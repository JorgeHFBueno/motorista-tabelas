// KPI da frota (/frota/analytics). Funções puras; a tela carrega os dados e chama estas funções.
// Custo = a mesma conta do relatório do veículo (vehicle-report-core): diesel interno a R$ 5,90/L, o abastecimento
// externo que já virou manutenção não conta duas vezes, manutenções FROTA e, quando carregado, ERP Q47 (DESPESA).
import { isSemOdometro } from './combustivel-normalizer';
import { custoPorAbastecimento, extractCnpj, fuelReportSupplier, normalizeCalendarDate, summarizeInternalFuel, summarizeVehicleReportErp47 } from './vehicle-report-core';

export type DataQuality = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
export type AnalyticsPeriod = { start: Date; end: Date };

/** O KPI começa em 01/01/2025 (como o relatório do veículo) e vai até hoje. */
export const KPI_INICIO = new Date(2025, 0, 1);
export function periodoKpi(hoje = new Date()): AnalyticsPeriod {
  return { start: KPI_INICIO, end: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999) };
}

export type ActivityAnalyticsRecord = { id: string; tipo?: unknown; data?: unknown; veiculoId?: unknown; placa?: unknown; km?: unknown; motorista?: unknown };
export type FuelAnalyticsRecord = { id: string; data?: unknown; placa?: unknown; km?: unknown; semKm?: unknown; motivo?: unknown; quantidadeAbastecida?: unknown; isFuelOutput?: boolean; schema?: string; itemFrotaUid?: unknown; itemFrotaTipo?: unknown; identificadorSnapshot?: unknown; [campo: string]: unknown };
export type MaintenanceAnalyticsRecord = { id: string; data?: unknown; item_frota_id?: unknown; valor?: unknown; categoria?: unknown; categoriaNomeSnapshot?: unknown; fornecedor?: unknown; fornecedorNomeSnapshot?: unknown };
export type ErpAnalyticsRow = Record<string, unknown>;
export type VehicleAnalyticsIdentity = { id: string; placa?: string; identificador?: string; extra?: string; tipo?: string | null; quilometragemInicial?: number | null; dataUltimaAtualizacao?: unknown };

/** Registros de um veículo. `erp` null = ERP não carregado (ou falhou) para ele. */
export type VehicleData = { activities: ActivityAnalyticsRecord[]; fuel: FuelAnalyticsRecord[]; maintenance: MaintenanceAnalyticsRecord[]; erp: ErpAnalyticsRow[] | null };

export type FleetMetrics = {
  viagens: number;
  kmRodado: number | null;
  kmQuality: DataQuality;
  horasTrabalhadas: number | null; // máquinas (EXTRA), pelo horímetro
  leiturasIgnoradas: number;
  custoCombustivel: number;
  custoManutencao: number;
  custoErp: number | null;     // null = ERP não carregado para nenhum veículo
  erpCompleto: boolean;        // ERP carregado para todos os veículos considerados
  custoTotal: number;          // combustível + manutenção + ERP carregado
  rsKm: number | null;         // custo total dos veículos com KM ÷ KM rodado
  rsHora: number | null;       // custo total das máquinas com horas ÷ horas trabalhadas
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

// ---------------------------------------------------------------- KM e horímetro
export type Medidor = 'km' | 'h';
/** `valor` é o km (odômetro) ou as horas (horímetro); `origem` é "<coleção>/<id>" do registro. */
export type Leitura = { date: Date; valor: number; origem: string };
/** Mais que isto por dia entre duas leituras é erro de digitação (dígito a mais, vírgula perdida). */
export const KM_MAXIMO_POR_DIA = 1500;
export const HORAS_MAXIMAS_POR_DIA = 24;
const DIA = 86_400_000;

function abastecimentoValido(item: FuelAnalyticsRecord) {
  if (item.isFuelOutput === false || isSemOdometro(item.semKm)) return false;
  const motivo = typeof item.motivo === 'string' ? item.motivo.toLowerCase() : '';
  return !(motivo.includes('galão') || motivo.includes('galao') || motivo.includes('bomba') || motivo.includes('ajuste') || motivo.includes('estoque'));
}
function fuelReading(item: FuelAnalyticsRecord, medidor: Medidor): Leitura | null {
  if (!abastecimentoValido(item)) return null;
  if (medidor === 'km' ? item.itemFrotaTipo === 'maquina' : item.itemFrotaTipo !== 'maquina') return null;
  const valor = numberValue(medidor === 'km' ? item.km : item.horimetro);
  const date = toAnalyticsDate(item.data);
  return valor !== null && date ? { valor, date, origem: `03-combustivel/${item.id}` } : null;
}
function activityOdometer(item: ActivityAnalyticsRecord): Leitura | null {
  const valor = typeof item.km === 'number' && Number.isFinite(item.km) ? item.km : null;
  const date = toAnalyticsDate(item.data);
  return valor !== null && date ? { valor, date, origem: `atividades/${item.id}` } : null;
}

/** Leituras do medidor (km: abastecimentos e atividades; h: horímetro dos abastecimentos de máquina), da mais antiga
 * para a mais nova, sem as soltas: fica a maior sequência que só cresce e não salta mais que o máximo por dia; 0 e 1
 * (sem leitura) saem. */
// Guardado pelas listas (não pelo objeto do veículo), para o ERP chegar sem refazer as leituras.
type Limpas = { leituras: Leitura[]; ignoradas: Leitura[] };
const cacheKm = new WeakMap<object, WeakMap<object, Limpas>>();
const cacheHoras = new WeakMap<object, Limpas>();
export function leiturasLimpas(data: Pick<VehicleData, 'activities' | 'fuel'>, medidor: Medidor = 'km'): Limpas {
  if (medidor === 'h') {
    const guardado = cacheHoras.get(data.fuel);
    if (guardado) return guardado;
    const resultado = limpar(data.fuel.map((item) => fuelReading(item, 'h')), HORAS_MAXIMAS_POR_DIA);
    cacheHoras.set(data.fuel, resultado);
    return resultado;
  }
  const porAtividades = cacheKm.get(data.activities) ?? new WeakMap();
  cacheKm.set(data.activities, porAtividades);
  const guardado = porAtividades.get(data.fuel);
  if (guardado) return guardado;
  const resultado = limpar([...data.fuel.map((item) => fuelReading(item, 'km')), ...data.activities.map(activityOdometer)], KM_MAXIMO_POR_DIA);
  porAtividades.set(data.fuel, resultado);
  return resultado;
}
function limpar(lidas: (Leitura | null)[], maximoPorDia: number): Limpas {
  const todas = lidas.filter((item): item is Leitura => item !== null).sort((a, b) => a.date.getTime() - b.date.getTime() || a.valor - b.valor);
  const candidatas = todas.filter((item) => item.valor > 1);
  const cabe = (antes: Leitura, depois: Leitura) => depois.valor >= antes.valor && depois.valor - antes.valor <= maximoPorDia * Math.max(1, (depois.date.getTime() - antes.date.getTime()) / DIA);
  const tamanho = candidatas.map(() => 1); const anterior = candidatas.map(() => -1);
  for (let j = 0; j < candidatas.length; j += 1) {
    for (let i = 0; i < j; i += 1) if (tamanho[i] + 1 > tamanho[j] && cabe(candidatas[i], candidatas[j])) { tamanho[j] = tamanho[i] + 1; anterior[j] = i; }
  }
  let fim = -1; tamanho.forEach((t, i) => { if (fim < 0 || t >= tamanho[fim]) fim = i; });
  const mantidas = new Set<number>(); for (let i = fim; i >= 0; i = anterior[i]) mantidas.add(i);
  const leituras = candidatas.filter((_, i) => mantidas.has(i));
  return { leituras, ignoradas: todas.filter((item) => !leituras.includes(item)) };
}

/** Quanto o medidor andou no período: soma dos trechos entre leituras limpas seguidas cuja leitura final cai no período. */
function medicao(data: Pick<VehicleData, 'activities' | 'fuel'>, period: AnalyticsPeriod, medidor: Medidor): { value: number | null; quality: DataQuality; ignoradas: number } {
  const { leituras, ignoradas } = leiturasLimpas(data, medidor);
  let value: number | null = null;
  for (let i = 1; i < leituras.length; i += 1) if (inPeriod(leituras[i].date, period)) value = (value ?? 0) + leituras[i].valor - leituras[i - 1].valor;
  const ignoradasNoPeriodo = ignoradas.filter((item) => inPeriod(item.date, period)).length;
  return { value, quality: value === null ? 'UNAVAILABLE' : ignoradasNoPeriodo ? 'PARTIAL' : 'AVAILABLE', ignoradas: ignoradasNoPeriodo };
}
export const kmRodado = (data: Pick<VehicleData, 'activities' | 'fuel'>, period: AnalyticsPeriod) => medicao(data, period, 'km');
export const horasTrabalhadas = (data: Pick<VehicleData, 'activities' | 'fuel'>, period: AnalyticsPeriod) => medicao(data, period, 'h');

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
  const horas = horasTrabalhadas(data, period);
  const combustivel = custoCombustivel(data, period);
  const manutencao = custoManutencao(data, period);
  const erp = custoErp(data, period);
  const custoTotal = combustivel + manutencao + (erp ?? 0);
  return {
    viagens: data.activities.filter((item) => item.tipo === 'saida' && inPeriod(item.data, period)).length,
    kmRodado: km.value, kmQuality: km.quality, horasTrabalhadas: horas.value, leiturasIgnoradas: km.ignoradas + horas.ignoradas,
    custoCombustivel: combustivel, custoManutencao: manutencao, custoErp: erp, erpCompleto: erp !== null, custoTotal,
    rsKm: km.value && km.value > 0 ? custoTotal / km.value : null,
    rsHora: horas.value && horas.value > 0 ? custoTotal / horas.value : null,
  };
}

/** Soma de vários veículos. R$/km usa só os veículos com KM, para não dividir custo de quem não tem leitura. */
export function fleetMetrics(rows: FleetMetrics[]): FleetMetrics {
  const comKm = rows.filter((row) => row.kmRodado !== null);
  const kmRodadoTotal = comKm.length ? comKm.reduce((sum, row) => sum + (row.kmRodado ?? 0), 0) : null;
  const custoComKm = comKm.reduce((sum, row) => sum + row.custoTotal, 0);
  const comErp = rows.filter((row) => row.custoErp !== null);
  const comHoras = rows.filter((row) => row.horasTrabalhadas !== null);
  const horasTotal = comHoras.length ? comHoras.reduce((sum, row) => sum + (row.horasTrabalhadas ?? 0), 0) : null;
  const custoComHoras = comHoras.reduce((sum, row) => sum + row.custoTotal, 0);
  return {
    viagens: rows.reduce((sum, row) => sum + row.viagens, 0),
    kmRodado: kmRodadoTotal,
    kmQuality: !comKm.length ? 'UNAVAILABLE' : comKm.length === rows.length && comKm.every((row) => row.kmQuality === 'AVAILABLE') ? 'AVAILABLE' : 'PARTIAL',
    horasTrabalhadas: horasTotal,
    leiturasIgnoradas: rows.reduce((sum, row) => sum + row.leiturasIgnoradas, 0),
    custoCombustivel: rows.reduce((sum, row) => sum + row.custoCombustivel, 0),
    custoManutencao: rows.reduce((sum, row) => sum + row.custoManutencao, 0),
    custoErp: comErp.length ? comErp.reduce((sum, row) => sum + (row.custoErp ?? 0), 0) : null,
    erpCompleto: rows.length > 0 && comErp.length === rows.length,
    custoTotal: rows.reduce((sum, row) => sum + row.custoTotal, 0),
    rsKm: kmRodadoTotal && kmRodadoTotal > 0 ? custoComKm / kmRodadoTotal : null,
    rsHora: horasTotal && horasTotal > 0 ? custoComHoras / horasTotal : null,
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

// ---------------------------------------------------------------- registros (tabela da análise de um veículo)
export type FonteRegistro = 'atividade' | 'abastecimento' | 'manutencao' | 'erp';
export type RegistroKpi = { id: string; fonte: FonteRegistro; data: Date | null; categoria: string; valor: number | null; valorTexto: string | null };
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const erpNumero = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(String(value ?? '').replace(',', '.')) || 0);

/** Registros do veículo no período, com o valor que entra no custo: a soma dos valores das fontes de custo é o
 * custo total do período (combustível + manutenção + ERP DESPESA). Atividade não tem valor (mostra o km); abastecimento
 * externo já lançado na manutenção e linha do ERP que não é DESPESA aparecem sem valor, com o motivo. */
export function registrosDoPeriodo(data: VehicleData, period: AnalyticsPeriod): RegistroKpi[] {
  const registros: RegistroKpi[] = [];
  for (const item of data.activities) {
    if (item.tipo !== 'saida' || !inPeriod(item.data, period)) continue;
    const km = typeof item.km === 'number' && Number.isFinite(item.km) ? item.km : null;
    registros.push({ id: `atividade_${item.id}`, fonte: 'atividade', data: toAnalyticsDate(item.data), categoria: text(item.motorista) ? `Saída — ${text(item.motorista)}` : 'Saída', valor: null, valorTexto: km !== null ? `${new Intl.NumberFormat('pt-BR').format(km)} km` : null });
  }
  const fuel = data.fuel.filter((item) => item.isFuelOutput !== false && inPeriod(item.data, period));
  const manutencoes = data.maintenance.filter((item) => inPeriod(item.data, period));
  const valores = custoPorAbastecimento(
    fuel.map((item) => { const fornecedor = fuelReportSupplier(item as Record<string, unknown>); return { id: item.id, data: normalizeCalendarDate(item.data), quantidadeRaw: numberValue(item.quantidadeAbastecida) ?? 0, fornecedor, cnpj: extractCnpj(fornecedor) }; }),
    manutencoes.map((item) => ({ id: item.id, data: normalizeCalendarDate(item.data), categoria: text(item.categoriaNomeSnapshot) || text(item.categoria), fornecedor: text(item.fornecedorNomeSnapshot) || text(item.fornecedor) })),
  );
  for (const item of fuel) {
    const valor = valores.get(item.id) ?? null;
    const motivo = text(item.motivo) || 'ABASTECIMENTO';
    registros.push({ id: `abastecimento_${item.id}`, fonte: 'abastecimento', data: toAnalyticsDate(item.data), categoria: valor === null ? `${motivo} (externo, na manutenção)` : motivo, valor, valorTexto: valor === null ? 'na manutenção' : null });
  }
  for (const item of manutencoes) {
    registros.push({ id: `manutencao_${item.id}`, fonte: 'manutencao', data: toAnalyticsDate(item.data), categoria: text(item.categoriaNomeSnapshot) || text(item.categoria) || 'Manutenção', valor: numberValue(item.valor) ?? 0, valorTexto: null });
  }
  (data.erp ?? []).forEach((row, index) => {
    const emissao = normalizeCalendarDate(row.data_emissao);
    if (!emissao || !inPeriod(`${emissao}T12:00:00`, period)) return;
    const despesa = text(row.tipo_movimento).toUpperCase() === 'DESPESA';
    const valor = erpNumero(row.valor_rateio);
    registros.push({ id: `erp_${index}`, fonte: 'erp', data: new Date(`${emissao}T12:00:00`), categoria: text(row.natureza) || text(row.conta) || 'ERP', valor: despesa ? valor : null, valorTexto: despesa ? null : `${text(row.tipo_movimento) || 'sem tipo'}: ${moeda.format(valor)}` });
  });
  return registros.sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0));
}

// ---------------------------------------------------------------- Testes de KPI (não entram nos números principais)
const dataBr = (date: Date | null) => (date ? date.toLocaleDateString('pt-BR') : '—');
const DIAS_SEM_ATUALIZAR = 30;

export type Duplicidade = { manutencaoId: string; manutencaoData: Date | null; manutencaoCategoria: string; erpData: Date | null; erpNatureza: string; valor: number; dias: number };
/** Gasto lançado no FROTA e no ERP: manutenção e linha DESPESA do ERP com o mesmo valor (diferença até R$ 0,01) e
 * datas a até `maxDias` dias; cada linha casa uma vez só, com a data mais próxima. null = ERP não carregado. */
export function duplicidadesFrotaErp(data: VehicleData, period: AnalyticsPeriod, maxDias = 7): Duplicidade[] | null {
  if (!data.erp) return null;
  const erp = data.erp.map((row) => ({ row, data: normalizeCalendarDate(row.data_emissao) ? new Date(`${normalizeCalendarDate(row.data_emissao)}T12:00:00`) : null }))
    .filter((item) => item.data && inPeriod(item.data, period) && text(item.row.tipo_movimento).toUpperCase() === 'DESPESA');
  const usadas = new Set<number>();
  const duplicidades: Duplicidade[] = [];
  const manutencoes = data.maintenance.filter((item) => inPeriod(item.data, period) && (numberValue(item.valor) ?? 0) > 0)
    .sort((a, b) => (toAnalyticsDate(a.data)?.getTime() ?? 0) - (toAnalyticsDate(b.data)?.getTime() ?? 0));
  for (const item of manutencoes) {
    const valor = numberValue(item.valor) ?? 0; const dataManutencao = toAnalyticsDate(item.data);
    let melhor = -1; let melhorDias = Infinity;
    erp.forEach((linha, index) => {
      if (usadas.has(index) || !linha.data || !dataManutencao) return;
      if (Math.abs(erpNumero(linha.row.valor_rateio) - valor) > 0.01) return;
      const dias = Math.abs(linha.data.getTime() - dataManutencao.getTime()) / DIA;
      if (dias <= maxDias + 0.5 && dias < melhorDias) { melhor = index; melhorDias = dias; }
    });
    if (melhor < 0) continue;
    usadas.add(melhor);
    duplicidades.push({ manutencaoId: item.id, manutencaoData: dataManutencao, manutencaoCategoria: text(item.categoriaNomeSnapshot) || text(item.categoria) || 'Manutenção', erpData: erp[melhor].data, erpNatureza: text(erp[melhor].row.natureza) || text(erp[melhor].row.conta) || 'ERP', valor, dias: Math.round(melhorDias) });
  }
  return duplicidades;
}

export type Consumo = { litros: number; kmPorLitro: number | null; litrosPorHora: number | null };
/** Consumo no período: litros de todas as saídas de combustível do veículo; km/L com o KM rodado e L/h com as horas. */
export function consumo(data: VehicleData, period: AnalyticsPeriod): Consumo {
  const litros = data.fuel.filter((item) => item.isFuelOutput !== false && inPeriod(item.data, period)).reduce((total, item) => total + (numberValue(item.quantidadeAbastecida) ?? 0) / 10, 0);
  const km = kmRodado(data, period).value; const horas = horasTrabalhadas(data, period).value;
  return { litros, kmPorLitro: km && litros > 0 ? km / litros : null, litrosPorHora: horas && horas > 0 && litros > 0 ? litros / horas : null };
}

/** Para onde vai o dinheiro: soma por categoria (FROTA) e natureza (ERP); combustível numa linha só. */
export function custoPorCategoria(dados: VehicleData[], period: AnalyticsPeriod): { categoria: string; valor: number }[] {
  const soma = new Map<string, number>();
  for (const data of dados) {
    for (const registro of registrosDoPeriodo(data, period)) {
      if (registro.valor === null || registro.valor === 0) continue;
      const categoria = registro.fonte === 'abastecimento' ? 'COMBUSTÍVEL (diesel interno)' : `${registro.categoria.trim().toUpperCase()}${registro.fonte === 'erp' ? ' (ERP)' : ''}`;
      soma.set(categoria, (soma.get(categoria) ?? 0) + registro.valor);
    }
  }
  return [...soma].map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor);
}

export type ProblemaDado = { tipo: 'leitura-solta' | 'km-inicial' | 'sem-atualizacao'; detalhe: string; data: Date | null; origem: string | null };
/** Dados a corrigir de um veículo (todo o histórico, não só o período). */
export function dadosACorrigir(vehicle: VehicleAnalyticsIdentity, data: Pick<VehicleData, 'activities' | 'fuel'>, hoje = new Date()): ProblemaDado[] {
  const problemas: ProblemaDado[] = [];
  const placa = Boolean(vehicle.placa);
  for (const medidor of ['km', 'h'] as Medidor[]) {
    const { leituras, ignoradas } = leiturasLimpas(data, medidor);
    for (const leitura of ignoradas) {
      const antes = [...leituras].reverse().find((item) => item.date <= leitura.date);
      problemas.push({ tipo: 'leitura-solta', data: leitura.date, origem: leitura.origem, detalhe: `${new Intl.NumberFormat('pt-BR').format(leitura.valor)} ${medidor} em ${dataBr(leitura.date)} fora da sequência${antes ? ` (antes: ${new Intl.NumberFormat('pt-BR').format(antes.valor)} ${medidor} em ${dataBr(antes.date)})` : ''}` });
    }
  }
  if (placa && !vehicle.quilometragemInicial) problemas.push({ tipo: 'km-inicial', data: null, origem: null, detalhe: vehicle.quilometragemInicial === 0 ? 'KM inicial 0' : 'KM inicial vazio' });
  if (placa) {
    const ultima = toAnalyticsDate(vehicle.dataUltimaAtualizacao);
    const dias = ultima ? Math.floor((hoje.getTime() - ultima.getTime()) / DIA) : null;
    if (dias === null || dias > DIAS_SEM_ATUALIZAR) problemas.push({ tipo: 'sem-atualizacao', data: ultima, origem: null, detalhe: dias === null ? 'KM nunca atualizado pelo app' : `KM sem atualização há ${dias} dias` });
  }
  return problemas;
}
