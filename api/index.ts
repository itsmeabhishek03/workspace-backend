import { buildExpressApp } from '../src/app';

// Vercel’s Node runtime picks up default export here.
const app = buildExpressApp();
export default app;
