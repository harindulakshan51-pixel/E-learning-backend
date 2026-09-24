import 'dotenv/config';
import mongoose from 'mongoose';
import Enrollment from '../models/enrollment.js';
import AccessCode from '../models/accessCode.js';
import CourseVideo from '../models/coursevideo.js';
import '../middlewares/rateLimit.js';
import User from '../models/user.js';
import Course from '../models/course.js';
import Otp from '../models/Otp.js';
const apply = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
try {
  const db = mongoose.connection.db;
  const duplicateGroups = await db.collection('enrollments').aggregate([{ $group: { _id: { userId: '$userId', courseId: '$courseId' }, ids: { $push: '$_id' }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]).toArray();
  const legacy = await db.collection('enrollments').countDocuments({ status: { $exists: false } });
  const videos = await db.collection('coursevideos').countDocuments({ provider: { $exists: false } });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', legacyEnrollments: legacy, duplicateGroups: duplicateGroups.length, legacyVideos: videos }));
  if (!apply) { console.log('Back up MongoDB, stop API writes, then rerun with --apply. No records changed.'); }
  else {
    // Preserve every duplicate in a dedicated archive before consolidation.
    for (const group of duplicateGroups) {
      const records = await db.collection('enrollments').find({ _id: { $in: group.ids } }).toArray();
      records.sort((a, b) => {
        const rank = x => x.status === 'revoked' ? 0 : x.status === 'active' ? 1 : 2;
        return rank(a) - rank(b) || new Date(a.enrolledDate) - new Date(b.enrolledDate);
      });
      for (const row of records.slice(1)) {
        await db.collection('enrollment_duplicate_archive').updateOne({ _id: row._id }, { $setOnInsert: row }, { upsert: true });
        await db.collection('enrollments').deleteOne({ _id: row._id });
      }
    }
    for await (const row of db.collection('enrollments').find({ status: { $exists: false } })) {
      const paid = await db.collection('orders').findOne({ email: row.userId, status: 'Completed', 'items.courseId': row.courseId });
      await db.collection('enrollments').updateOne({ _id: row._id, status: { $exists: false } }, { $set: { status: paid ? 'active' : 'pending_review', method: paid ? 'legacy_completed_order' : 'legacy_review', completedVideos: [] } });
    }
    // Recover legitimate completed purchases missing an enrollment. Never reactivate revoked records.
    for await (const order of db.collection('orders').find({ status: 'Completed' })) {
      for (const item of order.items || []) {
        await db.collection('enrollments').updateOne({ userId: order.email, courseId: item.courseId }, { $setOnInsert: { userId: order.email, courseId: item.courseId, status: 'active', method: 'legacy_completed_order', paymentStatus: 'completed', enrolledDate: order.date || new Date(), completedVideos: [] } }, { upsert: true });
      }
    }
    await db.collection('coursevideos').updateMany({ provider: { $exists: false } }, { $set: { provider: 'legacy', isPreview: false } });
    await db.collection('users').updateMany({ sessionVersion: { $exists: false } }, { $set: { sessionVersion: 0 } });
    // Previously issued reset codes have no reliable expiry; invalidate them.
    await db.collection('otps').deleteMany({ expiresAt: { $exists: false } });
    await User.createIndexes();
    await Course.createIndexes();
    await Otp.createIndexes();
    await Enrollment.createIndexes();
    await AccessCode.createIndexes();
    await CourseVideo.createIndexes();
    await mongoose.model('SecurityAttempt').createIndexes();
    console.log('Migration complete. Review pending legacy enrollments in the admin panel. Existing video URLs remain stored but cannot be played.');
  }
} finally { await mongoose.disconnect(); }
