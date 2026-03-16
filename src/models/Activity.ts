import mongoose, { Schema, Document } from "mongoose";

export type ActivityType =
  | "task_added"
  | "task_upcoming"
  | "task_done"
  | "task_converted"
  | "person_added"
  | "check_scheduled"
  | "check_completed"
  | "style_changed"
  | "mode_changed"
  | "dump"
  | "ai_triggered";

export interface IActivity extends Document {
  telegramChatId: string;
  type: ActivityType;
  title: string;
  detail?: string;
  actor?: string;
  createdAt: Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    telegramChatId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    detail: String,
    actor: String,
  },
  { timestamps: true }
);

ActivitySchema.index({ telegramChatId: 1, createdAt: -1 });

export default mongoose.models.Activity || mongoose.model<IActivity>("Activity", ActivitySchema);
