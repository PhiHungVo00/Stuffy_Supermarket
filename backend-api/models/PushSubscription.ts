import mongoose from 'mongoose';

const PushSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subscription: {
    endpoint: { type: String, required: true },
    expirationTime: { type: Number },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    }
  },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('PushSubscription', PushSubscriptionSchema);
