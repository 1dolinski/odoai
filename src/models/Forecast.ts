import mongoose, { Schema, Document } from "mongoose";

export interface ISimulatedMessage {
  role: "user" | "assistant";
  author: string;
  content: string;
  timestamp: string;
}

export interface IHorizonForecast {
  horizon: string;
  label: string;
  messages: ISimulatedMessage[];
  keyMilestones: string[];
  score: number;
}

export type ForecastStatus = "running" | "complete" | "failed";

export interface IForecast extends Document {
  telegramChatId: string;
  guidance: string;
  horizons: IHorizonForecast[];
  iterations: number;
  /** LLM id (e.g. moonshotai/kimi-k2.5) — not named `model` to avoid clashing with Document.model */
  llmModel: string;
  generatedAt: Date;
  status: ForecastStatus;
  errorMessage?: string;
  /** Truncated stack / diagnostic for debugging failed runs */
  errorStack?: string;
  lastLog?: string;
  progressLogs: string[];
  createdAt: Date;
}

const SimulatedMessageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    author: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: String, required: true },
  },
  { _id: false },
);

const HorizonForecastSchema = new Schema(
  {
    horizon: { type: String, required: true },
    label: { type: String, required: true },
    messages: [SimulatedMessageSchema],
    keyMilestones: [String],
    score: { type: Number, default: 5 },
  },
  { _id: false },
);

const ForecastSchema = new Schema<IForecast>(
  {
    telegramChatId: { type: String, required: true, index: true },
    guidance: { type: String, default: "" },
    horizons: [HorizonForecastSchema],
    iterations: { type: Number, default: 1 },
    llmModel: { type: String, default: "" },
    generatedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["running", "complete", "failed"],
      default: "complete",
    },
    errorMessage: { type: String },
    errorStack: { type: String },
    lastLog: { type: String },
    progressLogs: { type: [String], default: [] },
  },
  { timestamps: true },
);

ForecastSchema.index({ telegramChatId: 1, createdAt: -1 });
ForecastSchema.index({ telegramChatId: 1, status: 1 });

export default mongoose.models.Forecast || mongoose.model<IForecast>("Forecast", ForecastSchema);
