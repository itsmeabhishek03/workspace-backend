import jwt, { SignOptions } from "jsonwebtoken";
import ms from "ms";

const accessSecret = process.env.JWT_ACCESS_SECRET!;
const refreshSecret = process.env.JWT_REFRESH_SECRET!;
const accessExp: string = process.env.JWT_ACCESS_EXPIRES || "15m";
const refreshExp: string = process.env.JWT_REFRESH_EXPIRES || "7d";


export function signAccessToken(payload: any) {
  return jwt.sign(payload, accessSecret, { expiresIn: accessExp as SignOptions["expiresIn"] });
}

export function signRefreshToken(payload: any) {
  return jwt.sign(payload, refreshSecret, { expiresIn: refreshExp as SignOptions["expiresIn"] });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, accessSecret);
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, refreshSecret);
}

export function accessMs() {
  // @ts-ignore
  return ms(accessExp);
}

export function refreshMs() {
  // @ts-ignore
  return ms(refreshExp);
}
