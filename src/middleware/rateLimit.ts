import { Request, Response, NextFunction } from "express";
import { getRedis } from "../redis/client";
import { RKeys } from "../redis/keys";

type RLOpts = {
  windowSec?: number;
  max?: number;
  bucket?: (req: Request) => string;
  headers?: boolean; // add rate limit headers
};

export function rateLimit(opts: RLOpts = {}) {
  const windowSec = opts.windowSec ?? Number(process.env.RATE_LIMIT_WINDOW_SEC || 60);
  const max = opts.max ?? Number(process.env.RATE_LIMIT_MAX || 100);
  const addHeaders = opts.headers ?? true;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const redis = getRedis();
      const id = opts.bucket ? opts.bucket(req) : (req.ip || "ip:unknown");
      const key = RKeys.rlBucket(id);

      const tx = redis.multi();
      tx.incr(key);
      tx.ttl(key);
      const [countRaw, ttlRaw] = (await tx.exec())!.map((r) => r[1]) as [number, number];
      let count = Number(countRaw);
      let ttl = Number(ttlRaw);

      if (ttl < 0) {
        await redis.expire(key, windowSec);
        ttl = windowSec;
      }

      if (addHeaders) {
        res.setHeader("X-RateLimit-Limit", String(max));
        res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - count)));
        res.setHeader("X-RateLimit-Reset", String(ttl));
      }

      if (count > max) {
        return res.status(429).json({ error: { message: "Too many requests. Please slow down." } });
      }

      next();
    } catch (e) {
      // Fail-open or fail-closed? Typically fail-open but log it.
      console.error("[rateLimit] error", (e as Error).message);
      next();
    }
  };
}
