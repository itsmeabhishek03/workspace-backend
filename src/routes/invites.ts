import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { requireJWT } from "../middleware/requireJWT";
import { loadWorkspaceMembership } from "../middleware/workspaceMembership";
import { authorizeWorkspaceRole } from "../middleware/authorizeWorkspaceRole";
import Invite from "../models/invite.model";
import { Membership } from "../models/membership.model";
import { User } from "../models/user.model";
import { Workspace } from "../models/workspace.model";

const router = Router();

const sendInvite = z.object({
  email: z.string().email(),
  role: z.enum(["member", "admin"]).optional().default("member")
});

router.post("/:workspaceId/invites", requireJWT, loadWorkspaceMembership, authorizeWorkspaceRole("admin"),
  async (req, res) => {
    try {
      const { workspaceId } = req.params;
      const parsed = sendInvite.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { message: "Invalid body" } });
      }

      const inviterId = req.user!.id;
      const email = parsed.data.email.trim().toLowerCase();
      const role = parsed.data.role ?? "member";

      const user = await User.findOne({ email }).select("_id").lean();
      if (user) {
        const alreadyMember = await Membership.findOne({ workspaceId, userId: user._id }).lean();
        if (alreadyMember) {
          return res.status(409).json({ error: { message: "Email already a member of this workspace" } });
        }
      }

      // (3) Idempotency: if a pending invite already exists for this email+workspace, return it (200)
      let existingInvite = await Invite.findOne({ workspaceId, email, accepted: false }).lean();
      if (existingInvite) {
        // if role differs, you can update it:
        if (existingInvite.role !== role) {
          await Invite.updateOne({ _id: existingInvite._id }, { $set: { role } });
          existingInvite = await Invite.findById(existingInvite._id).lean();
        }
        return res.status(200).json({ invite: toSafeInvite(existingInvite) });
      }

      // (4) Create new invite
      const token = crypto.randomBytes(32).toString("hex");
      const created = await Invite.create({
        workspaceId,
        inviterId,
        email,               
        role,                
        token,
        accepted: false
      });

      // (7) Return safe payload (include token now for testing; later you’ll email it)
      return res.status(201).json({ invite: toSafeInvite(created.toObject()) });
    } catch (err: any) {
      // (6) Graceful unique-index handling (workspaceId+email)
      if (err?.code === 11000) {
        return res.status(409).json({ error: { message: "Invite already exists for this email" } });
      }
      return res.status(500).json({ error: { message: "Failed to create invite", details: err?.message || "unknown" } });
    }
  }
);

function toSafeInvite(i: any) {
  return {
    id: String(i._id),
    workspaceId: String(i.workspaceId),
    inviterId: String(i.inviterId),
    email: i.email,
    role: i.role,
    token: i.token,         
    accepted: !!i.accepted,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt
  };
}

const acceptInvite = z.object({
  token: z.string().min(1)
});

router.post("/invites/accept", requireJWT, async (req, res) => {
  try {
    // 1) Validate input
    const parsed = acceptInvite.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Invalid body" } });
    }
    const token = parsed.data.token;

    // 2) Load invite
    const invited = await Invite.findOne({ token });
    if (!invited) {
      return res.status(404).json({ error: { message: "Invalid token" } });
    }
    if (invited.accepted === true) {
      // You can choose 200 with existing membership instead of 409 to be idempotent.
      return res.status(409).json({ error: { message: "Invite already accepted" } });
    }

    // 3) Email must match authenticated user
    const inviteEmail = invited.email.trim().toLowerCase();
    const userEmail = (req.user?.email || "").trim().toLowerCase();
    if (inviteEmail !== userEmail) {
      return res.status(403).json({ error: { message: "Invite is for a different email" } });
    }

    // 4) Workspace must exist
    const ws = await Workspace.findById(invited.workspaceId).lean();
    if (!ws) {
      return res.status(404).json({ error: { message: "Workspace not found" } });
    }

    // 5) Not already a member
    const existingMem = await Membership.findOne({
      workspaceId: invited.workspaceId,
      userId: req.user!.id
    }).lean();
    if (existingMem) {
      return res.status(409).json({ error: { message: "Already a member of this workspace" } });
    }

    // 6) Create membership
    const membership = await Membership.create({
      workspaceId: invited.workspaceId,
      userId: req.user!.id,
      role: invited.role
    });

    // 7) Mark invite accepted (you skipped earlier) — do it now
    invited.accepted = true;
    await invited.save();

    // Optional: delete other pending invites for same (workspaceId,email)
    await Invite.deleteMany({ workspaceId: invited.workspaceId, email: inviteEmail, accepted: false });

    // 8) Return success payload
    return res.status(201).json({
      membership: {
        id: String(membership._id),
        workspaceId: String(membership.workspaceId),
        userId: String(membership.userId),
        role: membership.role,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt
      },
      invite: {
        id: String(invited._id),
        accepted: true
      }
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: { message: "Already a member or duplicate" } });
    }
    return res.status(500).json({ error: { message: "Failed to accept invite", details: err?.message || "unknown" } });
  }
});

export default router;