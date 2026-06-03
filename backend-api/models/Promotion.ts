import mongoose, { Document, Schema } from 'mongoose';

export interface IAddonProduct {
  product: mongoose.Types.ObjectId;
  addonPrice: number;
}

export interface IPromotion extends Document {
  shopId: mongoose.Types.ObjectId;
  name: string;
  type: 'bundle_deal' | 'addon_deal' | 'flash_sale';
  minQuantity?: number; // for bundle_deal (e.g. buy 2 get 10% off)
  discountType?: 'percentage' | 'fixed_amount'; // for bundle_deal & flash_sale
  discountValue?: number; // for bundle_deal & flash_sale
  primaryProductId?: mongoose.Types.ObjectId; // for addon_deal & flash_sale (purchasing this triggers the deal)
  addonProducts?: IAddonProduct[]; // for addon_deal
  status: 'active' | 'inactive';
  startsAt: Date;
  endsAt: Date;
}

const AddonProductSchema = new Schema<IAddonProduct>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  addonPrice: { type: Number, required: true }
}, { _id: false });

const PromotionSchema = new Schema<IPromotion>({
  shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['bundle_deal', 'addon_deal', 'flash_sale'], required: true },
  minQuantity: { type: Number, default: 2 },
  discountType: { type: String, enum: ['percentage', 'fixed_amount'] },
  discountValue: { type: Number },
  primaryProductId: { type: Schema.Types.ObjectId, ref: 'Product' },
  addonProducts: [AddonProductSchema],
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true }
}, { timestamps: true });

export default mongoose.model<IPromotion>('Promotion', PromotionSchema);
