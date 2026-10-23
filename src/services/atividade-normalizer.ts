/** Activity as the WEB shows it: read only from the V2 contract (01_FIRESTORE/COLECOES/atividades.md). */
export type AtividadeV2 = {
  id: string;
  data?: unknown;
  tipo?: 'saida' | 'chegada';
  /** True for any document outside the V2 contract: shown flagged, never interpreted. */
  foraDoContrato?: boolean;
  motorista?: string;
  motoristaUid?: string | null;
  autor?: string;
  placa?: string;
  veiculoNome?: string;
  /** veiculos-v2 ID (`item_frota_id`); named `veiculoId` for the fleet analytics. */
  veiculoId?: string | null;
  destino?: string;
  obra?: string;
  /** obras-v2 ID (`id_obra`); named `obraId` for the fleet analytics. */
  obraId?: string | null;
  motivo?: string;
  km?: number | null;
};

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const map = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function normalizarAtividade(raw: Record<string, unknown>, id: string): AtividadeV2 {
  if (raw.schemaVersion !== 2 || (raw.tipo !== 'saida' && raw.tipo !== 'chegada')) {
    return { id, data: raw.data, foraDoContrato: true, motivo: 'Fora do contrato V2' };
  }
  const motorista = map(raw.motorista);
  const item = map(raw.item_frota_snapshot);
  const obra = map(raw.id_obra_snap);
  return {
    id, data: raw.data, tipo: raw.tipo,
    motorista: text(motorista.nome), motoristaUid: text(motorista.uid) || null, autor: text(map(raw.criadoPor).nome),
    placa: text(item.identificador), veiculoNome: text(item.nome), veiculoId: text(raw.item_frota_id) || null,
    destino: text(raw.destino), obra: text(obra.nomeObra), obraId: text(raw.id_obra) || null,
    motivo: text(raw.motivo), km: typeof raw.km === 'number' && Number.isFinite(raw.km) ? raw.km : null,
  };
}
