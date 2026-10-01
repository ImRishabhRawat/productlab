import mongoose from 'mongoose';
import { AI_KINDS } from '@product-lab/shared/constants';

const { Schema } = mongoose;

const aiAnalysisSchema = new Schema(
  {
    kind: { type: String, enum: AI_KINDS, required: true },
    targetId: { type: Schema.Types.ObjectId, default: null },
    title: { type: String, trim: true, default: '' },
    input: { type: Schema.Types.Mixed, default: null },
    output: { type: Schema.Types.Mixed, default: null },
    model: { type: String, default: '' },
  },
  { timestamps: true, versionKey: false },
);

aiAnalysisSchema.index({ kind: 1, targetId: 1, createdAt: -1 });

export default mongoose.model('AIAnalysis', aiAnalysisSchema);
