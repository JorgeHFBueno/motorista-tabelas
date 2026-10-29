/** Regra de negócio do KPI veicular: diesel interno valorizado a R$ 5,90/L. */
export const PRECO_DIESEL_RELATORIO = 5.90;

export type FuelReportCandidate = { id: string; data: string; quantidadeRaw: number; fornecedor?: string; cnpj?: string };
export type MaintenanceReportCandidate = { id?: string; data: string; categoria?: string; fornecedor?: string; cnpj?: string };
export type VehicleReportPeriod = '25' | '26' | 'all';
export type ResolvedVehicleReportPeriod = { dataInicial: string; dataFinal: string; label: string };

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

/** The report intentionally starts in 2025; "all" is not the full historic database. */
export function resolveVehicleReportPeriod(option: VehicleReportPeriod, today = new Date()): ResolvedVehicleReportPeriod {
  const current = normalizeCalendarDate(today);
  if (!current) throw new Error('REPORT_PERIOD_TODAY_INVALID');
  if (option === '25') return { dataInicial: '2025-01-01', dataFinal: '2025-12-31', label: '2025' };
  if (option === '26') return { dataInicial: '2026-01-01', dataFinal: current < '2026-12-31' ? current : '2026-12-31', label: '2026' };
  return { dataInicial: '2025-01-01', dataFinal: current, label: '2025–atual' };
}

export function filterVehicleReportPeriod<T>(records: T[], dataInicial: string, dataFinal: string, getDate: (record: T) => unknown): T[] {
  return records.filter((record) => {
    const value = normalizeCalendarDate(getDate(record));
    return value >= dataInicial && value <= dataFinal;
  });
}

export function normalizeVehiclePlate(plate: string) { return plate.toUpperCase().replace(/[-\s]/g, ''); }
export function litrosFromQuantidadeRaw(quantidadeRaw: number) { return quantidadeRaw / 10; }
export function custoDieselInterno(litros: number) { return cents(litros * PRECO_DIESEL_RELATORIO); }
export function fuelReportSupplier(raw: Record<string, unknown>) {
  const candidates = [raw.fornecedorNomeSnapshot, raw.motorista, raw.fornecedor, raw.paraQuem].map((value) => String(value ?? '').trim()).filter(Boolean);
  return candidates.find((value) => extractCnpj(value)) ?? candidates[0] ?? '';
}

/** Maps ERP Q47 rows into the report's presentation-safe summary. */
export function summarizeVehicleReportErp47(rows: Record<string, unknown>[]) {
  const text = (value: unknown) => String(value ?? '').trim();
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(String(value ?? '').replace(',', '.')) || 0;
  const details = rows.map((row) => ({ data: text(row.data_emissao), nota: text(row.numero_nota), fornecedor: text(row.cliente_fornecedor), natureza: text(row.natureza), conta: text(row.conta), tipo: text(row.tipo_movimento), valor_rateio: number(row.valor_rateio), placa_nota: text(row.placa_nota) || '—' }));
  return { linhas: rows.length, notas: new Set(rows.map((row) => text(row.numero_nota || row.cod_nota)).filter(Boolean)).size, despesa: rows.filter((row) => text(row.tipo_movimento).toUpperCase() === 'DESPESA').reduce((total, row) => total + number(row.valor_rateio), 0), detalhes: details };
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

export function reportTotals(firebase: number, q47Despesa: number) { return { firebase: cents(firebase), erpQ47: cents(q47Despesa), consolidado: cents(firebase + q47Despesa) }; }

/** Diagnóstico de uma falha de getVehicleErpCosts para adm2: código, mensagem e o `details` que a Function devolve
 * (status e trecho da resposta do ERP), com o pedido feito e o horário de Brasília. */
export function describeErpCallError(error: unknown, pedido: { placa: string; dataInicial: string; dataFinal: string }, agora = new Date()) {
  const e = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown };
  const horario = new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
  const linhas = [
    `Função: getVehicleErpCosts (Query 47)`,
    `Pedido: placa ${pedido.placa}, de ${pedido.dataInicial} a ${pedido.dataFinal}`,
    `Horário: ${horario} (BRT)`,
    `Código: ${typeof e.code === 'string' ? e.code : '—'}`,
    `Mensagem: ${typeof e.message === 'string' && e.message ? e.message : String(error)}`,
  ];
  if (e.details !== undefined && e.details !== null) linhas.push(`Detalhe: ${typeof e.details === 'string' ? e.details : JSON.stringify(e.details, null, 2)}`);
  return linhas.join('\n');
}
