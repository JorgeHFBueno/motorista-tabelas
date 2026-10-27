import type { ContratoCronograma } from '../../domain/models';

export type ContratosChange = { type: 'added' | 'modified' | 'removed'; id: string; contrato: ContratoCronograma | null; diagnostics: string[] };

/** Applies parent-document changes without rebuilding unrelated contracts. */
export function applyContratosChanges(parents: ReadonlyMap<string, ContratoCronograma>, changes: readonly ContratosChange[]) {
  const next = new Map(parents);
  changes.forEach((change) => {
    if (change.type === 'removed' || !change.contrato) next.delete(change.id);
    else next.set(change.id, change.contrato);
  });
  return next;
}
