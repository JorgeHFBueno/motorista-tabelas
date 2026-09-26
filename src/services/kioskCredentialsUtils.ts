import type { KioskCredentialStatus } from './kioskCredentials';

export const KIOSK_STATUS_BATCH_SIZE = 200;

export function isKioskPin(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function uniqueUidBatches(uids: string[]): string[][] {
  const unique = [...new Set(uids.filter((uid) => uid.trim().length > 0))];
  return Array.from({ length: Math.ceil(unique.length / KIOSK_STATUS_BATCH_SIZE) }, (_, index) =>
    unique.slice(index * KIOSK_STATUS_BATCH_SIZE, (index + 1) * KIOSK_STATUS_BATCH_SIZE));
}

export function qrStatusLabel(status: KioskCredentialStatus | undefined) {
  if (!status?.qrConfigured) return 'Não emitido';
  return status.qrRevoked ? 'Revogado' : 'Ativo';
}

export function pinStatusLabel(status: KioskCredentialStatus | undefined) {
  if (!status?.pinConfigured) return 'Não configurado';
  return status.pinEnabled ? 'Ativo' : 'Desativado';
}

export function sanitizeKioskFilename(uid: string) {
  return `kiosk-qr-${uid.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'credencial'}.png`;
}

export function formatKioskUpdatedAt(value: unknown): string {
  if (!value) return '—';
  const serializedSeconds = typeof value === 'object' && value !== null
    ? (typeof (value as { seconds?: unknown }).seconds === 'number'
      ? (value as { seconds: number }).seconds
      : typeof (value as { _seconds?: unknown })._seconds === 'number'
        ? (value as { _seconds: number })._seconds
        : null)
    : null;
  const candidate = value instanceof Date
    ? value
    : typeof value === 'string' || typeof value === 'number'
      ? new Date(value)
      : serializedSeconds !== null
        ? new Date(serializedSeconds * 1000)
      : typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function'
        ? value.toDate()
        : null;
  if (!candidate || Number.isNaN(candidate.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(candidate);
}

export function kioskFunctionErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code).replace(/^functions\//, '') : '';
  const messages: Record<string, string> = {
    'permission-denied': 'Você não possui permissão para administrar credenciais Kiosk.',
    unauthenticated: 'Sua sessão expirou. Faça login novamente.',
    'invalid-argument': 'Dados inválidos para esta operação.',
    'failed-precondition': 'Este funcionário não está disponível para esta operação.',
    'not-found': 'Funcionário não encontrado.',
    unavailable: 'Serviço temporariamente indisponível.',
    internal: 'Não foi possível concluir a operação agora.',
  };
  return messages[code] ?? 'Não foi possível concluir a operação agora.';
}
