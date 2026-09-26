// Run from backend. Source stays read-only; reruns preserve destination records.
import 'dotenv/config';
import fs from 'node:fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { defaultProfileImage, publicImage } from '../lib/storage.js';

const apply = process.argv.includes('--apply');
const sourceUri = process.env.SOURCE_MONGODB_URI || dotenv.parse(fs.readFileSync('.env.before-migration')).MONGODB_URI;
const source = await mongoose.createConnection(sourceUri, { autoIndex: false, serverSelectionTimeoutMS: 15000 }).asPromise();
let target;
try {
  target = await mongoose.createConnection(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 15000 }).asPromise();
  if (target.name !== 'E-learning-web') throw new Error('Destination must be E-learning-web');
  if (source.host === target.host && source.name === target.name) throw new Error('Source and destination must differ');
  const accounts = [
    { email: 'buddhika@gmail.com', firstName: 'Buddhika', lastName: 'Sankalpa', isAdmin: true, password: process.env.MIGRATION_ADMIN_PASSWORD },
    { email: 'hasitha@gmail.com', firstName: 'Hasitha', lastName: 'Gimhan', isAdmin: true, password: process.env.MIGRATION_ADMIN_PASSWORD },
    { email: 'student@gmail.com', firstName: 'student', lastName: 'student', isAdmin: false, password: process.env.MIGRATION_STUDENT_PASSWORD },
  ];
  if (apply && accounts.some(a => !a.password)) throw new Error('Set MIGRATION_ADMIN_PASSWORD and MIGRATION_STUDENT_PASSWORD');
  const knownEmails = accounts.map(a => a.email);
  if (await target.db.collection('users').countDocuments({ email: { $nin: knownEmails } })) throw new Error('Unexpected destination accounts; review before transfer');
  const missingImages = new Set();
  const imageCache = new Map();
  async function rewrite(value) {
    if (typeof value === 'string' && /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/Images\//.test(value)) {
      const path = decodeURIComponent(new URL(value).pathname.split('/Images/')[1]);
      if (!imageCache.has(path)) {
        const url = publicImage(path);
        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
        if (response.ok) imageCache.set(path, url);
        else {
          if (![400, 404].includes(response.status)) throw new Error('Image check failed: ' + response.status);
          missingImages.add(path);
          imageCache.set(path, defaultProfileImage());
        }
      }
      return imageCache.get(path);
    }
    if (Array.isArray(value)) return Promise.all(value.map(rewrite));
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await rewrite(item)])));
    }
    return value;
  }
  const collections = ['users', 'courses', 'instructors', 'coursevideos', 'orders', 'enrollments', 'accesscodes'];
  for (const name of collections) {
    const filter = name === 'users' ? { email: { $in: knownEmails } } : {};
    const rows = await source.db.collection(name).find(filter).toArray();
    if (apply) {
      if (!await target.db.listCollections({ name }).hasNext()) await target.db.createCollection(name);
      for (const row of rows) {
        const updated = await rewrite(row);
        const selector = name === 'users' ? { email: row.email } : { _id: row._id };
        await target.db.collection(name).updateOne(selector, { $setOnInsert: updated }, { upsert: true });
      }
    }
    console.log(JSON.stringify({ collection: name, sourceRecords: rows.length, mode: apply ? 'apply' : 'dry-run' }));
  }
  if (apply) {
    for (const { password, ...account } of accounts) {
      await target.db.collection('users').updateOne({ email: account.email }, {
        $set: { ...account, password: await bcrypt.hash(password, 12), isBlocked: false, image: defaultProfileImage() },
        $inc: { sessionVersion: 1 },
      }, { upsert: true });
    }
    // Reset tokens and rate-limit counters are transient and must not transfer.
    for (const name of ['otps', 'securityattempts']) if (!await target.db.listCollections({ name }).hasNext()) await target.db.createCollection(name);
  }
  console.log(JSON.stringify({ missingImages: [...missingImages], fallback: defaultProfileImage() }));
  console.log('Run migrations 001 and 002 with --apply on the destination before starting the API.');
} finally {
  await source.close();
  if (target) await target.close();
}
