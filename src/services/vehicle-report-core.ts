/** Regra de negócio do KPI veicular: diesel interno valorizado a R$ 5,90/L. */
export const PRECO_DIESEL_RELATORIO = 5.90;

export type FuelReportCandidate = { id: string; data: string; quantidadeRaw: number; fornecedor?: string; cnpj?: string };
export type MaintenanceReportCandidate = { id?: string; data: string; categoria?: string; fornecedor?: string; cnpj?: string };

const cents = (value: number) => Math.round(value * 100) / 100;
const normalizedText = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
const cnpjPattern = /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}\b/g;

export function extractCnpj(value: unknown) {
  const match = String(value ?? '').match(cnpjPattern)?.[0];
  const digits = match?.replace(/\D/g, '') ?? '';
  return digits.length === 14 ? digits : '';
}

export function normalizeSupplier(value: unknown) {
  return normalizedText(String(value ?? '').replace(cnpjPattern, ''))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns a local calendar date and never compares the time portion. */
export function normalizeCalendarDate(value: unknown) {
  if (typeof value === 'string') {
    const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
  }
  const candidate = value && typeof value === 'object' && 'toDate' in value && typeof (value as any).toDate === 'function'
    ? (value as any).toDate()
    : value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(candidate.getTime())
    ? ''
    : `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
}

export function normalizeVehiclePlate(plate: string) { return plate.toUpperCase().replace(/[-\s]/g, ''); }
export function litrosFromQuantidadeRaw(quantidadeRaw: number) { return quantidadeRaw / 10; }
export function custoDieselInterno(litros: number) { return cents(litros * PRECO_DIESEL_RELATORIO); }
export function fuelReportSupplier(raw: Record<string, unknown>) {
  const candidates = [raw.fornecedorNomeSnapshot, raw.motorista, raw.fornecedor, raw.paraQuem].map((value) => String(value ?? '').trim()).filter(Boolean);
  return candidates.find((value) => extractCnpj(value)) ?? candidates[0] ?? '';
}

export type ExternalMatchDiagnostic = {
  fuelDate: string;
  maintenanceDate: string;
  fuelSupplier: string;
  maintenanceSupplier: string;
  normalizedFuelSupplier: string;
  normalizedMaintenanceSupplier: string;
  fuelCnpj: string;
  maintenanceCnpj: string;
  matched: boolean;
  reason: string;
  maintenanceId?: string;
};

function diagnostic(fuel: FuelReportCandidate, maintenance: MaintenanceReportCandidate, matched: boolean, reason: string): ExternalMatchDiagnostic {
  const fuelDate = normalizeCalendarDate(fuel.data);
  const maintenanceDate = normalizeCalendarDate(maintenance.data);
  const fuelSupplier = String(fuel.fornecedor ?? '');
  const maintenanceSupplier = String(maintenance.fornecedor ?? '');
  return { fuelDate, maintenanceDate, fuelSupplier, maintenanceSupplier, normalizedFuelSupplier: normalizeSupplier(fuelSupplier), normalizedMaintenanceSupplier: normalizeSupplier(maintenanceSupplier), fuelCnpj: extractCnpj(fuel.cnpj || fuelSupplier), maintenanceCnpj: extractCnpj(maintenance.cnpj || maintenanceSupplier), matched, reason, maintenanceId: maintenance.id };
}

/** Matches one fuel document to at most one external-maintenance document. */
export function matchExternalFuelToMaintenance(fuel: FuelReportCandidate, maintenances: MaintenanceReportCandidate[], usedMaintenanceIds = new Set<string>()) {
  const candidates = maintenances.filter((maintenance) => normalizedText(maintenance.categoria) === 'ABASTECIMENTO EXTERNO');
  const fuelDate = normalizeCalendarDate(fuel.data);
  const fuelSupplier = normalizeSupplier(fuel.fornecedor);
  const fuelCnpj = extractCnpj(fuel.cnpj || fuel.fornecedor);
  for (const maintenance of candidates) {
    if (maintenance.id && usedMaintenanceIds.has(maintenance.id)) continue;
    const maintenanceDate = normalizeCalendarDate(maintenance.data);
    const maintenanceSupplier = normalizeSupplier(maintenance.fornecedor);
    const maintenanceCnpj = extractCnpj(maintenance.cnpj || maintenance.fornecedor);
    if (fuelDate !== maintenanceDate) continue;
    if (fuelCnpj && maintenanceCnpj) {
      if (fuelCnpj === maintenanceCnpj) return diagnostic(fuel, maintenance, true, 'data + CNPJ');
      continue;
    }
    if (fuelSupplier && maintenanceSupplier && fuelSupplier === maintenanceSupplier) return diagnostic(fuel, maintenance, true, 'data + fornecedor normalizado');
  }
  const sameDate = candidates.find((maintenance) => normalizeCalendarDate(maintenance.data) === fuelDate);
  const reason = !fuelDate ? 'data combustível inválida' : !sameDate ? 'nenhuma manutenção externa na mesma data' : fuelCnpj && extractCnpj(sameDate.cnpj || sameDate.fornecedor) && fuelCnpj !== extractCnpj(sameDate.cnpj || sameDate.fornecedor) ? 'CNPJ divergente' : fuelSupplier !== normalizeSupplier(sameDate.fornecedor) ? 'fornecedor normalizado divergente' : 'manutenção já usada por outro abastecimento';
  return sameDate ? diagnostic(fuel, sameDate, false, reason) : diagnostic(fuel, { data: '', fornecedor: '', categoria: 'ABASTECIMENTO EXTERNO' }, false, reason);
}

export function isExternalFuelForReport(fuel: FuelReportCandidate, maintenances: MaintenanceReportCandidate[]) { return matchExternalFuelToMaintenance(fuel, maintenances).matched; }

export function summarizeInternalFuel(fuel: FuelReportCandidate[], maintenances: MaintenanceReportCandidate[]) {
  const usedMaintenanceIds = new Set<string>();
  const keyedMaintenances = maintenances.map((maintenance, index) => ({ ...maintenance, id: maintenance.id || `__maintenance_${index}` }));
  const diagnostics: ExternalMatchDiagnostic[] = [];
  const externos = fuel.filter((item) => {
    const match = matchExternalFuelToMaintenance(item, keyedMaintenances, usedMaintenanceIds);
    diagnostics.push(match);
    if (match.matched && match.maintenanceId) usedMaintenanceIds.add(match.maintenanceId);
    return match.matched;
  });
  const externalIds = new Set(externos.map((item) => item.id));
  const internos = fuel.filter((item) => !externalIds.has(item.id));
  const quantidadeRawInterna = internos.reduce((total, item) => total + item.quantidadeRaw, 0);
  const litros = litrosFromQuantidadeRaw(quantidadeRawInterna);
  return { encontrados: fuel.length, externos: externos.length, internos: internos.length, quantidadeRawInterna, litros, valor: custoDieselInterno(litros), itens: internos, diagnostics };
}

export function reportTotals(firebase: number, q46Despesa: number, q47Despesa: number) { return { firebase: cents(firebase), firebaseQ46: cents(firebase + q46Despesa), firebaseQ47: cents(firebase + q47Despesa), firebaseQ46Q47: cents(firebase + q46Despesa + q47Despesa) }; }
