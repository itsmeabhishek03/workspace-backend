import { Router } from "express";
import { requireJWT } from "../middleware/requireJWT";
import { loadWorkspaceMembership } from "../middleware/workspaceMembership";
import { authorizeWorkspaceRole } from "../middleware/authorizeWorkspaceRole";
import { Channel } from "../models/channel.model";
import { Message } from "../models/message.model";
import { z } from "zod";

const router = Router();

router.get(
  "/:workspaceId/channels",
  requireJWT,
  loadWorkspaceMembership,
  authorizeWorkspaceRole("member"),
  async (req, res) => {
    const { workspaceId } = req.params;
    const channels = await Channel.find({ workspaceId }).lean();
    res.json({ channels });
  }
);

const createSchema = z.object({ name: z.string().min(1).max(64) });

router.post(
  "/:workspaceId/channels",
  requireJWT,
  loadWorkspaceMembership,
  authorizeWorkspaceRole("admin"),
  async (req, res) => {
    const { workspaceId } = req.params;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { message: "Invalid body" } });

    const exists = await Channel.findOne({ workspaceId, name: parsed.data.name });
    if (exists) return res.status(409).json({ error: { message: "Channel name already exists" } });

    const channel = await Channel.create({
      workspaceId,
      name: parsed.data.name,
      createdBy: req.user!.id
    });

    res.status(201).json({ channel });
  }
);

// ---------- NEW: rename channel ----------
const renameSchema = z.object({ name: z.string().min(1).max(64) });

router.patch(
  "/:workspaceId/channels/:channelId",
  requireJWT,
  loadWorkspaceMembership,
  authorizeWorkspaceRole("admin"),
  async (req, res) => {
    const { workspaceId, channelId } = req.params;
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { message: "Invalid body" } });

    // prevent duplicate name within same workspace
    const dupe = await Channel.findOne({ workspaceId, name: parsed.data.name, _id: { $ne: channelId } }).lean();
    if (dupe) return res.status(409).json({ error: { message: "Channel name already exists" } });

    const updated = await Channel.findOneAndUpdate(
      { _id: channelId, workspaceId },
      { $set: { name: parsed.data.name } },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ error: { message: "Channel not found" } });

    return res.json({ channel: updated });
  }
);

// ---------- NEW: delete channel (and its messages) ----------
router.delete(
  "/:workspaceId/channels/:channelId",
  requireJWT,
  loadWorkspaceMembership,
  authorizeWorkspaceRole("admin"),
  async (req, res) => {
    const { workspaceId, channelId } = req.params;

    const ch = await Channel.findOneAndDelete({ _id: channelId, workspaceId }).lean();
    if (!ch) return res.status(404).json({ error: { message: "Channel not found" } });

    await Message.deleteMany({ channelId }); // hard delete messages of this channel
    return res.json({ ok: true });
  }
);

export default router;
