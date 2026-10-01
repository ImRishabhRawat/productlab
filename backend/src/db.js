import mongoose from 'mongoose';

export async function connectDb(uri) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  } catch (err) {
    throw new Error(`Could not connect to MongoDB at ${uri.replace(/\/\/[^@]*@/, '//***@')}. Set MONGODB_URI or run "npm run db". (${err.message})`);
  }
}

export const disconnectDb = () => mongoose.disconnect();
