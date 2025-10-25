import { Router, Request, Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { requireJWT } from "../middleware/requireJWT";
import { loadWorkspaceMembership } from "../middleware/workspaceMembership";
import { authorizeWorkspaceRole } from "../middleware/authorizeWorkspaceRole";
import { Membership } from "../models/membership.model";
import { Workspace } from "../models/workspace.model";

const router = Router();

async function ensureWorkspaceExists(workspaceId: string) {
  const ws = await Workspace.findById(workspaceId).lean();
  return !!ws;
}

async function countOwners(workspaceId: string): Promise<number> {
  return Membership.countDocuments({ workspaceId, role: "owner" });
}

async function getTargetMembership(workspaceId: string, userId: string) {
  return Membership.findOne({ workspaceId, userId });
}

function isValidObjectId(id: string) {
  return mongoose.Types.ObjectId.isValid(id);
}

/** -----------------------
 *  5A. List Members
 *  GET /api/:workspaceId/members
 *  admin+ only
 *  ----------------------*/

router.get(
  "/:workspaceId/members",
  requireJWT,
  loadWorkspaceMembership,
  authorizeWorkspaceRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { workspaceId } = req.params;
      if (!isValidObjectId(workspaceId)) {
        return res.status(400).json({ error: { message: "Invalid workspaceId" } });
      }
      const exists = await ensureWorkspaceExists(workspaceId);
      if (!exists) return res.status(404).json({ error: { message: "Workspace not found" } });

      const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || "20"), 10), 1), 100);
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const roleFilter =
        typeof req.query.role === "string" && ["member", "admin", "owner"].includes(req.query.role)
          ? (req.query.role as "member" | "admin" | "owner")
          : undefined;
      const sortField = typeof req.query.sort === "string" && ["name", "createdAt"].includes(req.query.sort)
        ? req.query.sort
        : "name";

      const match: any = { workspaceId: new mongoose.Types.ObjectId(workspaceId) };
      if (roleFilter) match.role = roleFilter;

      const pipeline: any[] = [
        { $match: match },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "user"
          }
        },
        { $unwind: "$user" }
      ];

      if (search) {
        const re = new RegExp(search, "i");
        pipeline.push({
          $match: {
            $or: [
              { "user.name": re },
              { "user.email": re }
            ]
          }
        });
      }

      // total count stage
      pipeline.push(
        {
          $facet: {
            data: [
              ...(sortField === "name"
                ? [{ $sort: { "user.name": 1, _id: 1 } }]
                : [{ $sort: { createdAt: -1, _id: 1 } }]),
              { $skip: (page - 1) * limit },
              { $limit: limit },
              {
                $project: {
                  _id: 0,
                  userId: "$userId",
                  role: "$role",
                  joinedAt: "$createdAt",
                  user: {
                    id: "$user._id",
                    name: "$user.name",
                    email: "$user.email",
                    avatarUrl: "$user.avatarUrl"
                  }
                }
              }
            ],
            total: [{ $count: "count" }]
          }
        }
      );

      const result = await Membership.aggregate(pipeline);
      const data = result[0]?.data || [];
      const total = result[0]?.total?.[0]?.count || 0;
      const totalPages = Math.max(Math.ceil(total / limit), 1);

      return res.json({
        members: data.map((m: any) => ({
          userId: String(m.userId),
          role: m.role,
          joinedAt: m.joinedAt,
          user: {
            id: String(m.user.id),
            name: m.user.name,
            email: m.user.email,
            avatarUrl: m.user.avatarUrl ?? null
          }
        })),
        page,
        limit,
        total,
        totalPages
      });
    } catch (e: any) {
      return res.status(500).json({ error: { message: "Failed to fetch members", details: e?.message || "unknown" } });
    }
  }
);

/** -----------------------
 *  5B. Change Role
 *  PATCH /api/:workspaceId/members/:userId
 *  owner only
 *  ----------------------*/

const changeRoleSchema = z.object({
  role: z.enum(["member", "admin", "owner"])
});

router.patch(
  "/:workspaceId/members/:userId",
  requireJWT,
  loadWorkspaceMembership,
  authorizeWorkspaceRole("owner"),
  async (req: Request, res: Response) => {
    try {
      const { workspaceId, userId } = req.params;

      if (!isValidObjectId(workspaceId) || !isValidObjectId(userId)) {
        return res.status(400).json({ error: { message: "Invalid ids" } });
      }
      const exists = await ensureWorkspaceExists(workspaceId);
      if (!exists) return res.status(404).json({ error: { message: "Workspace not found" } });

      const parsed = changeRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { message: "Invalid body" } });
      }
      const targetRole = parsed.data.role;

      // Target membership must exist
      const targetMem = await getTargetMembership(workspaceId, userId);
      if (!targetMem) {
        return res.status(404).json({ error: { message: "Target member not found" } });
      }

      // Current requestor must be owner (middleware already), but enforce safety rules:

      // Rule: Prevent leaving workspace with no owners
      if (targetMem.role === "owner" && targetRole !== "owner") {
        const owners = await countOwners(workspaceId);
        if (owners <= 1) {
          return res.status(409).json({ error: { message: "Cannot demote the last owner" } });
        }
      }

      // Rule: Owner can change anyone’s role (including promoting to owner)
      // But prevent self-demotion that leaves no owner
      if (String(targetMem.userId) === String(req.user!.id) && targetRole !== "owner") {
        const owners = await countOwners(workspaceId);
        if (owners <= 1) {
          return res.status(409).json({ error: { message: "Cannot demote yourself as the last owner" } });
        }
      }

      targetMem.role = targetRole;
      await targetMem.save();

      return res.json({
        membership: {
          id: String(targetMem._id),
          workspaceId: String(targetMem.workspaceId),
          userId: String(targetMem.userId),
          role: targetMem.role,
          createdAt: targetMem.createdAt,
          updatedAt: targetMem.updatedAt
        }
      });
    } catch (e: any) {
      return res.status(500).json({ error: { message: "Failed to change role", details: e?.message || "unknown" } });
    }
  }
);

/** -----------------------
 *  5C. Remove Member
 *  DELETE /api/:workspaceId/members/:userId
 *  admin+ can remove members; owner required to remove admins/owners
 *  ----------------------*/

router.delete(
  "/:workspaceId/members/:userId",
  requireJWT,
  loadWorkspaceMembership,
  authorizeWorkspaceRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { workspaceId, userId } = req.params;

      if (!isValidObjectId(workspaceId) || !isValidObjectId(userId)) {
        return res.status(400).json({ error: { message: "Invalid ids" } });
      }
      const exists = await ensureWorkspaceExists(workspaceId);
      if (!exists) return res.status(404).json({ error: { message: "Workspace not found" } });

      const target = await getTargetMembership(workspaceId, userId);
      if (!target) {
        return res.status(404).json({ error: { message: "Target member not found" } });
      }

      const requesterRole = req.membership!.role;

      // Admins can remove members only
      if (requesterRole === "admin") {
        if (target.role !== "member") {
          return res.status(403).json({ error: { message: "Admins can remove members only" } });
        }
      }

      // Owners can remove anyone, but must not remove the last owner (including self)
      if (target.role === "owner") {
        const owners = await countOwners(workspaceId);
        if (owners <= 1) {
          return res.status(409).json({ error: { message: "Cannot remove the last owner" } });
        }
      }

      // Optional: prevent self-removal if last owner
      if (String(target.userId) === String(req.user!.id) && target.role === "owner") {
        const owners = await countOwners(workspaceId);
        if (owners <= 1) {
          return res.status(409).json({ error: { message: "Cannot remove yourself as the last owner" } });
        }
      }

      await target.deleteOne();

      return res.status(204).send();
    } catch (e: any) {
      return res.status(500).json({ error: { message: "Failed to remove member", details: e?.message || "unknown" } });
    }
  }
);

export default router;
