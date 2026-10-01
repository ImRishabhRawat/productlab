import mongoose from 'mongoose';
import { NOTIFICATION_CATEGORIES } from '@product-lab/shared/constants';

const notificationSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true, lowercase: true, trim: true },
    category: { type: String, enum: NOTIFICATION_CATEGORIES, required: true },
    type: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true, default: '' },
    url: { type: String, default: '/' },
    dedupeKey: { type: String, default: null },
    readAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    pushed: {
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: String, default: '' },
    },
  },
  { timestamps: true, versionKey: false },
);

notificationSchema.index({ owner: 1, createdAt: -1 });
notificationSchema.index({ owner: 1, readAt: 1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

export default mongoose.model('Notification', notificationSchema);
