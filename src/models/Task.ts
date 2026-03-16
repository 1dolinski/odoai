import mongoose, { Schema, Document } from "mongoose";

export type TaskStatus = "todo" | "upcoming" | "done";

export interface ITask extends Document {
  telegramChatId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  createdBy: string;
  createdByUsername?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    telegramChatId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: String,
    status: { type: String, enum: ["todo", "upcoming", "done"], default: "todo" },
    createdBy: { type: String, required: true },
    createdByUsername: String,
  },
  { timestamps: true }
);

export default mongoose.models.Task || mongoose.model<ITask>("Task", TaskSchema);
