import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || "notst";

if (!MONGO_URI) {
  throw new Error("MongoDB connection string is missing");
}

// Prevent query buffering (critical)
mongoose.set("bufferCommands", false);
mongoose.set("strictQuery", true);

// Global cache (required for serverless)
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI, {
      dbName: process.env.DB_NAME || "teamchat_dev",
      serverSelectionTimeoutMS: 5000,
    }).then((mongoose) => mongoose);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
