import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  email: string;
  name: string;
  password: string;        // hashed
  verified: boolean;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    verified: { type: Boolean, default: false },
    avatarUrl: { type: String },
  },
  { timestamps: true }
);

export const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);
