import mongoose, { Schema, Document } from "mongoose";

export interface IJob extends Document {
  telegramChatId: string;
  title: string;
  description: string;
  status: "active" | "paused" | "completed";
  checkInIntervalMin: number;
  lastCheckIn: Date;
  nextCheckIn: Date;
  context: string;
  createdBy: string;
  createdByUsername?: string;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    telegramChatId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, enum: ["active", "paused", "completed"], default: "active" },
    checkInIntervalMin: { type: Number, default: 60 },
    lastCheckIn: { type: Date, default: Date.now },
    nextCheckIn: { type: Date },
    context: { type: String, default: "" },
    createdBy: { type: String, required: true },
    createdByUsername: String,
  },
  { timestamps: true }
);

export default mongoose.models.Job || mongoose.model<IJob>("Job", JobSchema);
