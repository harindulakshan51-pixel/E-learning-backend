import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
const schema = new mongoose.Schema({ _id: String, count: Number, expiresAt: Date });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Attempt = mongoose.model('SecurityAttempt', schema);
// Database counters are shared by all API instances.
export const rateLimit = (scope, limit, windowMs = 900000) => async (req, res, next) => {
  try {
    const bucket = Math.floor(Date.now() / windowMs);
    for (const key of [req.ip, ...(req.user ? [req.user.email] : [])]) {
      const id = createHash('sha256').update(scope + ':' + key + ':' + bucket).digest('hex');
      let attempt;
      try {
        attempt = await Attempt.findOneAndUpdate({ _id: id }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs) } }, { upsert: true, returnDocument: 'after' });
      } catch (error) {
        if (error.code !== 11000) throw error;
        attempt = await Attempt.findOneAndUpdate({ _id: id }, { $inc: { count: 1 } }, { returnDocument: 'after' });
      }
      if (attempt.count > limit) {
        res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ message: 'Too many attempts. Please try again later.' });
      }
    }
    next();
  } catch (error) { next(error); }
};
