import mongoose, { Document, Schema } from 'mongoose';

export interface IShop extends Document {
  name: string;
  owner: mongoose.Types.ObjectId;
  description: string;
  logo: string;
  rating: number;
  tenantId: string;
  province: string;
  district: string;
  decorationConfig?: any;
  isLive?: boolean;
  activeStreamUrl?: string;
  aiChatbotEnabled?: boolean;
  aiChatbotPrompt?: string;
}

const shopSchema = new Schema<IShop>({
  name: { type: String, required: true, unique: true },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, default: '' },
  logo: { type: String, default: '' },
  rating: { type: Number, default: 0 },
  tenantId: { type: String, required: true, default: 'default_store' },
  province: { type: String, default: 'Hồ Chí Minh' },
  district: { type: String, default: 'Quận Thủ Đức' },
  decorationConfig: { type: Schema.Types.Mixed, default: null },
  isLive: { type: Boolean, default: false },
  activeStreamUrl: { type: String, default: '' },
  aiChatbotEnabled: { type: Boolean, default: false },
  aiChatbotPrompt: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model<IShop>('Shop', shopSchema);
