export const DIESEL_PATIO_ID = 'diesel_patio';
export const ENTRADA_DIESEL_MOTIVO = 'Abastecimento de Diesel';

export interface DieselEntryRecordInput {
  date: Date;
  bombaId: string;
  responsavelId: string;
  responsavelNome: string;
  estoqueAntes: number;
  estoqueAposMovimento: number;
  montanteSnapshot: number;
  litrosComprados: number;
  totalPrice: number;
  unitPrice: number;
  batch: string;
}

export interface FuelMovementSource {
  id: string;
  data: unknown;
  tipo?: string;
  motivo?: string;
  litrosComprados?: number;
  qa?: number;
  diesel?: number;
  lf?: number;
  preco?: number;
  precoTotal?: number;
  precoLitro?: number;
  precoPorLitro?: number;
  lote?: string;
  responsavel?: { id?: string; nome?: string };
  estoqueAntes?: number;
  estoqueAposMovimento?: number;
  montanteSnapshot?: number;
  placa?: string;
  id_motorista?: string;
  id_motorista_snap?: string;
  motorista?: string;
  obra?: string;
  bombaId?: string;
}

export interface FuelMovement {
  id: string;
  data: unknown;
  tipo: 'entrada' | 'saida' | 'ajuste';
  motivo?: string;
  litrosComprados?: number;
  estoqueAntes?: number;
  estoqueAposMovimento?: number;
  montanteSnapshot?: number;
  preco?: number;
  precoLitro?: number;
  lote?: string;
  placa?: string;
  responsavel?: { id: string; nome: string };
  obra?: string;
  bombaId?: string;
}

export interface StoredPumpState {
  montanteAtual: number;
  estoqueAtual: number;
}

export function parsePtBrNumber(value: string): number {
  const cleaned = value.trim().replace(/[^\d,.-]/g, '');
  if (!cleaned) return Number.NaN;

  let normalized = cleaned;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Converts real liters to the legacy pump storage unit (tenths of a liter). */
export function litrosParaUnidadeBomba(liters: number): number {
  if (!Number.isFinite(liters)) return Number.NaN;
  return Math.round(liters * 10);
}

/** Converts the pump's internal storage unit (tenths) to visual liters. */
export function unidadeBombaParaLitros(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value / 10 : null;
}

export function calculateUnitPrice(totalPrice: number, liters: number): number | null {
  if (!Number.isFinite(totalPrice) || !Number.isFinite(liters) || totalPrice <= 0 || liters <= 0) {
    return null;
  }
  return totalPrice / liters;
}

export function calculateStockAfterEntry(currentStoredTenths: number, entryStoredTenths: number): number {
  if (!Number.isFinite(currentStoredTenths) || !Number.isFinite(entryStoredTenths) || entryStoredTenths <= 0) {
    return Number.NaN;
  }
  return Math.trunc(currentStoredTenths) + Math.trunc(entryStoredTenths);
}

export function applyDieselEntryToPump(
  current: StoredPumpState,
  entryStoredTenths: number,
): StoredPumpState {
  const newStock = calculateStockAfterEntry(current.estoqueAtual, entryStoredTenths);
  if (!Number.isFinite(current.montanteAtual) || !Number.isFinite(newStock)) {
    return { montanteAtual: Number.NaN, estoqueAtual: Number.NaN };
  }
  return {
    montanteAtual: Math.trunc(current.montanteAtual),
    estoqueAtual: newStock,
  };
}

export function getPumpIndicators(pump: {
  montanteAtual?: unknown;
  estoqueAtual?: unknown;
}) {
  return {
    montanteLiters: unidadeBombaParaLitros(pump.montanteAtual),
    stockLiters: unidadeBombaParaLitros(pump.estoqueAtual),
  };
}

export function suggestBatch(dateValue: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateValue);
  return match ? `LT-${match[1]}-${match[2]}` : '';
}

export function formatFlutterFuelDocumentId(date: Date, uid: string): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(date.getDate())}_${two(date.getMonth() + 1)}_${two(date.getFullYear() % 100)} - ${two(date.getHours())}${two(date.getMinutes())}-${two(date.getSeconds())} ${uid}`;
}

export function buildDieselEntryRecord(input: DieselEntryRecordInput) {
  return {
    data: input.date,
    tipo: 'entrada' as const,
    bombaId: input.bombaId,
    litrosComprados: input.litrosComprados,
    preco: Math.round(input.totalPrice * 100) / 100,
    precoLitro: Math.round(input.unitPrice * 10000) / 10000,
    lote: input.batch.trim(),
    responsavel: {
      id: input.responsavelId.trim(),
      nome: input.responsavelNome.trim(),
    },
    estoqueAntes: input.estoqueAntes,
    estoqueAposMovimento: input.estoqueAposMovimento,
    montanteSnapshot: input.montanteSnapshot,
  };
}

function finiteNumber(primary: unknown, legacy: unknown): number | undefined {
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary;
  return typeof legacy === 'number' && Number.isFinite(legacy) ? legacy : undefined;
}

export function normalizeFuelMovement(source: FuelMovementSource): FuelMovement {
  const isEntry = source.tipo === 'entrada' || source.motivo === ENTRADA_DIESEL_MOTIVO;
  const isAdjustment = source.motivo?.toLocaleLowerCase('pt-BR').includes('ajuste') === true;
  const snapshotName = source.id_motorista_snap?.trim();
  const legacyName = source.motorista?.trim();
  const isCanonicalEntry = source.tipo === 'entrada'
    && typeof source.litrosComprados === 'number'
    && typeof source.responsavel === 'object'
    && typeof source.estoqueAposMovimento === 'number';

  return {
    id: source.id,
    data: source.data,
    tipo: isEntry ? 'entrada' : isAdjustment ? 'ajuste' : 'saida',
    motivo: source.motivo,
    // Canonical entries store real liters. Only legacy QA is in tenths.
    litrosComprados: isCanonicalEntry
      ? finiteNumber(source.litrosComprados, undefined)
      : unidadeBombaParaLitros(source.qa),
    estoqueAntes: finiteNumber(source.estoqueAntes, undefined),
    estoqueAposMovimento: finiteNumber(source.estoqueAposMovimento, source.diesel),
    montanteSnapshot: finiteNumber(source.montanteSnapshot, source.lf),
    preco: finiteNumber(source.preco, source.precoTotal),
    precoLitro: finiteNumber(source.precoLitro, source.precoPorLitro),
    lote: source.lote,
    placa: source.placa,
    responsavel: source.responsavel
      ? { id: source.responsavel.id?.trim() || '', nome: source.responsavel.nome?.trim() || '' }
      : snapshotName || legacyName || source.id_motorista
        ? { id: source.id_motorista?.trim() || '', nome: snapshotName || legacyName || '' }
        : undefined,
    obra: source.obra,
    bombaId: source.bombaId,
  };
}
