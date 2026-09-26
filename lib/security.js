import { randomBytes, createHash } from 'node:crypto';
export const fail = (status, message) => Object.assign(new Error(message), { status });
export function textField(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw fail(400, name + ' is invalid');
  return value.trim();
}
export function identifier(value, name = 'Course ID') {
  const id = textField(value, name, 80);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw fail(400, name + ' must contain letters, numbers, underscores or hyphens');
  return id;
}
export function youtubeId(value) {
  value = textField(value, 'YouTube URL or ID', 500);
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  let url;
  try { url = new URL(textField(value, 'YouTube URL', 500)); } catch { throw fail(400, 'Enter a valid YouTube URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw fail(400, 'Use an HTTPS YouTube URL');
  let id;
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.getAll('v').length === 1 ? url.searchParams.get('v') : null;
    else id = /^\/(?:embed|shorts)\/([\w-]{11})$/.exec(url.pathname)?.[1];
  }
  if (!/^[\w-]{11}$/.test(id || '')) throw fail(400, 'Unsupported YouTube URL');
  return id;
}
export const newCode = () => 'CRS-' + randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g).join('-');
export const hashCode = value => createHash('sha256').update(value.trim().toUpperCase()).digest('hex');
export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Please sign in' });
  next();
}
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Please sign in' });
  if (!req.user.isAdmin) return res.status(403).json({ message: 'Administrator access required' });
  next();
}
