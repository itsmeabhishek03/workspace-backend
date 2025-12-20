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
import { connectDB } from './config/db';

/** Build the plain Express application (no http.Server, no sockets). */
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

/**
 * Vercel expects a default export that is either:
 *  - an Express app, or
 *  - a handler function (or a server listening on a port).
 * We export the Express app here so the "src/app.ts" detector is satisfied.
 * Also connect to Mongo once on Vercel cold start.
 */
if (process.env.VERCEL) {
  // Connect once per cold start; reuse while the function stays warm.
  connectDB()
    .then(() => console.log('🟢 Mongo connected (Vercel cold start)'))
    .catch((err) => console.error('🔴 Mongo connection failed (Vercel):', err));
}

const app = buildExpressApp();
export default app;
