/* src/middleware/authorizeWorkspaceRole.ts */
import { Request, Response, NextFunction } from "express";
import { roleAtLeast } from "../utils/rbac";
import { WorkspaceRole } from "../models/membership.model";

export function authorizeWorkspaceRole(required: WorkspaceRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const actual = req.membership?.role;
    if (!actual) return res.status(403).json({ error: { message: "No membership context" } });
    if (!roleAtLeast(actual, required)) {
      return res.status(403).json({ error: { message: `Requires ${required} role` } });
    }
    next();
  };
}
