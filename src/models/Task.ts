import mongoose, { Schema, Document } from "mongoose";

export type TaskStatus = "todo" | "upcoming" | "done";
export type Momentum = "new" | "in-motion" | "stalled" | "blocked";
export type EffortLevel = "low" | "medium" | "high";
export type ImpactLevel = "low" | "medium" | "high";
export type ExecutionType = "automated" | "human" | "hybrid";
/** delegate | delete | automate | do — how the task should be handled (4-bucket triage). */
export type ActionLane = "do" | "delegate" | "automate" | "delete";

export interface ISubtask {
  id: string;
  title: string;
  done: boolean;
}

export interface ITitleChange {
  from: string;
  to: string;
  at: Date;
}

export interface ITask extends Document {
  telegramChatId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  categories: string[];
  dueDate?: Date;
  people: string[];
  initiative?: string;
  subtasks: ISubtask[];
  titleHistory: ITitleChange[];
  createdBy: string;
  createdByUsername?: string;
  completedAt?: Date;
  momentum: Momentum;
  effort: EffortLevel;
  impact: ImpactLevel;
  executionType: ExecutionType;
  /** Empty string = not classified yet */
  actionLane: ActionLane | "";
  /** Why this lane (from AI classify / prioritize / explain). */
  actionLaneReason: string;
  costEstimate: string;
  revenueEstimate: string;
  blockedBy: string;
  waitingOn: string;
  priorityScore: number;
  priorityReason: string;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    telegramChatId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: String,
    status: { type: String, enum: ["todo", "upcoming", "done"], default: "todo" },
    categories: { type: [String], default: [] },
    dueDate: Date,
    people: { type: [String], default: [] },
    initiative: { type: String, default: "" },
    subtasks: { type: [{ id: String, title: String, done: { type: Boolean, default: false } }], default: [] },
    titleHistory: { type: [{ from: String, to: String, at: { type: Date, default: Date.now } }], default: [] },
    createdBy: { type: String, required: true },
    createdByUsername: String,
    completedAt: Date,
    momentum: { type: String, enum: ["new", "in-motion", "stalled", "blocked"], default: "new" },
    effort: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    impact: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    executionType: { type: String, enum: ["automated", "human", "hybrid"], default: "human" },
    actionLane: { type: String, enum: ["", "do", "delegate", "automate", "delete"], default: "" },
    actionLaneReason: { type: String, default: "" },
    costEstimate: { type: String, default: "" },
    revenueEstimate: { type: String, default: "" },
    blockedBy: { type: String, default: "" },
    waitingOn: { type: String, default: "" },
    priorityScore: { type: Number, default: 0 },
    priorityReason: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.Task || mongoose.model<ITask>("Task", TaskSchema);
