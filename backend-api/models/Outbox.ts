import mongoose, { Document, Schema } from 'mongoose';

export interface IOutbox extends Document {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: any;
  status: 'pending' | 'processed' | 'failed';
  error?: string;
  createdAt: Date;
  processedAt?: Date;
}

const OutboxSchema = new Schema<IOutbox>({
  aggregateType: { type: String, required: true },
  aggregateId: { type: String, required: true },
  eventType: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'processed', 'failed'], default: 'pending' },
  error: { type: String },
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model<IOutbox>('Outbox', OutboxSchema);
