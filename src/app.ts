import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from "cookie-parser";
import http from "http";

import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/error';
import { notFound } from './middleware/notFound';
import healthRoutes from './routes/health';
import authRoutes from './routes/auth'
import workspaceRoutes from './routes/workspaces'
import channelRoutes from './routes/channels'
import messageRoutes from './routes/messages'
import memeberRoutes from './routes/members'
import inviteRoutes from './routes/invites'
import { initRealtime } from "./realtime/socket";

export function createApp() {
  const app = express();

  // security & parsing
  app.use(helmet());
  app.use(cookieParser());
  app.use(cors({ origin: true, credentials: true }));
  app.use(cors({ origin: (process.env.WS_ALLOW_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean), credentials: true }));
  app.use(express.json());

  // logging
  app.use(requestLogger);
  const server = http.createServer(app);
  initRealtime(server)

  // routes
  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes); 
  app.use('/api/workspaces', workspaceRoutes);
  app.use('/api', channelRoutes);
  app.use('/api/channels', messageRoutes); 
  app.use('/api', inviteRoutes)
  app.use("/api", memeberRoutes);
  // 404 + error
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
