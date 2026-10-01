export type AlocacaoRecord = {
  id: string;
  obraId?: string;
  contratoId: string;
  mestreId: string;
  inicio: string;
  tempoPlanejado: number;
  criadoPorFuncionarioId: string;
};

export type AlocacaoChange = { type: 'added' | 'modified' | 'removed'; id: string; data?: unknown };

function valid(data: unknown, id: string): AlocacaoRecord | null {
  const value = data as Partial<AlocacaoRecord>;
  if (!value || (value.obraId !== undefined && typeof value.obraId !== 'string') || typeof value.contratoId !== 'string' || typeof value.mestreId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.inicio ?? '') || !Number.isInteger(value.tempoPlanejado) || value.tempoPlanejado < 1 || typeof value.criadoPorFuncionarioId !== 'string' || !value.criadoPorFuncionarioId) return null;
  return { id, ...(typeof value.obraId === 'string' ? { obraId: value.obraId } : {}), contratoId: value.contratoId, mestreId: value.mestreId, inicio: value.inicio, tempoPlanejado: value.tempoPlanejado, criadoPorFuncionarioId: value.criadoPorFuncionarioId };
}

/** Applies Firestore changes without replacing records whose planning fields did not change. */
export function reconcileAlocacoes<T extends AlocacaoRecord>(current: readonly T[], changes: readonly AlocacaoChange[]): T[] {
  const next = new Map(current.map((item) => [item.id, item]));
  changes.forEach((change) => {
    if (change.type === 'removed') { next.delete(change.id); return; }
    const incoming = valid(change.data, change.id) as T | null;
    if (!incoming) { next.delete(change.id); return; }
    const previous = next.get(change.id);
    const sameOperationalFields = previous && previous.obraId === incoming.obraId && previous.contratoId === incoming.contratoId && previous.mestreId === incoming.mestreId && previous.inicio === incoming.inicio && previous.tempoPlanejado === incoming.tempoPlanejado && previous.criadoPorFuncionarioId === incoming.criadoPorFuncionarioId;
    next.set(change.id, sameOperationalFields ? previous : incoming);
  });
  return [...next.values()];
}
