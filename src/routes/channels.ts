import { Router } from "express";
import { requireJWT } from "../middleware/requireJWT";
import { loadWorkspaceMembership } from "../middleware/workspaceMembership";
import { authorizeWorkspaceRole } from "../middleware/authorizeWorkspaceRole";
import { Channel } from "../models/channel.model";
import { z } from "zod";

const router = Router();

router.get("/:workspaceId/channels", requireJWT, loadWorkspaceMembership, authorizeWorkspaceRole("member"), async (req, res) => {
  const { workspaceId } = req.params;
  const channels = await Channel.find({ workspaceId }).lean();
  res.json({ channels });
});

const createSchema = z.object({ name: z.string().min(1).max(64) });

router.post("/:workspaceId/channels", requireJWT, loadWorkspaceMembership, authorizeWorkspaceRole("admin"), async (req, res) => {
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
});

export default router;
