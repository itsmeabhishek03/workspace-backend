import 'dotenv/config';

const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  MONGO_URL: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/teamchat_dev',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

export default env;
