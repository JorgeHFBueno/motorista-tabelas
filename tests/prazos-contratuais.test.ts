import assert from "node:assert/strict";
import test from "node:test";
import { PRAZOS_FIXTURE } from "./prazos-contratuais.fixture";
import { FRIDAY_QUADRO_OBRAS } from "../src/features/prazos-contratuais/data/prazosSchema";
import {
  adaptarDocumento, calcularLinha, colunasTempo, hojeBrasilia, montarPrazos, posicaoHoje, resumoLotes, situacaoPeloStatus, situacaoPorDias, trechosBarra,
  type ObraPrazo,
} from "../src/features/prazos-contratuais/domain/prazos";
import { getObraTemporalSegments, getTemporalStateForDate } from "../src/features/cronograma-obras/domain/obraTemporal";
import { DEFAULT_CALENDAR_DISPLAY, visibleTemporalState } from "../src/features/cronograma-obras/domain/calendarDisplay";
import type { ObraCronograma } from "../src/features/cronograma-obras/domain/models";

const HOJE = "2026-10-19";
const obras = PRAZOS_FIXTURE.map((doc) => adaptarDocumento(doc.id, doc.data)!);
const todas = { empresas: [], situacoes: [], incluirPrivadas: false };
const obra = (nome: string) => obras.find((o) => o.nome === nome)!;

test("Carlos Gomes 181/2026 matches the specification example", () => {
  const linha = calcularLinha(obra("CARLOS GOMES 181/2026"), HOJE);
  assert.equal(linha.duracao, 92);
  assert.equal(linha.diasRestantes, 22);
  assert.equal(Math.round(linha.pctDecorrido!), 76);
  assert.equal(linha.situacaoPrazo, "critico");
  assert.equal(linha.observacao, "2 lotes em andamento; 1 em Revisar escopo");
});

test("thresholds: <0 vencido, 0-45 crítico, 46-150 atenção, >150 folgado, configurable", () => {
  assert.deepEqual([-1, 0, 45, 46, 150, 151].map((d) => situacaoPorDias(d)), ["vencido", "critico", "critico", "atencao", "atencao", "folgado"]);
  assert.equal(situacaoPorDias(50, { critico: 60, atencao: 200 }), "critico");
});

test("zero-length contract counts as 100% elapsed", () => {
  const base = obra("IBIRUBÁ 139/2026");
  assert.equal(calcularLinha({ ...base, inicio: "2026-11-01", fim: "2026-11-01" }, HOJE).pctDecorrido, 100);
});

test("screen reproduces the 19/10/2026 spreadsheet: counters, order and exclusions", () => {
  const { linhas, contagem, conferir } = montarPrazos(obras, HOJE, todas);
  assert.deepEqual(contagem, { vencido: 6, critico: 5, atencao: 5, folgado: 4, "sem-data": 6 });
  assert.equal(linhas.length, 26);
  assert.equal(linhas[0].obra.nome, "FONTOURA XAVIER 122/2024");
  assert.equal(linhas[0].diasRestantes, -143);
  assert.equal(linhas[19].obra.nome, "MOSTARDAS 137/2025");
  assert.equal(linhas[19].diasRestantes, 347);
  assert.deepEqual(linhas.slice(20).map((l) => l.obra.nome), ["ALEGRIA 147/2026", "BARROS CASSAL 156/2026", "IBIRAPUITÃ 32/2026", "PASSA SETE 032/2026", "SÃO VENDELINO 64/2026", "SEGREDO 175/2026"]);
  assert.deepEqual(linhas.map((l) => l.posicao), Array.from({ length: 26 }, (_, i) => i + 1));
  assert.ok(!linhas.some((l) => /ACIEPP|SOBRADINHO|CONDOMÍNIO/.test(l.obra.nome)));
  assert.deepEqual(conferir.map((c) => c.obra.nome), ["SOBRADINHO 01/2025"]);
});

test("filters by company, deadline status and private works", () => {
  assert.ok(montarPrazos(obras, HOJE, { ...todas, empresas: ["ARTEBASE"] }).linhas.every((l) => l.obra.empresa === "ARTEBASE"));
  assert.ok(montarPrazos(obras, HOJE, { ...todas, situacoes: ["vencido"] }).linhas.every((l) => l.situacaoPrazo === "vencido"));
  assert.equal(montarPrazos(obras, HOJE, { ...todas, incluirPrivadas: true }).linhas.length, 28);
});

test("special cases: Parada prefix, no lots, no dates, Ok without dates", () => {
  assert.equal(calcularLinha(obra("SINIMBU 029/2025"), HOJE).observacao, "Obra PARADA; 3 lotes não iniciados");
  assert.equal(calcularLinha(obra("FONTOURA XAVIER 122/2024"), HOJE).observacao, "Sem lotes cadastrados");
  const semData = calcularLinha(obra("ALEGRIA 147/2026"), HOJE);
  assert.equal(semData.situacaoPrazo, "sem-data");
  assert.equal(semData.observacao, "Confirmar Recurso; 3 lotes em Revisar escopo");
  assert.equal(calcularLinha(obra("PASSA SETE 032/2026"), HOJE).alertas.length, 1);
  assert.equal(calcularLinha(obra("IBIRAPUITÃ 32/2026"), HOJE).alertas.length, 0);
  assert.equal(resumoLotes([{ id: "1", nome: "a", status: "Finalizado" }, { id: "2", nome: "b", status: "Em andamento" }, { id: "3", nome: "c", status: "Em andamento" }]), "1 lote finalizado; 2 em andamento");
});

test("weekly timeline spans 09/09/2024 to 04/10/2027 (161 weeks) and splits elapsed/remaining", () => {
  const { linhas } = montarPrazos(obras, HOJE, todas);
  const colunas = colunasTempo(linhas, "semana", HOJE);
  assert.equal(colunas[0].inicio, "2024-09-09");
  assert.equal(colunas[colunas.length - 1].inicio, "2027-10-04");
  assert.equal(colunas.length, 161);
  const hojeIdx = colunas.findIndex((c) => c.inicio === "2026-10-19");
  assert.equal(Math.floor(posicaoHoje(colunas, HOJE)!), hojeIdx);
  const vencido = trechosBarra(linhas[0], colunas, HOJE);
  assert.equal(vencido.length, 1);
  assert.ok(vencido[0].decorrido);
  const carlos = trechosBarra(linhas.find((l) => l.obra.nome === "CARLOS GOMES 181/2026")!, colunas, HOJE);
  assert.deepEqual(carlos.map((t) => t.decorrido), [true, false]);
  assert.equal(carlos[0].ate, hojeIdx);
  assert.equal(colunas[carlos[1].ate].inicio, "2026-11-09");
});

test("today uses America/Sao_Paulo, not the machine time zone", () => {
  assert.equal(hojeBrasilia(new Date("2026-10-20T02:30:00Z")), "2026-10-19");
  assert.equal(hojeBrasilia(new Date("2026-10-20T03:30:00Z")), "2026-10-20");
});

test("Situação comes from the projected Status formula", () => {
  assert.deepEqual(["Obra Finalizada", "Solicitar termo Definitivo", "Obra Parada", "Solicitar termo de Recebimento", "Obra em Andamento", null].map(situacaoPeloStatus),
    ["Finalizada", "Entregue", "Parada", null, null, null]);
});

test("adapter reads the obras-v2 contract linked to Friday and links to its Friday item", () => {
  const atual = adaptarDocumento("123", { nomeObra: "X", tipoObra: "Pública", dataInicial: "2026-01-01", dataFinal: "bad", lotes: null, friday: { ok: true } }, 77) as ObraPrazo;
  assert.equal(atual.fim, null);
  assert.deepEqual(atual.lotes, []);
  assert.equal(atual.url, `/friday/quadros/${FRIDAY_QUADRO_OBRAS}?item=77`);
  assert.equal(adaptarDocumento("123", { nomeObra: "X", friday: { ok: true } })?.url, `/friday/quadros/${FRIDAY_QUADRO_OBRAS}`);
  assert.equal(montarPrazos([atual], HOJE, todas).linhas.length, 1);
  assert.equal(montarPrazos([{ ...atual, tipoObra: null }], HOJE, todas).linhas.length, 0);
  assert.equal(adaptarDocumento("x", { foo: 1 }), null);
  assert.equal(adaptarDocumento("x", { nomeObra: "Fora do Friday" }), null);
});

test("adapter keeps LOTEs in Friday order and leaves out archived or trashed ones", () => {
  const obra = adaptarDocumento("c", { nomeObra: "C", friday: { ok: true }, lotes: {
    b: { nome: "Segundo", status: "Em andamento", ordem: 1 }, a: { nome: "Primeiro", status: "Finalizado", ordem: 0 },
    x: { nome: "Arquivado", status: "Parada", ordem: 2, situacao: "arquivado" }, y: { nome: "Lixeira", status: "Parada", ordem: 3, situacao: "excluido" },
  } })!;
  assert.deepEqual(obra.lotes.map((l) => [l.id, l.nome, l.status]), [["a", "Primeiro", "Finalizado"], ["b", "Segundo", "Em andamento"]]);
});

// ---------- Linha de Base do Cronograma: mesmas regras ----------
const lote = (inicio: string, tempoPlanejado: number, status = "Em andamento") => ({ inicioPlanejado: inicio, tempoPlanejado, status, mestresPlanejados: [] }) as unknown as ObraCronograma;

test("Linha de Base starts off and hides the layer while off", () => {
  assert.equal(DEFAULT_CALENDAR_DISPLAY.liveAlerts, false);
  assert.equal(visibleTemporalState("vencido", false), null);
  assert.equal(visibleTemporalState("critico-decorrido", true), "critico-decorrido");
});

test("Linha de Base colours the contract period by its deadline situation, strong until today", () => {
  // Carlos Gomes: 10/08/2026 a 10/11/2026, 22 dias restantes em 19/10/2026 -> Crítico.
  assert.deepEqual(getObraTemporalSegments(lote("2026-08-10", 93), HOJE), [
    { type: "critico-decorrido", inicio: "2026-08-10", fim: HOJE },
    { type: "critico-a-decorrer", inicio: "2026-10-20", fim: "2026-11-10" },
  ]);
  assert.equal(getTemporalStateForDate(lote("2026-10-01", 120), "2026-10-01", HOJE), "atencao-decorrido");
  assert.equal(getTemporalStateForDate(lote("2026-10-01", 366), "2027-01-01", HOJE), "folgado-a-decorrer");
  assert.equal(getTemporalStateForDate(lote("2026-08-10", 93), "2026-08-09", HOJE), null);
  assert.equal(getTemporalStateForDate(lote("2026-08-10", 93), "2026-11-11", HOJE), null);
});

test("Linha de Base paints an overdue contract entirely red, with no extension past the end", () => {
  assert.deepEqual(getObraTemporalSegments(lote("2026-10-01", 10), HOJE), [{ type: "vencido", inicio: "2026-10-01", fim: "2026-10-10" }]);
});

test("Linha de Base gives finished LOTEs the contract colour", () => {
  assert.deepEqual(getObraTemporalSegments(lote("2026-10-01", 10, "Finalizado"), HOJE), getObraTemporalSegments(lote("2026-10-01", 10), HOJE));
});
