// tests/alocacoes-local.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// src/features/cronograma-obras/data/alocacoesLocal.ts
var ALOCACOES_STORAGE_KEY = "cronoobra.alocacoes.v1";
var valid = (value) => Boolean(value && typeof value === "object" && typeof value.id === "string" && typeof value.obraId === "string" && typeof value.mestreId === "string" && typeof value.inicio === "string" && typeof value.tempoPlanejado === "number");
function loadAlocacoes(storage = localStorage) {
  const raw = storage.getItem(ALOCACOES_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.alocacoes) ? parsed.alocacoes.filter(valid) : [];
  } catch {
    console.warn("CronoObra: aloca\xE7\xF5es locais inv\xE1lidas foram ignoradas.");
    return [];
  }
}
function saveAlocacoes(alocacoes, storage = localStorage) {
  storage.setItem(ALOCACOES_STORAGE_KEY, JSON.stringify({ version: 1, alocacoes }));
}
function hydrateAlocacoes(obras, mestres, alocacoes) {
  const masters2 = new Map(mestres.map((mestre) => [mestre.id, mestre]));
  return obras.map((obra2) => ({ ...obra2, mestresPlanejados: [...obra2.mestresPlanejados, ...alocacoes.filter((item) => item.obraId === obra2.id && masters2.has(item.mestreId) && !obra2.mestresPlanejados.some((current) => current.localId === item.id)).map((item) => {
    const mestre = masters2.get(item.mestreId);
    return { localId: item.id, mestreId: item.mestreId, nome: mestre.nome, inicio: item.inicio, tempoPlanejado: item.tempoPlanejado };
  })] }));
}
function alocacoesDasObras(obras) {
  return obras.flatMap((obra2) => obra2.mestresPlanejados.flatMap((mestre) => mestre.mestreId ? [{ id: mestre.localId, obraId: obra2.id, mestreId: mestre.mestreId, inicio: mestre.inicio, tempoPlanejado: mestre.tempoPlanejado }] : []));
}
function mergeAlocacoes(existing, obras, mestres) {
  const obraIds = new Set(obras.map((obra2) => obra2.id));
  const mestreIds = new Set(mestres.map((mestre) => mestre.id));
  return [...existing.filter((item) => !obraIds.has(item.obraId) || !mestreIds.has(item.mestreId)), ...alocacoesDasObras(obras)];
}

// tests/alocacoes-local.test.ts
var MemoryStorage = class {
  values = /* @__PURE__ */ new Map();
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, value);
  }
};
var masters = [{ id: "m-joao", nome: "Jo\xE3o" }, { id: "m-pedro", nome: "Pedro" }];
var obra = (id = "lote-a") => ({ id, sourceRow: 0, codObra: id, siglaObra: "LOTE", nomeObra: id, local: id, status: "Em execu\xE7\xE3o", empresa: "LEDUR", mestreInicial: null, descricao: null, inicioPlanejado: "2026-09-01", tempoPlanejado: 1, mestresPlanejados: [] });
var allocation = { id: "periodo-1", obraId: "lote-a", mestreId: "m-joao", inicio: "2026-09-28", tempoPlanejado: 7 };
test("aloca\xE7\xE3o persiste e hidrata pelo ID do LOTE e do mestre", () => {
  const storage = new MemoryStorage();
  saveAlocacoes([allocation], storage);
  const reloaded = loadAlocacoes(storage);
  assert.deepEqual(reloaded, [allocation]);
  const hydrated = hydrateAlocacoes([obra(), obra("lote-b")], masters, reloaded);
  assert.equal(hydrated[0].mestresPlanejados[0].nome, "Jo\xE3o");
  assert.equal(hydrated[0].mestresPlanejados[0].mestreId, "m-joao");
  assert.equal(hydrated[1].mestresPlanejados.length, 0);
});
test("extens\xE3o, altera\xE7\xE3o de in\xEDcio, m\xFAltiplos mestres e per\xEDodos persistem sem duplicar", () => {
  const storage = new MemoryStorage();
  const periods = [{ ...allocation, inicio: "2026-10-01", tempoPlanejado: 11 }, { id: "periodo-2", obraId: "lote-a", mestreId: "m-joao", inicio: "2026-10-21", tempoPlanejado: 7 }, { id: "periodo-3", obraId: "lote-a", mestreId: "m-pedro", inicio: "2026-10-01", tempoPlanejado: 7 }];
  saveAlocacoes(periods, storage);
  const hydrated = hydrateAlocacoes([obra()], masters, loadAlocacoes(storage));
  assert.equal(hydrated[0].mestresPlanejados.length, 3);
  assert.deepEqual(alocacoesDasObras(hydrated), periods);
  assert.equal(hydrateAlocacoes(hydrated, masters, periods)[0].mestresPlanejados.length, 3);
});
test("merge preserva \xF3rf\xE3os e remo\xE7\xF5es de per\xEDodos conhecidos", () => {
  const orphan = { id: "orphan", obraId: "lote-removido", mestreId: "m-ausente", inicio: "2026-01-01", tempoPlanejado: 1 };
  const current = [{ ...obra(), mestresPlanejados: [{ localId: "periodo-4", mestreId: "m-pedro", nome: "Pedro", inicio: "2026-11-01", tempoPlanejado: 2 }] }];
  assert.deepEqual(mergeAlocacoes([allocation, orphan], current, masters), [orphan, { id: "periodo-4", obraId: "lote-a", mestreId: "m-pedro", inicio: "2026-11-01", tempoPlanejado: 2 }]);
});
test("JSON inv\xE1lido n\xE3o derruba nem sobrescreve o armazenamento", () => {
  const storage = new MemoryStorage();
  storage.setItem(ALOCACOES_STORAGE_KEY, "{inv\xE1lido");
  assert.deepEqual(loadAlocacoes(storage), []);
  assert.equal(storage.getItem(ALOCACOES_STORAGE_KEY), "{inv\xE1lido");
});
