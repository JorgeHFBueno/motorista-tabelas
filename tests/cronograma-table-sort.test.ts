import assert from "node:assert/strict";
import test from "node:test";
import { nextTableSort, sortObras } from "../src/features/cronograma-obras/domain/tableSort";
import { RESIZABLE_COLUMNS } from "../src/features/cronograma-obras/domain/obraGridColumns";
import { readFileSync } from "node:fs";

test("table sort cycles asc, desc and original", () => {
  const asc = nextTableSort({ column: null, direction: null }, "obra");
  const desc = nextTableSort(asc, "obra");
  assert.deepEqual(nextTableSort(desc, "obra"), { column: null, direction: null });
});

test("all active data schemas expose resize handles while control slots remain excluded", () => {
  assert.deepEqual(RESIZABLE_COLUMNS.startedFlat, ["nomeContrato", "obra", "empresa", "status", "mestres", "inicio", "dias"]);
  assert.deepEqual(RESIZABLE_COLUMNS.startedContracts, ["nomeContrato", "empresa", "status", "mestres", "inicio", "dias"]);
  assert.deepEqual(RESIZABLE_COLUMNS.notStartedFlat, ["nomeContrato", "obra", "empresa", "status", "ordemInicio", "confirmacaoRecurso", "inicio", "dias"]);
  assert.deepEqual(RESIZABLE_COLUMNS.notStartedContracts, ["nomeContrato", "empresa", "status", "ordemInicio", "confirmacaoRecurso", "inicio", "dias"]);
  assert.ok(!(RESIZABLE_COLUMNS.finished as readonly string[]).includes("toggle"));
});

test("master label remains inside its strip and is aligned to the end with ellipsis", () => {
  const css = readFileSync("src/features/cronograma-obras/styles/cronograma-obras.css", "utf8");
  assert.match(css, /\.co-master-strip > span[\s\S]*justify-content: flex-end/);
  assert.match(css, /\.co-master-strip > span[\s\S]*text-overflow: ellipsis/);
});

test("panel toggle uses accessible chevron icons without mojibake", () => {
  const grid = readFileSync("src/features/cronograma-obras/components/GanttGrid.tsx", "utf8");
  assert.doesNotMatch(grid, /Ã¢â‚¬Âº|Ã¢â‚¬Â¹|â€º|â€¹/);
  assert.match(grid, /className="co-columns-toggle"/);
  assert.match(grid, /aria-label=\{detailsVisible \? "Ocultar colunas complementares" : "Mostrar colunas complementares"\}/);
  assert.match(grid, /detailsVisible \? <ChevronRightRounded fontSize="inherit"\/> : <ChevronLeftRounded fontSize="inherit"\/>/);
  assert.match(grid, /onClick=\{\(\) => setDetailsVisible\(\(visible\) => !visible\)\}/);
});

test("sort compares dates and numbers and keeps missing values last", () => {
  const obras: any[] = [
    { id: "a", nomeObra: "Zeta", status: "Parada", empresa: "", inicioPlanejado: "2026-06-25", tempoPlanejado: 12, mestresPlanejados: [] },
    { id: "b", nomeObra: "Alfa", status: "Em andamento", empresa: "", inicioPlanejado: "2026-01-02", tempoPlanejado: 3, mestresPlanejados: [] },
    { id: "c", nomeObra: "Sem", status: "", empresa: "", inicioPlanejado: null, tempoPlanejado: null, mestresPlanejados: [] },
  ];
  const contracts = new Map();
  assert.deepEqual(sortObras(obras, contracts, { column: "inicio", direction: "asc" }).map((item) => item.id), ["b", "a", "c"]);
  assert.deepEqual(sortObras(obras, contracts, { column: "dias", direction: "desc" }).map((item) => item.id), ["a", "b", "c"]);
});
