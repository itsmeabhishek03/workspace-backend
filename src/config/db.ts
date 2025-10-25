import mongoose from 'mongoose';
import env from './env';

export async function connectDB() {
  mongoose.set('strictQuery', true);

  await mongoose.connect(env.MONGO_URL, {
    // you can add options here if needed
  });

  const conn = mongoose.connection;
  conn.on('connected', () => {
    // eslint-disable-next-line no-console
    console.log('🟢 Mongo connected');
  });
  conn.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('🔴 Mongo error:', err);
  });
}

export async function disconnectDB() {
  await mongoose.connection.close();
}
