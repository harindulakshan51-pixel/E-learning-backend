import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import { cookieOptions } from '../lib/session.js';
export default async function authenticate(req, res, next) {
  const cookie = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('scholarly_session='))?.split('=')[1];
  const bearer = req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  const token = cookie || (bearer !== 'session' ? bearer : null);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY, { algorithms: ['HS256'] });
    if (!decoded.exp || !decoded.sub) throw new Error('Old session');
    const user = await User.findById(decoded.sub).select('-password').lean();
    if (!user || user.isBlocked || (user.sessionVersion || 0) !== decoded.version) throw new Error('Session revoked');
    req.user = user;
    next();
  } catch { res.clearCookie('scholarly_session', cookieOptions()); res.status(401).json({ message: 'Session expired. Please sign in again.' }); }
}
