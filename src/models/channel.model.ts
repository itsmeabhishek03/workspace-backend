import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IChannel extends Document {
  workspaceId: mongoose.Types.ObjectId;
  name: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ChannelSchema = new Schema<IChannel>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// unique name within a workspace
ChannelSchema.index({ workspaceId: 1, name: 1 }, { unique: true });

export const Channel: Model<IChannel> = mongoose.model<IChannel>('Channel', ChannelSchema);
