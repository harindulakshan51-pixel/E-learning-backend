// This file is a disposable preview server for local development and testing.
// Local-only disposable UI fixture. Never imports index.js or reads .env.
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import bcrypt from 'bcrypt';
import app from '../app.js';
import User from '../models/user.js';
import Course from '../models/course.js';
import Lesson from '../models/coursevideo.js';
import Enrollment from '../models/enrollment.js';
import AccessCode from '../models/accessCode.js';
process.env.JWT_SECRET_KEY = 'local-preview-only-secret-not-for-production';
process.env.FRONTEND_ORIGINS = 'http://localhost:5174';
const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await mongoose.connect(replica.getUri());
await Promise.all([User.init(), Course.init(), Lesson.init(), Enrollment.init(), AccessCode.init(), mongoose.model('SecurityAttempt').init()]);
const password = await bcrypt.hash('Preview-only-2026!', 4);
await User.create([{ email: 'admin@example.test', firstName: 'Admin', lastName: 'Preview', password, isAdmin: true }, { email: 'student@example.test', firstName: 'Student', lastName: 'Preview', password }]);
await Course.create({ courseId: 'COURSE001', title: 'Full Stack Web Development', description: 'Master front-end and back-end development with modern technologies.', price: 7990, labelledPrice: '9990', instructor: 'James Carter', duration: '50 hours', category: 'Web Development', thumbnail: '/heroSection.png' });
await Lesson.create({ videoId: 'VID003', courseId: 'COURSE001', title: 'K-means intuition', duration: '6:48', order: 1, youtubeVideoId: 'E5hQgK5Lm6E' });
await Lesson.create({ videoId: 'VID004', courseId: 'COURSE001', title: 'Second lesson', duration: '6:48', order: 2, youtubeVideoId: 'E5hQgK5Lm6E' });
await Enrollment.create({ userId: 'student@example.test', courseId: 'COURSE001', status: 'active', lastVideoId: 'VID003', position: 30 });
const server = app.listen(3101, '127.0.0.1', () => console.log('Disposable preview API: http://localhost:3101/api · admin@example.test or student@example.test · password Preview-only-2026!'));
async function stop() { server.close(); await mongoose.disconnect(); await replica.stop(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
