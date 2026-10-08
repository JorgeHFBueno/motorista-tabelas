export const PHONE_LOGIN_DOMAIN = '@example.com';

export function normalizePhoneIdentifier(value: string) {
  return value.replace(/\D/g, '');
}

export function isValidEmailIdentifier(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function prepareLoginIdentifier(value: string, enterWithPhone: boolean) {
  const trimmedValue = value.trim();

  if (!enterWithPhone) return trimmedValue;
  if (trimmedValue.endsWith(PHONE_LOGIN_DOMAIN)) return trimmedValue;

  return `${normalizePhoneIdentifier(trimmedValue)}${PHONE_LOGIN_DOMAIN}`;
}
