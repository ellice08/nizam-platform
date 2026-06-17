import crypto from 'crypto';

// Lazy key getter — validates only when encrypt/decrypt is first called,
// so importing this module at boot doesn't crash unrelated code if the env
// var is absent (e.g. in test environments that don't touch WhatsApp paths).
function getKey(): Buffer {
  const key = Buffer.from(process.env.WHATSAPP_TOKEN_KEY ?? '', 'hex');
  if (key.length !== 32) {
    throw new Error(
      'WHATSAPP_TOKEN_KEY must be a 64-char hex string (32 bytes). ' +
      `Got ${(process.env.WHATSAPP_TOKEN_KEY ?? '').length} hex chars.`
    );
  }
  return key;
}

export interface EncryptedToken {
  ciphertext: string; // hex
  iv: string;         // hex, 12 bytes
  tag: string;        // hex, 16 bytes (GCM auth tag)
}

export function encrypt(plaintext: string): EncryptedToken {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

export function decrypt(ciphertextHex: string, ivHex: string, tagHex: string): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const out = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return out.toString('utf8');
}
