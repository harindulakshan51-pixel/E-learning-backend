import jwt from 'jsonwebtoken';
export const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 3600000 });
export function startSession(res, user) {
  const token = jwt.sign({ version: user.sessionVersion || 0 }, process.env.JWT_SECRET_KEY, { subject: String(user._id), expiresIn: '1h', algorithm: 'HS256' });
  res.cookie('scholarly_session', token, cookieOptions());
  return res.json({ message: 'Login successful', token: 'session', isAdmin: user.isAdmin });
}
