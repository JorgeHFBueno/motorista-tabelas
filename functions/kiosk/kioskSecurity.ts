import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

export const QR_PREFIX = 'LEDUR-KIOSK:1:';
export const QR_TOKEN_BYTES = 32;
export const PIN_LENGTH = 6;
export const PIN_SCRYPT_N = 16384;
export const PIN_SCRYPT_R = 8;
export const PIN_SCRYPT_P = 1;
export const PIN_HASH_BYTES = 32;

function deriveScrypt(pin: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(pin, salt, length, {
    N: PIN_SCRYPT_N,
    r: PIN_SCRYPT_R,
    p: PIN_SCRYPT_P,
  }, (error, derived) => error ? reject(error) : resolve(derived)));
}

export function createQrToken(): string {
  return randomBytes(QR_TOKEN_BYTES).toString('base64url');
}

export function formatQrPayload(token: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error('QR token must be a 256-bit base64url value');
  }
  return `${QR_PREFIX}${token}`;
}

export function hashQrToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveScrypt(pin, salt, PIN_HASH_BYTES);
  return `scrypt$${PIN_SCRYPT_N}$${PIN_SCRYPT_R}$${PIN_SCRYPT_P}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export function isValidPinHash(encoded: unknown): encoded is string {
  if (typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltText, digestText] = parts;
  if (n !== String(PIN_SCRYPT_N) || r !== String(PIN_SCRYPT_R) || p !== String(PIN_SCRYPT_P)
    || !/^[A-Za-z0-9_-]+$/.test(saltText) || !/^[A-Za-z0-9_-]+$/.test(digestText)) return false;
  return Buffer.from(saltText, 'base64url').length === 16
    && Buffer.from(digestText, 'base64url').length === PIN_HASH_BYTES;
}

export async function verifyPin(pin: string, encoded: string): Promise<boolean> {
  if (!isValidPinHash(encoded)) return false;
  const [, n, r, p, saltText, digestText] = encoded.split('$');
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(digestText, 'base64url');
  const actual = await deriveScrypt(pin, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
