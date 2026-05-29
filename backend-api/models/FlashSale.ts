import mongoose, { Document, Schema } from 'mongoose';

export interface IFlashSale extends Document {
  product: mongoose.Types.ObjectId;
  originalPrice: number;
  flashPrice: number;
  startAt: Date;
  endAt: Date;
  isActive: boolean;
  tenantId: string;
}

const flashSaleSchema = new Schema<IFlashSale>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  originalPrice: { type: Number, required: true },
  flashPrice: { type: Number, required: true },
  startAt: { type: Date, required: true, default: Date.now },
  endAt: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  tenantId: { type: String, required: true, default: 'default_store' },
}, { timestamps: true });

flashSaleSchema.index({ endAt: 1, isActive: 1 });

export default mongoose.model<IFlashSale>('FlashSale', flashSaleSchema);
