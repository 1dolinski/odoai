import mongoose, { Schema, Document } from "mongoose";

export type SpendType = "openrouter" | "apinow_search" | "qmd";

export interface ISpend extends Document {
  telegramChatId: string;
  type: SpendType;
  label: string;
  tokens?: number;
  cost?: number;
  createdAt: Date;
}

const SpendSchema = new Schema<ISpend>(
  {
    telegramChatId: { type: String, required: true, index: true },
    type: { type: String, enum: ["openrouter", "apinow_search", "qmd"], required: true },
    label: { type: String, required: true },
    tokens: Number,
    cost: Number,
  },
  { timestamps: true }
);

export default mongoose.models.Spend || mongoose.model<ISpend>("Spend", SpendSchema);
