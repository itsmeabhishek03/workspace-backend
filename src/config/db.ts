import mongoose from 'mongoose';
import env from './env';

export async function connectDB() {
  mongoose.set('strictQuery', true);

  await mongoose.connect(process.env.MONGO_URI ?? process.env.MONGO_URL ?? env.MONGO_URL, {
    dbName: process.env.DB_NAME || 'teamchat_dev',
    serverSelectionTimeoutMS: 5000,
  });

  const conn = mongoose.connection;
  conn.on('connected', () => console.log('🟢 Mongo connected'));
  conn.on('error', (err) => console.error('🔴 Mongo error:', err));
}

export async function disconnectDB() {
  await mongoose.connection.close();
}
