import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import type { Server as HttpServer } from "http";
import { verifyAccessToken } from "../utils/jwt";
import { Membership } from "../models/membership.model";
import { Channel } from "../models/channel.model";

// room helpers
export const room = {
  user: (userId: string) => `user:${userId}`,
  channel: (channelId: string) => `channel:${channelId}`,
  workspace: (workspaceId: string) => `workspace:${workspaceId}`,
};

// export a singleton io + publisher API
let ioSingleton: Server | null = null;

export function initRealtime(httpServer: HttpServer) {
  if (ioSingleton) return ioSingleton;

  const allowOrigins = (process.env.WS_ALLOW_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const io = new Server(httpServer, {
    cors: allowOrigins.length ? { origin: allowOrigins, credentials: true } : undefined,
    connectionStateRecovery: { maxDisconnectionDuration: 60_000, skipMiddlewares: true },
  });

  // Redis adapter for horizontal scale
  // const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  // const pubClient = new Redis(redisUrl);
  // const subClient = pubClient.duplicate();
  // io.adapter(createAdapter(pubClient, subClient));

  // auth middleware (JWT)
  io.use((socket, next) => {
    try {
      // JWT can arrive via auth.token or headers['authorization']
      const token =
        (socket.handshake.auth && socket.handshake.auth.token) ||
        (socket.handshake.headers.authorization?.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);

      if (!token) return next(new Error("Missing auth token"));
      const payload: any = verifyAccessToken(token);
      (socket as any).user = { id: String(payload.id), email: payload.email, name: payload.name };
      return next();
    } catch (e) {
      return next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as any).user as { id: string; email: string; name?: string };
    // always join a personal room
    socket.join(room.user(user.id));

    // subscribe to a channel: client emits { channelId }
    socket.on("subscribe:channel", async (payload: { channelId: string }) => {
      try {
        if (!payload?.channelId) return socket.emit("error", { message: "channelId required" });

        const ch = await Channel.findById(payload.channelId).select("_id workspaceId").lean();
        if (!ch) return socket.emit("error", { message: "Channel not found" });

        // ensure membership
        const mem = await Membership.findOne({ workspaceId: ch.workspaceId, userId: user.id })
          .select("_id")
          .lean();
        if (!mem) return socket.emit("error", { message: "Not a member of this workspace" });

        socket.join(room.channel(payload.channelId));
        socket.emit("subscribed:channel", { channelId: payload.channelId });
      } catch (e: any) {
        socket.emit("error", { message: e?.message || "subscribe failed" });
      }
    });

    // unsubscribe
    socket.on("unsubscribe:channel", (payload: { channelId: string }) => {
      if (!payload?.channelId) return;
      socket.leave(room.channel(payload.channelId));
      socket.emit("unsubscribed:channel", { channelId: payload.channelId });
    });

    socket.on("disconnect", () => {
      // noop; connectionStateRecovery will help with transient drops
    });
  });

  ioSingleton = io;
  return io;
}

// --------- publishers you can call from routes ----------
export function publishMessageCreated(message: any) {
  // message must contain channelId
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
