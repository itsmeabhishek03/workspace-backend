import mongoose, { Schema, Document, Model } from "mongoose";

export interface IInvite extends Document {
  workspaceId: mongoose.Types.ObjectId;
  inviterId: mongoose.Types.ObjectId;
  email: string;
  role: "member" | "admin";
  token: string;
  accepted: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSentAt?: Date;
  sendCount: number;
  status: "pending" | "sent" | "failed" | "accepted";
  lastError?: string;
  expiresAt?: Date;
}


const inviteSchema = new Schema<IInvite>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    inviterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ["member", "admin"], default: "member" },
    token: { type: String, required: true, unique: true },
    accepted: { type: Boolean, default: false },
    lastSentAt: { type: Date },
    sendCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "accepted"],
      default: "pending",
    },
    lastError: { type: String },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

inviteSchema.index({ workspaceId: 1, email: 1 }, { unique: true });

const Invite: Model<IInvite> = mongoose.model<IInvite>("Invite", inviteSchema);
export default Invite;
