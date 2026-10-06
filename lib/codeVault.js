import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

// Domain-separated key; preserve the configured secret to keep saved keys readable.
function vaultKey() {
  const secret = process.env.ACCESS_CODE_SECRET || process.env.JWT_SECRET_KEY;
  if (!secret || secret.length < 32) throw new Error('Access code encryption requires a secret of at least 32 characters');
  return createHmac('sha256', secret).update('scholarly:access-code-vault:v1').digest();
}
export function sealCode(code) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', vaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64')).join('.');
}
export function openCode(value) {
  const [iv, tag, encrypted] = value.split('.').map(part => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', vaultKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
