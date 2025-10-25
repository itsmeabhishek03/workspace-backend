/* src/utils/rbac.ts */
import { WorkspaceRole } from "../models/membership.model";

const RANK: Record<WorkspaceRole, number> = {
  member: 1,
  admin: 2,
  owner: 3
};

export function roleAtLeast(actual: WorkspaceRole | undefined, required: WorkspaceRole) {
  if (!actual) return false;
  return RANK[actual] >= RANK[required];
}
