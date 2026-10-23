import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { normalizarMovimentoCombustivel } from './combustivel-normalizer';
import { custoDieselInterno, extractCnpj, filterVehicleReportPeriod, fuelReportSupplier, litrosFromQuantidadeRaw, normalizeCalendarDate, normalizeVehiclePlate, summarizeInternalFuel, summarizeVehicleReportErp47 } from './vehicle-report-core';

export { normalizeVehiclePlate } from './vehicle-report-core';
export type SourceError = { code?: string; message: string };
export type SourceResult<T> = { status: 'ok'; data: T } | { status: 'error'; error: SourceError };
export type VehicleReportStatus = 'complete' | 'partial' | 'failed';
const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : Number(String(v ?? '').replace(',', '.')) || 0;
const text = (v: unknown) => String(v ?? '').trim(); const iso = (v: any) => normalizeCalendarDate(v);
const sum = (items: any[], key: string) => items.reduce((total, item) => total + n(item[key]), 0);

/** Only a stable, safe code and source-specific message reach the PDF. */
export function sanitizeSourceError(source: 'fuel' | 'maintenance' | 'erp', error: unknown): SourceError {
  const code = typeof (error as any)?.code === 'string' && /^[a-z-]+$/i.test((error as any).code) ? (error as any).code : undefined;
  const messages = { fuel: 'Não foi possível carregar os dados de combustível no Firebase.', maintenance: 'Não foi possível consultar os dados de manutenção no Firebase.', erp: 'Não foi possível consultar o ERP no momento da geração.' };
  return { ...(code ? { code } : {}), message: messages[source] };
}
function sourceResult<T>(source: 'fuel' | 'maintenance' | 'erp', settled: PromiseSettledResult<T>): SourceResult<T> {
  if (settled.status === 'fulfilled') return { status: 'ok', data: settled.value };
  console.warn(`[vehicle-report] ${source} source failed`, settled.reason);
  return { status: 'error', error: sanitizeSourceError(source, settled.reason) };
}
type BuildInput = { placa: string; vehicleId: string; vehicleName?: string; dataInicial: string; dataFinal: string };
export type VehicleReportSources = { fuel: SourceResult<any[]>; maintenance: SourceResult<any[]>; erp: SourceResult<any> };

/** Creates a report model from independently resolved sources; no failed source becomes zero. */
export function composeVehicleReport(input: BuildInput, sources: VehicleReportSources) {
  const { placa, vehicleId, vehicleName, dataInicial, dataFinal } = input;
  const fuel = sources.fuel.status === 'ok' ? filterVehicleReportPeriod(sources.fuel.data.map((raw: any, index) => ({ id: raw.id ?? String(index), ...normalizarMovimentoCombustivel(raw, raw.id ?? String(index)) as any })).filter((r: any) => r.isFuelOutput !== false && (r.itemFrotaUid ? r.itemFrotaUid === vehicleId : text(r.identificadorSnapshot) === placa)), dataInicial, dataFinal, (r: any) => r.data).map((r: any) => ({ data: iso(r.data), quantidadeRaw: n(r.quantidadeAbastecida), fornecedor: fuelReportSupplier(r), cnpj: extractCnpj(fuelReportSupplier(r)), km: r.km ?? null, obra: text(r.obra), motorista: text(r.motorista), id: r.id })) : [];
  const maintenance = sources.maintenance.status === 'ok' ? filterVehicleReportPeriod(sources.maintenance.data.map((raw: any, index) => ({ id: raw.id ?? String(index), ...raw })), dataInicial, dataFinal, (r: any) => r.data).filter((r: any) => text(r.item_frota_id) === vehicleId).map((r: any) => ({ data: iso(r.data), categoria: text(r.categoriaNomeSnapshot || r.categoria), descricao: text(r.descricao || r.categoriaNomeSnapshot || r.categoria), fornecedor: text(r.fornecedorNomeSnapshot || r.fornecedor), valor: n(r.valor), id: r.id })).sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id)) : [];
  const canClassifyFuel = sources.fuel.status === 'ok' && sources.maintenance.status === 'ok';
  const fuelSummary = canClassifyFuel ? summarizeInternalFuel(fuel, maintenance) : null;
  const fuelItems = fuelSummary?.itens.map((r) => { const litros = litrosFromQuantidadeRaw(r.quantidadeRaw); return { data: r.data, litros, valor: custoDieselInterno(litros), km: (r as any).km, obra: (r as any).obra, motorista: (r as any).motorista, id: r.id }; }) ?? [];
  const q47 = sources.erp.status === 'ok' ? summarizeVehicleReportErp47(filterVehicleReportPeriod(sources.erp.data.query47 ?? [], dataInicial, dataFinal, (r: any) => r.data_emissao)) : null;
  const maintenanceValue = sources.maintenance.status === 'ok' ? sum(maintenance, 'valor') : null;
  const firebaseTotal = fuelSummary && maintenanceValue !== null ? fuelSummary.valor + maintenanceValue : null;
  const erpValue = q47?.despesa ?? null;
  const available = Object.values(sources).filter((source) => source.status === 'ok').length;
  const status: VehicleReportStatus = available === 3 ? 'complete' : available === 0 ? 'failed' : 'partial';
  return { veiculo: { placa, nome: vehicleName || placa }, periodo: { dataInicial, dataFinal }, status, sources, firebase: { combustivel: { registrosEncontrados: sources.fuel.status === 'ok' ? fuel.length : null, classificacaoDisponivel: canClassifyFuel, externos: fuelSummary?.externos ?? null, registros: fuelSummary?.internos ?? null, litros: fuelSummary?.litros ?? null, valor: fuelSummary?.valor ?? null, itens: fuelItems, itensBrutos: fuel }, manutencoes: { registros: sources.maintenance.status === 'ok' ? maintenance.length : null, valor: maintenanceValue, itens: maintenance }, total: firebaseTotal }, erp: { query47: q47 }, totais: { firebase: firebaseTotal, erpQ47: erpValue, consolidado: firebaseTotal !== null && erpValue !== null ? firebaseTotal + erpValue : null } };
}
export async function buildVehicleReport(input: BuildInput) {
  const settled = await Promise.allSettled([
    getDocs(collection(db, '03-combustivel')).then((snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
    getDocs(collection(db, 'manutencoes')).then((snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
    httpsCallable<any, any>(functions, 'getVehicleErpCosts')({ placa: input.placa, dataInicial: input.dataInicial, dataFinal: input.dataFinal }).then((result) => result.data),
  ]);
  return composeVehicleReport(input, { fuel: sourceResult('fuel', settled[0]), maintenance: sourceResult('maintenance', settled[1]), erp: sourceResult('erp', settled[2]) });
}
