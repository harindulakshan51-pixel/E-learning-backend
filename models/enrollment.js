import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  userId: { type: String, required: true }, courseId: { type: String, required: true },
  enrolledDate: { type: Date, default: Date.now }, paymentStatus: { type: String, default: 'completed' },
  status: { type: String, enum: ['active', 'revoked', 'pending_review'], default: 'pending_review' },
  method: { type: String, default: 'legacy' }, accessCodeId: mongoose.Schema.Types.ObjectId,
  lastVideoId: String, position: { type: Number, default: 0 }, completedVideos: { type: [String], default: [] },
  lastActivity: Date, revokedAt: Date, revokedBy: String,
});
schema.index({ userId: 1, courseId: 1 }, { unique: true });
export default mongoose.model('enrollment', schema);
