import mongoose, { Schema, Document } from "mongoose";

export interface IDataSnapshot extends Document {
  telegramChatId: string;
  sourceId: string;
  endpointId: string;
  data: Record<string, unknown>;
  fetchedAt: Date;
  error?: string;
}

const DataSnapshotSchema = new Schema<IDataSnapshot>(
  {
    telegramChatId: { type: String, required: true, index: true },
    sourceId: { type: String, required: true },
    endpointId: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    fetchedAt: { type: Date, default: Date.now, index: true },
    error: String,
  },
  { timestamps: true }
);

DataSnapshotSchema.index({ telegramChatId: 1, sourceId: 1, endpointId: 1, fetchedAt: -1 });

export default mongoose.models.DataSnapshot || mongoose.model<IDataSnapshot>("DataSnapshot", DataSnapshotSchema);
