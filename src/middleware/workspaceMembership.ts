import { Request, Response, NextFunction } from "express";
import  { Membership } from "../models/membership.model";

declare module "express-serve-static-core" {
  interface Request {
    membership?: { role: "owner" | "admin" | "member"; workspaceId: string; userId: string };
  }
}

export async function loadWorkspaceMembership(req: Request, res: Response, next: NextFunction) {
  try {
    const workspaceId = (req.params.workspaceId || req.body.workspaceId || req.query.workspaceId) as string | undefined;
    if (!workspaceId) return res.status(400).json({ error: { message: "workspaceId is required" } });
    if (!req.user?.id) return res.status(401).json({ error: { message: "Unauthorized" } });

    const mem = await Membership.findOne({ workspaceId, userId: req.user.id }).lean();
    if (!mem) return res.status(403).json({ error: { message: "Not a member of this workspace" } });

    req.membership = {
        role: mem.role,
        workspaceId: String(workspaceId),
        userId: String(req.user.id)
    };

    next();
  } catch (e: any) {
    res.status(500).json({ error: { message: "Failed to load membership", details: e?.message || "unknown" } });
  }
}
