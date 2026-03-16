import mongoose, { Schema, Document } from "mongoose";

export interface IRelationship {
  personId: string;
  label: string;
  notes: string;
}

export interface IPerson extends Document {
  telegramUserId: string;
  telegramChatId: string;
  username?: string;
  firstName?: string;
  role?: string;
  context: string;
  intentions: string[];
  relationships: IRelationship[];
  messageCount: number;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RelationshipSchema = new Schema<IRelationship>({
  personId: { type: String, required: true },
  label: String,
  notes: String,
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
    messageCount: { type: Number, default: 0 },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

PersonSchema.index({ telegramUserId: 1, telegramChatId: 1 }, { unique: true });

export default mongoose.models.Person || mongoose.model<IPerson>("Person", PersonSchema);
