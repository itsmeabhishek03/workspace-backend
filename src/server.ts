import http from 'http';
import env from './config/env';
import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';

async function start() {
  await connectDB();

  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`HTTP server listening on http://localhost:${env.PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} received: closing HTTP server and Mongo connection...`);
    server.close(async () => {
      await disconnectDB();
      // eslint-disable-next-line no-console
      console.log('Clean shutdown complete. Bye 👋');
      process.exit(0);
    });
    // Force-exit timer in case something hangs
    setTimeout(async () => {
      // eslint-disable-next-line no-console
      console.warn('Forcing shutdown...');
      await disconnectDB();
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
