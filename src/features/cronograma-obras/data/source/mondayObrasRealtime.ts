import type { ContratoCronograma } from '../../domain/models';

export type MondayObrasChange = { type: 'added' | 'modified' | 'removed'; id: string; contrato: ContratoCronograma | null; diagnostics: string[] };

/** Applies parent-document changes without rebuilding unrelated contracts. */
export function applyMondayObrasChanges(parents: ReadonlyMap<string, ContratoCronograma>, changes: readonly MondayObrasChange[]) {
  const next = new Map(parents);
  changes.forEach((change) => {
    if (change.type === 'removed' || !change.contrato) next.delete(change.id);
    else next.set(change.id, change.contrato);
  });
  return next;
}
