// import { NextFunction, Request, Response } from 'express';
// import mongoose from 'mongoose';

// export function requireUser(req: Request, res: Response, next: NextFunction) {
//   const userId = req.header('x-user-id');
//   if (!userId || !mongoose.isValidObjectId(userId)) {
//     return res.status(401).json({ error: { message: 'Unauthorized (x-user-id missing or invalid). JWT coming next.' } });
//   }
//   // attach to req
//   (req as any).userId = new mongoose.Types.ObjectId(userId);
//   next();
// }
