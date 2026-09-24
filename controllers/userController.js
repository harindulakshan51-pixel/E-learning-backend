import User from '../models/user.js';
import Otp from '../models/Otp.js';
import bcrypt from 'bcrypt';
import axios from 'axios';
import nodemailer from 'nodemailer';
import { randomInt, randomBytes, createHmac } from 'node:crypto';
import { textField, fail } from '../lib/security.js';
import { startSession, cookieOptions } from '../lib/session.js';

const emailField = value => {
  const email = textField(value, 'Email', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Invalid email');
  return email;
};
const passwordField = value => {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value) > 72) throw fail(400, 'Use a password of at least 12 characters and at most 72 bytes');
  return value;
};
const otpHash = value => createHmac('sha256', process.env.JWT_SECRET_KEY).update(value).digest('hex');
export async function createUser(req, res) {
  const email = emailField(req.body.email);
  if (await User.exists({ email })) throw fail(409, 'Unable to register this email');
  await User.create({ email, firstName: textField(req.body.firstName, 'First name', 80), lastName: textField(req.body.lastName, 'Last name', 80), password: await bcrypt.hash(passwordField(req.body.password), 12) });
  res.status(201).json({ message: 'User created successfully' });
}
export async function loginUser(req, res) {
  const email = emailField(req.body.email);
  const password = req.body.password;
  if (typeof password !== 'string' || !password || password.length > 200) throw fail(400, 'Invalid password');
  const user = await User.findOne({ email });
  const valid = await bcrypt.compare(password, user?.password || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7lzKlHI.TzsWf1u9DKfKpgZoZ8UQx1q');
  if (!user || !valid || user.isBlocked) throw fail(401, 'Invalid email or password, or account unavailable');
  return startSession(res, user);
}
export async function getUser(req, res) { res.json(req.user); }
export async function getAllUsers(req, res) { res.json(await User.find().select('-password -sessionVersion')); }
export async function updateUserStatus(req, res) {
  if (req.user.email === req.params.email) throw fail(400, 'You cannot block your own account');
  if (typeof req.body.isBlocked !== 'boolean') throw fail(400, 'Invalid account status');
  await User.updateOne({ email: req.params.email }, { $set: { isBlocked: req.body.isBlocked }, $inc: { sessionVersion: 1 } });
  res.json({ message: 'User status updated successfully' });
}
export async function deleteUser(req, res) {
  if (req.user.email === req.params.email) throw fail(400, 'You cannot delete your own admin account');
  // Preserve enrollment and identity records; disable instead of destructive deletion.
  await User.updateOne({ email: req.params.email }, { $set: { isBlocked: true }, $inc: { sessionVersion: 1 } });
  res.json({ message: 'Account disabled; historical records preserved' });
}
export async function updateUser(req, res) {
  if (!req.user.isAdmin && req.user.email !== req.params.email) throw fail(403, 'Forbidden');
  if (['email', 'isAdmin', 'isBlocked', 'sessionVersion'].some(k => k in req.body)) throw fail(400, 'Protected account fields cannot be changed here');
  const updates = {};
  for (const field of ['firstName', 'lastName']) if (req.body[field] !== undefined) updates[field] = textField(req.body[field], field, 80);
  if (req.body.password) {
    const user = await User.findOne({ email: req.params.email });
    if (!user || typeof req.body.currentPassword !== 'string' || !await bcrypt.compare(req.body.currentPassword, user.password)) throw fail(403, 'Current password is required');
    updates.password = await bcrypt.hash(passwordField(req.body.password), 12);
  }
  await User.updateOne({ email: req.params.email }, { $set: updates, ...(updates.password ? { $inc: { sessionVersion: 1 } } : {}) });
  res.json({ message: 'Profile updated' });
}
export async function googleLogin(req, res) {
  let data;
  try {
    ({ data } = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + textField(req.body.token, 'Google token', 4096) }, timeout: 10000 }));
  } catch { throw fail(401, 'Google sign-in failed'); }
  if (!data.email_verified) throw fail(401, 'Verified email required');
  const email = emailField(data.email);
  let user = await User.findOne({ email });
  if (!user) user = await User.create({ email, firstName: data.given_name || 'Student', lastName: data.family_name || 'User', password: await bcrypt.hash(randomBytes(32).toString('hex'), 12) });
  if (user.isBlocked) throw fail(403, 'Account unavailable');
  return startSession(res, user);
}
export async function sendOTP(req, res) {
  const email = emailField(req.params.email);
  const message = 'If this account exists, a reset code has been sent. It expires in 10 minutes.';
  if (!await User.exists({ email })) return res.json({ message });
  const otp = String(randomInt(100000, 1000000));
  await Otp.findOneAndUpdate({ email }, { $set: { otp: otpHash(otp), expiresAt: new Date(Date.now() + 600000), attempts: 0 } }, { upsert: true });
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  try { await transport.sendMail({ from: process.env.SMTP_USER, to: email, subject: 'Scholarly password reset', text: 'Your reset code is ' + otp + '. It expires in 10 minutes.' }); }
  catch { throw fail(503, 'Password reset is temporarily unavailable'); }
  res.json({ message });
}
export async function validateOTPAndUpdatePassword(req, res) {
  const email = emailField(req.body.email);
  const otp = textField(req.body.otp, 'Reset code', 6);
  const password = passwordField(req.body.newPassword);
  const record = await Otp.findOneAndUpdate({ email, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { returnDocument: 'after' });
  if (!record || record.otp !== otpHash(otp)) throw fail(400, 'Invalid or expired reset code');
  const consumed = await Otp.findOneAndDelete({ _id: record._id, otp: record.otp });
  if (!consumed) throw fail(400, 'Reset code already used');
  await User.updateOne({ email }, { $set: { password: await bcrypt.hash(password, 12) }, $inc: { sessionVersion: 1 } });
  res.clearCookie('scholarly_session', cookieOptions());
  res.json({ message: 'Password updated. Please sign in again.' });
}
export async function logout(req, res) {
  if (req.user) await User.updateOne({ _id: req.user._id }, { $inc: { sessionVersion: 1 } });
  res.clearCookie('scholarly_session', cookieOptions());
  res.json({ message: 'Signed out' });
}
