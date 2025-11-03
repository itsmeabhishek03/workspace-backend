// src/utils/jwt.ts
import jwt, { SignOptions } from "jsonwebtoken";
import ms from "ms";
import crypto from "crypto";

/**
 * ENV config
 */
const accessSecret = process.env.JWT_ACCESS_SECRET!;
const refreshSecret = process.env.JWT_REFRESH_SECRET!;
const accessExp: string = process.env.JWT_ACCESS_EXPIRES || "15m";
const refreshExp: string = process.env.JWT_REFRESH_EXPIRES || "7d";

/**
 * Types for what we embed in tokens
 */
export type AccessPayload = {
  id: string;
  email: string;
  name: string;
  jti: string;      // <-- required for access tokens (denylist)
  iat?: number;
  exp?: number;
};

export type RefreshPayload = {
  id: string;
  jti: string;      // <-- required for refresh sessions (Redis)
  iat?: number;
  exp?: number;
};

/**
 * Helper to generate jti
 */
export function newJti(bytes: number = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Signers
 * - Access token now always includes a random jti
 * - Refresh token requires caller to pass a jti (so you can store it in Redis)
 */
export function signAccessToken(payload: { id: string; email: string; name: string }) {
  const jti = newJti();
  const body: AccessPayload = { ...payload, jti };
  return jwt.sign(body, accessSecret, { expiresIn: accessExp as SignOptions["expiresIn"] });
}

export function signRefreshToken(payload: { id: string; jti: string }) {
  const body: RefreshPayload = { id: payload.id, jti: payload.jti };
  return jwt.sign(body, refreshSecret, { expiresIn: refreshExp as SignOptions["expiresIn"] });
}

/**
 * Verifiers (typed)
 */
export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, accessSecret) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, refreshSecret) as RefreshPayload;
}

/**
 * Handy TTL helpers you already use for cookies, etc.
 */
export function accessMs() {
  // @ts-ignore – ms accepts string
  return ms(accessExp);
}

export function refreshMs() {
  // @ts-ignore – ms accepts string
  return ms(refreshExp);
}