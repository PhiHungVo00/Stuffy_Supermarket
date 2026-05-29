import mongoose, { Document, Schema } from 'mongoose';

export interface IAddress extends Document {
  user: mongoose.Types.ObjectId;
  label: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

const addressSchema = new Schema<IAddress>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  label: { type: String, default: 'Home' },
  address: { type: String, required: true },
  city: { type: String, required: true },
  postalCode: { type: String, required: true },
  country: { type: String, required: true },
  phone: { type: String, default: '' },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model<IAddress>('Address', addressSchema);
