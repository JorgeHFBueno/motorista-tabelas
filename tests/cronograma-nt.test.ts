import assert from "node:assert/strict";
import test from "node:test";
import {
  desmarcarNaoTrabalhado,
  juntarPeriodos,
  lerNaoTrabalhados,
  marcarNaoTrabalhado,
  normalizarNaoTrabalhados,
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

test("Juntar turns two periods into one, the gap becomes NT", () => {
  // X..19 and 23..Y → X..Y with 20, 21, 22 as NT.
  assert.deepEqual(juntarPeriodos({ inicio: "2026-10-23", tempoPlanejado: 5 }, { inicio: "2026-10-01", tempoPlanejado: 19 }),
    { inicio: "2026-10-01", tempoPlanejado: 27, naoTrabalhados: [{ inicio: "2026-10-20", dias: 3 }] });
  // Existing NT is kept; a day worked in either period stays worked; overlapping periods leave no gap.
  assert.deepEqual(juntarPeriodos({ inicio: "2026-10-01", tempoPlanejado: 10, naoTrabalhados: [{ inicio: "2026-10-03", dias: 1 }] }, { inicio: "2026-10-08", tempoPlanejado: 5, naoTrabalhados: [{ inicio: "2026-10-09", dias: 1 }] }),
    { inicio: "2026-10-01", tempoPlanejado: 12, naoTrabalhados: [{ inicio: "2026-10-03", dias: 1 }] });
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
