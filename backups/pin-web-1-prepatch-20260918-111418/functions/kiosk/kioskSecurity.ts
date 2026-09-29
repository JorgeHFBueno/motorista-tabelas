import { createHash, randomBytes } from 'node:crypto';

export const QR_PREFIX = 'LEDUR-KIOSK:1:';
export const QR_TOKEN_BYTES = 32;

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
