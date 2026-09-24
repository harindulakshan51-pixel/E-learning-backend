import Course from '../models/course.js';
import { identifier, textField, fail } from '../lib/security.js';
function fields(body) {
  const data = {};
  for (const key of ['title', 'description', 'instructor', 'duration', 'category', 'thumbnail', 'labelledPrice']) if (body[key] !== undefined) {
    if (['category', 'thumbnail', 'labelledPrice'].includes(key) && body[key] === '') continue;
    data[key] = textField(typeof body[key] === 'number' && key === 'labelledPrice' ? String(body[key]) : body[key], key, key === 'description' ? 10000 : 1000);
  }
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) throw fail(400, 'Invalid price');
    data.price = price;
  }
  if (body.isAvailable !== undefined) {
    if (typeof body.isAvailable !== 'boolean') throw fail(400, 'Invalid availability');
    data.isAvailable = body.isAvailable;
  }
  return data;
}
export async function createCourse(req, res) {
  await Course.create({ labelledPrice: String(req.body.price || 0), ...fields(req.body), courseId: identifier(req.body.courseId) });
  res.status(201).json({ message: 'Course created successfully' });
}
export async function updateCourse(req, res) {
  if ('courseId' in req.body) throw fail(400, 'Course ID cannot be changed because lessons and enrollments reference it');
  if (!await Course.findOneAndUpdate({ courseId: req.params.courseId }, { $set: fields(req.body) }, { runValidators: true })) throw fail(404, 'Course not found');
  res.json({ message: 'Course updated successfully' });
}
export async function deleteCourse(req, res) {
  await Course.updateOne({ courseId: req.params.courseId }, { $set: { isAvailable: false } });
  res.json({ message: 'Course archived; lessons and enrollment history preserved' });
}
export async function getAllCourses(req, res) { res.json(await Course.find(req.user?.isAdmin ? {} : { isAvailable: true })); }
export async function getCourseById(req, res) {
  const course = await Course.findOne({ courseId: req.params.courseId, ...(req.user?.isAdmin ? {} : { isAvailable: true }) });
  if (!course) throw fail(404, 'Course not found');
  res.json(course);
}
export async function searchCourse(req, res) {
  const query = textField(req.params.query, 'Search', 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  res.json(await Course.find({ isAvailable: true, $or: [{ title: { $regex: query, $options: 'i' } }, { description: { $regex: query, $options: 'i' } }] }));
}
