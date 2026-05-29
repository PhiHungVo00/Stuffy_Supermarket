import mongoose, { Document, Schema } from 'mongoose';

export interface IVoucher extends Document {
  code: string;
  type: 'shipping' | 'discount' | 'cashback';
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  description: string;
  minOrderValue: number;
  maxDiscount: number;
  usageLimit: number;
  usedCount: number;
  claimedBy: mongoose.Types.ObjectId[];
  expiresAt: Date;
  isActive: boolean;
  tenantId: string;
}

const voucherSchema = new Schema<IVoucher>({
  code: { type: String, required: true, unique: true, uppercase: true },
  type: { type: String, enum: ['shipping', 'discount', 'cashback'], required: true },
  discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
  discountValue: { type: Number, required: true },
  description: { type: String, required: true },
  minOrderValue: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: 0 },
  usageLimit: { type: Number, default: 100 },
  usedCount: { type: Number, default: 0 },
  claimedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  expiresAt: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  tenantId: { type: String, required: true, default: 'default_store' }
}, { timestamps: true });

export default mongoose.model<IVoucher>('Voucher', voucherSchema);
