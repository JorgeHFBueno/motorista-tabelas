// KPI da frota (/frota/analytics). Funções puras; a tela carrega os dados e chama estas funções.
// Custo = a mesma conta do relatório do veículo (vehicle-report-core): diesel interno a R$ 5,90/L, o abastecimento
// externo que já virou manutenção não conta duas vezes, manutenções FROTA e, quando carregado, ERP Q47 (DESPESA).
import { isSemOdometro } from './combustivel-normalizer';
import { extractCnpj, fuelReportSupplier, normalizeCalendarDate, summarizeInternalFuel, summarizeVehicleReportErp47 } from './vehicle-report-core';

export type DataQuality = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
export type AnalyticsPeriod = { start: Date; end: Date };

/** O KPI começa em 01/01/2025 (como o relatório do veículo) e vai até hoje. */
export const KPI_INICIO = new Date(2025, 0, 1);
export function periodoKpi(hoje = new Date()): AnalyticsPeriod {
  return { start: KPI_INICIO, end: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999) };
}

export type ActivityAnalyticsRecord = { id: string; tipo?: unknown; data?: unknown; veiculoId?: unknown; placa?: unknown; km?: unknown };
export type FuelAnalyticsRecord = { id: string; data?: unknown; placa?: unknown; km?: unknown; semKm?: unknown; motivo?: unknown; quantidadeAbastecida?: unknown; isFuelOutput?: boolean; schema?: string; itemFrotaUid?: unknown; itemFrotaTipo?: unknown; identificadorSnapshot?: unknown; [campo: string]: unknown };
export type MaintenanceAnalyticsRecord = { id: string; data?: unknown; item_frota_id?: unknown; valor?: unknown; categoria?: unknown; categoriaNomeSnapshot?: unknown; fornecedor?: unknown; fornecedorNomeSnapshot?: unknown };
export type ErpAnalyticsRow = Record<string, unknown>;
export type VehicleAnalyticsIdentity = { id: string; placa?: string; identificador?: string; extra?: string };

/** Registros de um veículo. `erp` null = ERP não carregado (ou falhou) para ele. */
export type VehicleData = { activities: ActivityAnalyticsRecord[]; fuel: FuelAnalyticsRecord[]; maintenance: MaintenanceAnalyticsRecord[]; erp: ErpAnalyticsRow[] | null };

export type FleetMetrics = {
  viagens: number;
  kmRodado: number | null;
  kmQuality: DataQuality;
  leiturasIgnoradas: number;
  custoCombustivel: number;
  custoManutencao: number;
  custoErp: number | null;     // null = ERP não carregado para nenhum veículo
  erpCompleto: boolean;        // ERP carregado para todos os veículos considerados
  custoTotal: number;          // combustível + manutenção + ERP carregado
  rsKm: number | null;         // custo total dos veículos com KM ÷ KM rodado
};
export type MonthlyMetric = FleetMetrics & { month: string; label: string };

export function toAnalyticsDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') return toAnalyticsDate((value as { toDate: () => Date }).toDate());
  if (value && typeof value === 'object' && 'seconds' in value) return toAnalyticsDate(new Date(Number((value as { seconds: number }).seconds) * 1000));
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

const inPeriod = (value: unknown, period: AnalyticsPeriod) => { const date = toAnalyticsDate(value); return Boolean(date && date >= period.start && date <= period.end); };
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const result = Number(value.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(result) ? result : null;
  }
  return null;
}
const normalizePlate = (value: unknown) => (typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');

export function vehicleMatches(activity: ActivityAnalyticsRecord, vehicle: VehicleAnalyticsIdentity): boolean {
  if (activity.veiculoId === vehicle.id) return true;
  const candidate = normalizePlate(activity.placa);
  return Boolean(candidate && [vehicle.placa, vehicle.identificador, vehicle.extra, vehicle.id].some((value) => normalizePlate(value) === candidate));
}

function fuelMatchesVehicle(item: FuelAnalyticsRecord, vehicle: VehicleAnalyticsIdentity): boolean {
  if (item.isFuelOutput === false) return false;
  // Ligado por ID: só o ID decide. A placa vale apenas para registro sem item_frota_id.
  if (typeof item.itemFrotaUid === 'string' && item.itemFrotaUid) return item.itemFrotaUid === vehicle.id;
  const candidate = normalizePlate(item.identificadorSnapshot ?? item.placa);
  return Boolean(candidate && [vehicle.placa, vehicle.identificador, vehicle.extra].some((value) => normalizePlate(value) === candidate));
}

// Manutenção liga o veículo só por item_frota_id (veiculos-v2); todos os registros o têm desde a migração de 2026-10-23.
export function maintenanceMatchesVehicle(item: MaintenanceAnalyticsRecord, vehicle: VehicleAnalyticsIdentity): boolean {
  return typeof item.item_frota_id === 'string' && item.item_frota_id === vehicle.id;
}

/** Separa os registros por veículo uma vez só (as métricas por período e por mês leem estes grupos). */
export function agruparPorVeiculo(activities: ActivityAnalyticsRecord[], fuel: FuelAnalyticsRecord[], maintenance: MaintenanceAnalyticsRecord[], vehicles: VehicleAnalyticsIdentity[], erp: Map<string, ErpAnalyticsRow[] | null> = new Map()): Map<string, VehicleData> {
  return new Map(vehicles.map((vehicle) => [vehicle.id, {
    activities: activities.filter((item) => vehicleMatches(item, vehicle)),
    fuel: fuel.filter((item) => fuelMatchesVehicle(item, vehicle)),
    maintenance: maintenance.filter((item) => maintenanceMatchesVehicle(item, vehicle)),
    erp: erp.get(vehicle.id) ?? null,
  }]));
}

// ---------------------------------------------------------------- KM
type Leitura = { date: Date; km: number };
/** Mais que isto por dia entre duas leituras é erro de digitação (dígito a mais, vírgula perdida). */
export const KM_MAXIMO_POR_DIA = 1500;
const DIA = 86_400_000;

function fuelOdometer(item: FuelAnalyticsRecord): Leitura | null {
  if (item.isFuelOutput === false || item.itemFrotaTipo === 'maquina') return null;
  if (isSemOdometro(item.semKm)) return null;
  const motivo = typeof item.motivo === 'string' ? item.motivo.toLowerCase() : '';
  if (motivo.includes('galão') || motivo.includes('galao') || motivo.includes('bomba') || motivo.includes('ajuste') || motivo.includes('estoque')) return null;
  const km = numberValue(item.km);
  const date = toAnalyticsDate(item.data);
  return km !== null && date ? { km, date } : null;
}
function activityOdometer(item: ActivityAnalyticsRecord): Leitura | null {
  const km = typeof item.km === 'number' && Number.isFinite(item.km) ? item.km : null;
  const date = toAnalyticsDate(item.data);
  return km !== null && date ? { km, date } : null;
}

/** Leituras de odômetro do veículo (abastecimentos e atividades), da mais antiga para a mais nova, sem as soltas:
 * fica a maior sequência que só cresce e não salta mais que KM_MAXIMO_POR_DIA por dia; 0 e 1 (sem leitura) saem. */
// Guardado pelas listas (não pelo objeto do veículo), para o ERP chegar sem refazer as leituras.
const cacheLeituras = new WeakMap<object, WeakMap<object, { leituras: Leitura[]; ignoradas: Leitura[] }>>();
export function leiturasLimpas(data: Pick<VehicleData, 'activities' | 'fuel'>): { leituras: Leitura[]; ignoradas: Leitura[] } {
  const porAtividades = cacheLeituras.get(data.activities) ?? new WeakMap();
  cacheLeituras.set(data.activities, porAtividades);
  const guardado = porAtividades.get(data.fuel);
  if (guardado) return guardado;
  const resultado = calcularLeiturasLimpas(data);
  porAtividades.set(data.fuel, resultado);
  return resultado;
}
function calcularLeiturasLimpas(data: Pick<VehicleData, 'activities' | 'fuel'>): { leituras: Leitura[]; ignoradas: Leitura[] } {
  const todas = [...data.fuel.map(fuelOdometer), ...data.activities.map(activityOdometer)]
    .filter((item): item is Leitura => item !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.km - b.km);
  const candidatas = todas.filter((item) => item.km > 1);
  const cabe = (antes: Leitura, depois: Leitura) => depois.km >= antes.km && depois.km - antes.km <= KM_MAXIMO_POR_DIA * Math.max(1, (depois.date.getTime() - antes.date.getTime()) / DIA);
  const tamanho = candidatas.map(() => 1); const anterior = candidatas.map(() => -1);
  for (let j = 0; j < candidatas.length; j += 1) {
    for (let i = 0; i < j; i += 1) if (tamanho[i] + 1 > tamanho[j] && cabe(candidatas[i], candidatas[j])) { tamanho[j] = tamanho[i] + 1; anterior[j] = i; }
  }
  let fim = -1; tamanho.forEach((t, i) => { if (fim < 0 || t >= tamanho[fim]) fim = i; });
  const mantidas = new Set<number>(); for (let i = fim; i >= 0; i = anterior[i]) mantidas.add(i);
  const leituras = candidatas.filter((_, i) => mantidas.has(i));
  return { leituras, ignoradas: todas.filter((item) => !leituras.includes(item)) };
}

/** KM rodado no período: soma dos trechos entre leituras limpas consecutivas cuja leitura final cai no período. */
export function kmRodado(data: Pick<VehicleData, 'activities' | 'fuel'>, period: AnalyticsPeriod): { value: number | null; quality: DataQuality; ignoradas: number } {
  const { leituras, ignoradas } = leiturasLimpas(data);
  let value: number | null = null;
  for (let i = 1; i < leituras.length; i += 1) if (inPeriod(leituras[i].date, period)) value = (value ?? 0) + leituras[i].km - leituras[i - 1].km;
  const ignoradasNoPeriodo = ignoradas.filter((item) => inPeriod(item.date, period)).length;
  return { value, quality: value === null ? 'UNAVAILABLE' : ignoradasNoPeriodo ? 'PARTIAL' : 'AVAILABLE', ignoradas: ignoradasNoPeriodo };
}

// ---------------------------------------------------------------- custos
/** Custo do combustível do veículo no período: diesel interno a R$ 5,90/L, sem os abastecimentos externos que já
 * estão numa manutenção "ABASTECIMENTO EXTERNO" (mesma regra do relatório). */
export function custoCombustivel(data: Pick<VehicleData, 'fuel' | 'maintenance'>, period: AnalyticsPeriod): number {
  const fuel = data.fuel.filter((item) => item.isFuelOutput !== false && inPeriod(item.data, period)).map((item) => {
    const fornecedor = fuelReportSupplier(item as Record<string, unknown>);
    return { id: item.id, data: normalizeCalendarDate(item.data), quantidadeRaw: numberValue(item.quantidadeAbastecida) ?? 0, fornecedor, cnpj: extractCnpj(fornecedor) };
  });
  if (!fuel.length) return 0;
  const maintenance = data.maintenance.filter((item) => inPeriod(item.data, period)).map((item) => ({ id: item.id, data: normalizeCalendarDate(item.data), categoria: text(item.categoriaNomeSnapshot) || text(item.categoria), fornecedor: text(item.fornecedorNomeSnapshot) || text(item.fornecedor) }));
  return summarizeInternalFuel(fuel, maintenance).valor;
}

export function custoManutencao(data: Pick<VehicleData, 'maintenance'>, period: AnalyticsPeriod): number {
  return data.maintenance.filter((item) => inPeriod(item.data, period)).reduce((total, item) => total + (numberValue(item.valor) ?? 0), 0);
}

/** Despesa do ERP (Query 47, linhas DESPESA) no período; null quando o ERP não foi carregado para o veículo. */
export function custoErp(data: Pick<VehicleData, 'erp'>, period: AnalyticsPeriod): number | null {
  if (!data.erp) return null;
  return summarizeVehicleReportErp47(data.erp.filter((row) => inPeriod(normalizeCalendarDate(row.data_emissao) ? `${normalizeCalendarDate(row.data_emissao)}T12:00:00` : null, period))).despesa;
}

// ---------------------------------------------------------------- métricas
export function vehicleMetrics(data: VehicleData, period: AnalyticsPeriod): FleetMetrics {
  const km = kmRodado(data, period);
  const combustivel = custoCombustivel(data, period);
  const manutencao = custoManutencao(data, period);
  const erp = custoErp(data, period);
  const custoTotal = combustivel + manutencao + (erp ?? 0);
  return {
    viagens: data.activities.filter((item) => item.tipo === 'saida' && inPeriod(item.data, period)).length,
    kmRodado: km.value, kmQuality: km.quality, leiturasIgnoradas: km.ignoradas,
    custoCombustivel: combustivel, custoManutencao: manutencao, custoErp: erp, erpCompleto: erp !== null, custoTotal,
    rsKm: km.value && km.value > 0 ? custoTotal / km.value : null,
  };
}

/** Soma de vários veículos. R$/km usa só os veículos com KM, para não dividir custo de quem não tem leitura. */
export function fleetMetrics(rows: FleetMetrics[]): FleetMetrics {
  const comKm = rows.filter((row) => row.kmRodado !== null);
  const kmRodadoTotal = comKm.length ? comKm.reduce((sum, row) => sum + (row.kmRodado ?? 0), 0) : null;
  const custoComKm = comKm.reduce((sum, row) => sum + row.custoTotal, 0);
  const comErp = rows.filter((row) => row.custoErp !== null);
  return {
    viagens: rows.reduce((sum, row) => sum + row.viagens, 0),
    kmRodado: kmRodadoTotal,
    kmQuality: !comKm.length ? 'UNAVAILABLE' : comKm.length === rows.length && comKm.every((row) => row.kmQuality === 'AVAILABLE') ? 'AVAILABLE' : 'PARTIAL',
    leiturasIgnoradas: rows.reduce((sum, row) => sum + row.leiturasIgnoradas, 0),
    custoCombustivel: rows.reduce((sum, row) => sum + row.custoCombustivel, 0),
    custoManutencao: rows.reduce((sum, row) => sum + row.custoManutencao, 0),
    custoErp: comErp.length ? comErp.reduce((sum, row) => sum + (row.custoErp ?? 0), 0) : null,
    erpCompleto: rows.length > 0 && comErp.length === rows.length,
    custoTotal: rows.reduce((sum, row) => sum + row.custoTotal, 0),
    rsKm: kmRodadoTotal && kmRodadoTotal > 0 ? custoComKm / kmRodadoTotal : null,
  };
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Meses do período, todos (inclusive os sem registro), cada um recortado pelo período: o eixo dos gráficos. */
export function mesesDoPeriodo(period: AnalyticsPeriod): { month: string; label: string; period: AnalyticsPeriod }[] {
  const meses = [];
  for (let d = new Date(period.start.getFullYear(), period.start.getMonth(), 1); d <= period.end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    meses.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      period: { start: d < period.start ? period.start : d, end: fim > period.end ? period.end : fim },
    });
  }
  return meses;
}

export function monthlyMetrics(dados: VehicleData[], period: AnalyticsPeriod): MonthlyMetric[] {
  return mesesDoPeriodo(period).map(({ month, label, period: mes }) => ({ month, label, ...fleetMetrics(dados.map((data) => vehicleMetrics(data, mes))) }));
}

/** Placa para o ERP a partir do identificador ("ILW-2A23 - MICRO" → "ILW2A23"); sem placa (EXTRA), null. */
export function placaParaErp(identificador: string | undefined): string | null {
  const compacta = (identificador ?? '').toUpperCase().replace(/[-\s]/g, '');
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}/.test(compacta) ? compacta.slice(0, 7) : null;
}
