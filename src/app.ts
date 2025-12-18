import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/error';
import { notFound } from './middleware/notFound';
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import workspaceRoutes from './routes/workspaces';
import channelRoutes from './routes/channels';
import messageRoutes from './routes/messages';
import memberRoutes from './routes/members';
import inviteRoutes from './routes/invites';

/** Build the plain Express application (no server/listen). */
export function buildExpressApp() {
  const app = express();

  app.use(helmet());
  app.use(cookieParser());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  // REST routes
  app.use('/api', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/workspaces', workspaceRoutes);
  app.use('/api', channelRoutes);
  app.use('/api/channels', messageRoutes);
  app.use('/api', inviteRoutes);
  app.use('/api', memberRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
