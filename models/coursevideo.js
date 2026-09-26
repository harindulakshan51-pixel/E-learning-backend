import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  videoId: { type: String, unique: true, required: true },
  courseId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  youtubeVideoId: { type: String, match: /^[A-Za-z0-9_-]{11}$/ },
  durationSeconds: Number,
  duration: { type: String, required: true },
  order: { type: Number, required: true },
  isPreview: { type: Boolean, default: false },
});
export default mongoose.model('coursevideo', schema);
