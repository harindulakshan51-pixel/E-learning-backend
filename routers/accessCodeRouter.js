import express from 'express';
import mongoose from 'mongoose';
import AccessCode from '../models/accessCode.js';
import Course from '../models/course.js';
import User from '../models/user.js';
import Enrollment from '../models/enrollment.js';
import { requireAdmin, identifier, newCode, hashCode, fail, textField } from '../lib/security.js';
import { sealCode, openCode } from '../lib/codeVault.js';
const router = express.Router();
router.use(requireAdmin);
router.get('/', async (req, res) => {
  const rows = await AccessCode.find().sort({ createdAt: -1 }).lean();
  res.json(rows.map(row => ({ ...row, status: row.status === 'unused' && row.expiresAt && row.expiresAt <= new Date() ? 'expired' : row.status })));
});
router.post('/', async (req, res) => {
  const courseId = identifier(req.body.courseId);
  if (!await Course.exists({ courseId, isAvailable: true })) throw fail(404, 'Select an available course');
  let assignedEmail;
  if (req.body.assignedEmail) {
    assignedEmail = textField(req.body.assignedEmail, 'Student email', 254);
    if (!await User.exists({ email: assignedEmail, isBlocked: false, isAdmin: false })) throw fail(400, 'Select a registered, active student email');
  }
  let expiresAt;
  if (req.body.expiresAt) {
    expiresAt = new Date(textField(req.body.expiresAt, 'Expiry', 40));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) throw fail(400, 'Expiry must be in the future');
  }
  const code = newCode();
  const row = await AccessCode.create({ courseId, assignedEmail, expiresAt, digest: hashCode(code), encryptedCode: sealCode(code), hint: code.slice(-9), createdBy: req.user.email });
  res.set('Cache-Control', 'no-store');
  res.status(201).json({ code, id: row._id, message: 'Access code generated. You can view its key again from the table.' });
});
router.get('/:id/key', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(400, 'Invalid code ID');
  const row = await AccessCode.findById(req.params.id).select('+encryptedCode');
  if (!row) throw fail(404, 'Code not found');
  if (!row.encryptedCode) throw fail(409, 'This older code was saved before key viewing was available. Its full key cannot be recovered.');
  res.json({ code: openCode(row.encryptedCode) });
});
router.post('/:id/revoke', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(400, 'Invalid code ID');
  await mongoose.connection.transaction(async session => {
    const code = await AccessCode.findByIdAndUpdate(req.params.id, { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: req.user.email } }, { returnDocument: 'after', session });
    if (!code) throw fail(404, 'Code not found');
    await Enrollment.updateMany({ accessCodeId: code._id }, { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: req.user.email } }, { session });
  });
  res.json({ message: 'Code and any enrollment granted by it revoked' });
});
router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(400, 'Invalid code ID');
  const deleted = await AccessCode.findOneAndDelete({ _id: req.params.id, status: 'revoked' });
  if (!deleted) {
    if (!await AccessCode.exists({ _id: req.params.id })) throw fail(404, 'Code not found');
    throw fail(409, 'Revoke this code before deleting it');
  }
  res.json({ message: 'Revoked access code deleted' });
});
export default router;
