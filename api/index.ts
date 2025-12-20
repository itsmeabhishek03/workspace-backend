// api/index.ts
import { buildExpressApp } from '../src/app';
import { connectDB } from '../src/config/db';

const app = buildExpressApp();

// Connect once per cold start
await connectDB();

export default app;
