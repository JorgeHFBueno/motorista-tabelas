import type { ContratoCronograma, ObraCronograma } from '../../domain/models';
import { inclusiveCivilDays, isValidCivilDate } from '../../domain/temporal';

/**
 * Contrato de obras-v2 (The Manuscript, 01_FIRESTORE/COLECOES/obras-v2.md): um documento por contrato, LOTEs em
 * `lotes.{chave}`. O CronoObra mostra os contratos ligados ao Friday (`friday.ok`). LOTEs são só identidades: o
 * período de planejamento é sempre o do contrato.
 */
type Lote = { nome?: unknown; status?: unknown; ordem?: unknown; situacao?: unknown };
type ObraV2 = {
  nomeObra?: unknown; empresa?: unknown; situacao?: unknown; numeroContrato?: unknown; ano?: unknown; dataInicial?: unknown; dataFinal?: unknown;
  tipoObra?: unknown; confirmacaoRecurso?: unknown; ordemInicio?: unknown; subcentroErp?: unknown; lotes?: unknown; friday?: { ok?: unknown };
};
export type ObraV2Document = { id: string; exists: boolean; data?: unknown };
export type CronogramaLoadResult = { contratos: ContratoCronograma[]; obras: ObraCronograma[]; diagnostics: string[] };
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const optionalText = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const validDate = (value: unknown): string | null => typeof value === 'string' && isValidCivilDate(value) ? value : null;
const ordem = (lote: Lote) => typeof lote.ordem === 'number' && Number.isFinite(lote.ordem) ? lote.ordem : Number.MAX_SAFE_INTEGER;

function contractPlanningRow(contratoId: string, nome: string, status: string, empresa: string, inicio: string | null, fim: string | null): ObraCronograma {
  const dias = inclusiveCivilDays(inicio, fim);
  return { id: `contrato:${contratoId}`, targetType: 'contrato', contratoId, contratoNome: nome, sourceRow: 0, codObra: contratoId, siglaObra: 'CONTRATO', nomeObra: 'Analisar Contrato', local: 'Analisar Contrato', status, empresa, mestreInicial: null, descricao: null, inicioPlanejado: dias === null ? null : inicio, tempoPlanejado: dias, allocationAllowed: dias !== null, mestresPlanejados: [] };
}

export function adaptObraV2Contract(document: ObraV2Document, diagnostics: string[]): ContratoCronograma | null {
  const data = document.data && typeof document.data === 'object' ? document.data as ObraV2 : null;
  if (!document.exists || !data || data.friday?.ok !== true) return null;
  const inicio = validDate(data.dataInicial); const fim = validDate(data.dataFinal);
  if (inicio && fim && inclusiveCivilDays(inicio, fim) === null) diagnostics.push(`Contrato ${document.id}: fim anterior ao início.`);
  const mapa = data.lotes && typeof data.lotes === 'object' && !Array.isArray(data.lotes) ? data.lotes as Record<string, Lote> : {};
  if (data.lotes != null && mapa !== data.lotes) diagnostics.push(`Contrato ${document.id}: lotes não é um mapa; tratado como vazio.`);
  const nome = text(data.nomeObra, document.id);
  const empresa = text(data.empresa, 'Não informado');
  const status = text(data.situacao, 'Sem status');
  const dias = inclusiveCivilDays(inicio, fim);
  // LOTE arquivado ou na lixeira no Friday fica no documento, marcado em `situacao`, e sai do CronoObra.
  const lotes = Object.entries(mapa).filter(([, lote]) => lote && typeof lote === 'object' && lote.situacao == null)
    .sort(([a, x], [b, y]) => ordem(x) - ordem(y) || a.localeCompare(b));
  const obras: ObraCronograma[] = lotes.map(([loteId, lote]) => {
    const nomeLote = optionalText(lote.nome) ?? 'Analisar Contrato';
    return { id: loteId, loteId, targetType: 'obra', contratoId: document.id, contratoNome: nome, sourceRow: 0, codObra: loteId, siglaObra: 'LOTE', nomeObra: nomeLote, local: nomeLote, status: text(lote.status, 'Sem status'), empresa, mestreInicial: null, descricao: null, inicioPlanejado: dias === null ? null : inicio, tempoPlanejado: dias, allocationAllowed: dias !== null, mestresPlanejados: [] } satisfies ObraCronograma;
  });
  if (!obras.length) obras.push(contractPlanningRow(document.id, nome, status, empresa, inicio, fim));
  return { id: document.id, idObra: document.id, nome, empresa, status, numeroContrato: optionalText(data.numeroContrato), ano: typeof data.ano === 'number' ? data.ano : null, inicio, fim, tipoObra: optionalText(data.tipoObra), confirmacaoRecurso: data.confirmacaoRecurso, ordemInicio: data.ordemInicio, subcentroErp: optionalText(data.subcentroErp), rawDocument: document.data, obras };
}

export function contractPlanningRowFor(contrato: ContratoCronograma): ObraCronograma {
  return contractPlanningRow(contrato.id, contrato.nome, contrato.status, contrato.empresa, contrato.inicio, contrato.fim);
}

/** This is the exact condition that creates the synthetic review row. */
export function requiresContractReview(contrato: ContratoCronograma | undefined): boolean { return Boolean(contrato?.obras.some((obra) => obra.targetType === 'contrato')); }
export function adaptObrasV2Cronograma(documents: ObraV2Document[]): CronogramaLoadResult { const diagnostics: string[] = []; const contratos = documents.flatMap((item) => [adaptObraV2Contract(item, diagnostics)].filter((value): value is ContratoCronograma => Boolean(value))).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); return { contratos, obras: contratos.flatMap((contrato) => contrato.obras), diagnostics }; }
