// src/server.ts
import env from './config/env';
import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { closeRealtime } from './realtime/socket'; // <-- add

async function start() {
  await connectDB();

  const server = createApp();

  server.listen(env.PORT, () => {
    console.log(`✅ HTTP + WebSocket server running at http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received: closing server, websockets, and DB...`);

    // stop accepting new HTTP connections
    server.close(async () => {
      // close Socket.IO + Redis
      await closeRealtime();         // <-- graceful Redis close
      await disconnectDB();          // <-- then Mongo
      console.log('Clean shutdown complete. 👋');
      process.exit(0);
    });

    // safety timer
    setTimeout(async () => {
      console.warn('Forcing shutdown...');
      try { await closeRealtime(); } catch {}
      try { await disconnectDB(); } catch {}
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
