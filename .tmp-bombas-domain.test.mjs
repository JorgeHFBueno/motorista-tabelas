// tests/bombas-domain.test.ts
import assert from "node:assert/strict";
import test from "node:test";

// src/utils/bombasDomain.ts
var ENTRADA_DIESEL_MOTIVO = "Abastecimento de Diesel";
var BOMBAS_SCHEMA_VERSION = 2;
function parsePtBrNumber(value) {
  const cleaned = value.trim().replace(/[^\d,.-]/g, "");
  if (!cleaned) return Number.NaN;
  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
function litrosParaUnidadeBomba(liters) {
  if (!Number.isFinite(liters)) return Number.NaN;
  return Math.round(liters * 10);
}
function unidadeBombaParaLitros(value) {
  return typeof value === "number" && Number.isFinite(value) ? value / 10 : null;
}
function isStoredVolume(value) {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}
function reaisParaCentavos(valueEmReais) {
  if (!Number.isFinite(valueEmReais)) throw new Error("Valor monet\xE1rio inv\xE1lido.");
  const cents = Math.round(valueEmReais * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("Valor monet\xE1rio excede o limite seguro.");
  return cents;
}
function centavosParaReais(valueEmCentavos) {
  if (!Number.isSafeInteger(valueEmCentavos)) throw new Error("Centavos inv\xE1lidos.");
  return valueEmCentavos / 100;
}
function calcularCustoAbastecimentoCentavos(quantidadeAbastecidaX10, precoCompraCentavos, litrosCompradosX10) {
  if (![quantidadeAbastecidaX10, precoCompraCentavos, litrosCompradosX10].every(Number.isSafeInteger)) {
    throw new Error("Valores do custo devem ser inteiros seguros.");
  }
  if (quantidadeAbastecidaX10 < 0 || precoCompraCentavos < 0 || litrosCompradosX10 <= 0) {
    throw new Error("Valores do custo s\xE3o incoerentes.");
  }
  const product = quantidadeAbastecidaX10 * precoCompraCentavos;
  if (!Number.isSafeInteger(product)) throw new Error("Multiplica\xE7\xE3o do custo excede o limite seguro.");
  return Math.round(product / litrosCompradosX10);
}
function calculateUnitPrice(totalPrice, liters) {
  if (!Number.isFinite(totalPrice) || !Number.isFinite(liters) || totalPrice <= 0 || liters <= 0) {
    return null;
  }
  return totalPrice / liters;
}
function calculateStockAfterEntry(currentStoredTenths, entryStoredTenths) {
  if (!isStoredVolume(currentStoredTenths) || !isStoredVolume(entryStoredTenths) || entryStoredTenths <= 0) {
    return Number.NaN;
  }
  return Math.trunc(currentStoredTenths) + Math.trunc(entryStoredTenths);
}
function applyDieselEntryToPump(current, entryStoredTenths) {
  const newStock = calculateStockAfterEntry(current.estoqueAtual, entryStoredTenths);
  if (!isStoredVolume(current.montanteAtual) || !Number.isFinite(newStock)) {
    return { montanteAtual: Number.NaN, estoqueAtual: Number.NaN };
  }
  return {
    montanteAtual: Math.trunc(current.montanteAtual),
    estoqueAtual: newStock
  };
}
function getPumpIndicators(pump) {
  return {
    montanteLiters: unidadeBombaParaLitros(pump.montanteAtual),
    stockLiters: unidadeBombaParaLitros(pump.estoqueAtual)
  };
}
function suggestBatch(dateValue) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateValue);
  return match ? `LT-${match[1]}-${match[2]}` : "";
}
function formatFlutterFuelDocumentId(date, uid) {
  const two = (value) => String(value).padStart(2, "0");
  return `${two(date.getDate())}_${two(date.getMonth() + 1)}_${two(date.getFullYear() % 100)} - ${two(date.getHours())}${two(date.getMinutes())}-${two(date.getSeconds())} ${uid}`;
}
function buildDieselEntryRecord(input) {
  if (![input.litrosComprados, input.estoqueAntes, input.estoqueAposMovimento, input.montanteSnapshot].every(isStoredVolume)) {
    throw new Error("Volumes da entrada devem ser inteiros na unidade da bomba.");
  }
  const preco = reaisParaCentavos(input.totalPrice);
  const precoLitro = reaisParaCentavos(input.unitPrice);
  if (preco <= 0 || precoLitro <= 0) throw new Error("Valores monet\xE1rios devem ser maiores que zero.");
  return {
    schemaVersion: BOMBAS_SCHEMA_VERSION,
    data: input.date,
    tipo: "entrada",
    bombaId: input.bombaId,
    litrosComprados: input.litrosComprados,
    preco,
    precoLitro,
    lote: input.batch.trim(),
    responsavel: {
      id: input.responsavelId.trim(),
      nome: input.responsavelNome.trim()
    },
    estoqueAntes: input.estoqueAntes,
    estoqueAposMovimento: input.estoqueAposMovimento,
    montanteSnapshot: input.montanteSnapshot
  };
}
function buildDieselLatestEntrySnapshot(input) {
  return {
    schemaVersion: BOMBAS_SCHEMA_VERSION,
    movimentoId: input.movimentoId,
    data: input.data,
    litrosComprados: input.litrosComprados,
    preco: reaisParaCentavos(input.totalPrice),
    precoLitro: reaisParaCentavos(input.unitPrice),
    lote: input.batch.trim(),
    responsavel: { id: input.responsavelId.trim(), nome: input.responsavelNome.trim() }
  };
}
function finiteNumber(primary, legacy) {
  if (typeof primary === "number" && Number.isFinite(primary)) return primary;
  return typeof legacy === "number" && Number.isFinite(legacy) ? legacy : void 0;
}
function normalizeFuelMovement(source) {
  const isEntry = source.tipo === "entrada" || source.motivo === ENTRADA_DIESEL_MOTIVO;
  const isAdjustment = source.motivo?.toLocaleLowerCase("pt-BR").includes("ajuste") === true;
  const snapshotName = source.id_motorista_snap?.trim();
  const legacyName = source.motorista?.trim();
  const isCanonicalEntry = source.tipo === "entrada" && typeof source.litrosComprados === "number" && typeof source.responsavel === "object" && typeof source.estoqueAposMovimento === "number";
  return {
    id: source.id,
    data: source.data,
    schemaVersion: source.schemaVersion,
    tipo: isEntry ? "entrada" : isAdjustment ? "ajuste" : "saida",
    motivo: source.motivo,
    // Both canonical and legacy volume fields are returned in persisted units.
    litrosComprados: isCanonicalEntry ? finiteNumber(source.litrosComprados, void 0) : isEntry ? finiteNumber(source.qa, void 0) : finiteNumber(source.quantidadeAbastecida, source.qa),
    quantidadeMovimentada: isEntry ? isCanonicalEntry ? finiteNumber(source.litrosComprados, void 0) : finiteNumber(source.qa, void 0) : finiteNumber(source.quantidadeAbastecida, source.qa),
    estoqueAntes: finiteNumber(source.estoqueAntes, void 0),
    estoqueAposMovimento: finiteNumber(source.estoqueAposMovimento, source.diesel),
    montanteSnapshot: finiteNumber(source.montanteSnapshot, source.lf),
    // New versioned records are stored as cents; historical records retain reais.
    preco: source.schemaVersion === BOMBAS_SCHEMA_VERSION ? typeof source.preco === "number" && Number.isFinite(source.preco) ? centavosParaReais(source.preco) : void 0 : finiteNumber(source.preco, source.precoTotal),
    precoLitro: source.schemaVersion === BOMBAS_SCHEMA_VERSION ? typeof source.precoLitro === "number" && Number.isFinite(source.precoLitro) ? centavosParaReais(source.precoLitro) : void 0 : finiteNumber(source.precoLitro, source.precoPorLitro),
    lote: source.lote,
    placa: source.placa,
    responsavel: source.responsavel ? { id: source.responsavel.id?.trim() || "", nome: source.responsavel.nome?.trim() || "" } : snapshotName || legacyName || source.id_motorista ? { id: source.id_motorista?.trim() || "", nome: snapshotName || legacyName || "" } : void 0,
    obra: source.obra,
    bombaId: source.bombaId
  };
}
function normalizeBombaLatestEntry(source) {
  const litrosComprados = finiteNumber(source.litrosComprados, source.qa);
  return {
    id: source.id,
    data: source.data,
    schemaVersion: source.schemaVersion,
    tipo: "entrada",
    litrosComprados,
    quantidadeMovimentada: litrosComprados,
    preco: source.schemaVersion === BOMBAS_SCHEMA_VERSION ? typeof source.preco === "number" && Number.isFinite(source.preco) ? centavosParaReais(source.preco) : void 0 : finiteNumber(source.preco, source.precoTotal),
    precoLitro: source.schemaVersion === BOMBAS_SCHEMA_VERSION ? typeof source.precoLitro === "number" && Number.isFinite(source.precoLitro) ? centavosParaReais(source.precoLitro) : void 0 : finiteNumber(source.precoLitro, source.precoPorLitro),
    lote: source.lote,
    responsavel: source.responsavel ? { id: source.responsavel.id?.trim() || "", nome: source.responsavel.nome?.trim() || "" } : void 0,
    bombaId: source.bombaId
  };
}
function filterFuelMovements(movements, filter) {
  if (filter === "todos") return movements;
  return movements.filter((movement) => movement.tipo === filter);
}

// tests/bombas-domain.test.ts
test("converte dinheiro explicitamente entre reais e centavos", () => {
  assert.equal(reaisParaCentavos(29e3), 29e5);
  assert.equal(reaisParaCentavos(5.8), 580);
  assert.equal(reaisParaCentavos(5.86), 586);
  assert.equal(centavosParaReais(29e5), 29e3);
  assert.equal(centavosParaReais(580), 5.8);
});
test("calcula custo absoluto pela compra e n\xE3o pelo snapshot", () => {
  assert.equal(calcularCustoAbastecimentoCentavos(873, 29e5, 5e4), 50634);
  assert.equal(centavosParaReais(50634), 506.34);
  assert.equal(calcularCustoAbastecimentoCentavos(3e4, 29e5, 49500), 1757576);
  assert.throws(() => calcularCustoAbastecimentoCentavos(1, 100, 0));
  assert.throws(() => calcularCustoAbastecimentoCentavos(1.5, 100, 10));
});
test("cria ultimaEntrada v2 com dinheiro em centavos", () => {
  const snapshot = buildDieselLatestEntrySnapshot({
    movimentoId: "movement-1",
    data: /* @__PURE__ */ new Date(),
    litrosComprados: 5e4,
    totalPrice: 29e3,
    unitPrice: 5.8,
    batch: " LT-2026-09 ",
    responsavelId: "adm2@example.com",
    responsavelNome: "Operador"
  });
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.preco, 29e5);
  assert.equal(snapshot.precoLitro, 580);
  assert.equal(snapshot.litrosComprados, 5e4);
});
test("interpreta valores pt-BR sem armazenar formata\xE7\xE3o", () => {
  assert.equal(parsePtBrNumber("R$ 20.000,00"), 2e4);
  assert.equal(parsePtBrNumber("5.000"), 5e3);
  assert.equal(parsePtBrNumber("4,25"), 4.25);
  assert.ok(Number.isNaN(parsePtBrNumber("")));
});
test("converte litros para a unidade em d\xE9cimos usada pelo Flutter", () => {
  assert.equal(litrosParaUnidadeBomba(5e3), 5e4);
  assert.equal(litrosParaUnidadeBomba(1.5), 15);
  assert.equal(litrosParaUnidadeBomba(12.3), 123);
  assert.equal(unidadeBombaParaLitros(34e3), 3400);
  assert.equal(unidadeBombaParaLitros(5e4), 5e3);
  assert.equal(unidadeBombaParaLitros(15), 1.5);
});
test("calcula pre\xE7o por litro e protege divis\xE3o inv\xE1lida", () => {
  assert.equal(calculateUnitPrice(2e4, 5e3), 4);
  assert.equal(calculateUnitPrice(29e3, unidadeBombaParaLitros(5e4)), 5.8);
  assert.equal(calculateUnitPrice(2e4, 0), null);
  assert.equal(calculateUnitPrice(Number.NaN, 5e3), null);
});
test("entrada aumenta estoque armazenado sem perder a precis\xE3o do Flutter", () => {
  assert.equal(calculateStockAfterEntry(34e3, 5e4), 84e3);
  assert.ok(Number.isNaN(calculateStockAfterEntry(34e3, 0)));
});
test("card VI usa montanteAtual e card VII usa estoqueAtual como conceitos distintos", () => {
  assert.deepEqual(
    getPumpIndicators({ montanteAtual: 123500, estoqueAtual: 34e3 }),
    { montanteLiters: 12350, stockLiters: 3400 }
  );
});
test("normaliza snapshot v2 de ultimaEntrada sem exigir estoqueAposMovimento", () => {
  const movement = normalizeBombaLatestEntry({
    id: "snapshot-entry",
    data: /* @__PURE__ */ new Date(),
    schemaVersion: 2,
    tipo: "entrada",
    litrosComprados: 5e4,
    preco: 29e5,
    precoLitro: 580,
    lote: "1006"
  });
  assert.equal(movement.litrosComprados, 5e4);
  assert.equal(movement.quantidadeMovimentada, 5e4);
  assert.equal(unidadeBombaParaLitros(movement.litrosComprados), 5e3);
  assert.equal(movement.preco, 29e3);
  assert.equal(movement.precoLitro, 5.8);
});
test("preserva quantidade de entrada zero e converte quantidade de sa\xEDda", () => {
  const entrada = normalizeBombaLatestEntry({ id: "zero", data: /* @__PURE__ */ new Date(), schemaVersion: 2, tipo: "entrada", litrosComprados: 0, preco: 0, precoLitro: 0, lote: "0" });
  const saida = normalizeFuelMovement({ id: "saida", data: /* @__PURE__ */ new Date(), schemaVersion: 2, tipo: "saida", quantidadeAbastecida: 873 });
  assert.equal(entrada.quantidadeMovimentada, 0);
  assert.equal(unidadeBombaParaLitros(entrada.quantidadeMovimentada), 0);
  assert.equal(saida.quantidadeMovimentada, 873);
  assert.equal(unidadeBombaParaLitros(saida.quantidadeMovimentada), 87.3);
});
test("filtra movimentos normalizados localmente", () => {
  const movements = [
    normalizeFuelMovement({ id: "e", data: /* @__PURE__ */ new Date(), tipo: "entrada", litrosComprados: 5e4, estoqueAposMovimento: 5e4 }),
    normalizeFuelMovement({ id: "s", data: /* @__PURE__ */ new Date(), tipo: "saida", quantidadeAbastecida: 873 })
  ];
  assert.deepEqual(filterFuelMovements(movements, "todos").map((item) => item.id), ["e", "s"]);
  assert.deepEqual(filterFuelMovements(movements, "entrada").map((item) => item.id), ["e"]);
  assert.deepEqual(filterFuelMovements(movements, "saida").map((item) => item.id), ["s"]);
});
test("entrada de 1.000 L aumenta s\xF3 o estoque e preserva o montante", () => {
  const before = { montanteAtual: 123500, estoqueAtual: 34e3 };
  const after = applyDieselEntryToPump(before, litrosParaUnidadeBomba(1e3));
  assert.deepEqual(after, { montanteAtual: 123500, estoqueAtual: 44e3 });
  assert.equal(after.montanteAtual, before.montanteAtual);
  assert.deepEqual(getPumpIndicators(after), {
    montanteLiters: 12350,
    stockLiters: 4400
  });
});
test("gera lote sugerido e ID no padr\xE3o exato do Flutter", () => {
  assert.equal(suggestBatch("2026-08-15"), "LT-2026-08");
  const date = new Date(2026, 7, 15, 9, 7, 4);
  assert.equal(formatFlutterFuelDocumentId(date, "uid-123"), "15_08_26 - 0907-04 uid-123");
});
test("mapeia o novo schema e conserva somente a compatibilidade necess\xE1ria ao hist\xF3rico Flutter", () => {
  const date = new Date(2026, 7, 15, 9, 7, 4);
  const record = buildDieselEntryRecord({
    date,
    bombaId: "diesel_patio",
    responsavelId: "jorge@example.com",
    responsavelNome: "JORGE H. F. BUENO",
    estoqueAntes: 34e3,
    estoqueAposMovimento: 84e3,
    montanteSnapshot: 12345,
    litrosComprados: 5e4,
    totalPrice: 2e4,
    unitPrice: 4,
    batch: " LT-2026-08 "
  });
  assert.deepEqual(record, {
    schemaVersion: 2,
    data: date,
    tipo: "entrada",
    bombaId: "diesel_patio",
    litrosComprados: 5e4,
    preco: 2e6,
    precoLitro: 400,
    lote: "LT-2026-08",
    responsavel: { id: "jorge@example.com", nome: "JORGE H. F. BUENO" },
    estoqueAntes: 34e3,
    estoqueAposMovimento: 84e3,
    montanteSnapshot: 12345
  });
  for (const field of ["litrosComprados", "preco", "precoLitro", "estoqueAntes", "estoqueAposMovimento", "montanteSnapshot"]) {
    assert.equal(Number.isInteger(record[field]), true, field);
  }
  for (const field of ["qa", "diesel", "lf", "motorista", "id_motorista", "id_motorista_snap", "motivo", "obra", "precoTotal", "precoPorLitro"]) {
    assert.equal(field in record, false, `campo legado ${field}`);
  }
});
test("normaliza uma entrada nova para o hist\xF3rico e prioriza os campos can\xF4nicos", () => {
  const movement = normalizeFuelMovement({
    id: "new-entry",
    data: new Date(2026, 8, 4),
    schemaVersion: 2,
    tipo: "entrada",
    litrosComprados: 5e4,
    qa: 1,
    preco: 2e6,
    precoTotal: 2,
    precoLitro: 400,
    precoPorLitro: 3,
    responsavel: { id: "jorge@example.com", nome: "JORGE H. F. BUENO" },
    estoqueAposMovimento: 84e3,
    montanteSnapshot: 491264,
    lote: "LT-2026-09"
  });
  assert.equal(movement.tipo, "entrada");
  assert.equal(movement.litrosComprados, 5e4);
  assert.equal(movement.preco, 2e4);
  assert.equal(movement.precoLitro, 4);
  assert.deepEqual(movement.responsavel, { id: "jorge@example.com", nome: "JORGE H. F. BUENO" });
  assert.equal(movement.estoqueAposMovimento, 84e3);
  assert.equal(movement.montanteSnapshot, 491264);
});
test("converte dinheiro do schema v2 para exibi\xE7\xE3o", () => {
  const movement = normalizeFuelMovement({
    id: "v2-entry",
    data: /* @__PURE__ */ new Date(),
    schemaVersion: 2,
    tipo: "entrada",
    litrosComprados: 5e4,
    preco: 29e5,
    precoLitro: 580
  });
  assert.equal(movement.preco, 29e3);
  assert.equal(movement.precoLitro, 5.8);
});
test("preserva dinheiro hist\xF3rico sem schemaVersion", () => {
  const movement = normalizeFuelMovement({
    id: "intermediate-entry",
    data: /* @__PURE__ */ new Date(),
    tipo: "entrada",
    litrosComprados: 5e4,
    preco: 29e3,
    precoLitro: 5.8
  });
  assert.equal(movement.preco, 29e3);
  assert.equal(movement.precoLitro, 5.8);
});
test("normaliza uma entrada legada sem remov\xEA-la do hist\xF3rico", () => {
  const movement = normalizeFuelMovement({
    id: "legacy-entry",
    data: new Date(2026, 7, 15),
    motivo: "Abastecimento de Diesel",
    qa: 5e4,
    precoTotal: 2e4,
    precoPorLitro: 4,
    motorista: "JORGE H. F. BUENO"
  });
  assert.deepEqual(
    {
      tipo: movement.tipo,
      litrosComprados: movement.litrosComprados,
      preco: movement.preco,
      precoLitro: movement.precoLitro,
      responsavel: movement.responsavel
    },
    {
      tipo: "entrada",
      litrosComprados: 5e4,
      preco: 2e4,
      precoLitro: 4,
      responsavel: { id: "", nome: "JORGE H. F. BUENO" }
    }
  );
});
