export type DataQuality = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
export const PILOT_START = new Date(2026, 0, 1);
export const PILOT_END = new Date(2026, 7, 31, 23, 59, 59, 999);
export const PILOT_PERIOD = { start: PILOT_START, end: PILOT_END };

export type AnalyticsPeriod = { start?: Date; end?: Date };
export type ActivityAnalyticsRecord = { id: string; tipo?: unknown; data?: unknown; veiculoId?: unknown; placa?: unknown; obraId?: unknown };
export type FuelAnalyticsRecord = { id: string; data?: unknown; placa?: unknown; km?: unknown; semKm?: unknown; tipoPlaca?: unknown; motivo?: unknown; qa?: unknown };
export type MaintenanceAnalyticsRecord = { id: string; data?: unknown; identificador?: unknown; valor?: unknown };
export type VehicleAnalyticsIdentity = { id: string; placa?: string; identificador?: string; extra?: string };

export type FleetMetrics = {
  viagens: number;
  kmEstimado: number | null;
  kmQuality: DataQuality;
  obrasVisitadas: number | null;
  obraQuality: DataQuality;
  custoManutencao: number;
  rsKmManutencao: number | null;
};

export type MonthlyMetric = FleetMetrics & { month: string };
export type ObraRanking = { obraId: string; viagens: number; percentual: number };

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

function inPeriod(value: unknown, period?: AnalyticsPeriod): boolean {
  const date = toAnalyticsDate(value);
  if (!date) return false;
  const start = period?.start && period.start > PILOT_START ? period.start : PILOT_START;
  const end = period?.end && period.end < PILOT_END ? period.end : PILOT_END;
  return date >= start && date <= end;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const result = Number(value.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(result) ? result : null;
  }
  return null;
}

export function vehicleMatches(activity: ActivityAnalyticsRecord, vehicle: VehicleAnalyticsIdentity): boolean {
  if (activity.veiculoId === vehicle.id) return true;
  const normalize = (value: unknown) => typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  const candidate = normalize(activity.placa);
  return Boolean(candidate && [vehicle.placa, vehicle.identificador, vehicle.extra, vehicle.id].some((value) => normalize(value) === candidate));
}

export function countTrips(activities: ActivityAnalyticsRecord[], period?: AnalyticsPeriod, vehicle?: VehicleAnalyticsIdentity, obraId?: string): number {
  return activities.filter((item) => item.tipo === 'saida' && inPeriod(item.data, period) && (!vehicle || vehicleMatches(item, vehicle)) && (!obraId || item.obraId === obraId)).length;
}

export function obrasVisited(): { value: null; quality: 'UNAVAILABLE' } { return { value: null, quality: 'UNAVAILABLE' }; }

function validOdometer(item: FuelAnalyticsRecord): { date: Date; km: number } | null {
  if (item.semKm === 'Sem Odômetro' || item.tipoPlaca === false) return null;
  const motivo = typeof item.motivo === 'string' ? item.motivo.toLowerCase() : '';
  if (motivo.includes('galão') || motivo.includes('galao') || motivo.includes('bomba') || motivo.includes('ajuste') || motivo.includes('estoque')) return null;
  const km = numberValue(item.km);
  const date = toAnalyticsDate(item.data);
  return km !== null && km >= 0 && date ? { km, date } : null;
}

export function estimatedKm(fuel: FuelAnalyticsRecord[], period?: AnalyticsPeriod, vehicle?: VehicleAnalyticsIdentity): { value: number | null; quality: DataQuality } {
  const labels = vehicle ? [vehicle.placa, vehicle.identificador, vehicle.extra].filter(Boolean) : null;
  const readings = fuel.filter((item) => (!labels || labels.includes(item.placa as string)) && inPeriod(item.data, period)).map(validOdometer).filter((item): item is { date: Date; km: number } => item !== null).sort((a, b) => a.date.getTime() - b.date.getTime());
  if (readings.length < 2) return { value: null, quality: 'UNAVAILABLE' };
  for (let i = 1; i < readings.length; i += 1) if (readings[i].km < readings[i - 1].km) return { value: null, quality: 'UNAVAILABLE' };
  return { value: readings[readings.length - 1].km - readings[0].km, quality: 'PARTIAL' };
}

export function maintenanceCost(records: MaintenanceAnalyticsRecord[], period?: AnalyticsPeriod, vehicle?: VehicleAnalyticsIdentity): number {
  return records.filter((item) => inPeriod(item.data, period) && (!vehicle || item.identificador === vehicle.id)).reduce((total, item) => total + (numberValue(item.valor) ?? 0), 0);
}

export function fleetMetrics(activities: ActivityAnalyticsRecord[], fuel: FuelAnalyticsRecord[], maintenance: MaintenanceAnalyticsRecord[], period?: AnalyticsPeriod, vehicle?: VehicleAnalyticsIdentity): FleetMetrics {
  if (!vehicle) {
    const custoManutencao = maintenanceCost(maintenance, period);
    return { viagens: countTrips(activities, period), kmEstimado: null, kmQuality: 'UNAVAILABLE', obrasVisitadas: null, obraQuality: 'UNAVAILABLE', custoManutencao, rsKmManutencao: null };
  }
  const km = estimatedKm(fuel, period, vehicle);
  const obras = obrasVisited();
  const custoManutencao = maintenanceCost(maintenance, period, vehicle);
  return { viagens: countTrips(activities, period, vehicle), kmEstimado: km.value, kmQuality: km.quality, obrasVisitadas: obras.value, obraQuality: obras.quality, custoManutencao, rsKmManutencao: km.value && km.value > 0 ? custoManutencao / km.value : null };
}

export function fleetMetricsForVehicles(activities: ActivityAnalyticsRecord[], fuel: FuelAnalyticsRecord[], maintenance: MaintenanceAnalyticsRecord[], vehicles: VehicleAnalyticsIdentity[], period?: AnalyticsPeriod): FleetMetrics {
  const rows = vehicles.map((vehicle) => fleetMetrics(activities, fuel, maintenance, period, vehicle));
  const kms = rows.filter((row) => row.kmEstimado !== null);
  const kmEstimado = kms.length ? kms.reduce((sum, row) => sum + (row.kmEstimado ?? 0), 0) : null;
  const custoManutencao = rows.reduce((sum, row) => sum + row.custoManutencao, 0);
  return { viagens: rows.reduce((sum, row) => sum + row.viagens, 0), kmEstimado, kmQuality: kms.length === vehicles.length ? 'AVAILABLE' : kms.length ? 'PARTIAL' : 'UNAVAILABLE', obrasVisitadas: null, obraQuality: 'UNAVAILABLE', custoManutencao, rsKmManutencao: kmEstimado && kmEstimado > 0 ? custoManutencao / kmEstimado : null };
}

export function monthlyMetrics(activities: ActivityAnalyticsRecord[], fuel: FuelAnalyticsRecord[], maintenance: MaintenanceAnalyticsRecord[], period?: AnalyticsPeriod, vehicle?: VehicleAnalyticsIdentity): MonthlyMetric[] {
  const keys = new Set<string>();
  [...activities, ...fuel, ...maintenance].forEach((item) => { const d = toAnalyticsDate(item.data); if (d && inPeriod(item.data, period)) keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); });
  return [...keys].sort().map((month) => { const [year, m] = month.split('-').map(Number); return { month, ...fleetMetrics(activities, fuel, maintenance, { start: new Date(year, m - 1, 1), end: new Date(year, m, 0, 23, 59, 59, 999) }, vehicle) }; });
}

export function monthlyFleetMetrics(activities: ActivityAnalyticsRecord[], fuel: FuelAnalyticsRecord[], maintenance: MaintenanceAnalyticsRecord[], vehicles: VehicleAnalyticsIdentity[], period?: AnalyticsPeriod): MonthlyMetric[] {
  const base = { start: period?.start ?? PILOT_START, end: period?.end ?? PILOT_END };
  const months: MonthlyMetric[] = [];
  for (let index = 0; index < 8; index += 1) {
    const start = new Date(2026, index, 1);
    const end = new Date(2026, index + 1, 0, 23, 59, 59, 999);
    if (end < base.start || start > base.end) continue;
    const effective = { start: start < base.start ? base.start : start, end: end > base.end ? base.end : end };
    months.push({ month: `${String(index + 1).padStart(2, '0')}/2026`, ...fleetMetricsForVehicles(activities, fuel, maintenance, vehicles, effective) });
  }
  return months;
}

export function tripsByObra(activities: ActivityAnalyticsRecord[], period?: AnalyticsPeriod, vehicle?: VehicleAnalyticsIdentity): ObraRanking[] {
  const rows = activities.filter((item) => item.tipo === 'saida' && inPeriod(item.data, period) && (!vehicle || vehicleMatches(item, vehicle)) && typeof item.obraId === 'string' && item.obraId.trim());
  const total = rows.length;
  const grouped = new Map<string, number>(); rows.forEach((row) => grouped.set(row.obraId as string, (grouped.get(row.obraId as string) ?? 0) + 1));
  return [...grouped.entries()].map(([obraId, viagens]) => ({ obraId, viagens, percentual: total ? viagens / total * 100 : 0 })).sort((a, b) => b.viagens - a.viagens);
}
