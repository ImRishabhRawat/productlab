import mongoose from 'mongoose';
import { IDEA_SIGNALS, IDEA_STATUSES } from '@product-lab/shared/constants';

const { Schema } = mongoose;
const scoreField = { type: Number, min: 0, max: 10, default: null };
const str = { type: String, trim: true, default: '' };

const validationSchema = new Schema(
  {
    competitors: [new Schema({ name: str, url: str, price: { type: Number, default: null }, notes: str }, { _id: false })],
    ads: [new Schema({ label: str, url: str, notes: str }, { _id: false })],
    priceExamples: [new Schema({ label: str, price: { type: Number, min: 0 } }, { _id: false })],
    signals: Object.fromEntries(IDEA_SIGNALS.map((k) => [k, { score: scoreField, note: str }])),
    audience: str,
    painDesire: str,
    rightsNotes: str,
  },
  { _id: false },
);

const ideaSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: str,
    targetCustomer: str,
    problem: str,
    format: str,
    deliverable: str,
    expectedPrice: { type: Number, min: 0, default: null },
    effort: scoreField,
    demonstrability: scoreField,
    repeatPotential: scoreField,
    legalRisk: scoreField,
    source: str,
    notes: str,
    status: { type: String, enum: IDEA_STATUSES, default: 'idea', index: true },
    validation: { type: validationSchema, default: () => ({}) },
    history: [new Schema({ at: { type: Date, default: Date.now }, from: String, to: String }, { _id: false })],
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    convertedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

ideaSchema.index({ category: 1 });
ideaSchema.index({ createdAt: -1 });

export default mongoose.model('ProductIdea', ideaSchema);
