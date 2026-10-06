import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  courseId: { type: String, required: true, index: true },
  digest: { type: String, required: true, unique: true, select: false },
  encryptedCode: { type: String, select: false },
  hint: String, assignedEmail: String,
  status: { type: String, enum: ['unused', 'redeemed', 'revoked'], default: 'unused' },
  expiresAt: Date, createdBy: String, redeemedBy: String, redeemedAt: Date, revokedBy: String, revokedAt: Date,
}, { timestamps: true });
export default mongoose.model('AccessCode', schema);
