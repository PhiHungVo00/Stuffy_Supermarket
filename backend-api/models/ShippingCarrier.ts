import mongoose, { Document, Schema } from 'mongoose';

export interface IShippingCarrier extends Document {
  name: string;
  code: string; // 'ghn', 'ghtk', or 'viettelpost'
  logo: string;
  isActive: boolean;
  baseRate: number;
}

const ShippingCarrierSchema = new Schema<IShippingCarrier>({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true },
  logo: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  baseRate: { type: Number, default: 5 }
}, { timestamps: true });

export default mongoose.model<IShippingCarrier>('ShippingCarrier', ShippingCarrierSchema);
