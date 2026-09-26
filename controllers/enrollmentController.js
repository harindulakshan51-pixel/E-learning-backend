import mongoose from 'mongoose';
import Enrollment from '../models/enrollment.js';
import Course from '../models/course.js';
import User from '../models/user.js';
import CourseVideo from '../models/coursevideo.js';
import AccessCode from '../models/accessCode.js';
import { fail, identifier, textField, hashCode } from '../lib/security.js';
import { assertCourseAccess } from '../lib/access.js';

export async function enrollCourse(req, res) {
  const courseId = identifier(req.body.courseId);
  const digest = hashCode(textField(req.body.code, 'Access code', 100));
  const userId = req.user.email;
  await mongoose.connection.transaction(async session => {
    if (!await Course.exists({ courseId, isAvailable: true }).session(session)) throw fail(404, 'Course is not available');
    if (await Enrollment.exists({ userId, courseId, status: 'active' }).session(session)) throw fail(409, 'You are already enrolled');
    // A conditional write and enrollment upsert share one transaction. Reuse cannot race.
    const code = await AccessCode.findOneAndUpdate({
      digest, courseId, status: 'unused',
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
        { $or: [{ assignedEmail: null }, { assignedEmail: userId }] },
      ],
    }, { $set: { status: 'redeemed', redeemedBy: userId, redeemedAt: new Date() } }, { returnDocument: 'after', session });
    if (!code) throw fail(400, 'This code is invalid, expired, revoked, already used, or assigned to another course or student');
    await Enrollment.findOneAndUpdate({ userId, courseId }, {
      $set: { status: 'active', method: 'access_code', accessCodeId: code._id, enrolledDate: new Date(), paymentStatus: 'completed' },
      $unset: { revokedAt: 1, revokedBy: 1 },
    }, { upsert: true, session, runValidators: true });
  });
  res.json({ message: 'Enrollment successful. Your course is now in My Courses.' });
}
export async function getMyCourses(req, res) {
  const enrollments = await Enrollment.find({ userId: req.user.email, status: 'active' }).lean();
  const courses = await Course.find({ courseId: { $in: enrollments.map(e => e.courseId) }, isAvailable: true }).lean();
  res.json(courses.map(course => ({ ...course, enrollment: enrollments.find(e => e.courseId === course.courseId) })));
}
export async function checkEnrollment(req, res) {
  const enrollment = await Enrollment.findOne({ userId: req.user.email, courseId: req.params.courseId, status: 'active' }).lean();
  const course = await Course.exists({ courseId: req.params.courseId, isAvailable: true });
  res.json({ enrolled: Boolean(enrollment && course), enrollment: course ? enrollment : null });
}
export async function getAllEnrollments(req, res) {
  const filter = {};
  if (req.query.courseId) filter.courseId = identifier(req.query.courseId);
  if (req.query.status) filter.status = textField(req.query.status, 'Status', 30);
  if (req.query.from || req.query.to) {
    filter.enrolledDate = {};
    for (const [key, op] of [['from', '$gte'], ['to', '$lte']]) if (req.query[key]) {
      const date = new Date(textField(req.query[key], 'Date', 30));
      if (Number.isNaN(date.getTime())) throw fail(400, 'Invalid date');
      if (key === 'to') date.setUTCHours(23, 59, 59, 999);
      filter.enrolledDate[op] = date;
    }
  }
  const [enrollments, users, courses, lessons] = await Promise.all([
    Enrollment.find(filter).sort({ enrolledDate: -1 }).lean(),
    User.find().select('email firstName lastName isBlocked').lean(),
    Course.find().select('courseId title').lean(),
    CourseVideo.find().select('courseId videoId').lean(),
  ]);
  const query = typeof req.query.search === 'string' ? req.query.search.toLowerCase().slice(0, 200) : '';
  res.json(enrollments.map(e => {
    const student = users.find(u => u.email === e.userId);
    const course = courses.find(c => c.courseId === e.courseId);
    const ids = lessons.filter(v => v.courseId === e.courseId).map(v => v.videoId);
    return { ...e, student, course, progress: ids.length ? Math.round(ids.filter(id => e.completedVideos?.includes(id)).length / ids.length * 100) : 0 };
  }).filter(e => !query || [e.userId, e.student?.firstName, e.student?.lastName, e.courseId, e.course?.title].join(' ').toLowerCase().includes(query)));
}
export async function deleteEnrollment(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(400, 'Invalid enrollment');
  const e = await Enrollment.findByIdAndUpdate(req.params.id, { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: req.user.email } }, { returnDocument: 'after' });
  if (!e) throw fail(404, 'Enrollment not found');
  res.json({ message: 'Enrollment revoked' });
}
export async function approveLegacyEnrollment(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(400, 'Invalid enrollment');
  const e = await Enrollment.findOneAndUpdate({ _id: req.params.id, status: 'pending_review' }, { $set: { status: 'active', method: 'admin_verified' } });
  if (!e) throw fail(404, 'Pending enrollment not found');
  res.json({ message: 'Legacy enrollment verified' });
}
export async function saveProgress(req, res) {
  const courseId = identifier(req.params.courseId);
  await assertCourseAccess(req.user, courseId);
  const videoId = identifier(req.body.videoId, 'Lesson ID');
  if (!await CourseVideo.exists({ videoId, courseId })) throw fail(400, 'Lesson does not belong to this course');
  const position = req.body.position;
  if (typeof position !== 'number' || !Number.isFinite(position) || position < 0 || position > 86400) throw fail(400, 'Invalid playback position');
  const update = { $set: { lastVideoId: videoId, position, lastActivity: new Date() } };
  if (req.body.completed === true) update.$addToSet = { completedVideos: videoId };
  // This status predicate also prevents progress updates racing enrollment revocation.
  const result = await Enrollment.updateOne({ userId: req.user.email, courseId, status: 'active' }, update);
  if (!result.matchedCount) throw fail(403, 'An active enrollment is required to save progress');
  res.json({ message: 'Progress saved' });
}
