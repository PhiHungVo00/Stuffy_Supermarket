import mongoose, { Document, Schema } from 'mongoose';
import { Product as SharedProduct } from '@stuffy/types';

export interface IReview extends Document {
  name: string;
  rating: number;
  comment: string;
  user: mongoose.Schema.Types.ObjectId;
}

const reviewSchema = new Schema<IReview>({
  name: { type: String, required: true },
  rating: { type: Number, required: true },
  comment: { type: String, required: true },
  user: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
}, { timestamps: true });

export interface IProduct extends Document, Omit<SharedProduct, 'id'> {
  _id: mongoose.Types.ObjectId;
  tenantId: string;
  images: string[];
  variants: mongoose.Types.ObjectId[];
  shop: mongoose.Types.ObjectId;
}

const ProductSchema = new Schema<IProduct>({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String, default: "A really great tech product." },
  image: { type: String, default: "https://via.placeholder.com/150/6366f1/ffffff?text=New+Item" },
  images: [{ type: String }],
  category: { type: String, required: true, default: "Uncategorized" },
  rating: { type: Number, required: true, default: 0 },
  numReviews: { type: Number, required: true, default: 0 },
  countInStock: { type: Number, required: true, default: 50 },
  reviews: [reviewSchema],
  tenantId: { type: String, required: true, default: 'default_store' },
  variants: [{ type: Schema.Types.ObjectId, ref: 'ProductVariant' }],
  shop: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
}, { timestamps: true });

export default mongoose.model<IProduct>('Product', ProductSchema);
