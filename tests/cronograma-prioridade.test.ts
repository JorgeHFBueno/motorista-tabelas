import assert from "node:assert/strict";
import test from "node:test";
import { adaptObrasV2Cronograma } from "../src/features/cronograma-obras/data/source/obrasV2CronogramaAdapter";
import { buildStartedFlatWorkStages } from "../src/features/cronograma-obras/domain/contractGroups";
import type { ObraCronograma } from "../src/features/cronograma-obras/domain/models";
import { planPrioridadeMove, sortByPrioridade } from "../src/features/cronograma-obras/domain/prioridade";
import { LOTE_START_OPTIONS } from "../src/services/loteStatusService";

const obra = (id: string, prioridade?: number) => ({ id, ...(prioridade === undefined ? {} : { prioridade }) }) as ObraCronograma;
const ids = (obras: readonly ObraCronograma[]) => obras.map((item) => item.id);
const writes = (list: ReturnType<typeof planPrioridadeMove>) => list.map(({ obra: item, prioridade }) => [item.id, prioridade]);

test("Iniciar offers only Em andamento and Próxima a Iniciar", () => {
  assert.deepEqual(LOTE_START_OPTIONS.map((status) => status.label), ["Em andamento", "Próxima a Iniciar"]);
});

test("adapter reads lotes.{id}.prioridade only when it is a number", () => {
  const { obras } = adaptObrasV2Cronograma([{ id: "c1", exists: true, data: { friday: { ok: true }, nomeObra: "C1", lotes: {
    a: { nome: "A", status: "Próxima a Iniciar", ordem: 0, prioridade: 2.5 },
    b: { nome: "B", status: "Próxima a Iniciar", ordem: 1, prioridade: "1" },
  } } }]);
  assert.deepEqual(obras.map((item) => [item.id, item.prioridade]), [["a", 2.5], ["b", undefined]]);
});

test("sortByPrioridade puts prioritized LOTEs first and keeps the others in their order", () => {
  assert.deepEqual(ids(sortByPrioridade([obra("x"), obra("b", 2), obra("y"), obra("a", 1)])), ["a", "b", "x", "y"]);
});

test("Próxima a iniciar follows prioridade inside each work type; started LOTEs keep their order", () => {
  const lote = (id: string, contratoId: string, status: string, prioridade?: number) =>
    ({ ...obra(id, prioridade), targetType: "obra", contratoId, status }) as ObraCronograma;
  const contratos = new Map([["c1", { numeroContrato: "1", tipoObra: "Pública" }], ["c2", { numeroContrato: "2", tipoObra: "Pública" }], ["c3", { numeroContrato: "3", tipoObra: "Privada" }]]) as never;
  const stages = buildStartedFlatWorkStages([
    lote("p1", "c1", "Próxima a Iniciar"), lote("p2", "c2", "Próxima a Iniciar", 1), lote("priv", "c3", "Próxima a Iniciar", 9),
    lote("and", "c2", "Em andamento", 1),
  ], contratos);
  assert.deepEqual(stages.map((stage) => [stage.kind, stage.workTypes.map((group) => [group.kind, ids(group.obras)])]), [
    ["iniciada", [["publica", ["and"]]]],
    ["proxima-a-iniciar", [["publica", ["p2", "p1"]], ["privada", ["priv"]]]],
  ]);
});

test("a move between prioritized neighbors writes only the moved LOTE", () => {
  const list = [obra("a", 1), obra("b", 2), obra("c", 3)];
  assert.deepEqual(writes(planPrioridadeMove(list, "c", 1)), [["c", 1.5]]);
  assert.deepEqual(writes(planPrioridadeMove(list, "c", 0)), [["c", 0]]);
  assert.deepEqual(writes(planPrioridadeMove(list, "a", 2)), [["a", 4]]);
  assert.deepEqual(planPrioridadeMove(list, "b", 1), []);
});

test("a move next to LOTEs without prioridade numbers the whole group", () => {
  assert.deepEqual(writes(planPrioridadeMove([obra("a"), obra("b"), obra("c")], "c", 0)), [["c", 1], ["a", 2], ["b", 3]]);
  assert.deepEqual(writes(planPrioridadeMove([obra("a", 1), obra("b"), obra("c")], "c", 1)), [["c", 2], ["b", 3]]);
  // Equal neighbors cannot hold a value between them.
  assert.deepEqual(writes(planPrioridadeMove([obra("a", 1), obra("b", 1), obra("c", 5)], "c", 1)), [["c", 2], ["b", 3]]);
});
