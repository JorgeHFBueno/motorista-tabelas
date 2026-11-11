import assert from "node:assert/strict";
import test from "node:test";
import { filterObras } from "../src/features/cronograma-obras/domain/cronograma";
import type { CronogramaFilters, ObraCronograma } from "../src/features/cronograma-obras/domain/models";

const obra = (id: string, status: string, inicioPlanejado: string | null = "2026-10-05") =>
  ({ id, status, codObra: id, siglaObra: "", nomeObra: id, local: "", empresa: "LEDUR", mestreInicial: null, descricao: null, inicioPlanejado, tempoPlanejado: inicioPlanejado ? 10 : null, mestresPlanejados: [] }) as unknown as ObraCronograma;
const sem: CronogramaFilters = { search: "", status: [], empresa: "", mestre: "" };
const obras = [obra("a", "Em andamento"), obra("b", "Parada"), obra("c", "Próxima a Iniciar"), obra("d", "Em andamento", null)];
const ids = (filters: CronogramaFilters) => filterObras(obras, filters).map((item) => item.id);

test("status filter keeps any of the checked statuses; none checked shows all", () => {
  assert.deepEqual(ids(sem), ["a", "b", "c"]);
  assert.deepEqual(ids({ ...sem, status: ["Parada"] }), ["b"]);
  assert.deepEqual(ids({ ...sem, status: ["Em andamento", "Próxima a Iniciar"] }), ["a", "c"]);
});

test("without the Período filter, only works planned in 2026 stay (the former default)", () => {
  assert.deepEqual(filterObras([obra("x", "Parada", "2025-01-01"), obra("y", "Parada", "2026-12-25")], sem).map((item) => item.id), ["y"]);
});
