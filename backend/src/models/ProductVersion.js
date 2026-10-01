import mongoose from 'mongoose';

const { Schema } = mongoose;

const versionSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    label: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    price: { type: Number, min: 0, default: null },
    changes: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model('ProductVersion', versionSchema);
