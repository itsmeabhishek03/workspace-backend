// src/realtime/socket.ts
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { Server as HttpServer } from "http";
import { verifyAccessToken } from "../utils/jwt";
import { Membership } from "../models/membership.model";
import { Channel } from "../models/channel.model";

export const room = {
  user: (userId: string) => `user:${userId}`,
  channel: (channelId: string) => `channel:${channelId}`,
  workspace: (workspaceId: string) => `workspace:${workspaceId}`,
};

let ioSingleton: Server | null = null;
// keep these so we can close them on shutdown
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

export function initRealtime(httpServer: HttpServer) {
  if (ioSingleton) return ioSingleton;

  const allowOrigins = (process.env.WS_ALLOW_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const io = new Server(httpServer, {
    cors: allowOrigins.length ? { origin: allowOrigins, credentials: true } : undefined,
    connectionStateRecovery: { maxDisconnectionDuration: 60_000, skipMiddlewares: true },
  });

  // Redis adapter
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  redisPub = new Redis(redisUrl);
  redisSub = redisPub.duplicate();
  io.adapter(createAdapter(redisPub, redisSub));

  // auth middleware
  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth && socket.handshake.auth.token) ||
        (socket.handshake.headers.authorization?.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);
      if (!token) return next(new Error("Missing auth token"));
      const payload: any = verifyAccessToken(token);
      (socket as any).user = { id: String(payload.id), email: payload.email, name: payload.name };
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as any).user as { id: string; email: string; name?: string };
    socket.join(room.user(user.id));

    socket.on("subscribe:channel", async ({ channelId }: { channelId: string }) => {
      if (!channelId) return socket.emit("error", { message: "channelId required" });
      const ch = await Channel.findById(channelId).select("_id workspaceId").lean();
      if (!ch) return socket.emit("error", { message: "Channel not found" });
      const mem = await Membership.findOne({ workspaceId: ch.workspaceId, userId: user.id }).select("_id").lean();
      if (!mem) return socket.emit("error", { message: "Not a member of this workspace" });
      socket.join(room.channel(channelId));
      socket.emit("subscribed:channel", { channelId });
    });

    socket.on("unsubscribe:channel", ({ channelId }: { channelId: string }) => {
      if (!channelId) return;
      socket.leave(room.channel(channelId));
      socket.emit("unsubscribed:channel", { channelId });
    });
  });

  ioSingleton = io;
  return io;
}

export async function closeRealtime() {
  // close socket.io first (stops using redis)
  if (ioSingleton) {
    await new Promise<void>((resolve) => ioSingleton!.close(() => resolve()));
    ioSingleton = null;
  }
  // then close redis connections
  if (redisSub) {
    try { await redisSub.quit(); } catch {}
    redisSub = null;
  }
  if (redisPub) {
    try { await redisPub.quit(); } catch {}
    redisPub = null;
  }
}

// publishers
export function publishMessageCreated(message: any) {
  if (!ioSingleton) return;
  ioSingleton.to(room.channel(String(message.channelId))).emit("message:created", { message });
}
export function publishMessageEdited(message: any) {
  if (!ioSingleton) return;
  ioSingleton.to(room.channel(String(message.channelId))).emit("message:edited", { message });
}
export function publishMessageDeleted(message: any) {
  if (!ioSingleton) return;
  ioSingleton.to(room.channel(String(message.channelId))).emit("message:deleted", { message });
}
