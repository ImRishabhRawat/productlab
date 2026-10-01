import mongoose from 'mongoose';

const scheduleSnapshotSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true },
    blocks: { type: Array, default: [] },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model('ScheduleSnapshot', scheduleSnapshotSchema);
