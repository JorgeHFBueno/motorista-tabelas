// tests/vehicle-report-core.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// src/services/vehicle-report-core.ts
var PRECO_DIESEL_RELATORIO = 5.9;
var cents = (value) => Math.round(value * 100) / 100;
var normalizedText = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
var cnpjPattern = /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}\b/g;
function extractCnpj(value) {
  const match = String(value ?? "").match(cnpjPattern)?.[0];
  const digits = match?.replace(/\D/g, "") ?? "";
  return digits.length === 14 ? digits : "";
}
function normalizeSupplier(value) {
  return normalizedText(String(value ?? "").replace(cnpjPattern, "")).replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function normalizeCalendarDate(value) {
  if (typeof value === "string") {
    const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
  }
  const candidate = value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function" ? value.toDate() : value instanceof Date ? value : new Date(value);
  return Number.isNaN(candidate.getTime()) ? "" : `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(candidate.getDate()).padStart(2, "0")}`;
}
function normalizeVehiclePlate(plate) {
  return plate.toUpperCase().replace(/[-\s]/g, "");
}
function litrosFromQuantidadeRaw(quantidadeRaw) {
  return quantidadeRaw / 10;
}
function custoDieselInterno(litros) {
  return cents(litros * PRECO_DIESEL_RELATORIO);
}
function fuelReportSupplier(raw) {
  const candidates = [raw.fornecedorNomeSnapshot, raw.motorista, raw.fornecedor, raw.paraQuem].map((value) => String(value ?? "").trim()).filter(Boolean);
  return candidates.find((value) => extractCnpj(value)) ?? candidates[0] ?? "";
}
function diagnostic(fuel, maintenance, matched, reason) {
  const fuelDate = normalizeCalendarDate(fuel.data);
  const maintenanceDate = normalizeCalendarDate(maintenance.data);
  const fuelSupplier = String(fuel.fornecedor ?? "");
  const maintenanceSupplier = String(maintenance.fornecedor ?? "");
  return { fuelDate, maintenanceDate, fuelSupplier, maintenanceSupplier, normalizedFuelSupplier: normalizeSupplier(fuelSupplier), normalizedMaintenanceSupplier: normalizeSupplier(maintenanceSupplier), fuelCnpj: extractCnpj(fuel.cnpj || fuelSupplier), maintenanceCnpj: extractCnpj(maintenance.cnpj || maintenanceSupplier), matched, reason, maintenanceId: maintenance.id };
}
function matchExternalFuelToMaintenance(fuel, maintenances, usedMaintenanceIds = /* @__PURE__ */ new Set()) {
  const candidates = maintenances.filter((maintenance) => normalizedText(maintenance.categoria) === "ABASTECIMENTO EXTERNO");
  const fuelDate = normalizeCalendarDate(fuel.data);
  const fuelSupplier = normalizeSupplier(fuel.fornecedor);
  const fuelCnpj = extractCnpj(fuel.cnpj || fuel.fornecedor);
  for (const maintenance of candidates) {
    if (maintenance.id && usedMaintenanceIds.has(maintenance.id)) continue;
    const maintenanceDate = normalizeCalendarDate(maintenance.data);
    const maintenanceSupplier = normalizeSupplier(maintenance.fornecedor);
    const maintenanceCnpj = extractCnpj(maintenance.cnpj || maintenance.fornecedor);
    if (fuelDate !== maintenanceDate) continue;
    if (fuelCnpj && maintenanceCnpj) {
      if (fuelCnpj === maintenanceCnpj) return diagnostic(fuel, maintenance, true, "data + CNPJ");
      continue;
    }
    if (fuelSupplier && maintenanceSupplier && fuelSupplier === maintenanceSupplier) return diagnostic(fuel, maintenance, true, "data + fornecedor normalizado");
  }
  const sameDate = candidates.find((maintenance) => normalizeCalendarDate(maintenance.data) === fuelDate);
  const reason = !fuelDate ? "data combust\xEDvel inv\xE1lida" : !sameDate ? "nenhuma manuten\xE7\xE3o externa na mesma data" : fuelCnpj && extractCnpj(sameDate.cnpj || sameDate.fornecedor) && fuelCnpj !== extractCnpj(sameDate.cnpj || sameDate.fornecedor) ? "CNPJ divergente" : fuelSupplier !== normalizeSupplier(sameDate.fornecedor) ? "fornecedor normalizado divergente" : "manuten\xE7\xE3o j\xE1 usada por outro abastecimento";
  return sameDate ? diagnostic(fuel, sameDate, false, reason) : diagnostic(fuel, { data: "", fornecedor: "", categoria: "ABASTECIMENTO EXTERNO" }, false, reason);
}
function summarizeInternalFuel(fuel, maintenances) {
  const usedMaintenanceIds = /* @__PURE__ */ new Set();
  const keyedMaintenances = maintenances.map((maintenance, index) => ({ ...maintenance, id: maintenance.id || `__maintenance_${index}` }));
  const diagnostics = [];
  const externos = fuel.filter((item) => {
    const match = matchExternalFuelToMaintenance(item, keyedMaintenances, usedMaintenanceIds);
    diagnostics.push(match);
    if (match.matched && match.maintenanceId) usedMaintenanceIds.add(match.maintenanceId);
    return match.matched;
  });
  const externalIds = new Set(externos.map((item) => item.id));
  const internos = fuel.filter((item) => !externalIds.has(item.id));
  const quantidadeRawInterna = internos.reduce((total, item) => total + item.quantidadeRaw, 0);
  const litros = litrosFromQuantidadeRaw(quantidadeRawInterna);
  return { encontrados: fuel.length, externos: externos.length, internos: internos.length, quantidadeRawInterna, litros, valor: custoDieselInterno(litros), itens: internos, diagnostics };
}
function reportTotals(firebase, q46Despesa, q47Despesa) {
  return { firebase: cents(firebase), firebaseQ46: cents(firebase + q46Despesa), firebaseQ47: cents(firebase + q47Despesa), firebaseQ46Q47: cents(firebase + q46Despesa + q47Despesa) };
}

// src/services/vehicle-report-pdf.ts
var money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value).replace(/\u00a0/g, " ");
var liters = (value) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
var winAnsi = { "\u20AC": 128, "\u2013": 150, "\u2014": 151, "\u201C": 147, "\u201D": 148, "\u2018": 145, "\u2019": 146, "\u2022": 149 };
function sanitizeErpPresentationText(value) {
  return String(value ?? "").replace(/[\p{C}]/gu, " ").replace(/\s+/gu, " ").trim();
}
function sanitizePdfText(value) {
  const text = sanitizeErpPresentationText(value);
  return text.replace(/^(VEÍCULO:\s*)(.+?)\s+—\s+\2$/u, "$1$2");
}
function normalizeVehicleIdentity(value) {
  return sanitizeErpPresentationText(value).normalize("NFKC").toLocaleUpperCase("pt-BR").replace(/[\s-]+/gu, "");
}
function formatVehicleReportHeader(placa, descricao) {
  const plate = sanitizeErpPresentationText(placa);
  const name = sanitizeErpPresentationText(descricao);
  return normalizeVehicleIdentity(plate) === normalizeVehicleIdentity(name) || !name ? `Ve\xEDculo: ${plate}` : `Ve\xEDculo: ${plate} \u2014 ${name}`;
}
function formatReportDate(value) {
  const text = sanitizeErpPresentationText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/u.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}
function encodePdfText(value) {
  let encoded = "";
  for (const char of sanitizePdfText(value)) {
    const code = char.codePointAt(0) ?? 63;
    encoded += String.fromCharCode(winAnsi[char] ?? (code >= 32 && code <= 255 ? code : 63));
  }
  return encoded.replace(/[()\\]/g, (match) => `\\${match}`);
}
var PAGE = { left: 36, right: 559, top: 800, bottom: 48 };
var colors = { ink: "0.12 0.15 0.18", border: "0.72 0.75 0.78", header: "0.92 0.93 0.95", section: "0.78 0.87 0.96", total: "0.88 0.93 0.97" };
function wrap(value, width) {
  const words = (sanitizeErpPresentationText(value) || "\u2014").split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if (word.length > width) {
      if (line) lines.push(line);
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      line = "";
    } else if (!line || line.length + word.length + 1 <= width) line = line ? `${line} ${word}` : word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["\u2014"];
}
function createDrawing() {
  const pages = [{ commands: [] }];
  let page = pages[0];
  let y = PAGE.top;
  const newPage = () => {
    page = { commands: [] };
    pages.push(page);
    y = PAGE.top;
  };
  const command = (value) => page.commands.push(value);
  const text = (x, baseline, value, size = 8, bold = false) => command(`BT /F${bold ? 2 : 1} ${size} Tf ${colors.ink} rg 1 0 0 1 ${x.toFixed(1)} ${baseline.toFixed(1)} Tm (${encodePdfText(String(value ?? ""))}) Tj ET`);
  const rect = (x, top, width, height, fill) => {
    if (fill) command(`q ${fill} rg ${x.toFixed(1)} ${(top - height).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re f Q`);
    command(`q ${colors.border} RG 0.35 w ${x.toFixed(1)} ${(top - height).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re S Q`);
  };
  const ensure = (height) => {
    if (y - height < PAGE.bottom + 18) {
      page = { commands: [] };
      pages.push(page);
      y = 800;
    }
  };
  const title = (value) => {
    ensure(34);
    text(PAGE.left, y, value, 15, true);
    y -= 22;
  };
  const section = (value) => {
    ensure(28);
    rect(PAGE.left, y, PAGE.right - PAGE.left, 18, colors.section);
    text(PAGE.left + 6, y - 12, value, 9, true);
    y -= 25;
  };
  const table = (headers, rows, widths, rightAligned = /* @__PURE__ */ new Set(), totalRows = /* @__PURE__ */ new Set()) => {
    const x0 = PAGE.left;
    const row = (cells, fill, bold = false) => {
      const wrapped = cells.map((cell, i) => wrap(cell, Math.max(5, Math.floor(widths[i] / 5.1))));
      const height = Math.max(...wrapped.map((lines) => lines.length)) * 9 + 7;
      if (y - height < PAGE.bottom + 20) {
        page = { commands: [] };
        pages.push(page);
        y = 800;
        row(headers, colors.header, true);
      }
      let x = x0;
      rect(x, y, widths.reduce((a, b) => a + b, 0), height, fill);
      cells.forEach((cell, i) => {
        const lines = wrapped[i];
        lines.forEach((line, j) => {
          const tx = rightAligned.has(i) ? x + widths[i] - 4 - line.length * 4.1 : x + 4;
          text(tx, y - 11 - j * 9, line, 7.2, bold);
        });
        x += widths[i];
      });
      for (let i = 1, offset = x0; i < widths.length; i++) {
        offset += widths[i - 1];
        command(`${colors.border} RG 0.35 w ${offset.toFixed(1)} ${(y - height).toFixed(1)} m ${offset.toFixed(1)} ${y.toFixed(1)} l S`);
      }
      y -= height;
    };
    row(headers, colors.header, true);
    rows.forEach((cells, index) => row(cells, totalRows.has(index) ? colors.total : void 0, totalRows.has(index)));
    y -= 8;
  };
  return { pages, get y() {
    return y;
  }, set y(value) {
    y = value;
  }, title, section, table, text };
}
function createVehicleReportPdf(report) {
  const q46 = report.erp.query46;
  const q47 = report.erp.query47;
  const drawing = createDrawing();
  const right = (indexes) => new Set(indexes);
  drawing.title("RELAT\xD3RIO DE CUSTOS DO VE\xCDCULO");
  drawing.text(PAGE.left, drawing.y, formatVehicleReportHeader(report.veiculo.placa, report.veiculo.nome), 9, true);
  drawing.y -= 13;
  drawing.text(PAGE.left, drawing.y, `Per\xEDodo: ${report.periodo.dataInicial} a ${report.periodo.dataFinal}   Gerado em: ${(/* @__PURE__ */ new Date()).toLocaleString("pt-BR")}`, 8);
  drawing.y -= 18;
  drawing.section("RESUMO EXECUTIVO");
  drawing.table(["Cen\xE1rio", "Total"], [["Firebase", money(report.totais.firebase)], ["Firebase + ERP Q46", money(report.totais.firebaseQ46)], ["Firebase + ERP Q47", money(report.totais.firebaseQ47)], ["Firebase + Q46 + Q47*", money(report.totais.firebaseQ46Q47)]], [350, 173], right([1]), /* @__PURE__ */ new Set([3]));
  drawing.text(PAGE.left, drawing.y, "* Cen\xE1rio experimental \u2014 poss\xEDvel dupla contagem ERP.", 7);
  drawing.y -= 15;
  drawing.table(["Componente", "Quantidade", "Valor"], [["Diesel interno", `${liters(report.firebase.combustivel.litros)} L / ${report.firebase.combustivel.registros} abastecimentos`, money(report.firebase.combustivel.valor)], ["Abastecimentos externos exclu\xEDdos", report.firebase.combustivel.externos, "\u2014"], ["Manuten\xE7\xF5es", `${report.firebase.manutencoes.registros} registros`, money(report.firebase.manutencoes.valor)]], [250, 160, 113], right([1, 2]));
  drawing.section("COMBUST\xCDVEL INTERNO");
  drawing.text(PAGE.left, drawing.y, `Documentos encontrados antes da classifica\xE7\xE3o: ${report.firebase.combustivel.registrosEncontrados}`, 7);
  drawing.y -= 13;
  drawing.table(["Data", "Litros", "Valor", "KM", "Obra", "Respons\xE1vel"], report.firebase.combustivel.itens.map((item) => [item.data, `${liters(item.litros)} L`, money(item.valor), item.km ?? "\u2014", item.obra, item.motorista]), [62, 58, 73, 48, 145, 137], right([1, 2, 3]));
  drawing.section("MANUTEN\xC7\xD5ES");
  drawing.table(["Data", "Descri\xE7\xE3o", "Fornecedor", "Valor"], report.firebase.manutencoes.itens.map((item) => [item.data, item.descricao, item.fornecedor, money(item.valor)]), [64, 190, 170, 99], right([3]));
  drawing.section("ERP Q46 \u2014 CAIXA");
  const q46Rows = q46.mensal.map((item) => [item.mes, item.qtd_lancamentos, money(item.receita), money(item.despesa), money(item.valor_resultado)]);
  q46Rows.push(["Total Q46", q46.qtd_lancamentos, money(q46.receita), money(q46.despesa), money(q46.valor_resultado)]);
  drawing.table(["M\xEAs", "Lan\xE7amentos", "Receitas", "Despesas", "Resultado"], q46Rows, [75, 92, 112, 112, 132], right([1, 2, 3, 4]), /* @__PURE__ */ new Set([q46Rows.length - 1]));
  drawing.section("ERP Q47 \u2014 COMPET\xCANCIA / NOTAS");
  drawing.table(["Data", "Nota", "Fornecedor", "Natureza / conta", "Tipo", "Valor"], q47.detalhes.map((item) => [formatReportDate(item.data), item.nota, item.fornecedor, `${item.natureza} / ${item.conta}`, item.tipo, money(item.valor_rateio)]), [57, 43, 125, 150, 65, 83], right([5]));
  drawing.section("COMPARATIVO ERP");
  drawing.table(["M\xE9trica", "Q46", "Q47"], [["Despesas", money(q46.despesa), money(q47.despesa)], ["Receitas", money(q46.receita), money(q47.receita)], ["Resultado", money(q46.valor_resultado), money(q47.valor_resultado)], ["Lan\xE7amentos / notas", q46.qtd_lancamentos, q47.notas]], [260, 131, 132], right([1, 2]));
  drawing.section("METODOLOGIA / PAR\xC2METROS");
  drawing.table(["Par\xE2metro", "Valor"], [["Ve\xEDculo", report.veiculo.placa], ["Per\xEDodo", `${report.periodo.dataInicial} a ${report.periodo.dataFinal}`], ["Diesel interno", "R$ 5,90/L"], ["Documentos combust\xEDvel encontrados", report.firebase.combustivel.registrosEncontrados], ["Internos / externos exclu\xEDdos", `${report.firebase.combustivel.registros} / ${report.firebase.combustivel.externos}`], ["ERP Q46 / Q47", "Caixa / Compet\xEAncia / notas"], ["Placa enviada ao ERP", report.veiculo.placa.replace(/[-\s]/g, "").toUpperCase()]], [250, 273]);
  drawing.text(PAGE.left, drawing.y, "Q46 e Q47 representam vis\xF5es cont\xE1beis distintas. A soma pode conter dupla contagem.", 7);
  const pages = drawing.pages;
  pages.forEach((page, index) => {
    page.commands.push(`BT /F1 7 Tf ${colors.ink} rg 1 0 0 1 ${PAGE.left} 27 Tm (${encodePdfText("Ledur Motorista \u2014 relat\xF3rio veicular")}) Tj ET`);
    page.commands.push(`BT /F1 7 Tf ${colors.ink} rg 1 0 0 1 470 27 Tm (${encodePdfText(`P\xE1g. ${index + 1} de ${pages.length}`)}) Tj ET`);
  });
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] >>`];
  pages.forEach((page, index) => {
    const content = page.commands.join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R /F2 ${4 + pages.length * 2} 0 R >> >> /Contents ${4 + index * 2} 0 R >>`, `<< /Length ${content.length} >>
stream
${content}
endstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj
${object}
endobj
`;
  });
  const start = pdf.length;
  pdf += `xref
0 ${objects.length + 1}
0000000000 65535 f 
${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}
trailer << /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${start}
%%EOF`;
  return new Blob([Uint8Array.from(pdf, (char) => char.charCodeAt(0))], { type: "application/pdf" });
}

// tests/vehicle-report-core.test.ts
test("normaliza JBJ-4J22 para o contrato ERP", () => assert.equal(normalizeVehiclePlate("JBJ-4J22"), "JBJ4J22"));
test("calcula os quatro totais da fixture JBJ sem hardcode no produto", () => {
  assert.deepEqual(reportTotals(104167.3, 44875.49, 10815.99), { firebase: 104167.3, firebaseQ46: 149042.79, firebaseQ47: 114983.29, firebaseQ46Q47: 159858.78 });
});
test("normaliza quantidade armazenada em d\xE9cimos de litro", () => {
  assert.equal(litrosFromQuantidadeRaw(1592), 159.2);
  assert.equal(litrosFromQuantidadeRaw(1886), 188.6);
});
test("usa fornecedor legado em motorista quando n\xE3o h\xE1 campo fornecedor", () => {
  assert.equal(fuelReportSupplier({ motorista: "COML BUFFON COMB E TRANSPS LTDA -" }), "COML BUFFON COMB E TRANSPS LTDA -");
});
test("regress\xE3o JBJ: cruza externos com manuten\xE7\xE3o, preserva quantidade 1 interna e calcula diesel pelo KPI", () => {
  const internos = Array.from({ length: 95 }, (_, index) => ({ id: `interno-${index}`, data: "2026-01-01", quantidadeRaw: index === 0 ? 1592 : index === 1 ? 1886 : index === 2 ? 156428 : 1, fornecedor: index === 94 ? "Fornecedor com quantidade 1" : "Diesel Interno" }));
  const externos = [
    { id: "buffon-fev", data: "2026-02-11", quantidadeRaw: 1, fornecedor: "COML BUFFON COMB E TRANSPS LTDA" },
    { id: "v8-mai", data: "2026-05-15", quantidadeRaw: 1, fornecedor: "COM DE COMB V8 LTDA" },
    { id: "buffon-jun", data: "2026-06-30", quantidadeRaw: 1, fornecedor: "COML BUFFON COMB E TRANSPS LTDA" }
  ];
  const maintenance = externos.map((item, index) => ({ data: item.data, categoria: "ABASTECIMENTO EXTERNO", fornecedor: `${item.fornecedor} - ${index === 1 ? "10.533.213/0001-32" : "93.489.243/0084-43"}` }));
  const result = summarizeInternalFuel([...internos, ...externos], maintenance);
  assert.deepEqual({ encontrados: result.encontrados, externos: result.externos, internos: result.internos, litros: result.litros, valor: result.valor }, { encontrados: 98, externos: 3, internos: 95, litros: 15999.8, valor: 94398.82 });
  assert.equal(custoDieselInterno(result.litros) + 9768.48, 104167.3);
  assert.ok(result.itens.some((item) => item.id === "interno-94"), "quantidade bruta 1 sem manuten\xE7\xE3o externa continua interna");
});
test("PDF preserva acentos e quebra textos longos antes da margem", async () => {
  const report = { veiculo: { placa: "JBJ-4J22", nome: "VE\xCDCULO F\xC1BRICA" }, periodo: { dataInicial: "2025-01-01", dataFinal: "2026-09-25" }, firebase: { combustivel: { registrosEncontrados: 98, externos: 3, registros: 95, litros: 15999.8, valor: 94398.82, itens: [{ data: "2026-01-01", litros: 159.2, valor: 939.28, km: 1, obra: "Obra S\xE3o Jo\xE3o", motorista: "Jo\xE3o", id: "fuel" }] }, manutencoes: { registros: 1, valor: 1, itens: [{ data: "2026-01-02", descricao: "MANUTEN\xC7\xD5ES", fornecedor: `Fornecedor ${"muito longo ".repeat(20)}`, valor: 1, id: "maintenance" }] } }, totais: reportTotals(104167.3, 44875.49, 10815.99), erp: { query46: { qtd_lancamentos: 1, receita: 0, despesa: 44875.49, valor_resultado: -44875.49, mensal: [] }, query47: { notas: 1, receita: 0, despesa: 10815.99, valor_resultado: -10815.99, placa_nota: { preenchidas: 1, vazias: 0, divergentes: 0 }, transferencias: { linhas: 0 }, detalhes: [] } } };
  const bytes = new Uint8Array(await createVehicleReportPdf(report).arrayBuffer());
  const content = new TextDecoder("windows-1252").decode(bytes);
  assert.match(content, /RELATÓRIO DE CUSTOS DO VEÍCULO/);
  assert.match(content, /MANUTENÇÕES/);
  assert.match(content, /COMPETÊNCIA/);
  assert.match(content, /VEÍCULO FÁBRICA/);
  assert.match(content, /159,2 L/);
  assert.doesNotMatch(content, /\?/);
  assert.match(content, /\/Type \/Page/);
  assert.match(content, /\/Count \d+/);
  assert.match(content, /Pág\./);
});
test("matcher externo usa data + CNPJ, fornecedor normalizado e diagn\xF3stico dos tr\xEAs pares JBJ", () => {
  const fuel = [
    { id: "6XkXIx78YNgehsfi0Jmn", data: "2026-02-11T03:00:00.000Z", quantidadeRaw: 1, fornecedor: "COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43" },
    { id: "mlVJI5eITOBKEHqRtzDa", data: "2026-05-15T03:00:00.000Z", quantidadeRaw: 1, fornecedor: "COM DE COMB V8 LTDA - 10.533.213/0001-32" },
    { id: "6yFtDcRUOMcVLDSKWtHc", data: "2026-06-30T03:00:00.000Z", quantidadeRaw: 1, fornecedor: "COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43" }
  ];
  const maintenance = [
    { id: "m1", data: "2026-02-11T12:45:00.000Z", categoria: "ABASTECIMENTO EXTERNO", fornecedor: "COML BUFFON COMB E TRANSPS LTDA - 93489243008443" },
    { id: "m2", data: "2026-05-15", categoria: "ABASTECIMENTO EXTERNO", fornecedor: "COM DE COMB V8 LTDA - 10.533.213/0001-32" },
    { id: "m3", data: "2026-06-30", categoria: "ABASTECIMENTO EXTERNO", fornecedor: "COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43" }
  ];
  const result = summarizeInternalFuel(fuel, maintenance);
  assert.deepEqual(result.diagnostics.map(({ matched, reason, fuelDate, maintenanceDate, fuelCnpj, maintenanceCnpj }) => ({ matched, reason, fuelDate, maintenanceDate, fuelCnpj, maintenanceCnpj })), [
    { matched: true, reason: "data + CNPJ", fuelDate: "2026-02-11", maintenanceDate: "2026-02-11", fuelCnpj: "93489243008443", maintenanceCnpj: "93489243008443" },
    { matched: true, reason: "data + CNPJ", fuelDate: "2026-05-15", maintenanceDate: "2026-05-15", fuelCnpj: "10533213000132", maintenanceCnpj: "10533213000132" },
    { matched: true, reason: "data + CNPJ", fuelDate: "2026-06-30", maintenanceDate: "2026-06-30", fuelCnpj: "93489243008443", maintenanceCnpj: "93489243008443" }
  ]);
  assert.equal(result.externos, 3);
  assert.equal(result.internos, 0);
});
test("controles: raw 1 sem manuten\xE7\xE3o externa \xE9 interno e uma manuten\xE7\xE3o n\xE3o casa dois documentos", () => {
  const rawFuel = [
    { id: "6XkXIx78YNgehsfi0Jmn", data: "2026-02-11", quantidadeRaw: 1, fornecedor: "usu\xC3\xA1rio lan\xC3\xA7ador", motorista: "COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43" },
    { id: "mlVJI5eITOBKEHqRtzDa", data: "2026-05-15", quantidadeRaw: 1, fornecedor: "usu\xC3\xA1rio lan\xC3\xA7ador", motorista: "COM DE COMB V8 LTDA - 10.533.213/0001-32" },
    { id: "6yFtDcRUOMcVLDSKWtHc", data: "2026-06-30", quantidadeRaw: 1, fornecedor: "usu\xC3\xA1rio lan\xC3\xA7ador", motorista: "COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43" }
  ];
  assert.deepEqual(rawFuel.map(fuelReportSupplier), [
    "COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43",
    "COM DE COMB V8 LTDA - 10.533.213/0001-32",
    "COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43"
  ]);
  const legacyFuel = rawFuel.map((item) => ({ ...item, fornecedor: fuelReportSupplier(item) }));
  const legacyMaintenance = legacyFuel.map((item, index) => ({ id: `legacy-maintenance-${index}`, data: item.data, categoria: "ABASTECIMENTO EXTERNO", fornecedor: item.fornecedor }));
  const legacyResult = summarizeInternalFuel(legacyFuel, legacyMaintenance);
  assert.equal(legacyResult.externos, 3);
  assert.equal(legacyResult.internos, 0);
  const maintenance = [{ id: "only-one", data: "2026-02-11", categoria: "ABASTECIMENTO EXTERNO", fornecedor: "Buffon Ltda - 93.489.243/0084-43" }];
  const fuel = [
    { id: "first", data: "2026-02-11", quantidadeRaw: 1, fornecedor: "Buffon Ltda - 93.489.243/0084-43" },
    { id: "second", data: "2026-02-11", quantidadeRaw: 1, fornecedor: "Buffon Ltda - 93.489.243/0084-43" },
    { id: "unmatched", data: "2026-02-12", quantidadeRaw: 1, fornecedor: "Outro fornecedor" }
  ];
  const result = summarizeInternalFuel(fuel, maintenance);
  assert.equal(result.externos, 1);
  assert.equal(result.internos, 2);
  assert.equal(result.itens.some((item) => item.id === "unmatched"), true);
  assert.equal(normalizeSupplier("Coml Buffon Comb e Transps Ltda - 93.489.243/0084-43"), "COML BUFFON COMB E TRANSPS LTDA");
  assert.equal(extractCnpj("Coml Buffon - 93.489.243/0084-43"), "93489243008443");
  assert.equal(normalizeCalendarDate("2026-02-11T23:59:59-03:00"), "2026-02-11");
  assert.equal(matchExternalFuelToMaintenance({ id: "raw-one", data: "2026-02-13", quantidadeRaw: 1, fornecedor: "Sem manuten\xE7\xE3o" }, maintenance).matched, false);
});
test("sanitiza\xE7\xE3o remove controles e elimina cabe\xE7alho duplicado preservando Unicode v\xE1lido", () => {
  assert.equal(sanitizePdfText("VE\xCDCULO: JBJ-4J22 \u2014 JBJ-4J22"), "VE\xCDCULO: JBJ-4J22");
  assert.equal(sanitizePdfText("VE\xCDCULOS\x07 E FINANCEIRO \u2014 N\xBA 1\xBA, \xE7, \xE1"), "VE\xCDCULOS E FINANCEIRO \u2014 N\xBA 1\xBA, \xE7, \xE1");
});
test("remove o caractere ERP U+FFFE na camada de apresenta\xE7\xE3o e preserva portugu\xEAs", () => {
  const controle = "\uFFFE";
  assert.equal(controle.codePointAt(0), 65534);
  assert.equal("MANUTEN\xC7\xC3O DE VE\xCDCULOS\uFFFEFINANCEIRO".indexOf(controle), 22);
  assert.equal(sanitizeErpPresentationText(`MANUTEN\xC7\xC3O DE VE\xCDCULOS${controle}FINANCEIRO`), "MANUTEN\xC7\xC3O DE VE\xCDCULOS FINANCEIRO");
  assert.equal(sanitizeErpPresentationText("FONTOURA XAVIER N\xBA 122/2024"), "FONTOURA XAVIER N\xBA 122/2024");
});
test("ERP U+FFFE is reported and removed without ASCII-folding valid text", () => {
  const controle = String.fromCodePoint(65534);
  const input = `MANUTEN${String.fromCodePoint(199, 195)}O DE VE${String.fromCodePoint(205)}CULOS${controle}FINANCEIRO`;
  assert.equal(controle.codePointAt(0), 65534);
  assert.equal(input.indexOf(controle), 22);
  assert.equal(sanitizeErpPresentationText(input), `MANUTEN${String.fromCodePoint(199, 195)}O DE VE${String.fromCodePoint(205)}CULOS FINANCEIRO`);
  assert.equal(sanitizeErpPresentationText(`FONTOURA XAVIER N${String.fromCodePoint(186)} 122/2024`), `FONTOURA XAVIER N${String.fromCodePoint(186)} 122/2024`);
  assert.equal(sanitizeErpPresentationText("COMPRA DE MERCADORIAS/PE\xC7AS - VE\xCDCULOS"), "COMPRA DE MERCADORIAS/PE\xC7AS - VE\xCDCULOS");
});
test("cabe\xE7alho do ve\xEDculo n\xE3o repete a placa quando a descri\xE7\xE3o \xE9 igual", () => {
  assert.equal(formatVehicleReportHeader("JBJ-4J22", "JBJ-4J22"), "Ve\xEDculo: JBJ-4J22");
  assert.equal(formatVehicleReportHeader("JBJ-4J22", "CAMINH\xC3O MUNCK"), "Ve\xEDculo: JBJ-4J22 \u2014 CAMINH\xC3O MUNCK");
});
test("data Q47 \xE9 compactada sem aplicar convers\xE3o de timezone", () => {
  assert.equal(formatReportDate("2025-04-08T00:00:00"), "08/04/2025");
  assert.equal(formatReportDate("2025-04-08T23:59:59-03:00"), "08/04/2025");
});
