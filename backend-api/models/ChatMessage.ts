import mongoose, { Document, Schema } from 'mongoose';

export interface IChatMessage extends Document {
  sender: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId;
  shop?: mongoose.Types.ObjectId;
  message: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>({
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  shop: { type: Schema.Types.ObjectId, ref: 'Shop' },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false }
}, { timestamps: true });

// Create indexes for efficient conversation fetching
ChatMessageSchema.index({ sender: 1, recipient: 1, createdAt: 1 });
ChatMessageSchema.index({ recipient: 1, sender: 1, createdAt: 1 });

export default mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
