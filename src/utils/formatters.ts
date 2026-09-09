const oneDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarLitrosX10(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? `${oneDecimal.format(n / 10)} L` : '—';
}

export function formatarMoedaCentavos(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? currency.format(n / 100).replace(/\u00a0/g, ' ') : '—';
}

export function formatarKm(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? integer.format(n) : '—';
}

export function formatarHorimetroX10(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? `${oneDecimal.format(n / 10)} h` : '—';
}

export function parseLitrosPtBr(value: string): number | null {
  const raw = value.trim().replace(/\s/g, '');
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const liters = Number(normalized);
  if (!Number.isFinite(liters) || liters < 0) return null;
  const stored = Math.round(liters * 10);
  return Number.isInteger(stored) ? stored : null;
}

/** Parses the digit representation already expressed in pump units (liters × 10). */
export function parseDigitosX10(value: string): number | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
