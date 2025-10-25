import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { User } from "../models/user.model"; 
import { signAccessToken, signRefreshToken, verifyRefreshToken, refreshMs } from "../utils/jwt";

const router = Router();
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || "rt";

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(6).max(128)
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
    verified: false
  });

  // Optional: auto-login after register (issue tokens)
  const accessToken = signAccessToken({ id: user._id, email: user.email, name: user.name });
  const refreshToken = signRefreshToken({ id: user._id, jti: crypto.randomBytes(16).toString("hex") });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: refreshMs()
  });

  return res.status(201).json({
    user: { id: user._id, email: user.email, name: user.name, verified: user.verified, createdAt: user.createdAt },
    accessToken
  });
});

/** LOGIN */
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: "Invalid input" } });

  const { email, password } = parsed.data;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.status(401).json({ error: { message: "Invalid credentials" } });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: { message: "Invalid credentials" } });

  const accessToken = signAccessToken({ id: user._id, email: user.email, name: user.name });
  const refreshToken = signRefreshToken({ id: user._id, jti: crypto.randomBytes(16).toString("hex") });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: refreshMs()
  });

  res.json({ accessToken, user: { id: user._id, email: user.email, name: user.name } });
});

/** REFRESH */
router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!token) return res.status(401).json({ error: { message: "Missing refresh token" } });

    const payload: any = verifyRefreshToken(token);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ error: { message: "User not found" } });

    const accessToken = signAccessToken({ id: user._id, email: user.email, name: user.name });
    const refreshToken = signRefreshToken({ id: user._id, jti: crypto.randomBytes(16).toString("hex") });

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: refreshMs()
    });

    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: { message: "Invalid refresh token" } });
  }
});

/** LOGOUT */
router.post("/logout", (req, res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  res.status(204).send();
});

export default router;
 