import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import User from '../models/user.js';
import Course from '../models/course.js';
import Lesson from '../models/coursevideo.js';
import Enrollment from '../models/enrollment.js';
import AccessCode from '../models/accessCode.js';
import { newCode, hashCode } from '../lib/security.js';
import { playbackSession } from '../lib/drm.js';

let repl, server, base, admin, student, other;
const origin = 'http://localhost:5173';
const password = 'Correct-Horse-Battery-2026';
async function request(path, { method = 'GET', cookie, body, origin: requestOrigin = origin, token } = {}) {
  const response = await fetch(base + path, { method, headers: {
    Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
}
async function login(email) { return request('/users/login', { method: 'POST', body: { email, password } }); }
async function code(courseId = 'COURSE001', extra = {}) {
  const response = await request('/access-codes', { method: 'POST', cookie: admin, body: { courseId, ...extra } });
  assert.equal(response.status, 201, JSON.stringify(response.body)); return response.body;
}
async function redeem(value, cookie = student, courseId = 'COURSE001') {
  return request('/enrollments', { method: 'POST', cookie, body: { courseId, code: value } });
}
before(async () => {
  process.env.JWT_SECRET_KEY = 'test-only-secret-with-at-least-32-characters';
  process.env.FRONTEND_ORIGINS = origin;
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(repl.getUri(), { dbName: 'scholarly_security_test' });
  await Promise.all([User.init(), Course.init(), Lesson.init(), Enrollment.init(), AccessCode.init(), mongoose.model('SecurityAttempt').init()]);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});
beforeEach(async () => {
  for (const model of [User, Course, Lesson, Enrollment, AccessCode, mongoose.model('SecurityAttempt')]) await model.deleteMany({});
  const hash = await bcrypt.hash(password, 4);
  await User.create([
    { email: 'admin@example.test', firstName: 'Admin', lastName: 'Owner', password: hash, isAdmin: true },
    { email: 'student@example.test', firstName: 'Student', lastName: 'One', password: hash },
    { email: 'other@example.test', firstName: 'Other', lastName: 'Student', password: hash },
  ]);
  for (const courseId of ['COURSE001', 'COURSE002']) await Course.create({ courseId, title: courseId, description: 'Course', price: 100, labelledPrice: '100', instructor: 'Teacher', duration: '1h' });
  await Lesson.create({ videoId: 'LESSON1', courseId: 'COURSE001', title: 'Legacy lesson', videoUrl: 'https://example.test/secret.mp4', duration: '10:00', order: 1, isPreview: true });
  admin = (await login('admin@example.test')).cookie;
  student = (await login('student@example.test')).cookie;
  other = (await login('other@example.test')).cookie;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); if (repl) await repl.stop(); });

test('existing passwords work; sessions are HttpOnly and expiring; invalid credentials and forged roles fail', async () => {
  const response = await login('student@example.test');
  assert.equal(response.status, 200); assert.equal(response.body.token, 'session');
  assert.match(response.headers.get('set-cookie'), /HttpOnly/); assert.match(response.headers.get('set-cookie'), /SameSite=Lax/);
  const payload = jwt.decode(response.cookie.split('=')[1]); assert.equal(payload.exp - payload.iat, 3600);
  assert.equal((await request('/users/login', { method: 'POST', body: { email: 'student@example.test', password: 'wrong' } })).status, 401);
  assert.equal((await request('/users/all')).status, 401);
  assert.equal((await request('/users/all', { cookie: student })).status, 403);
  assert.equal((await request('/access-codes', { cookie: student })).status, 403);
  const users = await request('/users/all', { cookie: admin }); assert.ok(users.body.every(u => !('password' in u)));
  assert.equal((await request('/users', { token: jwt.sign({ email: 'admin@example.test', isAdmin: true }, process.env.JWT_SECRET_KEY) })).status, 401);
});
test('every lesson route is locked, including preview lessons; no raw legacy URL leaks', async () => {
  for (const path of ['/course-videos/course/COURSE001', '/course-videos/LESSON1', '/course-videos/LESSON1/playback']) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, { cookie: student })).status, 403);
  }
  assert.equal((await request('/course-videos/all', { cookie: student })).status, 403);
  assert.equal((await request('/enrollments', { method: 'POST', cookie: student, body: { courseId: 'COURSE001' } })).status, 400);
  assert.equal((await request('/orders', { method: 'POST', cookie: student, body: {} })).status, 410);
  const lessons = await request('/course-videos/course/COURSE001', { cookie: admin });
  assert.ok(!JSON.stringify(lessons.body).includes('secret.mp4'));
});
test('course-scoped single-use code unlocks only the owner My Courses and lesson metadata; DRM migration stays locked', async () => {
  assert.deepEqual((await request('/enrollments/my', { cookie: student })).body, []);
  const issued = await code();
  assert.equal((await redeem(issued.code, student, 'COURSE002')).status, 400);
  assert.equal((await redeem(issued.code)).status, 200);
  const mine = await request('/enrollments/my', { cookie: student });
  assert.equal(mine.body.length, 1); assert.equal(mine.body[0].courseId, 'COURSE001');
  assert.deepEqual((await request('/enrollments/my', { cookie: other })).body, []);
  assert.equal((await request('/course-videos/LESSON1', { cookie: student })).status, 200);
  assert.equal((await request('/course-videos/LESSON1/playback', { cookie: student })).status, 423);
  assert.equal((await redeem(issued.code, other)).status, 400);
  assert.equal((await redeem(issued.code)).status, 409);
  assert.equal(await Enrollment.countDocuments(), 1);
  const stored = await AccessCode.findById(issued.id).select('+digest').lean();
  assert.equal(stored.digest, hashCode(issued.code)); assert.ok(!JSON.stringify(stored).includes(issued.code));
});
test('expired, revoked, assigned-to-other and malformed codes cannot enroll', async () => {
  const expired = await code(); await AccessCode.updateOne({ _id: expired.id }, { expiresAt: new Date(0) });
  assert.equal((await redeem(expired.code)).status, 400);
  const assigned = await code('COURSE001', { assignedEmail: 'other@example.test' });
  assert.equal((await redeem(assigned.code)).status, 400);
  const revoked = await code(); await request('/access-codes/' + revoked.id + '/revoke', { method: 'POST', cookie: admin });
  assert.equal((await redeem(revoked.code)).status, 400);
  assert.equal((await redeem({ $ne: null })).status, 400);
  assert.equal(await Enrollment.countDocuments(), 0);
});
test('concurrent redemption commits exactly one enrollment and one redemption', async () => {
  const issued = await code();
  const attempts = await Promise.all([redeem(issued.code), redeem(issued.code, other)]);
  assert.deepEqual(attempts.map(a => a.status).sort(), [200, 400]);
  assert.equal(await Enrollment.countDocuments({ status: 'active' }), 1);
  assert.equal(await AccessCode.countDocuments({ status: 'redeemed' }), 1);
});
test('code revocation withdraws enrollment, My Courses visibility, progress and playback; replacement can re-enroll', async () => {
  const issued = await code(); await redeem(issued.code);
  assert.equal((await request('/enrollments/progress/COURSE001', { method: 'PUT', cookie: student, body: { videoId: 'LESSON1', position: 42, completed: true } })).status, 200);
  assert.equal((await request('/enrollments/check/COURSE001', { cookie: student })).body.enrollment.position, 42);
  await request('/access-codes/' + issued.id + '/revoke', { method: 'POST', cookie: admin });
  assert.deepEqual((await request('/enrollments/my', { cookie: student })).body, []);
  assert.equal((await request('/course-videos/LESSON1/playback', { cookie: student })).status, 403);
  assert.equal((await request('/enrollments/progress/COURSE001', { method: 'PUT', cookie: student, body: { videoId: 'LESSON1', position: 50 } })).status, 403);
  const replacement = await code(); assert.equal((await redeem(replacement.code)).status, 200);
  assert.equal(await Enrollment.countDocuments(), 1);
});
test('enrollment revocation cannot be bypassed by reusing its redeemed code', async () => {
  const issued = await code(); await redeem(issued.code);
  const enrollment = await Enrollment.findOne();
  assert.equal((await request('/enrollments/' + enrollment._id, { method: 'DELETE', cookie: other })).status, 403);
  await request('/enrollments/' + enrollment._id, { method: 'DELETE', cookie: admin });
  assert.equal((await redeem(issued.code)).status, 400);
  assert.equal((await request('/enrollments/check/COURSE001', { cookie: student })).body.enrolled, false);
});
test('blocking, role changes, logout and password changes invalidate authorization using database state', async () => {
  await User.updateOne({ email: 'admin@example.test' }, { isAdmin: false });
  assert.equal((await request('/access-codes', { cookie: admin })).status, 403);
  await User.updateOne({ email: 'student@example.test' }, { isBlocked: true });
  assert.equal((await request('/enrollments/my', { cookie: student })).status, 401);
  await request('/users/logout', { method: 'POST', cookie: other });
  assert.equal((await request('/users', { cookie: other })).status, 401);
});
test('CSRF, operator injection, forged identities and role updates are rejected', async () => {
  assert.equal((await request('/access-codes', { method: 'POST', cookie: admin, origin: 'https://evil.test', body: { courseId: 'COURSE001' } })).status, 403);
  assert.equal((await request('/users/login', { method: 'POST', body: { email: { $ne: null }, password } })).status, 400);
  assert.equal((await request('/users/student@example.test', { method: 'PUT', cookie: student, body: { isAdmin: true } })).status, 400);
  const issued = await code();
  await request('/enrollments', { method: 'POST', cookie: student, body: { courseId: 'COURSE001', code: issued.code, userId: 'other@example.test', status: 'active' } });
  assert.equal((await Enrollment.findOne()).userId, 'student@example.test');
});
test('brute-force code attempts are rate limited in shared database counters', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await redeem('wrong-code-' + i)).status, 400);
  assert.equal((await redeem('another-wrong-code')).status, 429);
});
test('progress cannot reference another course; course IDs stay immutable and archives preserve records', async () => {
  const issued = await code(); await redeem(issued.code);
  assert.equal((await request('/enrollments/progress/COURSE001', { method: 'PUT', cookie: student, body: { videoId: 'FOREIGN', position: 12 } })).status, 400);
  assert.equal((await request('/courses/COURSE001', { method: 'PUT', cookie: admin, body: { courseId: 'CHANGED' } })).status, 400);
  await request('/courses/COURSE001', { method: 'DELETE', cookie: admin });
  assert.ok(await Course.exists({ courseId: 'COURSE001' }));
  assert.equal((await request('/course-videos/LESSON1', { cookie: student })).status, 403);
});
test('YouTube is disabled and DRM sessions fail closed when provider configuration is absent', async () => {
  assert.equal((await request('/course-videos', { method: 'POST', cookie: admin, body: { videoId: 'YT', courseId: 'COURSE001', videoUrl: 'https://youtu.be/abcdefghijk' } })).status, 400);
  await assert.rejects(playbackSession({ provider: 'mux-drm', muxPlaybackId: 'abc' }), { status: 503 });
  const values = Array.from({ length: 100 }, newCode);
  assert.equal(new Set(values).size, 100);
  assert.ok(values.every(v => /^CRS-(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/.test(v)));
});


test('DRM tokens are signed, scoped, short lived and nonpersistent; non-DRM assets fail verification', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { default: axios } = await import('axios');
  const { verifyDrmPlaybackId } = await import('../lib/drm.js');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const original = axios.get;
  const keys = ['MUX_TOKEN_ID','MUX_TOKEN_SECRET','MUX_SIGNING_KEY_ID','MUX_SIGNING_PRIVATE_KEY_BASE64','MUX_PLAYBACK_RESTRICTION_ID'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  Object.assign(process.env, { MUX_TOKEN_ID: 'test', MUX_TOKEN_SECRET: 'test', MUX_SIGNING_KEY_ID: 'key', MUX_SIGNING_PRIVATE_KEY_BASE64: Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64'), MUX_PLAYBACK_RESTRICTION_ID: 'restriction' });
  try {
    axios.get = async url => ({ data: { data: url.includes('/playback-ids/') ? { policy: 'drm', object: { type: 'asset', id: 'asset1' } } : { status: 'ready', duration: 600, playback_ids: [{ policy: 'drm' }], mp4_support: 'none' } } });
    const playback = await playbackSession({ provider: 'mux-drm', muxPlaybackId: 'secureID' });
    const license = jwt.verify(playback.tokens.drm, publicKey, { audience: 'd', subject: 'secureID', algorithms: ['RS256'] });
    assert.equal(license.offline, false); assert.equal(license.exp - license.iat, 300); assert.equal(license.playback_restriction_id, 'restriction');
    assert.throws(() => jwt.verify(playback.tokens.drm, publicKey, { audience: 'v' }));
    axios.get = async () => ({ data: { data: { policy: 'public' } } });
    await assert.rejects(verifyDrmPlaybackId('publicID'), { status: 400 });
    axios.get = async url => ({ data: { data: url.includes('/playback-ids/') ? { policy: 'drm', object: { type: 'asset', id: 'asset1' } } : { status: 'ready', playback_ids: [{ policy: 'drm' }, { policy: 'public' }] } } });
    await assert.rejects(verifyDrmPlaybackId('mixedID'), { status: 400 });
  } finally {
    axios.get = original;
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});
test('migration preserves users, paid enrollments and URLs; reviews unverified records; is repeatable', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const db = mongoose.connection.db;
  await Enrollment.collection.dropIndex('userId_1_courseId_1');
  const row = { userId: 'student@example.test', courseId: 'COURSE001', enrolledDate: new Date(), paymentStatus: 'completed' };
  await Enrollment.collection.insertMany([{ ...row }, { ...row }, { userId: 'other@example.test', courseId: 'COURSE002', enrolledDate: new Date() }]);
  await db.collection('orders').insertOne({ email: row.userId, status: 'Completed', items: [{ courseId: row.courseId }], date: new Date() });
  const usersBefore = JSON.stringify(await User.find().sort({ email: 1 }).lean());
  const run = args => promisify(execFile)(process.execPath, ['migrations/001-access-control.js', ...args], { env: { ...process.env, MONGODB_URI: repl.getUri('scholarly_security_test') }, timeout: 30000 });
  await run([]);
  assert.equal(await Enrollment.countDocuments(), 3);
  await run(['--apply']);
  assert.equal(await Enrollment.countDocuments(), 2);
  assert.equal((await Enrollment.findOne({ userId: row.userId })).status, 'active');
  assert.equal((await Enrollment.findOne({ userId: 'other@example.test' })).status, 'pending_review');
  assert.equal(await db.collection('enrollment_duplicate_archive').countDocuments(), 1);
  assert.equal((await Lesson.findOne().select('+videoUrl')).videoUrl, 'https://example.test/secret.mp4');
  assert.equal(JSON.stringify(await User.find().sort({ email: 1 }).lean()), usersBefore);
  await run(['--apply']);
  assert.equal(await Enrollment.countDocuments(), 2);
  assert.equal(await db.collection('enrollment_duplicate_archive').countDocuments(), 1);
});


test('reset codes are hashed, expire, are single-use and invalidate existing sessions', async () => {
  const { default: nodemailer } = await import('nodemailer');
  const { default: Otp } = await import('../models/Otp.js');
  await Otp.deleteMany({});
  const original = nodemailer.createTransport;
  let sent;
  nodemailer.createTransport = () => ({ sendMail: async message => { sent = message; } });
  try {
    const response = await request('/users/send-otp/student@example.test');
    assert.equal(response.status, 200);
    const resetCode = sent.text.match(/\b\d{6}\b/)[0];
    assert.notEqual((await Otp.findOne()).otp, resetCode);
    const body = { email: 'student@example.test', otp: resetCode, newPassword: 'A-new-strong-password-2026' };
    assert.equal((await request('/users/validate-otp', { method: 'POST', body })).status, 200);
    assert.equal((await request('/users', { cookie: student })).status, 401);
    assert.equal((await request('/users/validate-otp', { method: 'POST', body })).status, 400);
    assert.equal((await request('/users/login', { method: 'POST', body: { email: body.email, password: body.newPassword } })).status, 200);
    await request('/users/send-otp/student@example.test');
    const expired = sent.text.match(/\b\d{6}\b/)[0];
    await Otp.updateOne({ email: body.email }, { expiresAt: new Date(0) });
    assert.equal((await request('/users/validate-otp', { method: 'POST', body: { ...body, otp: expired } })).status, 400);
  } finally { nodemailer.createTransport = original; }
});
test('startup refuses missing security indexes', async () => {
  const { assertDatabaseReady } = await import('../lib/databaseReady.js');
  await assertDatabaseReady(mongoose.connection.db);
  await AccessCode.collection.dropIndex('digest_1');
  try { await assert.rejects(assertDatabaseReady(mongoose.connection.db), /security indexes are missing/); }
  finally { await AccessCode.createIndexes(); }
});
test('concurrent different codes for one student cannot consume both codes', async () => {
  const a = await code(), b = await code();
  const results = await Promise.all([redeem(a.code), redeem(b.code)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(await Enrollment.countDocuments(), 1);
  assert.equal(await AccessCode.countDocuments({ status: 'unused' }), 1);
});
