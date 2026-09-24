import express from 'express';
import cors from 'cors';
import authenticate from './middlewares/authenticate.js';
import userRouter from './routers/userRouter.js';
import courseRouter from './routers/courseRouter.js';
import enrollmentRouter from './routers/enrollmentRouter.js';
import courseVideoRouter from './routers/coursevideoRouter.js';
import instructorRouter from './routers/instructorRouter.js';
import accessCodeRouter from './routers/accessCodeRouter.js';

import mediaRouter from './routers/mediaRouter.js';
const app = express();
app.disable('x-powered-by');
const allowedOrigins = () => (process.env.FRONTEND_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({ origin: (origin, done) => done(null, !origin || allowedOrigins().includes(origin)), credentials: true }));
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' });
  // Cookie-authenticated mutations require an explicit trusted browser origin.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !allowedOrigins().includes(req.get('Origin'))) return res.status(403).json({ message: 'Untrusted request origin' });
  if (req.path === '/api/users/login' || req.path === '/api/users/google-login' || req.path === '/api/users/validate-otp' || req.path.startsWith('/api/users/send-otp/')) return next();
  authenticate(req, res, next);
});
app.use('/api/media', mediaRouter);
app.use('/api/users', userRouter);
app.use('/api/courses', courseRouter);
app.use('/api/enrollments', enrollmentRouter);
app.use('/api/course-videos', courseVideoRouter);
app.use('/api/access-codes', accessCodeRouter);
app.use('/api/instructors', instructorRouter);
app.use('/api/orders', (req, res) => res.status(410).json({ message: 'Ordering has been retired. Use course access codes.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || (error.code === 11000 ? 409 : error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500);
  res.status(status).json({ message: status === 500 ? 'Unable to complete this request. Please try again.' : error.code === 11000 ? 'This record already exists' : error.message });
});
export default app;
