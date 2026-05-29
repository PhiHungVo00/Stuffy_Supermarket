import mongoose, { Document, Schema } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  slug: string;
  parent: mongoose.Types.ObjectId | null;
  image: string;
  level: number;
  tenantId: string;
}

const categorySchema = new Schema<ICategory>({
  name: { type: String, required: true },
  slug: { type: String, required: true },
  parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  image: { type: String, default: '' },
  level: { type: Number, default: 0 },
  tenantId: { type: String, required: true, default: 'default_store' },
}, { timestamps: true });

categorySchema.index({ slug: 1, tenantId: 1 }, { unique: true });

export default mongoose.model<ICategory>('Category', categorySchema);
