import type { Registro } from '../types';

export type CombustivelSchema = 'entrada-v2' | 'saida-v2' | 'legado';
export type ItemFrotaTipo = 'veiculo' | 'maquina' | null;

export interface NormalizedCombustivel extends Registro {
  schema: CombustivelSchema;
  isFuelOutput: boolean;
  schemaVersion?: number;
  quantidadeAbastecida?: number;
  valorAbastecimento?: number;
  montanteAntes?: number;
  montanteAposMovimento?: number;
  estoqueAntes?: number;
  estoqueAposMovimento?: number;
  modalidadeAbastecimento?: 'direto' | 'galao';
  itemFrotaUid?: string;
  itemFrotaTipo?: ItemFrotaTipo;
  identificadorSnapshot?: string;
  horimetro?: number;
  frentista?: string;
  paraQuem?: string;
  autorLancamento?: string;
  obraUid?: string;
}

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Single boundary between Firestore's historical shapes and Web consumers. */
export function normalizarMovimentoCombustivel(raw: Record<string, unknown>, id = ''): NormalizedCombustivel {
  const version = raw.schemaVersion;
  const isV2 = version === 2 && (raw.tipo === 'entrada' || raw.tipo === 'saida');
  if (isV2 && raw.tipo === 'entrada') {
    return { ...raw, id, schema: 'entrada-v2', isFuelOutput: false, schemaVersion: 2, tipo: 'entrada' } as NormalizedCombustivel;
  }
  if (isV2 && raw.tipo === 'saida') {
    const item = (raw.itemFrota && typeof raw.itemFrota === 'object' ? raw.itemFrota : {}) as Record<string, unknown>;
    const obra = (raw.obra && typeof raw.obra === 'object' ? raw.obra : {}) as Record<string, unknown>;
    const frentista = (raw.frentista && typeof raw.frentista === 'object' ? raw.frentista : {}) as Record<string, unknown>;
    const paraQuem = (raw.paraQuem && typeof raw.paraQuem === 'object' ? raw.paraQuem : {}) as Record<string, unknown>;
    const autor = (raw.autorLancamento && typeof raw.autorLancamento === 'object' ? raw.autorLancamento : {}) as Record<string, unknown>;
    const itemTipo = item.tipo === 'veiculo' || item.tipo === 'maquina' ? item.tipo : null;
    return {
      ...raw, id, schema: 'saida-v2', isFuelOutput: true, schemaVersion: 2, tipo: 'saida',
      qa: finiteNumber(raw.quantidadeAbastecida), li: finiteNumber(raw.montanteAntes), lf: finiteNumber(raw.montanteAposMovimento),
      quantidadeAbastecida: finiteNumber(raw.quantidadeAbastecida), valorAbastecimento: finiteNumber(raw.valorAbastecimento),
      montanteAntes: finiteNumber(raw.montanteAntes), montanteAposMovimento: finiteNumber(raw.montanteAposMovimento),
      estoqueAntes: finiteNumber(raw.estoqueAntes), estoqueAposMovimento: finiteNumber(raw.estoqueAposMovimento),
      modalidadeAbastecimento: raw.modalidadeAbastecimento === 'galao' ? 'galao' : 'direto',
      itemFrotaUid: text(item.uid), itemFrotaTipo: itemTipo, identificadorSnapshot: text(item.identificadorSnapshot),
      km: itemTipo === 'veiculo' ? finiteNumber(item.km) ?? null : null,
      horimetro: itemTipo === 'maquina' ? finiteNumber(item.horimetro) : undefined,
      tipoPlaca: itemTipo === 'veiculo', placa: text(item.identificadorSnapshot),
      frentista: text(frentista.nomeSnapshot), paraQuem: text(paraQuem.nomeSnapshot), autorLancamento: text(autor.nomeSnapshot),
      motorista: text(frentista.nomeSnapshot), para_quem: text(paraQuem.nomeSnapshot),
      obraUid: text(obra.uid), obra: text(obra.nomeSnapshot), local: text(obra.localSnapshot),
      semKm: typeof raw.semKm === 'string' ? raw.semKm : undefined,
    } as NormalizedCombustivel;
  }
  return { ...raw, id, schema: 'legado', isFuelOutput: raw.tipo !== 'entrada' } as NormalizedCombustivel;
}

export function litrosFromX10(value: unknown): number | null { const n = finiteNumber(value); return n === undefined ? null : n / 10; }
export function reaisFromCentavos(value: unknown): number | null { const n = finiteNumber(value); return n === undefined ? null : n / 100; }
export function horasFromX10(value: unknown): number | null { return litrosFromX10(value); }
