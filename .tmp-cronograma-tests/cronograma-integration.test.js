// tests/cronograma-integration.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// src/features/cronograma-obras/data/source/rawCronogramaAdapter.ts
var CONTRATOS_HABILITADOS = ["12806288209", "12808776050", "12980608147", "12998583588", "12999477696"];
var text = (value, fallback = "") => typeof value === "string" ? value : fallback;
var optionalText = (value) => typeof value === "string" && value.trim() ? value : null;
var validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
function adaptRawContract(document, diagnostics) {
  if (!document.exists) {
    diagnostics.push(`Contrato ${document.id} n\xE3o encontrado.`);
    return null;
  }
  const raw = document.data && typeof document.data === "object" ? document.data.raw : null;
  if (!raw) {
    diagnostics.push(`Contrato ${document.id} n\xE3o possui o objeto raw.`);
    return null;
  }
  const inicio = validDate(raw.inicio);
  if (!inicio) diagnostics.push(`Contrato ${document.id} n\xE3o possui raw.inicio v\xE1lido; LOTEs usam 2026-01-01 como default local de renderiza\xE7\xE3o.`);
  const subitems = Array.isArray(raw.subitems) ? raw.subitems : [];
  if (!Array.isArray(raw.subitems) && raw.subitems !== void 0) diagnostics.push(`Contrato ${document.id}: raw.subitems n\xE3o \xE9 uma lista; tratado como vazio.`);
  const nome = text(raw.nome, document.id);
  const obras = subitems.flatMap((subitem) => {
    const id = text(subitem?.id);
    const nomeLote = text(subitem?.nome);
    if (!id || !nomeLote) {
      diagnostics.push(`Contrato ${document.id} cont\xE9m subitem sem id ou nome; ignorado.`);
      return [];
    }
    return [{ id, contratoId: document.id, contratoNome: nome, sourceRow: 0, codObra: id, siglaObra: "LOTE", nomeObra: nomeLote, local: nomeLote, status: text(raw.status, "SEM STATUS"), empresa: text(raw.empresa, "N\xE3o informado"), mestreInicial: null, descricao: null, inicioPlanejado: inicio ?? "2026-01-01", tempoPlanejado: 1, mestresPlanejados: [] }];
  });
  return { id: document.id, nome, empresa: text(raw.empresa, "N\xE3o informado"), status: text(raw.status, "SEM STATUS"), numeroContrato: optionalText(raw.numeroContrato), ano: typeof raw.ano === "number" ? raw.ano : null, inicio, obras };
}
function adaptRawCronograma(documents) {
  const diagnostics = [];
  const byId = new Map(documents.map((item) => [item.id, item]));
  const contratos = CONTRATOS_HABILITADOS.flatMap((id) => {
    const item = byId.get(id);
    return item ? [adaptRawContract(item, diagnostics)].filter((value) => Boolean(value)) : (diagnostics.push(`Contrato ${id} n\xE3o foi retornado.`), []);
  });
  return { contratos, obras: contratos.flatMap((contrato) => contrato.obras), diagnostics };
}

// src/features/cronograma-obras/data/mestresFirestoreAdapter.ts
var MESTRES_ESPERADOS = [["dine", "DINE", "376f55"], ["dilamar", "DILAMAR", "245f61"], ["jefe", "JEFE", "654084"], ["vanderlei", "VANDERLEI", "743f78"], ["rudimar", "RUDIMAR", "4d548b"], ["everaldo", "EVERALDO", "a0522d"], ["amilton", "AMILTON", "70483a"], ["antonio", "ANT\xD4NIO", "6a5136"], ["tiago", "TIAGO", "2f6f8f"]];
var HEX = /^[0-9a-f]{6}$/i;
function adaptMestresFirestore(documents) {
  const diagnostics = [];
  const used = /* @__PURE__ */ new Set();
  const mestres = [];
  for (const document of documents) {
    const data = document.data;
    if (!data || typeof data.nome !== "string" || !data.nome.trim() || typeof data.cor !== "string" || !HEX.test(data.cor)) {
      diagnostics.push(`Mestre ${document.id} inv\xE1lido em monday-mestres.`);
      continue;
    }
    const canonical = data.cor.toLowerCase();
    if (used.has(canonical)) {
      diagnostics.push(`Mestre ${document.id} ignorado: cor duplicada #${canonical}.`);
      continue;
    }
    used.add(canonical);
    mestres.push({ id: document.id, nome: data.nome, cor: { background: `#${canonical}`, text: "#ffffff" } });
  }
  return { mestres, diagnostics };
}

// tests/cronograma-integration.test.ts
var rawDoc = (id, subitems = []) => ({ id, exists: true, data: { raw: { id, nome: `Contrato ${id}`, empresa: "LEDUR", status: "Em execu\xE7\xE3o", inicio: "2026-08-28", subitems } } });
test("monday-obras usa a allowlist de cinco contratos, na ordem fornecida", () => {
  assert.deepEqual(CONTRATOS_HABILITADOS, ["12806288209", "12808776050", "12980608147", "12998583588", "12999477696"]);
  const result = adaptRawCronograma([...CONTRATOS_HABILITADOS].reverse().map((id) => rawDoc(id, id === "12806288209" ? [{ id: "lote-9", nome: "LOTE 9" }, { id: "lote-2", nome: "LOTE 2" }] : [])));
  assert.deepEqual(result.contratos.map((item) => item.id), [...CONTRATOS_HABILITADOS]);
  assert.deepEqual(result.contratos[0].obras.map((item) => ({ id: item.id, contratoNome: item.contratoNome })), [{ id: "lote-9", contratoNome: "Contrato 12806288209" }, { id: "lote-2", contratoNome: "Contrato 12806288209" }]);
});
test("datasource de obras \xE9 read-only e aponta para monday-obras", () => {
  const code = readFileSync("src/features/cronograma-obras/data/source/rawFirestoreCronogramaDataSource.ts", "utf8");
  assert.match(code, /monday-obras/);
  assert.doesNotMatch(code, /monday-gestao-obras-raw/);
  assert.doesNotMatch(code, /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/);
});
test("monday-mestres adapta nove IDs e cores CSS sem duplica\xE7\xF5es", () => {
  const result = adaptMestresFirestore(MESTRES_ESPERADOS.map(([id, nome, cor]) => ({ id, data: { nome, cor } })));
  assert.deepEqual(result.mestres.map((item) => item.id), MESTRES_ESPERADOS.map(([id]) => id));
  assert.deepEqual(result.mestres.map((item) => item.cor.background), MESTRES_ESPERADOS.map(([, , cor]) => `#${cor}`));
  assert.equal(new Set(result.mestres.map((item) => item.cor.background)).size, 9);
});
test("monday-mestres rejeita cor inv\xE1lida e duplicada", () => {
  const result = adaptMestresFirestore([{ id: "a", data: { nome: "A", cor: "aabbcc" } }, { id: "b", data: { nome: "B", cor: "#aabbcc" } }, { id: "c", data: { nome: "C", cor: "AABBCC" } }]);
  assert.equal(result.mestres.length, 1);
  assert.equal(result.diagnostics.length, 2);
});
test("p\xE1gina espera ambas leituras e n\xE3o cria mestre local", () => {
  const page = readFileSync("src/features/cronograma-obras/CronogramaObrasPage.tsx", "utf8");
  assert.match(page, /Promise\.all\(\[source\.carregar\(\), mestresSource\.carregar\(\)\]\)/);
  assert.match(page, /migrateAlocacoesParaMondayMestres/);
  assert.doesNotMatch(page, /addMestre\(/);
});
