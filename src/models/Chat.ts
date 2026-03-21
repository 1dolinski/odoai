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

export interface IInitiative {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "completed";
  createdAt: Date;
}

export interface IChatDataSourceEndpoint {
  sourceId: string;
  endpointId: string;
  enabled: boolean;
  lastFetchAt?: Date;
}

export interface IAiQuestion {
  id: string;
  category: string;
  question: string;
  answer: string;
  skipped?: boolean;
  answeredAt?: Date;
  createdAt: Date;
}

export interface IMenuItem {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  aiSuggestions?: string;
  targetBuyers?: string;
  createdAt: Date;
}

export interface IOffer {
  id: string;
  name: string;
  description: string;
  pricePoint: string;
  targetBuyer: string;
  whyNow: string;
  deliveryMethod: string;
  costToDeliver: string;
  revenueEstimate: string;
  confidenceScore: number;
  confidenceReason: string;
  validationNotes: string;
  /** Non‑negotiable core of what gets delivered (the spine of the offer). */
  meatAndPotatoes: string[];
  /** How named people / roles from the team plug in (from context). */
  teamLeverage: string[];
  /** Operational execution moves (logistics, proof, handoffs, ops); UI shows a preview then expand. */
  standoutActions: string[];
  /** 2–4 differentiated / creative moves (story, partnerships, wow moments). */
  creativePlays: string[];
  /** What you should hear/see in team chat when this offer is actually thriving. */
  chatSignals: string[];
  /** One short message to paste in Telegram to align owners and next steps. */
  teamPing: string;
  status: "hypothesis" | "validating" | "validated" | "rejected" | "live";
  iteration: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOfferResearchLog {
  id: string;
  iteration: number;
  action: string;
  result: string;
  /** How to keep the group chat aligned and high-signal this iteration. */
  conversationCadence: string[];
  keptOffers: string[];
  discardedOffers: string[];
  newOffers: string[];
  createdAt: Date;
}

export interface IChat extends Document {
  telegramChatId: string;
  chatTitle?: string;
  mode: ChatMode;
  aiStyle: AiStyle;
  aiModel: string;
  dashboardToken: string;
  watchSettings: IWatchSettings;
  messages: IMessage[];
  guidance: string;
  dumps: { text: string; source: string; category: string; subject: string; createdAt: Date }[];
  initiatives: IInitiative[];
  abilities: string;
  contextSummary: string;
  lastSummaryAt: Date;
  lastSyncAt: Date;
  lastReviewedAt: Date;
  aiFeedEnabled: boolean;
  aiFeed: { type: string; content: string; status: string; createdAt: Date }[];
  aiQuestions: IAiQuestion[];
  menu: IMenuItem[];
  dataSources: IChatDataSourceEndpoint[];
  priorityNarrative: string;
  leveragePlay: string;
  lastPrioritizedAt: Date;
  offers: IOffer[];
  offerResearchLog: IOfferResearchLog[];
  offerIteration: number;
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
    aiModel: { type: String, default: "moonshotai/kimi-k2.5" },
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
    dumps: { type: [{ text: String, source: String, category: { type: String, default: "general" }, subject: { type: String, default: "" }, createdAt: { type: Date, default: Date.now } }], default: [] },
    initiatives: { type: [{ id: String, name: String, description: { type: String, default: "" }, status: { type: String, enum: ["active", "paused", "completed"], default: "active" }, createdAt: { type: Date, default: Date.now } }], default: [] },
    abilities: { type: String, default: "" },
    contextSummary: { type: String, default: "" },
    lastSummaryAt: { type: Date },
    lastSyncAt: { type: Date },
    lastReviewedAt: { type: Date },
    aiFeedEnabled: { type: Boolean, default: false },
    aiFeed: [{ type: { type: String }, content: String, status: { type: String, enum: ["new", "seen", "actioned"], default: "new" }, createdAt: { type: Date, default: Date.now } }],
    aiQuestions: { type: [{ id: String, category: String, question: String, answer: { type: String, default: "" }, skipped: { type: Boolean, default: false }, answeredAt: Date, createdAt: { type: Date, default: Date.now } }], default: [] },
    menu: { type: [{ id: String, name: String, description: { type: String, default: "" }, price: { type: String, default: "" }, category: { type: String, default: "general" }, aiSuggestions: { type: String, default: "" }, targetBuyers: { type: String, default: "" }, createdAt: { type: Date, default: Date.now } }], default: [] },
    dataSources: { type: [{ sourceId: String, endpointId: String, enabled: { type: Boolean, default: true }, lastFetchAt: Date }], default: [] },
    priorityNarrative: { type: String, default: "" },
    leveragePlay: { type: String, default: "" },
    lastPrioritizedAt: { type: Date },
    offers: { type: [{
      id: String, name: String, description: { type: String, default: "" },
      pricePoint: { type: String, default: "" }, targetBuyer: { type: String, default: "" },
      whyNow: { type: String, default: "" }, deliveryMethod: { type: String, default: "" },
      costToDeliver: { type: String, default: "" }, revenueEstimate: { type: String, default: "" },
      confidenceScore: { type: Number, default: 0 }, confidenceReason: { type: String, default: "" },
      validationNotes: { type: String, default: "" },
      meatAndPotatoes: { type: [String], default: [] },
      teamLeverage: { type: [String], default: [] },
      standoutActions: { type: [String], default: [] },
      creativePlays: { type: [String], default: [] },
      chatSignals: { type: [String], default: [] },
      teamPing: { type: String, default: "" },
      status: { type: String, enum: ["hypothesis", "validating", "validated", "rejected", "live"], default: "hypothesis" },
      iteration: { type: Number, default: 1 },
      createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now },
    }], default: [] },
    offerResearchLog: { type: [{
      id: String, iteration: Number, action: String, result: String,
      conversationCadence: { type: [String], default: [] },
      keptOffers: [String], discardedOffers: [String], newOffers: [String],
      createdAt: { type: Date, default: Date.now },
    }], default: [] },
    offerIteration: { type: Number, default: 0 },
    messagesSinceSummary: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Chat || mongoose.model<IChat>("Chat", ChatSchema);
