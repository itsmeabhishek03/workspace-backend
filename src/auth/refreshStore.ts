import { getRedis } from "../redis/client";
import { RKeys } from "../redis/keys";

const days = (d: number) => d * 24 * 60 * 60;

export async function storeRefreshSession(userId: string, jti: string, meta?: Record<string, any>) {
  const ttlDays = Number(process.env.REFRESH_TTL_DAYS || 30);
  const redis = getRedis();
  const key = RKeys.rtSession(userId, jti);
  await redis.set(key, JSON.stringify(meta || {}), "EX", days(ttlDays));
}

export async function hasRefreshSession(userId: string, jti: string) {
  const redis = getRedis();
  const key = RKeys.rtSession(userId, jti);
  const v = await redis.get(key);
  return !!v;
}

export async function deleteRefreshSession(userId: string, jti: string) {
  const redis = getRedis();
  const key = RKeys.rtSession(userId, jti);
  await redis.del(key);
}

export async function deleteAllRefreshSessions(userId: string) {
  const redis = getRedis();
  const keys = await redis.keys(`rt:${userId}:*`);
  if (keys.length) await redis.del(keys);
}
