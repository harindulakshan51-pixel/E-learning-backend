import express from 'express';
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { requireAdmin, fail } from '../lib/security.js';
const router = express.Router();
router.post('/', requireAdmin, express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' }), async (req, res) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw fail(503, 'Image storage is not configured');
  const data = req.body;
  if (!Buffer.isBuffer(data)) throw fail(400, 'Use a PNG, JPEG or WebP image');
  const mime = req.get('Content-Type')?.split(';')[0];
  const valid = mime === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === 'image/jpeg' ? data[0] === 255 && data[1] === 216 && data[2] === 255 : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw fail(400, 'Image content does not match its type');
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime];
  const name = randomUUID() + '.' + extension;
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  await axios.post(base + '/storage/v1/object/Images/' + name, data, { headers: { Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': mime }, timeout: 30000 });
  res.status(201).json({ url: base + '/storage/v1/object/public/Images/' + name });
});
export default router;
