const crypto = require('crypto');

function encryptSecret(value, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${Buffer.concat([enc, tag]).toString('base64url')}`;
}

function decryptSecret(payload, secret) {
  const [ivPart, cipherPart] = payload.split('.');
  if (!ivPart || !cipherPart) return null;
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = Buffer.from(ivPart, 'base64url');
  const data = Buffer.from(cipherPart, 'base64url');
  const tag = data.subarray(data.length - 16);
  const text = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(text), decipher.final()]).toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
