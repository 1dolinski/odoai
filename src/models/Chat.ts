import mongoose, { Schema, Document } from "mongoose";

export interface IMessage {
  role: "user" | "assistant";
  content: string;
  telegramUserId?: string;
  telegramUsername?: string;
  firstName?: string;
  createdAt: Date;
}

export type ChatMode = "passive" | "active" | "aggressive";
export type AiStyle = "concise" | "detailed" | "casual" | "professional" | "technical";

export interface IWatchSettings {
  deadlines: boolean;
  blockers: boolean;
  actionItems: boolean;
  sentiment: boolean;
  questions: boolean;
  followUps: boolean;
  newPeople: boolean;
  decisions: boolean;
  opportunities: boolean;
}

export const WATCH_DEFAULTS: IWatchSettings = {
  deadlines: true,
  blockers: true,
  actionItems: true,
  sentiment: false,
  questions: true,
  followUps: true,
  newPeople: true,
  decisions: false,
  opportunities: true,
};

export interface IChat extends Document {
  telegramChatId: string;
  chatTitle?: string;
  mode: ChatMode;
  aiStyle: AiStyle;
  dashboardToken: string;
  watchSettings: IWatchSettings;
  messages: IMessage[];
  guidance: string;
  contextSummary: string;
  lastSummaryAt: Date;
  lastSyncAt: Date;
  lastReviewedAt: Date;
  messagesSinceSummary: number;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  telegramUserId: String,
  telegramUsername: String,
  firstName: String,
  createdAt: { type: Date, default: Date.now },
});

const ChatSchema = new Schema<IChat>(
  {
    telegramChatId: { type: String, required: true, unique: true, index: true },
    chatTitle: String,
    mode: { type: String, enum: ["passive", "active", "aggressive"], default: "passive" },
    aiStyle: {
      type: String,
      enum: ["concise", "detailed", "casual", "professional", "technical"],
      default: "concise",
    },
    dashboardToken: { type: String, unique: true, sparse: true },
    watchSettings: {
      deadlines: { type: Boolean, default: true },
      blockers: { type: Boolean, default: true },
      actionItems: { type: Boolean, default: true },
      sentiment: { type: Boolean, default: false },
      questions: { type: Boolean, default: true },
      followUps: { type: Boolean, default: true },
      newPeople: { type: Boolean, default: true },
      decisions: { type: Boolean, default: false },
      opportunities: { type: Boolean, default: true },
    },
    messages: [MessageSchema],
    guidance: { type: String, default: "" },
    contextSummary: { type: String, default: "" },
    lastSummaryAt: { type: Date },
    lastSyncAt: { type: Date },
    lastReviewedAt: { type: Date },
    messagesSinceSummary: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Chat || mongoose.model<IChat>("Chat", ChatSchema);
