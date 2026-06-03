import mongoose, { Document, Schema } from 'mongoose';

export interface ICoinTransaction extends Document {
  user: mongoose.Types.ObjectId;
  amount: number; // Positive for earn, negative for spend/refund
  type: 'earn' | 'spend' | 'refund';
  isCredited: boolean; // false until order is Delivered
  orderId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const CoinTransactionSchema = new Schema<ICoinTransaction>({
  user: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  amount: {
    type: Number,
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['earn', 'spend', 'refund'],
  },
  isCredited: {
    type: Boolean,
    required: true,
    default: false,
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
  }
}, { timestamps: true });

export default mongoose.model<ICoinTransaction>('CoinTransaction', CoinTransactionSchema);
