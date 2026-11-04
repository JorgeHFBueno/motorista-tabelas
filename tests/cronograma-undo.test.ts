import assert from "node:assert/strict";
import test from "node:test";
import {
  dropUndoFor,
  isEditableTarget,
  planUndo,
  pushUndo,
  type AlocacaoUndoSnapshot,
  type UndoEntry,
} from "../src/features/cronograma-obras/domain/undoStack";

const alocacao: AlocacaoUndoSnapshot = {
  id: "a1",
  obraId: "lote-1",
  contratoId: "c1",
  mestreId: "m-dilamar",
  inicio: "2026-10-05",
  tempoPlanejado: 14,
};
const created: UndoEntry = { kind: "create", mestreNome: "DILAMAR", alocacao };
const deleted: UndoEntry = { kind: "delete", mestreNome: "DILAMAR", alocacao };
const resized: UndoEntry = {
  kind: "update",
  mestreNome: "DILAMAR",
  id: "a1",
  mestreId: "m-dilamar",
  before: { inicio: "2026-10-01", tempoPlanejado: 10 },
  after: { inicio: "2026-10-05", tempoPlanejado: 14 },
};

test("pushUndo keeps only the most recent actions", () => {
  let stack: UndoEntry[] = [];
  for (let index = 0; index < 5; index += 1)
    stack = pushUndo(stack, { ...created, alocacao: { ...alocacao, id: `a${index}` } }, 3);
  assert.deepEqual(stack.map((entry) => (entry.kind === "update" ? entry.id : entry.alocacao.id)), ["a2", "a3", "a4"]);
});

test("dropUndoFor removes the action of a failed write", () => {
  const stack = [created, { ...resized, id: "a2" }];
  assert.deepEqual(dropUndoFor(stack, "a1"), [{ ...resized, id: "a2" }]);
});

test("undoing a drop deletes the allocation while it is unchanged", () => {
  assert.deepEqual(planUndo(created, alocacao), { ok: true, operation: { type: "delete", id: "a1" } });
});

test("undoing a drop fails when someone else moved or removed it", () => {
  const moved = planUndo(created, { ...alocacao, inicio: "2026-10-12" });
  assert.equal(moved.ok, false);
  assert.match(moved.ok ? "" : moved.message, /DILAMAR foi alterada por outra pessoa/);
  assert.equal(planUndo(created, null).ok, false);
  assert.equal(planUndo(created, { ...alocacao, mestreId: "m-tiago" }).ok, false);
});

test("undoing a resize restores the previous period while it is unchanged", () => {
  assert.deepEqual(planUndo(resized, alocacao), {
    ok: true,
    operation: { type: "update", id: "a1", patch: { inicio: "2026-10-01", tempoPlanejado: 10 } },
  });
  assert.equal(planUndo(resized, { ...alocacao, tempoPlanejado: 20 }).ok, false);
  assert.equal(planUndo(resized, null).ok, false);
});

test("undoing Del recreates the same allocation unless it already exists", () => {
  assert.deepEqual(planUndo(deleted, null), { ok: true, operation: { type: "recreate", alocacao } });
  assert.equal(planUndo(deleted, alocacao).ok, false);
});

test("shortcuts are ignored while typing in a field", () => {
  assert.equal(isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget), true);
  assert.equal(isEditableTarget({ tagName: "textarea" } as unknown as EventTarget), true);
  assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget), true);
  assert.equal(isEditableTarget({ tagName: "I" } as unknown as EventTarget), false);
  assert.equal(isEditableTarget(null), false);
});
