import type { Registro } from '../types';
export type CombustivelSchema = 'entrada-v2' | 'saida-v2' | 'legado';
export type ItemFrotaTipo = 'veiculo' | 'maquina' | null;
export interface NormalizedCombustivel extends Registro {
  schema: CombustivelSchema; isFuelOutput: boolean; schemaVersion?: number; tipo?: string;
  quantidadeAbastecida?: number; valorAbastecimento?: number; montanteAntes?: number; montanteAposMovimento?: number; estoqueAntes?: number; estoqueAposMovimento?: number;
  modalidadeAbastecimento?: 'direto' | 'galao'; itemFrotaUid?: string; itemFrotaTipo?: ItemFrotaTipo; identificadorSnapshot?: string; horimetro?: number;
  frentista?: string; paraQuem?: string; autorLancamento?: string; obraUid?: string; litrosComprados?: number; preco?: number; precoLitro?: number; lote?: string; responsavel?: string;
}
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function num(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function map(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function normalizarMovimentoCombustivel(raw: Record<string, unknown>, id = ''): NormalizedCombustivel {
  if (raw.schemaVersion === 2 && raw.tipo === 'entrada') {
    const responsavel = map(raw.responsavel); const origem = map(raw.origemPreco);
    return { ...raw, id, schema: 'entrada-v2', isFuelOutput: false, schemaVersion: 2, tipo: 'entrada', litrosComprados: num(raw.litrosComprados), preco: num(raw.preco), precoLitro: num(raw.precoLitro ?? origem.precoLitro), lote: text(raw.lote), responsavel: text(responsavel.nome ?? raw.responsavel) } as NormalizedCombustivel;
  }
  if (raw.schemaVersion === 2 && raw.tipo === 'saida') {
    const item = map(raw.itemFrota); const obra = map(raw.obra); const fr = map(raw.frentista); const pk = map(raw.paraQuem); const au = map(raw.autorLancamento); const origin = map(raw.origemPreco); const itemTipo = item.tipo === 'veiculo' || item.tipo === 'maquina' ? item.tipo : null;
    return { ...raw, id, schema: 'saida-v2', isFuelOutput: true, schemaVersion: 2, tipo: 'saida', quantidadeAbastecida: num(raw.quantidadeAbastecida), valorAbastecimento: num(raw.valorAbastecimento), montanteAntes: num(raw.montanteAntes), montanteAposMovimento: num(raw.montanteAposMovimento), estoqueAntes: num(raw.estoqueAntes), estoqueAposMovimento: num(raw.estoqueAposMovimento), modalidadeAbastecimento: raw.modalidadeAbastecimento === 'galao' ? 'galao' : 'direto', itemFrotaUid: text(item.uid), itemFrotaTipo: itemTipo, identificadorSnapshot: text(item.identificadorSnapshot), km: itemTipo === 'veiculo' ? num(item.km) ?? null : null, horimetro: itemTipo === 'maquina' ? num(item.horimetro) : undefined, frentista: text(fr.nomeSnapshot), paraQuem: text(pk.nomeSnapshot), autorLancamento: text(au.nomeSnapshot), obraUid: text(obra.uid), obra: text(obra.nomeSnapshot), local: text(obra.localSnapshot), placa: itemTipo === 'veiculo' ? text(item.identificadorSnapshot) : '', motorista: text(fr.nomeSnapshot), para_quem: text(pk.nomeSnapshot), qa: num(raw.quantidadeAbastecida), li: num(raw.montanteAntes), lf: num(raw.montanteAposMovimento), arla: num(raw.arla), origemPreco: raw.origemPreco } as NormalizedCombustivel;
  }
  return { ...raw, id, schema: 'legado', isFuelOutput: raw.tipo !== 'entrada' } as NormalizedCombustivel;
}
export function litrosFromX10(value: unknown): number | null { const n = num(value); return n === undefined ? null : n / 10; }
export function reaisFromCentavos(value: unknown): number | null { const n = num(value); return n === undefined ? null : n / 100; }
export function horasFromX10(value: unknown): number | null { return litrosFromX10(value); }
