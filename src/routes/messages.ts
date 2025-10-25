import { Router } from "express";
import { requireJWT } from "../middleware/requireJWT";
import { loadWorkspaceMembership } from "../middleware/workspaceMembership";
import { authorizeWorkspaceRole } from "../middleware/authorizeWorkspaceRole";
import { Channel } from "../models/channel.model";
import { Message } from "../models/message.model";
import { z } from "zod";

const router = Router();

// helper middleware to inject workspaceId param based on :channelId
async function injectWorkspaceFromChannel(req: any, res: any, next: any) {
  const { channelId } = req.params;
  const ch = await Channel.findById(channelId).lean();
  if (!ch) return res.status(404).json({ error: { message: "Channel not found" } });
  req.params.workspaceId = String(ch.workspaceId);
  next();
}

router.get("/:channelId/messages", requireJWT, injectWorkspaceFromChannel, loadWorkspaceMembership, authorizeWorkspaceRole("member"), async (req, res) => {
  const { channelId } = req.params;
  const limit = Math.min(parseInt(String(req.query.limit || "20"), 10), 100);
  const before = req.query.before ? new Date(String(req.query.before)) : undefined;

  const query: any = { channelId, parentMessageId: null };
  if (before) query.createdAt = { $lt: before };
  const messages = await Message.find(query).sort({ createdAt: -1 }).limit(limit).lean();

  res.json({ messages });
});

const postSchema = z.object({
  body: z.string().min(1),
  parentMessageId: z.string().optional()
});

router.post("/:channelId/messages", requireJWT, injectWorkspaceFromChannel, loadWorkspaceMembership, authorizeWorkspaceRole("member"), async (req, res) => {
  const { channelId } = req.params;
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { message: "Invalid body" } });

  const message = await Message.create({
    workspaceId: req.params.workspaceId,
    channelId,
    userId: req.user!.id,
    parentMessageId: parsed.data.parentMessageId || null,
    body: parsed.data.body
  });

  res.status(201).json({ message });
});

export default router;
