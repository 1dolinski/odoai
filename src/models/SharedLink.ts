import mongoose, { Schema, Document } from "mongoose";

export interface ISharedLink extends Document {
  linkId: string;
  telegramChatId: string;
  title: string;
  content: string;
  createdBy: string;
  createdByUsername?: string;
  createdAt: Date;
}

const SharedLinkSchema = new Schema<ISharedLink>(
  {
    linkId: { type: String, required: true, unique: true, index: true },
    telegramChatId: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    createdBy: { type: String, required: true },
    createdByUsername: String,
  },
  { timestamps: true }
);

export default mongoose.models.SharedLink ||
  mongoose.model<ISharedLink>("SharedLink", SharedLinkSchema);
