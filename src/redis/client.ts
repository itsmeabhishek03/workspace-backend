import { Redis } from "ioredis";

let redisSingleton: Redis | null = null;

export function getRedis(): Redis {
  if (redisSingleton) return redisSingleton;
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  redisSingleton = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
  redisSingleton.on("error", (e) => console.error("[redis] error:", e.message));
  redisSingleton.on("connect", () => console.log("[redis] connected"));
  return redisSingleton;
}

export async function closeRedis() {
  if (!redisSingleton) return;
  try { await redisSingleton.quit(); } catch {}
  redisSingleton = null;
}
