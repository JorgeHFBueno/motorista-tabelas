import type { Registro } from '../types';
export type CombustivelSchema = 'entrada-v2' | 'saida-v2' | 'fora-do-contrato';
export type ItemFrotaTipo = 'veiculo' | 'maquina' | null;
export interface NormalizedCombustivel extends Registro {
  schema: CombustivelSchema; isFuelOutput: boolean; schemaVersion?: number; tipo?: string;
  /** True for any document outside the V2 contract: it is shown flagged, never interpreted. */
  foraDoContrato?: boolean;
  quantidadeAbastecida?: number; valorAbastecimento?: number; montanteAntes?: number; montanteAposMovimento?: number; estoqueAntes?: number; estoqueAposMovimento?: number;
  modalidadeAbastecimento?: 'direto' | 'galao'; itemFrotaUid?: string; itemFrotaTipo?: ItemFrotaTipo; identificadorSnapshot?: string; horimetro?: number; extra?: string | null;
  frentista?: string; paraQuem?: string; autorLancamento?: string; obraUid?: string; litrosComprados?: number; preco?: number; precoLitro?: number; lote?: string; responsavel?: string;
}
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function num(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function map(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
/** The V2 contract writes exactly "Sem Odometro". */
export function isSemOdometro(value: unknown): boolean { return value === 'Sem Odometro'; }
/** Reads only the V2 contract (02_PROCESSOS/combustivel-saida-v2.md and combustivel-entrada-v2.md). */
export function normalizarMovimentoCombustivel(raw: Record<string, unknown>, id = ''): NormalizedCombustivel {
  if (raw.schemaVersion === 2 && raw.tipo === 'entrada') {
    return { ...raw, id, schema: 'entrada-v2', isFuelOutput: false, schemaVersion: 2, tipo: 'entrada', litrosComprados: num(raw.litrosComprados), preco: num(raw.preco), precoLitro: num(raw.precoLitro), lote: text(raw.lote), responsavel: text(map(raw.criadoPor).nome) } as NormalizedCombustivel;
  }
  if (raw.schemaVersion === 2 && raw.tipo === 'saida') {
    const snapshot = map(raw.item_frota_snapshot); const obraSnap = map(raw.id_obra_snap);
    const itemTipo: ItemFrotaTipo = snapshot.categoria === 'PLACA' ? 'veiculo' : snapshot.categoria === 'EXTRA' ? 'maquina' : null;
    const identificador = text(snapshot.identificador);
    const frentista = text(map(raw.frentista).nome); const paraQuem = text(map(raw.motoristaOperador).nome);
    return {
      ...raw, id, schema: 'saida-v2', isFuelOutput: true, schemaVersion: 2, tipo: 'saida',
      quantidadeAbastecida: num(raw.quantidadeAbastecida), valorAbastecimento: num(raw.valorAbastecimento), montanteAntes: num(raw.montanteAntes), montanteAposMovimento: num(raw.montanteAposMovimento), estoqueAntes: num(raw.estoqueAntes), estoqueAposMovimento: num(raw.estoqueAposMovimento),
      modalidadeAbastecimento: raw.modalidadeAbastecimento === 'galao' ? 'galao' : 'direto',
      itemFrotaUid: text(raw.item_frota_id), itemFrotaTipo: itemTipo, identificadorSnapshot: identificador,
      km: itemTipo === 'veiculo' ? num(raw.quilometragem) ?? null : null, horimetro: itemTipo === 'maquina' ? num(raw.horimetro) : undefined,
      extra: itemTipo === 'maquina' ? identificador : null, placa: itemTipo === 'veiculo' ? identificador : null,
      frentista, paraQuem, autorLancamento: text(map(raw.criadoPor).nome),
      obraUid: text(raw.id_obra), obra: text(obraSnap.nomeObra), local: text(obraSnap.local),
      motorista: frentista, para_quem: paraQuem, qa: num(raw.quantidadeAbastecida), li: num(raw.montanteAntes), lf: num(raw.montanteAposMovimento), arla: num(raw.arla), origemPreco: raw.origemPreco,
    } as NormalizedCombustivel;
  }
  // Outside the contract: kept visible and flagged, with no field interpreted, so it stands out for correction.
  return { id, data: raw.data, schema: 'fora-do-contrato', foraDoContrato: true, isFuelOutput: true, motivo: 'Fora do contrato V2' } as unknown as NormalizedCombustivel;
}
export function litrosFromX10(value: unknown): number | null { const n = num(value); return n === undefined ? null : n / 10; }
export function reaisFromCentavos(value: unknown): number | null { const n = num(value); return n === undefined ? null : n / 100; }
export function horasFromX10(value: unknown): number | null { return litrosFromX10(value); }
