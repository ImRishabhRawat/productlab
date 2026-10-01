import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true, lowercase: true, trim: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    label: { type: String, trim: true, default: '' },
    userAgent: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
    failures: { type: Number, default: 0 },
    lastSeenAt: { type: Date, default: Date.now },
    lastSuccessAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

pushSubscriptionSchema.index({ owner: 1, active: 1 });

export default mongoose.model('PushSubscription', pushSubscriptionSchema);
