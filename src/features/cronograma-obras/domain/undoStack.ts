/**
 * Ctrl+Z do calendário: guarda, só em memória, as ações do próprio usuário
 * nesta aba. Recarregar a página zera a pilha.
 */

import type { NaoTrabalhado } from "./naoTrabalhados";

export type AlocacaoUndoSnapshot = {
  id: string;
  obraId?: string;
  contratoId: string;
  mestreId: string;
  inicio: string;
  tempoPlanejado: number;
  naoTrabalhados?: NaoTrabalhado[];
};

/** `naoTrabalhados` ausente = nenhum dia NT. */
type Periodo = { inicio: string; tempoPlanejado: number; naoTrabalhados?: NaoTrabalhado[] };

type SingleUndoEntry =
  /** O usuário soltou um mestre: desfazer apaga a alocação criada. */
  | { kind: "create"; mestreNome: string; alocacao: AlocacaoUndoSnapshot }
  /** O usuário mudou dias, deslocou ou marcou NT: desfazer volta o período anterior. */
  | {
      kind: "update";
      mestreNome: string;
      id: string;
      mestreId: string;
      before: Periodo;
      after: Periodo;
    }
  /** O usuário apagou com Del: desfazer recria a alocação com o mesmo ID. */
  | { kind: "delete"; mestreNome: string; alocacao: AlocacaoUndoSnapshot };

export type UndoEntry =
  | SingleUndoEntry
  /** Várias alocações numa ação só (ex.: "Juntar" dois períodos): desfaz todas ou nenhuma. */
  | { kind: "group"; mestreNome: string; entries: SingleUndoEntry[] };

export type UndoOperation =
  | { type: "delete"; id: string }
  | { type: "update"; id: string; patch: Periodo }
  | { type: "recreate"; alocacao: AlocacaoUndoSnapshot };

export const UNDO_LIMIT = 20;

export function pushUndo(
  stack: readonly UndoEntry[],
  entry: UndoEntry,
  limit = UNDO_LIMIT,
): UndoEntry[] {
  return [...stack, entry].slice(-limit);
}

/** Tira da pilha a ação de uma alocação cuja gravação falhou. */
export function dropUndoFor(
  stack: readonly UndoEntry[],
  id: string,
): UndoEntry[] {
  return stack.filter((entry) => !undoIds(entry).includes(id));
}

const singleId = (entry: SingleUndoEntry) =>
  entry.kind === "update" ? entry.id : entry.alocacao.id;

/** IDs das alocações que uma ação tocou. */
export const undoIds = (entry: UndoEntry): string[] =>
  entry.kind === "group" ? entry.entries.map(singleId) : [singleId(entry)];

const samePeriod = (
  current: { mestreId: string } & Periodo,
  expected: { mestreId: string } & Periodo,
) =>
  current.mestreId === expected.mestreId &&
  current.inicio === expected.inicio &&
  current.tempoPlanejado === expected.tempoPlanejado &&
  JSON.stringify(current.naoTrabalhados ?? null) ===
    JSON.stringify(expected.naoTrabalhados ?? null);

/**
 * Decide como desfazer `entry` olhando o estado atual da alocação no
 * Firestore (`null` quando ela não existe). Se outra pessoa mexeu nela
 * depois da ação, não sobrescreve: devolve o erro a mostrar.
 */
export function planUndo(
  entry: SingleUndoEntry,
  current: AlocacaoUndoSnapshot | null,
): { ok: true; operation: UndoOperation } | { ok: false; message: string } {
  const changed = {
    ok: false as const,
    message: `Não foi possível desfazer: a alocação de ${entry.mestreNome} foi alterada por outra pessoa.`,
  };
  if (entry.kind === "delete") {
    return current
      ? changed
      : { ok: true, operation: { type: "recreate", alocacao: entry.alocacao } };
  }
  if (entry.kind === "create") {
    return current && samePeriod(current, entry.alocacao)
      ? { ok: true, operation: { type: "delete", id: entry.alocacao.id } }
      : changed;
  }
  return current &&
    samePeriod(current, { mestreId: entry.mestreId, ...entry.after })
    ? {
        ok: true,
        operation: {
          type: "update",
          id: entry.id,
          // Explicit key: undefined NT removes the field.
          patch: { inicio: entry.before.inicio, tempoPlanejado: entry.before.tempoPlanejado, naoTrabalhados: entry.before.naoTrabalhados },
        },
      }
    : changed;
}

/** Como `planUndo`, para qualquer ação: um grupo só é desfeito se todas as alocações estiverem como ficaram. */
export function planUndoAll(
  entry: UndoEntry,
  currentOf: (id: string) => AlocacaoUndoSnapshot | null,
): { ok: true; operations: UndoOperation[] } | { ok: false; message: string } {
  const entries = entry.kind === "group" ? entry.entries : [entry];
  const operations: UndoOperation[] = [];
  for (const item of entries) {
    const plan = planUndo(item, currentOf(singleId(item)));
    if (!plan.ok) return plan;
    operations.push(plan.operation);
  }
  return { ok: true, operations };
}

/** Atalhos não valem enquanto o usuário digita num campo. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
  } | null;
  if (!element?.tagName) return false;
  return (
    element.isContentEditable === true ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName.toUpperCase())
  );
}
