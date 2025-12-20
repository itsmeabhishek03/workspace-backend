import http from 'http';
import env from './config/env';
import { buildExpressApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { initRealtime, closeRealtime } from './realtime/socket';

/**
 * Local / VPS entrypoint.
 * Creates HTTP + WebSocket server and handles graceful shutdown.
 * (Vercel uses src/app.ts default export instead.)
 */
async function bootstrap() {
  await connectDB();

  const app = buildExpressApp();
  const server = http.createServer(app);

  // initialize Socket.IO only outside Vercel
  if (!process.env.VERCEL) {
    initRealtime(server);
  }

  server.listen(env.PORT, () => {
    console.log(`✅ HTTP + WebSocket server running at http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received: closing server, websockets, and DB...`);
    server.close(async () => {
      await closeRealtime();
      await disconnectDB();
      console.log('Clean shutdown complete. 👋');
      process.exit(0);
    });

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

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
