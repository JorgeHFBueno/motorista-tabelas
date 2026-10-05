import type { ContratoCronograma, ObraCronograma } from '../../domain/models';
import { inclusiveCivilDays, isValidCivilDate } from '../../domain/temporal';

/** LOTEs are identities only: their planning period always belongs to the contract. */
type RawSubitem = { id?: unknown; nome?: unknown; status?: unknown };
type RawContrato = { nome?: unknown; empresa?: unknown; status?: unknown; numeroContrato?: unknown; ano?: unknown; inicio?: unknown; fim?: unknown; tipoObra?: unknown; confirmacaoRecurso?: unknown; ordemInicio?: unknown; subitems?: unknown };
export type RawDocument = { id: string; exists: boolean; data?: unknown };
export type CronogramaLoadResult = { contratos: ContratoCronograma[]; obras: ObraCronograma[]; diagnostics: string[] };
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const optionalText = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const validDate = (value: unknown): string | null => typeof value === 'string' && isValidCivilDate(value) ? value : null;
export const hasObraV2Id = (value: unknown) => value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '');

function contractPlanningRow(document: RawDocument, nome: string, raw: RawContrato, inicio: string | null, fim: string | null): ObraCronograma {
  const dias = inclusiveCivilDays(inicio, fim);
  return { id: `contrato:${document.id}`, targetType: 'contrato', contratoId: document.id, contratoNome: nome, sourceRow: 0, codObra: document.id, siglaObra: 'CONTRATO', nomeObra: 'Analisar Contrato', local: 'Analisar Contrato', status: text(raw.status, 'Sem status'), empresa: text(raw.empresa, 'Não informado'), mestreInicial: null, descricao: null, inicioPlanejado: dias === null ? null : inicio, tempoPlanejado: dias, allocationAllowed: dias !== null, mestresPlanejados: [] };
}

export function adaptRawContract(document: RawDocument, diagnostics: string[]): ContratoCronograma | null {
  const data = document.data && typeof document.data === 'object' ? document.data as { raw?: unknown; obraV2Id?: unknown } : null;
  if (!document.exists || !data || !hasObraV2Id(data.obraV2Id)) return null;
  const raw = data.raw as RawContrato | undefined;
  if (!raw || typeof raw !== 'object') { diagnostics.push(`Contrato ${document.id} não possui o objeto raw.`); return null; }
  const inicio = validDate(raw.inicio); const fim = validDate(raw.fim);
  if (inicio && fim && inclusiveCivilDays(inicio, fim) === null) diagnostics.push(`Contrato ${document.id}: fim anterior ao início.`);
  const subitems = Array.isArray(raw.subitems) ? raw.subitems as RawSubitem[] : [];
  if (!Array.isArray(raw.subitems) && raw.subitems !== undefined && raw.subitems !== null) diagnostics.push(`Contrato ${document.id}: raw.subitems não é uma lista; tratado como vazio.`);
  const nome = text(raw.nome, document.id);
  const obras: ObraCronograma[] = subitems.flatMap((subitem) => {
    const id = text(subitem?.id); const nomeLote = text(subitem?.nome);
    if (!id || !nomeLote) { diagnostics.push(`Contrato ${document.id} contém subitem sem id ou nome; ignorado.`); return []; }
    const dias = inclusiveCivilDays(inicio, fim);
    return [{ id, targetType: 'obra', contratoId: document.id, contratoNome: nome, sourceRow: 0, codObra: id, siglaObra: 'LOTE', nomeObra: nomeLote, local: nomeLote, status: text(subitem.status, 'Sem status'), empresa: text(raw.empresa, 'Não informado'), mestreInicial: null, descricao: null, inicioPlanejado: dias === null ? null : inicio, tempoPlanejado: dias, allocationAllowed: dias !== null, mestresPlanejados: [] } satisfies ObraCronograma];
  });
  // Only entries produced from raw.subitems are real Monday subitems.
  obras.forEach((obra) => { obra.mondaySubitemId = obra.id; });
  if (!obras.length) obras.push(contractPlanningRow(document, nome, raw, inicio, fim));
  return { id: document.id, nome, empresa: text(raw.empresa, 'Não informado'), status: text(raw.status, 'Sem status'), numeroContrato: optionalText(raw.numeroContrato), ano: typeof raw.ano === 'number' ? raw.ano : null, inicio, fim, tipoObra: optionalText(raw.tipoObra), confirmacaoRecurso: raw.confirmacaoRecurso, ordemInicio: raw.ordemInicio, obraV2Id: typeof data.obraV2Id === 'string' ? data.obraV2Id : null, rawDocument: document.data, obras };
}

export function contractPlanningRowFor(contrato: ContratoCronograma): ObraCronograma {
  const dias = inclusiveCivilDays(contrato.inicio, contrato.fim);
  return { id: `contrato:${contrato.id}`, targetType: 'contrato', contratoId: contrato.id, contratoNome: contrato.nome, sourceRow: 0, codObra: contrato.id, siglaObra: 'CONTRATO', nomeObra: 'Analisar Contrato', local: 'Analisar Contrato', status: contrato.status, empresa: contrato.empresa, mestreInicial: null, descricao: null, inicioPlanejado: dias === null ? null : contrato.inicio, tempoPlanejado: dias, allocationAllowed: dias !== null, mestresPlanejados: [] };
}

/** This is the exact condition that creates the synthetic review row. */
export function requiresContractReview(contrato: ContratoCronograma | undefined): boolean { return Boolean(contrato?.obras.some((obra) => obra.targetType === 'contrato')); }
export function adaptRawCronograma(documents: RawDocument[]): CronogramaLoadResult { const diagnostics: string[] = []; const contratos = documents.flatMap((item) => [adaptRawContract(item, diagnostics)].filter((value): value is ContratoCronograma => Boolean(value))).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); return { contratos, obras: contratos.flatMap((contrato) => contrato.obras), diagnostics }; }
