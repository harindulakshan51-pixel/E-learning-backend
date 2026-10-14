import jwt from 'jsonwebtoken';
const isProd = () => process.env.NODE_ENV === 'production';
export const cookieOptions = () => ({ httpOnly: true, secure: isProd(), sameSite: isProd() ? 'none' : 'lax', path: '/', maxAge: 3600000 });
export function startSession(res, user) {
  const token = jwt.sign({ version: user.sessionVersion || 0 }, process.env.JWT_SECRET_KEY, { subject: String(user._id), expiresIn: '1h', algorithm: 'HS256' });
  res.cookie('scholarly_session', token, cookieOptions());
  return res.json({ message: 'Login successful', token: 'session', isAdmin: user.isAdmin });
}
