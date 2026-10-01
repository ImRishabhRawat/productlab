import mongoose from 'mongoose';
import { CREATIVE_FORMATS } from '@product-lab/shared/constants';

const { Schema } = mongoose;
const str = { type: String, trim: true, default: '' };

const creativeSchema = new Schema(
  {
    experimentId: { type: Schema.Types.ObjectId, ref: 'Experiment', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    name: { type: String, required: true, trim: true },
    hook: str,
    format: { type: String, enum: CREATIVE_FORMATS, default: 'video' },
    angle: str,
    campaign: str,
    adSet: str,
    startDate: { type: String, default: null },
    url: str,
    notes: str,
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model('AdCreative', creativeSchema);
