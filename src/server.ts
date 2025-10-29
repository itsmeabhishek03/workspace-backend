import env from './config/env';
import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';

async function start() {
  await connectDB();

  // createApp already returns server now
  const server = createApp();

  server.listen(env.PORT, () => {
    console.log(`✅ HTTP + WebSocket server running at http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received: closing server and DB...`);
    server.close(async () => {
      await disconnectDB();
      console.log('Clean shutdown complete. 👋');
      process.exit(0);
    });
    setTimeout(async () => {
      console.warn('Forcing shutdown...');
      await disconnectDB();
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
