import mongoose, { Schema, Document } from "mongoose";

export type TaskStatus = "todo" | "upcoming" | "done";

export interface ISubtask {
  id: string;
  title: string;
  done: boolean;
}

export interface ITask extends Document {
  telegramChatId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  dueDate?: Date;
  people: string[];
  initiative?: string;
  subtasks: ISubtask[];
  createdBy: string;
  createdByUsername?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    telegramChatId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: String,
    status: { type: String, enum: ["todo", "upcoming", "done"], default: "todo" },
    dueDate: Date,
    people: { type: [String], default: [] },
    initiative: { type: String, default: "" },
    subtasks: { type: [{ id: String, title: String, done: { type: Boolean, default: false } }], default: [] },
    createdBy: { type: String, required: true },
    createdByUsername: String,
    completedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.models.Task || mongoose.model<ITask>("Task", TaskSchema);
