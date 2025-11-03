import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { User } from "../models/user.model";
import { signAccessToken, signRefreshToken, verifyRefreshToken, refreshMs } from "../utils/jwt";
import { storeRefreshSession, hasRefreshSession, deleteRefreshSession, deleteAllRefreshSessions } from "../auth/refreshStore";
import { getRedis } from "../redis/client";
import { RKeys } from "../redis/keys";

const router = Router();
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || "rt";

/** REGISTER */
const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(6).max(128),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { message: "Invalid input", details: parsed.error.flatten() } });
  }

  const { email, name, password } = parsed.data;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ error: { message: "Email already in use" } });
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email: email.toLowerCase(),
    name,
    password: hash,
    verified: false,
  });

  // Issue tokens
  const accessToken = signAccessToken({ id: String(user._id), email: user.email, name: user.name });
  const rtJti = crypto.randomBytes(16).toString("hex");
  const refreshToken = signRefreshToken({ id: String(user._id), jti: rtJti });
  await storeRefreshSession(String(user._id), rtJti, { ua: req.headers["user-agent"], ip: req.ip });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: refreshMs(),
  });

  return res.status(201).json({
    user: { id: user._id, email: user.email, name: user.name, verified: user.verified, createdAt: user.createdAt },
    accessToken,
  });
});

/** LOGIN */
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: "Invalid input" } });

  const { email, password } = parsed.data;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.status(401).json({ error: { message: "Invalid credentials" } });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: { message: "Invalid credentials" } });

  const accessToken = signAccessToken({ id: String(user._id), email: user.email, name: user.name });

  // rotate refresh session on login
  const rtJti = crypto.randomBytes(16).toString("hex");
  const refreshToken = signRefreshToken({ id: String(user._id), jti: rtJti });
  await storeRefreshSession(String(user._id), rtJti, { ua: req.headers["user-agent"], ip: req.ip });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: refreshMs(),
  });

  res.json({ accessToken, user: { id: user._id, email: user.email, name: user.name } });
});

/** REFRESH (rotate RT) */
router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!token) return res.status(401).json({ error: { message: "Missing refresh token" } });

    const payload: any = verifyRefreshToken(token);
    const userId = String(payload.id);
    const oldJti = String(payload.jti);

    // 1️⃣ Check Redis session
    const exists = await hasRefreshSession(userId, oldJti);
    if (!exists) {
      return res.status(401).json({ error: { message: "Refresh session invalid" } });
    }

    // 2️⃣ Rotate refresh token
    await deleteRefreshSession(userId, oldJti);

    // 3️⃣ Fetch full user details
    const user = await User.findById(userId).select("id email name").lean();
    if (!user) {
      return res.status(404).json({ error: { message: "User not found" } });
    }

    // 4️⃣ Create new tokens
    const newAccessToken = signAccessToken({
      id: String(user._id),
      email: user.email,
      name: user.name,
    });

    const rtJti = crypto.randomBytes(16).toString("hex");
    const newRefreshToken = signRefreshToken({ id: userId, jti: rtJti });

    await storeRefreshSession(userId, rtJti, { ua: req.headers["user-agent"], ip: req.ip });

    // 5️⃣ Set new refresh cookie
    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: refreshMs(),
    });

    // 6️⃣ Send new access token to frontend
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(401).json({ error: { message: "Invalid refresh token" } });
  }
});


/** LOGOUT (revoke just this RT) */
router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    if (token) {
      const payload: any = verifyRefreshToken(token);
      await deleteRefreshSession(String(payload.id), String(payload.jti));
    }
  } catch {}
  res.status(204).send();
});

/** LOGOUT ALL (revoke all RT sessions) */
router.post("/logout-all", async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!token) return res.status(401).json({ error: { message: "Missing refresh token" } });
    const payload: any = verifyRefreshToken(token);
    await deleteAllRefreshSessions(String(payload.id));
  } catch {}
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(204).send();
});

/** FORCE-REVOKE ACCESS TOKEN (optional admin endpoint)
 *  Adds current AT jti to Redis denylist until its natural expiry.
 */
router.post("/revoke-access", (req, res) => {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return res.status(400).json({ error: { message: "Missing bearer" } });
  const token = auth.slice(7);
  try {
    const payload: any = require("../utils/jwt").verifyAccessToken(token);
    const jti = payload.jti;
    const exp = payload.exp as number; // epoch seconds
    if (!jti || !exp) return res.status(400).json({ error: { message: "Token missing jti/exp" } });

    const ttlSec = Math.max(exp - Math.floor(Date.now() / 1000), 0);
    const redis = getRedis();
    redis.set(RKeys.atBlock(jti), "1", "EX", ttlSec)
      .then(() => res.status(204).send())
      .catch(() => res.status(503).json({ error: { message: "Redis unavailable" } }));
  } catch {
    return res.status(401).json({ error: { message: "Invalid token" } });
  }
});

export default router;
