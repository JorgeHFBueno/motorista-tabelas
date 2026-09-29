// tests/combustivel-normalizer.test.ts
import assert from "node:assert/strict";
import test from "node:test";

// src/services/combustivel-normalizer.ts
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function map(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function normalizarMovimentoCombustivel(raw, id = "") {
  if (raw.schemaVersion === 2 && raw.tipo === "entrada") {
    const responsavel = map(raw.responsavel);
    const origem = map(raw.origemPreco);
    return { ...raw, id, schema: "entrada-v2", isFuelOutput: false, schemaVersion: 2, tipo: "entrada", litrosComprados: num(raw.litrosComprados), preco: num(raw.preco), precoLitro: num(raw.precoLitro ?? origem.precoLitro), lote: text(raw.lote), responsavel: text(responsavel.nome ?? raw.responsavel) };
  }
  if (raw.schemaVersion === 2 && raw.tipo === "saida") {
    const item = map(raw.itemFrota);
    const obra = map(raw.obra);
    const fr = map(raw.frentista);
    const pk = map(raw.paraQuem);
    const au = map(raw.autorLancamento);
    const itemTipo = item.tipo === "veiculo" || item.tipo === "maquina" ? item.tipo : null;
    return { ...raw, id, schema: "saida-v2", isFuelOutput: true, schemaVersion: 2, tipo: "saida", quantidadeAbastecida: num(raw.quantidadeAbastecida), valorAbastecimento: num(raw.valorAbastecimento), montanteAntes: num(raw.montanteAntes), montanteAposMovimento: num(raw.montanteAposMovimento), estoqueAntes: num(raw.estoqueAntes), estoqueAposMovimento: num(raw.estoqueAposMovimento), modalidadeAbastecimento: raw.modalidadeAbastecimento === "galao" ? "galao" : "direto", itemFrotaUid: text(item.uid), itemFrotaTipo: itemTipo, identificadorSnapshot: text(item.identificadorSnapshot), km: itemTipo === "veiculo" ? num(item.km) ?? null : null, horimetro: itemTipo === "maquina" ? num(item.horimetro) : void 0, extra: itemTipo === "maquina" ? text(item.identificadorSnapshot) : null, frentista: text(fr.nomeSnapshot), paraQuem: text(pk.nomeSnapshot), autorLancamento: text(au.nomeSnapshot), obraUid: text(obra.uid), obra: text(obra.nomeSnapshot), local: text(obra.localSnapshot), placa: itemTipo === "veiculo" ? text(item.identificadorSnapshot) : null, motorista: text(fr.nomeSnapshot), para_quem: text(pk.nomeSnapshot), qa: num(raw.quantidadeAbastecida), li: num(raw.montanteAntes), lf: num(raw.montanteAposMovimento), arla: num(raw.arla), origemPreco: raw.origemPreco };
  }
  return { ...raw, id, schema: "legado", isFuelOutput: raw.tipo !== "entrada", placa: text(raw.placa) || (raw.tipoPlaca === true ? text(raw.identificador) : ""), extra: text(raw.extra) || (raw.tipoPlaca === false ? text(raw.placa) : null), km: num(raw.km) ?? null };
}
function litrosFromX10(value) {
  const n = num(value);
  return n === void 0 ? null : n / 10;
}
function reaisFromCentavos(value) {
  const n = num(value);
  return n === void 0 ? null : n / 100;
}
function horasFromX10(value) {
  return litrosFromX10(value);
}

// src/utils/formatters.ts
var oneDecimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
var integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
var currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function formatarLitrosX10(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? `${oneDecimal.format(n / 10)} L` : "\u2014";
}
function formatarMoedaCentavos(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? currency.format(n / 100).replace(/\u00a0/g, " ") : "\u2014";
}
function formatarKm(value) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? integer.format(n) : "\u2014";
}
function formatarHorimetroX10(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? `${oneDecimal.format(n / 10)} h` : "\u2014";
}
function parseDigitosX10(value) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

// tests/combustivel-normalizer.test.ts
var base = {
  schemaVersion: 2,
  tipo: "saida",
  data: /* @__PURE__ */ new Date(),
  quantidadeAbastecida: 873,
  valorAbastecimento: 50634,
  montanteAntes: 492539,
  montanteAposMovimento: 493412,
  estoqueAntes: 5e4,
  estoqueAposMovimento: 49127,
  arla: 0,
  motivo: "Uso",
  modalidadeAbastecimento: "direto",
  origemPreco: { movimentoId: "m1", lote: "1006", precoLitro: 580 },
  frentista: { uid: "f", nomeSnapshot: "Frentista" },
  paraQuem: { uid: "p", nomeSnapshot: "Operador" },
  autorLancamento: { uid: "a", nomeSnapshot: "Autor" },
  obra: { uid: "o", nomeSnapshot: "Obra", localSnapshot: null }
};
test("aceita somente d\xEDgitos na representa\xE7\xE3o de entrada \xD710", () => {
  assert.equal(parseDigitosX10("5"), 5);
  assert.equal(formatarLitrosX10(parseDigitosX10("5")), "0,5 L");
  assert.equal(parseDigitosX10("50"), 50);
  assert.equal(formatarLitrosX10(parseDigitosX10("50")), "5,0 L");
  assert.equal(parseDigitosX10("873"), 873);
  assert.equal(formatarLitrosX10(parseDigitosX10("873")), "87,3 L");
  assert.equal(parseDigitosX10("492539"), 492539);
  assert.equal(formatarLitrosX10(parseDigitosX10("492539")), "49.253,9 L");
  assert.equal(parseDigitosX10("12,3"), 123);
  assert.equal(parseDigitosX10("12.3"), 123);
  assert.equal(parseDigitosX10("abc123"), 123);
});
test("normaliza sa\xEDda V2 de ve\xEDculo com aliases compat\xEDveis", () => {
  const result = normalizarMovimentoCombustivel({ ...base, itemFrota: { uid: "v1", tipo: "veiculo", identificadorSnapshot: "ABC1D23", km: 125430 } }, "s1");
  assert.equal(result.schema, "saida-v2");
  assert.equal(result.isFuelOutput, true);
  assert.equal(result.qa, 873);
  assert.equal(result.li, 492539);
  assert.equal(result.lf, 493412);
  assert.equal(result.placa, "ABC1D23");
  assert.equal(result.km, 125430);
  assert.equal(result.horimetro, void 0);
  assert.equal(result.extra, null);
  assert.equal(result.motorista, "Frentista");
  assert.equal(result.para_quem, "Operador");
});
test("normaliza m\xE1quina e gal\xE3o sem transformar hor\xEDmetro em KM", () => {
  const result = normalizarMovimentoCombustivel({ ...base, modalidadeAbastecimento: "galao", itemFrota: { uid: "m1", tipo: "maquina", identificadorSnapshot: "CARREGADEIRA CASE", horimetro: 8752 } });
  assert.equal(result.modalidadeAbastecimento, "galao");
  assert.equal(result.itemFrotaTipo, "maquina");
  assert.equal(result.identificadorSnapshot, "CARREGADEIRA CASE");
  assert.equal(result.horimetro, 8752);
  assert.equal(result.km, null);
  assert.equal(result.placa, null);
  assert.equal(result.extra, "CARREGADEIRA CASE");
});
test("formata unidades internas para a apresenta\xE7\xE3o pt-BR", () => {
  assert.equal(formatarLitrosX10(873), "87,3 L");
  assert.equal(formatarLitrosX10(492539), "49.253,9 L");
  assert.equal(formatarKm(125430), "125.430");
  assert.equal(formatarHorimetroX10(8752), "875,2 h");
  assert.equal(formatarMoedaCentavos(50634), "R$ 506,34");
});
test("calcula os tr\xEAs campos do abastecimento em unidade interna", () => {
  const montanteAntes = 492539;
  const quantidadeAbastecida = 873;
  assert.equal(montanteAntes + quantidadeAbastecida, 493412);
  assert.equal(formatarLitrosX10(montanteAntes), "49.253,9 L");
  assert.equal(formatarLitrosX10(quantidadeAbastecida), "87,3 L");
  assert.equal(formatarLitrosX10(montanteAntes + quantidadeAbastecida), "49.341,2 L");
});
test("preserva entrada V2 e legado sem infer\xEAncia por magnitude", () => {
  assert.equal(normalizarMovimentoCombustivel({ schemaVersion: 2, tipo: "entrada", qa: 873 }).isFuelOutput, false);
  const legacy = normalizarMovimentoCombustivel({ placa: "ABC", tipoPlaca: true, km: 125430, qa: 873, semKm: "Galao" });
  assert.equal(legacy.schema, "legado");
  assert.equal(legacy.placa, "ABC");
  assert.equal(legacy.semKm, "Galao");
  assert.equal(legacy.isFuelOutput, true);
});
test("unidades V2 permanecem separadas", () => {
  assert.equal(litrosFromX10(873), 87.3);
  assert.equal(reaisFromCentavos(50634), 506.34);
  assert.equal(125430, 125430);
  assert.equal(horasFromX10(8752), 875.2);
});
test("normaliza os seis formatos simultaneamente sem maps na camada de consumo", () => {
  const entrada = normalizarMovimentoCombustivel({ schemaVersion: 2, tipo: "entrada", data: /* @__PURE__ */ new Date(), litrosComprados: 5e4, preco: 29e5, precoLitro: 580, lote: "1006", responsavel: { id: "u", nome: "Comprador" } }, "e1");
  const legado = normalizarMovimentoCombustivel({ tipo: "saida", placa: "LEG", motorista: "Motorista", para_quem: "Pessoa", qa: 10 }, "l1");
  const veiculo = normalizarMovimentoCombustivel({ ...base, itemFrota: { uid: "v", tipo: "veiculo", identificadorSnapshot: "ABC1D23", km: 125430 } }, "v1");
  const maquina = normalizarMovimentoCombustivel({ ...base, itemFrota: { uid: "m", tipo: "maquina", identificadorSnapshot: "CASE", horimetro: 8752 } }, "m1");
  const galaoVeiculo = normalizarMovimentoCombustivel({ ...base, modalidadeAbastecimento: "galao", itemFrota: { uid: "v", tipo: "veiculo", identificadorSnapshot: "ABC1D23" } }, "gv");
  const galaoMaquina = normalizarMovimentoCombustivel({ ...base, modalidadeAbastecimento: "galao", itemFrota: { uid: "m", tipo: "maquina", identificadorSnapshot: "CASE" } }, "gm");
  assert.deepEqual([entrada.schema, legado.schema, veiculo.schema, maquina.schema, galaoVeiculo.schema, galaoMaquina.schema], ["entrada-v2", "legado", "saida-v2", "saida-v2", "saida-v2", "saida-v2"]);
  assert.equal(entrada.preco, 29e5);
  assert.equal(entrada.responsavel, "Comprador");
  assert.equal(maquina.km, null);
  assert.equal(maquina.horimetro, 8752);
  assert.equal(galaoVeiculo.identificadorSnapshot, "ABC1D23");
  assert.equal(galaoMaquina.itemFrotaTipo, "maquina");
});
