import 'dotenv/config';
import mongoose from 'mongoose';
import { youtubeId } from '../lib/security.js';
const apply = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
try {
  const lessons = mongoose.connection.db.collection('coursevideos');
  let normalized = 0, needsReplacement = 0;
  for await (const lesson of lessons.find({})) {
    let id;
    try { id = youtubeId(lesson.youtubeVideoId || lesson.videoUrl); }
    catch { needsReplacement++; continue; }
    if (id !== lesson.youtubeVideoId) {
      normalized++;
      // Retain all legacy source fields and all lesson/progress identifiers.
      if (apply) await lessons.updateOne({ _id: lesson._id, youtubeVideoId: lesson.youtubeVideoId ?? { $exists: false } }, { $set: { youtubeVideoId: id } });
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', normalized, needsReplacement }));
} finally { await mongoose.disconnect(); }
