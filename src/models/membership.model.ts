/* src/models/membership.model.ts */
import mongoose, { Schema, Document, Model } from "mongoose";

export type WorkspaceRole = "owner" | "admin" | "member";

export interface IMembership extends Document {
  workspaceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
}

const membershipSchema = new Schema<IMembership>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", index: true, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
    role: { type: String, enum: ["owner", "admin", "member"], required: true }
  },
  { timestamps: true }
);

membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const Membership: Model<IMembership> = mongoose.model<IMembership>("Membership", membershipSchema);
