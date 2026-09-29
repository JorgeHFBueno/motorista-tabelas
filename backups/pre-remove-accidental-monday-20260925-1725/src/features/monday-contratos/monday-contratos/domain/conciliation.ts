export const MONDAY_BOARD_ID = '8515762377';
export const WRITES_ENABLED = typeof import.meta.env !== 'undefined' && import.meta.env.VITE_ENABLE_FIRESTORE_WRITES === 'true';
export type ConciliationState = 'PENDENTE' | 'VINCULADO_A_OBRA' | 'IGNORADO';
export type MondayItem = { id: string; name: string; updatedAt?: string | null; columnValues: Array<{ id: string; text?: string | null; display_value?: string | null; value?: string | null }>; subitems?: Array<{ id: string; name: string }> };
export type Contract = { nome: string; status: string | null; numeroContrato: string | null; ano: number | null; empresa: string | null; inicio: string | null; integracoes: { monday: { boardId: string; itemId: string; updatedAt: string | null; sincronizadoEm?: unknown } } };
export type SubitemDecision = { estado: ConciliationState; obraId: string | null };
export type Conciliation = { obraDiretaId: string | null; subitems: Record<string, SubitemDecision> };
export type RawStage = { raw: MondayItem; sincronizacao: { boardId: string; itemId: string; capturadoEm?: unknown; mondayUpdatedAt: string | null }; conciliacao: Conciliation };
export type ObraV2 = { id: string; contratoId?: unknown; integracoes?: { monday?: { itemPaiId?: unknown; subitemId?: unknown } }; codObra: number; dataFinal: string; dataInicial: string; local: string; nomeObra: string; siglaObra: string; status: string; [key: string]: unknown };
const column = (item: MondayItem, id: string) => item.columnValues.find((value) => value.id === id);
const nullableText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const isoDate = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
export function contractId(item: MondayItem) { return String(item.id); }
export function contractFromMonday(item: MondayItem): Contract {
  const anoText = nullableText(column(item, 'text_mkntryg9')?.text);
  const ano = anoText && /^\d{4}$/.test(anoText) ? Number(anoText) : null;
  return { nome: item.name, status: nullableText(column(item, 'f_rmula_mknbt1hr')?.display_value), numeroContrato: nullableText(column(item, 'texto_mknarg02')?.text), ano, empresa: nullableText(column(item, 'empresa_mknb1cwy')?.text), inicio: isoDate(nullableText(column(item, 'data_mknaqn4f')?.text)), integracoes: { monday: { boardId: MONDAY_BOARD_ID, itemId: contractId(item), updatedAt: item.updatedAt ?? null } } };
}
export function emptyConciliation(item: MondayItem): Conciliation { return { obraDiretaId: null, subitems: Object.fromEntries((item.subitems ?? []).map((subitem) => [String(subitem.id), { estado: 'PENDENTE', obraId: null }])) }; }
export function mergeRawStage(previous: RawStage | null, item: MondayItem): RawStage { return { raw: item, sincronizacao: { boardId: MONDAY_BOARD_ID, itemId: contractId(item), mondayUpdatedAt: item.updatedAt ?? null }, conciliacao: previous?.conciliacao ?? emptyConciliation(item) }; }
export function validateConciliation(conciliation: Conciliation, item: MondayItem): string[] {
  const errors: string[] = []; const known = new Set((item.subitems ?? []).map((subitem) => String(subitem.id)));
  for (const [id, decision] of Object.entries(conciliation.subitems)) { if (!known.has(id)) errors.push(`SUBITEM_DESCONHECIDO:${id}`); if (decision.estado === 'VINCULADO_A_OBRA' && !decision.obraId) errors.push(`OBRA_OBRIGATORIA:${id}`); if (decision.estado !== 'VINCULADO_A_OBRA' && decision.obraId !== null) errors.push(`OBRA_NAO_PERMITIDA:${id}`); }
  return errors;
}
export function obraPatch(obra: ObraV2, contrato: string, subitemId: string | null): Record<string, unknown> | { conflict: string } {
  const monday = obra.integracoes?.monday ?? {}; const sameContract = obra.contratoId === undefined || obra.contratoId === contrato;
  const sameParent = monday.itemPaiId === undefined || monday.itemPaiId === contrato;
  const sameSubitem = monday.subitemId === undefined || monday.subitemId === subitemId;
  if (!sameContract) return { conflict: 'CONFLITO_CONTRATO_EXISTENTE' };
  if (!sameParent || !sameSubitem) return { conflict: 'CONFLITO_MONDAY_EXISTENTE' };
  return { contratoId: contrato, 'integracoes.monday.itemPaiId': contrato, 'integracoes.monday.subitemId': subitemId };
}
export function prepareContractPreview(item: MondayItem, currentContract: Record<string, unknown> | null, obras: ObraV2[], stage: RawStage): { errors: string[]; contractOperation: 'CREATE' | 'PATCH'; contract: Contract; obraPatches: Array<{ obraId: string; patch: Record<string, unknown> }>; pending: number } {
  const errors = validateConciliation(stage.conciliacao, item); const id = contractId(item); const links = [{ obraId: stage.conciliacao.obraDiretaId, subitemId: null }, ...Object.entries(stage.conciliacao.subitems).filter(([, value]) => value.estado === 'VINCULADO_A_OBRA').map(([subitemId, value]) => ({ obraId: value.obraId, subitemId }))];
  const obraPatches: Array<{ obraId: string; patch: Record<string, unknown> }> = [];
  links.forEach((link) => { if (!link.obraId) return; const obra = obras.find((candidate) => candidate.id === link.obraId); if (!obra) { errors.push(`OBRA_NAO_ENCONTRADA:${link.obraId}`); return; } const patch = obraPatch(obra, id, link.subitemId); if ('conflict' in patch) errors.push(`${patch.conflict}:${link.obraId}`); else obraPatches.push({ obraId: link.obraId, patch }); });
  return { errors, contractOperation: currentContract ? 'PATCH' : 'CREATE', contract: contractFromMonday(item), obraPatches, pending: Object.values(stage.conciliacao.subitems).filter((value) => value.estado === 'PENDENTE').length };
}
