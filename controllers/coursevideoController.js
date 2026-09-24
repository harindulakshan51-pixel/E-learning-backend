import CourseVideo from '../models/coursevideo.js';
import Course from '../models/course.js';
import { assertCourseAccess } from '../lib/access.js';
import { fail, identifier, textField } from '../lib/security.js';

function lessonData(body) {
  const data = {
    title: textField(body.title, 'Title'), 
    duration: textField(body.duration, 'Duration', 40),
    order: body.order, 
    isPreview: false,
  };
  if (!Number.isInteger(data.order) || data.order < 1) throw fail(400, 'Lesson order must be a positive integer');
  
  if (!body.youtubeVideoId || typeof body.youtubeVideoId !== 'string' || body.youtubeVideoId.length !== 11) {
    throw fail(400, 'Invalid YouTube Video ID. Please provide a valid YouTube URL or ID.');
  }
  data.youtubeVideoId = body.youtubeVideoId;

  return data;
}

export async function createCourseVideo(req, res) {
  const videoId = identifier(req.body.videoId, 'Lesson ID');
  const courseId = identifier(req.body.courseId);
  if (!await Course.exists({ courseId })) throw fail(404, 'Course not found');
  await CourseVideo.create({ videoId, courseId, ...lessonData(req.body) });
  res.status(201).json({ message: 'Lesson added' });
}

export async function updateCourseVideo(req, res) {
  if (req.body.videoId || req.body.courseId) throw fail(400, 'Lesson and course IDs cannot be changed');
  const data = lessonData(req.body);
  if (!await CourseVideo.findOneAndUpdate({ videoId: req.params.videoId }, { $set: data }, { runValidators: true })) throw fail(404, 'Lesson not found');
  res.json({ message: 'Lesson updated' });
}

export async function getAllCourseVideos(req, res) { 
  res.json(await CourseVideo.find()); 
}

export async function getVideosByCourseId(req, res) {
  await assertCourseAccess(req.user, req.params.courseId);
  const query = CourseVideo.find({ courseId: req.params.courseId }).sort({ order: 1 });
  res.json(await query);
}

export async function getVideoById(req, res) {
  const video = await CourseVideo.findOne({ videoId: req.params.videoId });
  if (!video) throw fail(404, 'Lesson not found');
  await assertCourseAccess(req.user, video.courseId);
  res.json(video);
}

export async function deleteCourseVideo(req, res) {
  await CourseVideo.deleteOne({ videoId: req.params.videoId });
  res.json({ message: 'Lesson removed' });
}
