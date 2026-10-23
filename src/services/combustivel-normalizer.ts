import type { Registro } from '../types';
export type CombustivelSchema = 'entrada-v2' | 'saida-v2' | 'legado';
export type ItemFrotaTipo = 'veiculo' | 'maquina' | null;
export interface NormalizedCombustivel extends Registro {
  schema: CombustivelSchema; isFuelOutput: boolean; schemaVersion?: number; tipo?: string;
  quantidadeAbastecida?: number; valorAbastecimento?: number; montanteAntes?: number; montanteAposMovimento?: number; estoqueAntes?: number; estoqueAposMovimento?: number;
  modalidadeAbastecimento?: 'direto' | 'galao'; itemFrotaUid?: string; itemFrotaTipo?: ItemFrotaTipo; identificadorSnapshot?: string; horimetro?: number; extra?: string | null;
  frentista?: string; paraQuem?: string; autorLancamento?: string; obraUid?: string; litrosComprados?: number; preco?: number; precoLitro?: number; lote?: string; responsavel?: string;
}
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function num(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function map(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
/** Legacy records write "Sem Odômetro"; the V2 contract writes "Sem Odometro". */
export function isSemOdometro(value: unknown): boolean { return value === 'Sem Odômetro' || value === 'Sem Odometro'; }
/** Person name from a contract map `{uid, nome}`, falling back to the pre-contract `{uid, nomeSnapshot}`. */
function personName(value: unknown): string { const person = map(value); return text(person.nome) || text(person.nomeSnapshot); }
export function normalizarMovimentoCombustivel(raw: Record<string, unknown>, id = ''): NormalizedCombustivel {
  if (raw.schemaVersion === 2 && raw.tipo === 'entrada') {
    const origem = map(raw.origemPreco);
    const responsavel = personName(raw.criadoPor) || personName(raw.responsavel) || text(raw.responsavel);
    return { ...raw, id, schema: 'entrada-v2', isFuelOutput: false, schemaVersion: 2, tipo: 'entrada', litrosComprados: num(raw.litrosComprados), preco: num(raw.preco), precoLitro: num(raw.precoLitro ?? origem.precoLitro), lote: text(raw.lote), responsavel } as NormalizedCombustivel;
  }
  if (raw.schemaVersion === 2 && raw.tipo === 'saida') {
    // Contract fields first (item_frota_*, id_obra*, motoristaOperador, criadoPor); pre-contract WEB names as fallback.
    const snapshot = map(raw.item_frota_snapshot); const item = map(raw.itemFrota);
    const obraSnap = map(raw.id_obra_snap); const obra = map(raw.obra);
    const itemTipo: ItemFrotaTipo = snapshot.categoria === 'PLACA' ? 'veiculo' : snapshot.categoria === 'EXTRA' ? 'maquina' : item.tipo === 'veiculo' || item.tipo === 'maquina' ? item.tipo : null;
    const identificador = text(snapshot.identificador) || text(item.identificadorSnapshot);
    const frentista = personName(raw.frentista); const paraQuem = personName(raw.motoristaOperador) || personName(raw.paraQuem);
    return {
      ...raw, id, schema: 'saida-v2', isFuelOutput: true, schemaVersion: 2, tipo: 'saida',
      quantidadeAbastecida: num(raw.quantidadeAbastecida), valorAbastecimento: num(raw.valorAbastecimento), montanteAntes: num(raw.montanteAntes), montanteAposMovimento: num(raw.montanteAposMovimento), estoqueAntes: num(raw.estoqueAntes), estoqueAposMovimento: num(raw.estoqueAposMovimento),
      modalidadeAbastecimento: raw.modalidadeAbastecimento === 'galao' ? 'galao' : 'direto',
      itemFrotaUid: text(raw.item_frota_id) || text(item.uid), itemFrotaTipo: itemTipo, identificadorSnapshot: identificador,
      km: itemTipo === 'veiculo' ? num(raw.quilometragem) ?? num(item.km) ?? null : null, horimetro: itemTipo === 'maquina' ? num(raw.horimetro) ?? num(item.horimetro) : undefined,
      extra: itemTipo === 'maquina' ? identificador : null, placa: itemTipo === 'veiculo' ? identificador : null,
      frentista, paraQuem, autorLancamento: personName(raw.criadoPor) || personName(raw.autorLancamento),
      obraUid: text(raw.id_obra) || text(obra.uid), obra: text(obraSnap.nomeObra) || text(obra.nomeSnapshot), local: text(obraSnap.local) || text(obra.localSnapshot),
      motorista: frentista, para_quem: paraQuem, qa: num(raw.quantidadeAbastecida), li: num(raw.montanteAntes), lf: num(raw.montanteAposMovimento), arla: num(raw.arla), origemPreco: raw.origemPreco,
    } as NormalizedCombustivel;
  }
  return { ...raw, id, schema: 'legado', isFuelOutput: raw.tipo !== 'entrada', placa: text(raw.placa) || (raw.tipoPlaca === true ? text(raw.identificador) : ''), extra: text(raw.extra) || (raw.tipoPlaca === false ? text(raw.placa) : null), km: num(raw.km) ?? null } as NormalizedCombustivel;
}
export function litrosFromX10(value: unknown): number | null { const n = num(value); return n === undefined ? null : n / 10; }
export function reaisFromCentavos(value: unknown): number | null { const n = num(value); return n === undefined ? null : n / 100; }
export function horasFromX10(value: unknown): number | null { return litrosFromX10(value); }
