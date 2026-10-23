/** Reads only the checklists-v2 contract (01_FIRESTORE/COLECOES/checklists-v2.md), including the converted legacy ones. */
export type ChecklistStatus = 'ok' | 'avaria' | 'nao_se_aplica';
export type ChecklistFoto = { path: string; miniatura: string | null };
export type ChecklistItem = { itemId: string; parte: string; titulo: string; status: ChecklistStatus; observacao: string | null; fotos: ChecklistFoto[] };
export type Checklist = {
  id: string;
  tipo: 'saida' | 'chegada';
  catalogo: string;
  veiculoId: string | null;
  placa: string;
  veiculoNome: string;
  medidor: { tipo: string; valor: number | null } | null;
  guincho: boolean;
  motorista: string;
  mecanico: string;
  assinatura: string;
  concluidoEm: Date | null;
  totais: { ok: number; avaria: number; naoSeAplica: number };
  itens: ChecklistItem[];
  /** Converted from the old atividades subcollections. */
  migradoDoLegado: boolean;
  atividadeOrigemId: string | null;
};

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const map = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const toDate = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === 'function' ? t.toDate() : null;
};
const STATUS: ChecklistStatus[] = ['ok', 'avaria', 'nao_se_aplica'];

export function normalizarChecklist(raw: Record<string, unknown>, id: string): Checklist {
  const item = map(raw.item_frota_snapshot);
  const medidor = map(raw.medidor);
  const assinatura = map(raw.assinatura);
  const totais = map(raw.totais);
  const itens = Array.isArray(raw.itens) ? raw.itens.map(map) : [];
  return {
    id,
    tipo: raw.tipo === 'chegada' ? 'chegada' : 'saida',
    catalogo: text(raw.catalogo),
    veiculoId: text(raw.item_frota_id) || null,
    placa: text(item.identificador),
    veiculoNome: text(item.nome),
    medidor: raw.medidor ? { tipo: text(medidor.tipo), valor: typeof medidor.valor === 'number' ? medidor.valor : null } : null,
    guincho: raw.guincho === true,
    motorista: text(map(raw.motoristaOperador).nome),
    mecanico: text(map(raw.criadoPor).nome),
    assinatura: assinatura.status === 'assinada' ? 'Assinada' : assinatura.status === 'ausente' ? `Ausente${text(assinatura.motivo) ? ` — ${text(assinatura.motivo)}` : ''}` : '—',
    concluidoEm: toDate(raw.concluidoEm),
    totais: { ok: num(totais.ok), avaria: num(totais.avaria), naoSeAplica: num(totais.naoSeAplica) },
    itens: itens.map((i) => ({
      itemId: text(i.itemId), parte: text(i.parte), titulo: text(i.titulo) || text(i.itemId),
      status: STATUS.includes(i.status as ChecklistStatus) ? (i.status as ChecklistStatus) : 'nao_se_aplica',
      observacao: text(i.observacao) || null,
      fotos: (Array.isArray(i.fotos) ? i.fotos.map(map) : []).filter((f) => text(f.path)).map((f) => ({ path: text(f.path), miniatura: text(f.miniatura) || null })),
    })),
    migradoDoLegado: raw.migradoDoLegado === true,
    atividadeOrigemId: text(raw.atividadeOrigemId) || null,
  };
}
