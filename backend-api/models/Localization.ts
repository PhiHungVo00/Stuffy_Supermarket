import mongoose from 'mongoose';

const LocalizationSchema = new mongoose.Schema({
  lang: { type: String, required: true, enum: ['en', 'vi'] },
  key: { type: String, required: true },
  value: { type: String, required: true },
  tenantId: { type: String, required: true, default: 'default_store' }
});

// Compound unique index to prevent duplicate keys per language and tenant
LocalizationSchema.index({ lang: 1, key: 1, tenantId: 1 }, { unique: true });

export default mongoose.model('Localization', LocalizationSchema);
