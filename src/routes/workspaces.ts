import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { Workspace } from '../models/workspace.model';
import { Membership } from '../models/membership.model';
import { requireJWT } from '../middleware/requireJWT';
import { loadWorkspaceMembership } from '../middleware/workspaceMembership';
import { authorizeWorkspaceRole } from '../middleware/authorizeWorkspaceRole';
import { roleAtLeast } from '../utils/rbac';
import Invite from '../models/invite.model';
import { Channel } from '../models/channel.model';
import { Message } from '../models/message.model';

const router = Router();

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(80),
});

router.post('/', requireJWT, async (req, res, next) => {
  try {
    const { name } = createWorkspaceSchema.parse(req.body);
    const userId = req.user?.id;
    const slug =
      name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') +
      '-' +
      nanoid(6);
    const ws = await Workspace.create({ name, slug, ownerId: userId });
    await Membership.create({ workspaceId: ws._id, userId, role: 'owner' });

    return res.status(201).json({ workspace: ws });
  } catch (err: any) {
    if (err?.issues) {
      return res.status(400).json({ error: { message: 'Validation error', details: err.issues } });
    }
    if (err?.code === 11000) {
      return res.status(409).json({ error: { message: 'Workspace slug conflict. Try a different name.' } });
    }
    next(err);
  }
});

router.get('/', requireJWT, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const memberships = await Membership.find({ userId }).select('workspaceId role').lean();
    const wsIds = memberships.map((m) => m.workspaceId);
    const workspaces = await Workspace.find({ _id: { $in: wsIds } }).lean();
    return res.json({ workspaces, memberships });
  } catch (err) {
    next(err);
  }
});

// ---------- NEW: update workspace (name for admin/owner, slug only by owner) ----------
const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(3)
    .max(120)
    .optional(),
});

router.patch(
  '/:workspaceId',
  requireJWT,
  loadWorkspaceMembership,
  authorizeWorkspaceRole('admin'), // admin or owner can reach here
  async (req, res) => {
    const { workspaceId } = req.params;

    const parsed = updateWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: 'Invalid body' } });
    }

    const update: any = {};
    if (parsed.data.name) update.name = parsed.data.name;

    // slug can be changed only by owner
    const role = req.membership!.role;
    if (parsed.data.slug) {
      if (!roleAtLeast(role, 'owner')) {
        return res.status(403).json({ error: { message: 'Only owner can change slug' } });
      }
      update.slug = parsed.data.slug;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: { message: 'Nothing to update' } });
    }

    try {
      const ws = await Workspace.findOneAndUpdate({ _id: workspaceId }, { $set: update }, { new: true }).lean();
      if (!ws) return res.status(404).json({ error: { message: 'Workspace not found' } });
      return res.json({ workspace: ws });
    } catch (err: any) {
      if (err?.code === 11000) {
        return res.status(409).json({ error: { message: 'Slug already in use' } });
      }
      return res.status(500).json({ error: { message: 'Failed to update workspace', details: err?.message || 'unknown' } });
    }
  }
);

// ---------- NEW: delete workspace (owner only) ----------
router.delete(
  '/:workspaceId',
  requireJWT,
  loadWorkspaceMembership,
  authorizeWorkspaceRole('owner'),
  async (req, res) => {
    const { workspaceId } = req.params;

    const ws = await Workspace.findById(workspaceId).lean();
    if (!ws) return res.status(404).json({ error: { message: 'Workspace not found' } });

    // cascade deletes
    await Promise.all([
      Channel.deleteMany({ workspaceId }),
      Message.deleteMany({ workspaceId }),
      Invite.deleteMany({ workspaceId }),
      Membership.deleteMany({ workspaceId }),
      Workspace.deleteOne({ _id: workspaceId }),
    ]);

    return res.json({ ok: true });
  }
);

export default router;

