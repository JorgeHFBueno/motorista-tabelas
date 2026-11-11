import type { ObraCronograma } from "./models";

/**
 * Ordem de "Próxima a iniciar" (obras-v2 `lotes.{id}.prioridade`): menor primeiro;
 * LOTE sem prioridade fica depois, na ordem que já tinha.
 */
export function sortByPrioridade(obras: readonly ObraCronograma[]): ObraCronograma[] {
  return obras
    .map((obra, index) => ({ obra, index }))
    .sort((left, right) => {
      const a = left.obra.prioridade;
      const b = right.obra.prioridade;
      if (a !== undefined && b !== undefined && a !== b) return a - b;
      if (a !== undefined && b === undefined) return -1;
      if (a === undefined && b !== undefined) return 1;
      return left.index - right.index;
    })
    .map(({ obra }) => obra);
}

export type PrioridadeWrite = { obra: ObraCronograma; prioridade: number };

/**
 * Arrastar `movedId` para a posição `targetIndex` (na lista já sem ele).
 * Quando os vizinhos têm prioridade, grava só o LOTE movido (no meio deles);
 * senão, numera o grupo inteiro 1, 2, 3… e grava só os que mudaram.
 */
export function planPrioridadeMove(
  obras: readonly ObraCronograma[],
  movedId: string,
  targetIndex: number,
): PrioridadeWrite[] {
  const moved = obras.find((obra) => obra.id === movedId);
  if (!moved) return [];
  const rest = obras.filter((obra) => obra.id !== movedId);
  const index = Math.max(0, Math.min(targetIndex, rest.length));
  if (obras.indexOf(moved) === index) return [];
  const next = [...rest.slice(0, index), moved, ...rest.slice(index)];
  const before = next[index - 1]?.prioridade;
  const after = next[index + 1]?.prioridade;
  const hasBefore = index > 0;
  const hasAfter = index < next.length - 1;
  if ((!hasBefore || before !== undefined) && (!hasAfter || after !== undefined)) {
    if (hasBefore && hasAfter && before! < after!) return [{ obra: moved, prioridade: (before! + after!) / 2 }];
    if (hasBefore && !hasAfter) return [{ obra: moved, prioridade: before! + 1 }];
    if (!hasBefore && hasAfter) return [{ obra: moved, prioridade: after! - 1 }];
  }
  return next
    .map((obra, position) => ({ obra, prioridade: position + 1 }))
    .filter(({ obra, prioridade }) => obra.prioridade !== prioridade);
}
