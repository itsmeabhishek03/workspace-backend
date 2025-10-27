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
import { sendInviteEmail } from "../mailer/resend"; // <-- add this

const router = Router();

const sendInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["member", "admin"]).optional().default("member")
});

const acceptInviteSchema = z.object({
  token: z.string().min(1)
});

// helper to hide token unless explicitly allowed in dev
function toSafeInvite(i: any) {
  const base = {
    id: String(i._id),
    workspaceId: String(i.workspaceId),
    inviterId: String(i.inviterId),
    email: i.email,
    role: i.role,
    accepted: !!i.accepted,
    status: i.status,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    expiresAt: i.expiresAt,
    lastSentAt: i.lastSentAt,
    sendCount: i.sendCount
  } as any;

  if (process.env.INVITE_TOKEN_IN_RESPONSE === "true") {
    base.token = i.token;
  }
  return base;
}

// create or resend invite
router.post(
  "/:workspaceId/invites",
  requireJWT,
  loadWorkspaceMembership,
  authorizeWorkspaceRole("admin"),
  async (req, res) => {
    try {
      const { workspaceId } = req.params;
      const parsed = sendInviteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: { message: "Invalid body" } });
      }

      const inviterId = req.user!.id;
      const inviterName = req.user?.name || req.user?.email || "Someone";
      const email = parsed.data.email.trim().toLowerCase();
      const role = parsed.data.role ?? "member";

      // ensure workspace exists (good UX + email template needs the name)
      const ws = await Workspace.findById(workspaceId).lean();
      if (!ws) {
        return res.status(404).json({ error: { message: "Workspace not found" } });
      }

      // if user exists & already a member, block
      const user = await User.findOne({ email }).select("_id").lean();
      if (user) {
        const alreadyMember = await Membership.findOne({ workspaceId, userId: user._id }).lean();
        if (alreadyMember) {
          return res.status(409).json({ error: { message: "Email already a member of this workspace" } });
        }
      }

      // if a pending invite exists for same email+workspace, keep idempotent behavior
      let existing = await Invite.findOne({ workspaceId, email, accepted: false });
      if (existing) {
        // if role changed, update role
        if (existing.role !== role) {
          existing.role = role;
        }

        // optionally rotate token (simple: reuse)
        const token = existing.token;

        // send (re)invite email
        const mailResult = await sendInviteEmail({
          to: email,
          inviterName,
          workspaceName: ws.name,
          role,
          token
        });

        existing.lastSentAt = new Date();
        existing.sendCount = (existing.sendCount || 0) + 1;
        existing.status = mailResult.success ? "sent" : "failed";
        if (!mailResult.success) existing.lastError = mailResult.error;
        await existing.save();

        return res.status(200).json({ invite: toSafeInvite(existing.toObject()) });
      }

      // create new invite
      const token = crypto.randomBytes(32).toString("hex");
      const expiresDays = Number(process.env.INVITE_EXPIRES_DAYS) || 7;
      const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);

      const created = await Invite.create({
        workspaceId,
        inviterId,
        email,
        role,
        token,
        accepted: false,
        expiresAt,
        status: "pending",
        sendCount: 0
      });

      // send email
      const mailResult = await sendInviteEmail({
        to: email,
        inviterName,
        workspaceName: ws.name,
        role,
        token
      });

      await Invite.updateOne(
        { _id: created._id },
        {
          $set: {
            lastSentAt: new Date(),
            sendCount: 1,
            status: mailResult.success ? "sent" : "failed",
            ...(mailResult.success ? {} : { lastError: mailResult.error })
          }
        }
      );

      // re-fetch to return updated fields
      const fresh = await Invite.findById(created._id).lean();
      return res.status(201).json({ invite: toSafeInvite(fresh) });
    } catch (err: any) {
      if (err?.code === 11000) {
        return res.status(409).json({ error: { message: "Invite already exists for this email" } });
      }
      return res.status(500).json({ error: { message: "Failed to create invite", details: err?.message || "unknown" } });
    }
  }
);

// accept invite
router.post("/invites/accept", requireJWT, async (req, res) => {
  try {
    const parsed = acceptInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Invalid body" } });
    }
    const token = parsed.data.token;

    // load invite
    const invited = await Invite.findOne({ token });
    if (!invited) {
      return res.status(404).json({ error: { message: "Invalid token" } });
    }
    if (invited.accepted === true) {
      return res.status(409).json({ error: { message: "Invite already accepted" } });
    }

    // expiry check (optional)
    if (invited.expiresAt && invited.expiresAt.getTime() < Date.now()) {
      return res.status(410).json({ error: { message: "Invite expired" } });
    }

    // email must match authenticated user
    const inviteEmail = invited.email.trim().toLowerCase();
    const userEmail = (req.user?.email || "").trim().toLowerCase();
    if (inviteEmail !== userEmail) {
      return res.status(403).json({ error: { message: "Invite is for a different email" } });
    }

    // workspace must exist
    const ws = await Workspace.findById(invited.workspaceId).lean();
    if (!ws) {
      return res.status(404).json({ error: { message: "Workspace not found" } });
    }

    // not already a member
    const existingMem = await Membership.findOne({
      workspaceId: invited.workspaceId,
      userId: req.user!.id
    }).lean();
    if (existingMem) {
      return res.status(409).json({ error: { message: "Already a member of this workspace" } });
    }

    // create membership
    const membership = await Membership.create({
      workspaceId: invited.workspaceId,
      userId: req.user!.id,
      role: invited.role
    });

    // mark invite accepted + cleanup other pending
    invited.accepted = true;
    invited.status = "accepted";
    await invited.save();
    await Invite.deleteMany({ workspaceId: invited.workspaceId, email: inviteEmail, accepted: false });

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
