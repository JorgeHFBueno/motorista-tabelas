import type { MestrePlanejado, ObraCronograma } from '../domain/models';

export const ALOCACOES_STORAGE_KEY = 'cronoobra.alocacoes.v1';
export const ALOCACOES_BACKUP_PRE_MONDAY_MESTRES_KEY = 'cronoobra.alocacoes.backup.pre-monday-mestres.v1';
export const MESTRES_LEGACY_STORAGE_KEY = 'cronoobra.mestres.v1';
export type AlocacaoLocal = { id: string; obraId: string; mestreId: string; inicio: string; tempoPlanejado: number };
type StoredAllocations = { version: 1; alocacoes: AlocacaoLocal[] };
type MestreIdentity = { id: string; nome: string };
const normalizeName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleUpperCase('pt-BR');

const valid = (value: unknown): value is AlocacaoLocal => Boolean(value && typeof value === 'object' && typeof (value as AlocacaoLocal).id === 'string' && typeof (value as AlocacaoLocal).obraId === 'string' && typeof (value as AlocacaoLocal).mestreId === 'string' && typeof (value as AlocacaoLocal).inicio === 'string' && typeof (value as AlocacaoLocal).tempoPlanejado === 'number');
export function loadAlocacoes(storage: Storage = localStorage): AlocacaoLocal[] { const raw = storage.getItem(ALOCACOES_STORAGE_KEY); if (!raw) return []; try { const parsed = JSON.parse(raw) as Partial<StoredAllocations>; return Array.isArray(parsed.alocacoes) ? parsed.alocacoes.filter(valid) : []; } catch { console.warn('CronoObra: alocações locais inválidas foram ignoradas.'); return []; } }
export function saveAlocacoes(alocacoes: readonly AlocacaoLocal[], storage: Storage = localStorage) { storage.setItem(ALOCACOES_STORAGE_KEY, JSON.stringify({ version: 1, alocacoes } satisfies StoredAllocations)); }
export function migrateAlocacoesParaMondayMestres(mestres: readonly MestreIdentity[], storage: Storage = localStorage): { analyzed: number; remapped: number; unmatched: string[]; backupCreated: boolean } {
  const alocacoes = loadAlocacoes(storage); const legacyRaw = storage.getItem(MESTRES_LEGACY_STORAGE_KEY);
  let legacy: Array<{ id?: unknown; nome?: unknown }> = [];
  try { const parsed = legacyRaw ? JSON.parse(legacyRaw) : []; if (Array.isArray(parsed)) legacy = parsed; } catch { /* legacy inválido não pode ser associado */ }
  const oldNames = new Map(legacy.filter((item): item is { id: string; nome: string } => typeof item.id === 'string' && typeof item.nome === 'string').map((item) => [item.id, normalizeName(item.nome)]));
  const newIds = new Map(mestres.map((item) => [normalizeName(item.nome), item.id]));
  const candidates = alocacoes.filter((item) => oldNames.has(item.mestreId) && newIds.has(oldNames.get(item.mestreId)!));
  const unmatched = [...new Set(alocacoes.filter((item) => oldNames.has(item.mestreId) && !newIds.has(oldNames.get(item.mestreId)!)).map((item) => item.mestreId))];
  if (!candidates.length) return { analyzed: alocacoes.length, remapped: 0, unmatched, backupCreated: false };
  const backupCreated = !storage.getItem(ALOCACOES_BACKUP_PRE_MONDAY_MESTRES_KEY);
  if (backupCreated) storage.setItem(ALOCACOES_BACKUP_PRE_MONDAY_MESTRES_KEY, storage.getItem(ALOCACOES_STORAGE_KEY)!);
  const migrated = alocacoes.map((item) => { const name = oldNames.get(item.mestreId); const mestreId = name ? newIds.get(name) : undefined; return mestreId ? { ...item, mestreId } : item; });
  saveAlocacoes(migrated, storage);
  return { analyzed: alocacoes.length, remapped: candidates.length, unmatched, backupCreated };
}
export function hydrateAlocacoes(obras: ObraCronograma[], mestres: readonly MestreIdentity[], alocacoes: readonly AlocacaoLocal[]): ObraCronograma[] { const masters = new Map(mestres.map((mestre) => [mestre.id, mestre])); return obras.map((obra) => ({ ...obra, mestresPlanejados: [...obra.mestresPlanejados, ...alocacoes.filter((item) => item.obraId === obra.id && masters.has(item.mestreId) && !obra.mestresPlanejados.some((current) => current.localId === item.id)).map((item) => { const mestre = masters.get(item.mestreId)!; return { localId: item.id, mestreId: item.mestreId, nome: mestre.nome, inicio: item.inicio, tempoPlanejado: item.tempoPlanejado } satisfies MestrePlanejado; })] })); }
export function alocacoesDasObras(obras: readonly ObraCronograma[]): AlocacaoLocal[] { return obras.flatMap((obra) => obra.mestresPlanejados.flatMap((mestre) => mestre.mestreId ? [{ id: mestre.localId, obraId: obra.id, mestreId: mestre.mestreId, inicio: mestre.inicio, tempoPlanejado: mestre.tempoPlanejado }] : [])); }
export function mergeAlocacoes(existing: readonly AlocacaoLocal[], obras: readonly ObraCronograma[], mestres: readonly MestreIdentity[]): AlocacaoLocal[] { const obraIds = new Set(obras.map((obra) => obra.id)); const mestreIds = new Set(mestres.map((mestre) => mestre.id)); return [...existing.filter((item) => !obraIds.has(item.obraId) || !mestreIds.has(item.mestreId)), ...alocacoesDasObras(obras)]; }
