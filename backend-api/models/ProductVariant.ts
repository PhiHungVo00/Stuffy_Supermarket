import mongoose, { Document, Schema } from 'mongoose';

export interface IProductVariant extends Document {
  product: mongoose.Types.ObjectId;
  sku: string;
  attributes: {
    size?: string;
    color?: string;
    storage?: string;
    [key: string]: string | undefined;
  };
  price: number;
  countInStock: number;
  image?: string;
}

const productVariantSchema = new Schema<IProductVariant>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  sku: { type: String, required: true, unique: true },
  attributes: {
    size: { type: String },
    color: { type: String },
    storage: { type: String },
  },
  price: { type: Number, required: true },
  countInStock: { type: Number, required: true, default: 0 },
  image: { type: String },
}, { timestamps: true });

export default mongoose.model<IProductVariant>('ProductVariant', productVariantSchema);
