// src/middleware/requireJWT.ts
import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessPayload } from "../utils/jwt";
import { getRedis } from "../redis/client";
import { RKeys } from "../redis/keys";

export async function requireJWT(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: { message: "Missing token" } });
    }

    const payload = verifyAccessToken(token) as AccessPayload;

    // Optional denylist by access-token jti
    if (payload.jti) {
      try {
        const redis = getRedis();
        const blocked = await redis.get(RKeys.atBlock(payload.jti));
        if (blocked) {
          return res.status(401).json({ error: { message: "Token revoked" } });
        }
      } catch {
        // Choose fail-open (continue) or fail-closed. Most apps fail-open here:
        return res.status(503).json({ error: { message: "Auth service unavailable" } });
      }
    }

    req.user = { id: payload.id, email: payload.email, name: payload.name };
    return next();
  } catch {
    return res.status(401).json({ error: { message: "Invalid or expired token" } });
  }
}
