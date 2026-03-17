import mongoose, { Schema, Document } from "mongoose";

export interface IRelationship {
  name: string;
  label: string;
  context: string;
}

export interface IDump {
  text: string;
  source: string;
  createdAt: Date;
}

export type PersonType = "member" | "contact";

export interface IPerson extends Document {
  telegramUserId: string;
  telegramChatId: string;
  username?: string;
  firstName?: string;
  role?: string;
  context: string;
  intentions: string[];
  relationships: IRelationship[];
  email?: string;
  phone?: string;
  notes?: string;
  avatarUrl?: string;
  dumps: IDump[];
  resources?: string;
  access?: string;
  source: "telegram" | "manual";
  personType: PersonType;
  messageCount: number;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RelationshipSchema = new Schema<IRelationship>({
  name: { type: String, required: true },
  label: { type: String, default: "" },
  context: { type: String, default: "" },
});

const DumpSchema = new Schema<IDump>({
  text: { type: String, required: true },
  source: { type: String, default: "dashboard" },
  createdAt: { type: Date, default: Date.now },
});

const PersonSchema = new Schema<IPerson>(
  {
    telegramUserId: { type: String, required: true },
    telegramChatId: { type: String, required: true },
    username: String,
    firstName: String,
    role: String,
    context: { type: String, default: "" },
    intentions: [String],
    relationships: [RelationshipSchema],
    email: String,
    phone: String,
    notes: String,
    avatarUrl: { type: String, default: "" },
    dumps: { type: [DumpSchema], default: [] },
    resources: { type: String, default: "" },
    access: { type: String, default: "" },
    source: { type: String, enum: ["telegram", "manual"], default: "telegram" },
    personType: { type: String, enum: ["member", "contact"], default: "member" },
    messageCount: { type: Number, default: 0 },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

PersonSchema.index({ telegramUserId: 1, telegramChatId: 1 }, { unique: true });

export default mongoose.models.Person || mongoose.model<IPerson>("Person", PersonSchema);
