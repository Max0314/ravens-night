import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const purpose = 'ravens:room-saved-passcode:v1';
const aad = Buffer.from(purpose);
const keyFor = (secret: string) => createHmac('sha256', secret).update(purpose).digest();

export function sealSavedPasscode(secret: string, passcode: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), nonce);
  cipher.setAAD(aad);
  const data = Buffer.concat([cipher.update(passcode, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), data]).toString('base64url');
}

export function openSavedPasscode(secret: string, value: string | undefined) {
  if (!value || value.length > 800) return undefined;
  try {
    const data = Buffer.from(value, 'base64url');
    if (data.length <= 28) return undefined;
    const cipher = createDecipheriv('aes-256-gcm', keyFor(secret), data.subarray(0, 12));
    cipher.setAAD(aad);
    cipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}
