import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from "cookie-parser";
import http from "http";
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
  const server = http.createServer(app);

  app.use(helmet());
  app.use(cookieParser());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  // initialize socket.io
  initRealtime(server);

  // routes
  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/workspaces', workspaceRoutes);
  app.use('/api', channelRoutes);
  app.use('/api/channels', messageRoutes);
  app.use('/api', inviteRoutes);
  app.use('/api', memeberRoutes);
  app.use(notFound);
  app.use(errorHandler);

  // Return the *HTTP server*, not the app
  return server;
}


