import Course from '../models/course.js';
import Enrollment from '../models/enrollment.js';
import { fail } from './security.js';
export async function assertCourseAccess(user, courseId) {
  if (!user) throw fail(401, 'Please sign in');
  const course = await Course.findOne({ courseId });
  if (!course) throw fail(404, 'Course not found');
  if (user.isAdmin) return;
  if (!course.isAvailable || !await Enrollment.exists({ userId: user.email, courseId, status: 'active' })) throw fail(403, 'An active enrollment is required for this course');
}
