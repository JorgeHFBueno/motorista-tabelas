import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { db } from '../../../../firebase';
import type { ContratoCronograma, ObraCronograma } from '../../domain/models';
import { adaptRawCronograma as adaptForCronograma, CONTRATOS_HABILITADOS } from './rawCronogramaAdapter';

export { CONTRATOS_HABILITADOS } from './rawCronogramaAdapter';
export const RAW_COLLECTION = 'monday-obras';
type RawSubitem = { id?: unknown; nome?: unknown };
type RawContrato = { id?: unknown; nome?: unknown; empresa?: unknown; status?: unknown; numeroContrato?: unknown; ano?: unknown; inicio?: unknown; subitems?: unknown };
export type RawDocument = { id: string; exists: boolean; data?: unknown };
export type CronogramaLoadResult = { contratos: ContratoCronograma[]; obras: ObraCronograma[]; diagnostics: string[] };

const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const optionalText = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const validDate = (value: unknown): string | null => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

export function adaptRawContract(document: RawDocument, diagnostics: string[]): ContratoCronograma | null {
  if (!document.exists) { diagnostics.push(`Contrato ${document.id} não encontrado.`); return null; }
  const raw = (document.data && typeof document.data === 'object' ? (document.data as { raw?: unknown }).raw : null) as RawContrato | null;
  if (!raw) { diagnostics.push(`Contrato ${document.id} não possui o objeto raw.`); return null; }
  const inicio = validDate(raw.inicio);
  if (!inicio) diagnostics.push(`Contrato ${document.id} não possui raw.inicio válido; LOTEs usam 2026-01-01 como default local de renderização.`);
  const subitems = Array.isArray(raw.subitems) ? raw.subitems as RawSubitem[] : [];
  if (!Array.isArray(raw.subitems) && raw.subitems !== undefined) diagnostics.push(`Contrato ${document.id}: raw.subitems não é uma lista; tratado como vazio.`);
  const nome = text(raw.nome, document.id);
  const obras = subitems.flatMap((subitem) => {
    const id = text(subitem?.id); const nomeLote = text(subitem?.nome);
    if (!id || !nomeLote) { diagnostics.push(`Contrato ${document.id} contém subitem sem id ou nome; ignorado.`); return []; }
    // Subitens não têm planejamento: início do contrato e um dia são defaults locais explícitos.
    return [{ id, contratoId: document.id, contratoNome: nome, sourceRow: 0, codObra: id, siglaObra: 'LOTE', nomeObra: nomeLote, local: nomeLote, status: text(raw.status, 'SEM STATUS'), empresa: text(raw.empresa, 'Não informado'), mestreInicial: null, descricao: null, inicioPlanejado: inicio ?? '2026-01-01', tempoPlanejado: 1, mestresPlanejados: [] } satisfies ObraCronograma];
  });
  return { id: document.id, nome, empresa: text(raw.empresa, 'Não informado'), status: text(raw.status, 'SEM STATUS'), numeroContrato: optionalText(raw.numeroContrato), ano: typeof raw.ano === 'number' ? raw.ano : null, inicio, obras };
}

export function adaptRawCronograma(documents: RawDocument[]): CronogramaLoadResult {
  const diagnostics: string[] = []; const byId = new Map(documents.map((item) => [item.id, item]));
  const contratos = CONTRATOS_HABILITADOS.flatMap((id) => { const item = byId.get(id); return item ? [adaptRawContract(item, diagnostics)].filter((value): value is ContratoCronograma => Boolean(value)) : (diagnostics.push(`Contrato ${id} não foi retornado.`), []); });
  return { contratos, obras: contratos.flatMap((contrato) => contrato.obras), diagnostics };
}

export class RawFirestoreCronogramaDataSource {
  constructor(private readonly firestore: Firestore = db) {}
  async carregar(): Promise<CronogramaLoadResult> {
    const snapshots = await Promise.all(CONTRATOS_HABILITADOS.map(async (id) => { const snapshot = await getDoc(doc(this.firestore, RAW_COLLECTION, id)); return { id, exists: snapshot.exists(), data: snapshot.data() }; }));
    return adaptForCronograma(snapshots);
  }
}
