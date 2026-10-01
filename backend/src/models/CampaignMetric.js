import mongoose from 'mongoose';
import { METRIC_FIELDS } from '@product-lab/shared/constants';

const { Schema } = mongoose;

const metricSchema = new Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    experimentId: { type: Schema.Types.ObjectId, ref: 'Experiment', default: null },
    creativeId: { type: Schema.Types.ObjectId, ref: 'AdCreative', default: null },
    campaign: { type: String, trim: true, default: '' },
    adSet: { type: String, trim: true, default: '' },
    ...Object.fromEntries(METRIC_FIELDS.map((f) => [f, { type: Number, min: 0, default: 0 }])),
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true, versionKey: false },
);

metricSchema.index({ productId: 1, date: 1 });
metricSchema.index({ experimentId: 1, date: 1 });
metricSchema.index({ creativeId: 1, date: 1 });
metricSchema.index({ date: 1 });
metricSchema.index({ campaign: 1 });

export default mongoose.model('CampaignMetric', metricSchema);
