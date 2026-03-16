import mongoose, { Schema, Document } from "mongoose";

export type CheckStatus = "pending" | "done" | "skipped";

export interface ICheck extends Document {
  telegramChatId: string;
  description: string;
  status: CheckStatus;
  scheduledFor: Date;
  context: string;
  triggeredBy: string;
  triggeredByUsername?: string;
  result?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CheckSchema = new Schema<ICheck>(
  {
    telegramChatId: { type: String, required: true, index: true },
    description: { type: String, required: true },
    status: { type: String, enum: ["pending", "done", "skipped"], default: "pending" },
    scheduledFor: { type: Date, required: true, index: true },
    context: { type: String, default: "" },
    triggeredBy: { type: String, default: "system" },
    triggeredByUsername: String,
    result: String,
    completedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.models.Check || mongoose.model<ICheck>("Check", CheckSchema);
