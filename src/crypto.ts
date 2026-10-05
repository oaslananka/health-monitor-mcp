import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, KEY_LENGTH);
}

export function encryptSecret(plaintext: string, masterKey: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(masterKey, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const result = Buffer.concat([salt, iv, ciphertext, authTag]);
  return result.toString('base64');
}

export function decryptSecret(encrypted: string, masterKey: string): string {
  const data = Buffer.from(encrypted, 'base64');

  if (data.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted secret format');
  }

  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = data.subarray(SALT_LENGTH + IV_LENGTH, data.length - TAG_LENGTH);
  const authTag = data.subarray(data.length - TAG_LENGTH);

  const key = deriveKey(masterKey, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plaintext.toString('utf8');
}

export function isEncryptedSecret(value: string): boolean {
  try {
    const data = Buffer.from(value, 'base64');
    return data.length >= SALT_LENGTH + IV_LENGTH + TAG_LENGTH;
  } catch {
    return false;
  }
}
