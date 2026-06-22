import mongoose, { Document, Schema } from 'mongoose';

export interface IWalletTransaction {
  amount: number;
  type: 'escrow_payout' | 'withdrawal' | 'refund' | 'adjustment';
  description: string;
  orderId?: mongoose.Types.ObjectId;
  status?: 'pending' | 'success' | 'failed';
  bankName?: string;
  accountNumber?: string;
  recipientName?: string;
  referenceId?: string;
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
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'success' },
  bankName: { type: String },
  accountNumber: { type: String },
  recipientName: { type: String },
  referenceId: { type: String }
}, { timestamps: { createdAt: true, updatedAt: false } });

const SellerWalletSchema = new Schema<ISellerWallet>({
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, unique: true },
  balance: { type: Number, default: 0 },
  pendingEscrow: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  transactions: [WalletTransactionSchema]
}, { timestamps: true });

export default mongoose.model<ISellerWallet>('SellerWallet', SellerWalletSchema);
