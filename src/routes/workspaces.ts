import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { Workspace } from '../models/workspace.model';
import {  Membership } from '../models/membership.model';
import { requireJWT } from '../middleware/requireJWT';

const router = Router();

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(80),
});

router.post('/', requireJWT, async (req, res, next) => {
  try {
    const { name } = createWorkspaceSchema.parse(req.body);
    const userId = req.user?.id;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      + '-' + nanoid(6);
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

router.get('/', requireJWT , async (req, res, next) => {
  try {
    const userId = req.user?.id
    const memberships = await Membership.find({ userId }).select('workspaceId role').lean();
    const wsIds = memberships.map(m => m.workspaceId);
    const workspaces = await Workspace.find({ _id: { $in: wsIds } }).lean();
    return res.json({ workspaces, memberships });
  } catch (err) { next(err); }
});

export default router;
