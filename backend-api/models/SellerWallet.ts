import mongoose, { Document, Schema } from 'mongoose';

export interface IWalletTransaction {
  amount: number;
  type: 'escrow_payout' | 'withdrawal' | 'refund' | 'adjustment';
  description: string;
  orderId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface ISellerWallet extends Document {
  shopId: mongoose.Types.ObjectId;
  balance: number;
  pendingEscrow: number;
  currency: string;
  transactions: IWalletTransaction[];
}

const WalletTransactionSchema = new Schema<IWalletTransaction>({
  amount: { type: Number, required: true },
  type: { type: String, enum: ['escrow_payout', 'withdrawal', 'refund', 'adjustment'], required: true },
  description: { type: String, default: '' },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' }
}, { timestamps: { createdAt: true, updatedAt: false } });

const SellerWalletSchema = new Schema<ISellerWallet>({
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, unique: true },
  balance: { type: Number, default: 0 },
  pendingEscrow: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  transactions: [WalletTransactionSchema]
}, { timestamps: true });

export default mongoose.model<ISellerWallet>('SellerWallet', SellerWalletSchema);
