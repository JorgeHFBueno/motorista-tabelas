import assert from "node:assert/strict";
import test from "node:test";
import {
  desmarcarNaoTrabalhado,
  dividirNoNT,
  lerNaoTrabalhados,
  marcarNaoTrabalhado,
  normalizarNaoTrabalhados,
  planoMarcarNT,
  planoRedimensionarNT,
  redimensionarNaoTrabalhado,
  rotuloDias,
  segmentosNT,
} from "../src/features/cronograma-obras/domain/naoTrabalhados";
import { buildWorkloads } from "../src/features/cronograma-obras/domain/cronograma";
import type { ObraCronograma } from "../src/features/cronograma-obras/domain/models";

// A 25-day period starting 01/10.
const periodo = { inicio: "2026-10-01", tempoPlanejado: 25 };

test("reads only well-formed NT entries", () => {
  assert.equal(lerNaoTrabalhados(undefined), undefined);
  assert.equal(lerNaoTrabalhados([{ inicio: "20/10", dias: 3 }, { inicio: "2026-10-20", dias: 0 }]), undefined);
  assert.deepEqual(lerNaoTrabalhados([{ inicio: "2026-10-20", dias: 3, extra: 1 }, "x"]), [{ inicio: "2026-10-20", dias: 3 }]);
});

test("NT stays inside the period, merged and in order; at the edges it is allowed", () => {
  assert.deepEqual(normalizarNaoTrabalhados({ ...periodo, naoTrabalhados: [{ inicio: "2026-10-21", dias: 2 }, { inicio: "2026-10-20", dias: 1 }, { inicio: "2026-09-29", dias: 3 }] }),
    [{ inicio: "2026-10-01", dias: 1 }, { inicio: "2026-10-20", dias: 3 }]);
  assert.deepEqual(normalizarNaoTrabalhados({ ...periodo, naoTrabalhados: [{ inicio: "2026-10-24", dias: 9 }] }), [{ inicio: "2026-10-24", dias: 2 }]);
  assert.equal(normalizarNaoTrabalhados({ ...periodo, naoTrabalhados: [{ inicio: "2026-11-30", dias: 2 }] }), undefined);
});

test("label shows total days and NT days", () => {
  assert.equal(rotuloDias(periodo), "25 dias");
  assert.equal(rotuloDias({ inicio: "2026-10-01", tempoPlanejado: 1 }), "1 dia");
  assert.equal(rotuloDias({ ...periodo, naoTrabalhados: [{ inicio: "2026-10-20", dias: 3 }] }), "25 dias (3 NT)");
});

test("mark and unmark NT", () => {
  const marcado = marcarNaoTrabalhado({ ...periodo, naoTrabalhados: [{ inicio: "2026-10-20", dias: 1 }] }, "2026-10-21", 2);
  assert.deepEqual(marcado, [{ inicio: "2026-10-20", dias: 3 }]);
  assert.equal(desmarcarNaoTrabalhado({ ...periodo, naoTrabalhados: marcado }, { inicio: "2026-10-20", dias: 3 }), undefined);
});

test("NT in the middle splits the period: NT at the end of the first, the second starts the next day", () => {
  // 12..30 with NT 19..22 → 12..22 (NT 19..22) and 23..30; another NT later goes to the second.
  const p = { inicio: "2026-11-12", tempoPlanejado: 19, naoTrabalhados: [{ inicio: "2026-11-19", dias: 4 }, { inicio: "2026-11-27", dias: 1 }] };
  assert.deepEqual(dividirNoNT(p, { inicio: "2026-11-19", dias: 4 }), {
    primeiro: { inicio: "2026-11-12", tempoPlanejado: 11, naoTrabalhados: [{ inicio: "2026-11-19", dias: 4 }] },
    segundo: { inicio: "2026-11-23", tempoPlanejado: 8, naoTrabalhados: [{ inicio: "2026-11-27", dias: 1 }] },
  });
  // NT on an edge does not split.
  assert.equal(dividirNoNT(p, { inicio: "2026-11-12", dias: 2 }), null);
  assert.equal(dividirNoNT(p, { inicio: "2026-11-29", dias: 2 }), null);
});

test("dropping NT on a day: splits in the middle, not on the edges", () => {
  const p = { inicio: "2026-11-12", tempoPlanejado: 19 };
  assert.deepEqual(planoMarcarNT(p, "2026-11-19"), {
    periodo: { inicio: "2026-11-12", tempoPlanejado: 8, naoTrabalhados: [{ inicio: "2026-11-19", dias: 1 }] },
    novo: { inicio: "2026-11-20", tempoPlanejado: 11 },
  });
  assert.deepEqual(planoMarcarNT(p, "2026-11-30"), { periodo: { inicio: "2026-11-12", tempoPlanejado: 19, naoTrabalhados: [{ inicio: "2026-11-30", dias: 1 }] } });
  // Next to an NT already at the end of the period: they merge and stay at the end.
  const comFim = { ...p, naoTrabalhados: [{ inicio: "2026-11-29", dias: 2 }] };
  assert.deepEqual(planoMarcarNT(comFim, "2026-11-28"), { periodo: { inicio: "2026-11-12", tempoPlanejado: 19, naoTrabalhados: [{ inicio: "2026-11-28", dias: 3 }] } });
});

test("stretching the NT at the end of a period moves the boundary with the next period", () => {
  const a = { inicio: "2026-11-12", tempoPlanejado: 11, naoTrabalhados: [{ inicio: "2026-11-19", dias: 4 }] }; // 12..22
  const b = { inicio: "2026-11-23", tempoPlanejado: 8 }; // 23..30
  const nt = { inicio: "2026-11-19", dias: 4 };
  // Stretch to the 24th: the first goes to 24, the second starts on the 25th.
  assert.deepEqual(planoRedimensionarNT(a, nt, "end", "2026-11-24", b), {
    periodo: { inicio: "2026-11-12", tempoPlanejado: 13, naoTrabalhados: [{ inicio: "2026-11-19", dias: 6 }] },
    sucessor: { inicio: "2026-11-25", tempoPlanejado: 6 },
  });
  // Shrink to the 20th: days 21 and 22 go to the second.
  assert.deepEqual(planoRedimensionarNT(a, nt, "end", "2026-11-20", b), {
    periodo: { inicio: "2026-11-12", tempoPlanejado: 9, naoTrabalhados: [{ inicio: "2026-11-19", dias: 2 }] },
    sucessor: { inicio: "2026-11-21", tempoPlanejado: 10 },
  });
  // The second keeps at least one day.
  assert.equal(planoRedimensionarNT(a, nt, "end", "2026-12-15", b).sucessor?.tempoPlanejado, 1);
  // The start edge is free inside the first period; the NT stays at its end, no split.
  assert.deepEqual(planoRedimensionarNT(a, nt, "start", "2026-11-21", b), {
    periodo: { inicio: "2026-11-12", tempoPlanejado: 11, naoTrabalhados: [{ inicio: "2026-11-21", dias: 2 }] },
  });
  // Without a next period, shrinking the end leaves the NT in the middle: the period splits.
  assert.deepEqual(planoRedimensionarNT(a, nt, "end", "2026-11-20"), {
    periodo: { inicio: "2026-11-12", tempoPlanejado: 9, naoTrabalhados: [{ inicio: "2026-11-19", dias: 2 }] },
    novo: { inicio: "2026-11-21", tempoPlanejado: 2 },
  });
});

test("NT pieces inside a calendar window", () => {
  const comNT = { ...periodo, naoTrabalhados: [{ inicio: "2026-10-20", dias: 3 }] };
  assert.deepEqual(segmentosNT(comNT, "2026-10-19", 7), [{ offset: 1, days: 3 }]);
  assert.deepEqual(segmentosNT(comNT, "2026-10-22", 7), [{ offset: 0, days: 1 }]);
});

test("an NT day does not occupy the mestre: no conflict with another LOTE", () => {
  const lote = (id: string, inicio: string, tempoPlanejado: number, naoTrabalhados?: { inicio: string; dias: number }[]) =>
    ({ id, status: "Em andamento", mestresPlanejados: [{ localId: id, nome: "AMILTON", inicio, tempoPlanejado, ...(naoTrabalhados ? { naoTrabalhados } : {}) }] }) as unknown as ObraCronograma;
  // AMILTON in LOTE A from 01/10 to 25/10 with 20–22 NT, and in LOTE B from 20/10 to 22/10.
  const [semNT] = buildWorkloads([lote("a", "2026-10-01", 25), lote("b", "2026-10-20", 3)]);
  assert.equal(semNT.conflictDays, 3);
  const [comNT] = buildWorkloads([lote("a", "2026-10-01", 25, [{ inicio: "2026-10-20", dias: 3 }]), lote("b", "2026-10-20", 3)]);
  assert.equal(comNT.conflictDays, 0);
  assert.equal(comNT.diasProgramados, 25);
});

test("an NT stretch is stretched or shrunk by its edges, inside the period", () => {
  const comNT = { ...periodo, naoTrabalhados: [{ inicio: "2026-10-20", dias: 3 }] };
  assert.deepEqual(redimensionarNaoTrabalhado(comNT, { inicio: "2026-10-20", dias: 3 }, "end", "2026-10-24"), [{ inicio: "2026-10-20", dias: 5 }]);
  assert.deepEqual(redimensionarNaoTrabalhado(comNT, { inicio: "2026-10-20", dias: 3 }, "start", "2026-10-21"), [{ inicio: "2026-10-21", dias: 2 }]);
  // Past the other edge it stops at one day; outside the period it stops at the period.
  assert.deepEqual(redimensionarNaoTrabalhado(comNT, { inicio: "2026-10-20", dias: 3 }, "start", "2026-10-30"), [{ inicio: "2026-10-22", dias: 1 }]);
  assert.deepEqual(redimensionarNaoTrabalhado(comNT, { inicio: "2026-10-20", dias: 3 }, "end", "2026-12-01"), [{ inicio: "2026-10-20", dias: 6 }]);
});
