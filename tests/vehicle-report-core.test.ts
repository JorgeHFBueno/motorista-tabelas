import test from 'node:test';
import assert from 'node:assert/strict';
import { custoDieselInterno, extractCnpj, filterVehicleReportPeriod, fuelReportSupplier, litrosFromQuantidadeRaw, matchExternalFuelToMaintenance, normalizeCalendarDate, normalizeSupplier, normalizeVehiclePlate, reportTotals, resolveVehicleReportPeriod, summarizeInternalFuel } from '../src/services/vehicle-report-core';
import { createVehicleReportPdf, formatReportDate, formatVehicleReportHeader, sanitizeErpPresentationText, sanitizePdfText } from '../src/services/vehicle-report-pdf';

test('normaliza JBJ-4J22 para o contrato ERP', () => assert.equal(normalizeVehiclePlate('JBJ-4J22'), 'JBJ4J22'));
test('calcula o total consolidado Firebase + ERP Q47 da fixture JBJ', () => {
  assert.deepEqual(reportTotals(104167.30, 10815.99), { firebase: 104167.30, erpQ47: 10815.99, consolidado: 114983.29 });
});

test('resolve os períodos 25, 26 e Todo com relógio congelado', () => {
  const today = new Date(2026, 9, 1);
  assert.deepEqual(resolveVehicleReportPeriod('25', today), { dataInicial: '2025-01-01', dataFinal: '2025-12-31', label: '2025' });
  assert.deepEqual(resolveVehicleReportPeriod('26', today), { dataInicial: '2026-01-01', dataFinal: '2026-10-01', label: '2026' });
  assert.deepEqual(resolveVehicleReportPeriod('all', today), { dataInicial: '2025-01-01', dataFinal: '2026-10-01', label: '2025–atual' });
});

test('filtra combustível, manutenções e Q47 pelo período selecionado', () => {
  const fixture = [{ id: '2025', data: '2025-06-01' }, { id: '2026', data: '2026-06-01' }];
  const ids = (period: ReturnType<typeof resolveVehicleReportPeriod>) => filterVehicleReportPeriod(fixture, period.dataInicial, period.dataFinal, (item) => item.data).map((item) => item.id);
  const today = new Date(2026, 9, 1);
  assert.deepEqual(ids(resolveVehicleReportPeriod('25', today)), ['2025']);
  assert.deepEqual(ids(resolveVehicleReportPeriod('26', today)), ['2026']);
  assert.deepEqual(ids(resolveVehicleReportPeriod('all', today)), ['2025', '2026']);
});

test('normaliza quantidade armazenada em décimos de litro', () => {
  assert.equal(litrosFromQuantidadeRaw(1592), 159.2);
  assert.equal(litrosFromQuantidadeRaw(1886), 188.6);
});

test('usa fornecedor legado em motorista quando não há campo fornecedor', () => {
  assert.equal(fuelReportSupplier({ motorista: 'COML BUFFON COMB E TRANSPS LTDA -' }), 'COML BUFFON COMB E TRANSPS LTDA -');
});

test('regressão JBJ: cruza externos com manutenção, preserva quantidade 1 interna e calcula diesel pelo KPI', () => {
  const internos = Array.from({ length: 95 }, (_, index) => ({ id: `interno-${index}`, data: '2026-01-01', quantidadeRaw: index === 0 ? 1592 : index === 1 ? 1886 : index === 2 ? 156428 : 1, fornecedor: index === 94 ? 'Fornecedor com quantidade 1' : 'Diesel Interno' }));
  const externos = [
    { id: 'buffon-fev', data: '2026-02-11', quantidadeRaw: 1, fornecedor: 'COML BUFFON COMB E TRANSPS LTDA' },
    { id: 'v8-mai', data: '2026-05-15', quantidadeRaw: 1, fornecedor: 'COM DE COMB V8 LTDA' },
    { id: 'buffon-jun', data: '2026-06-30', quantidadeRaw: 1, fornecedor: 'COML BUFFON COMB E TRANSPS LTDA' },
  ];
  const maintenance = externos.map((item, index) => ({ data: item.data, categoria: 'ABASTECIMENTO EXTERNO', fornecedor: `${item.fornecedor} - ${index === 1 ? '10.533.213/0001-32' : '93.489.243/0084-43'}` }));
  const result = summarizeInternalFuel([...internos, ...externos], maintenance);
  assert.deepEqual({ encontrados: result.encontrados, externos: result.externos, internos: result.internos, litros: result.litros, valor: result.valor }, { encontrados: 98, externos: 3, internos: 95, litros: 15999.8, valor: 94398.82 });
  assert.equal(custoDieselInterno(result.litros) + 9768.48, 104167.30);
  assert.ok(result.itens.some((item) => item.id === 'interno-94'), 'quantidade bruta 1 sem manutenção externa continua interna');
});

test('PDF preserva acentos e quebra textos longos antes da margem', async () => {
  const report: any = { veiculo: { placa: 'JBJ-4J22', nome: 'VEÍCULO FÁBRICA' }, periodo: { dataInicial: '2025-01-01', dataFinal: '2026-09-25' }, firebase: { combustivel: { registrosEncontrados: 98, externos: 3, registros: 95, litros: 15999.8, valor: 94398.82, itens: [{ data: '2026-01-01', litros: 159.2, valor: 939.28, km: 1, obra: 'Obra São João', motorista: 'João', id: 'fuel' }] }, manutencoes: { registros: 1, valor: 1, itens: [{ data: '2026-01-02', descricao: 'MANUTENÇÕES', fornecedor: `Fornecedor ${'muito longo '.repeat(20)}`, valor: 1, id: 'maintenance' }] } }, totais: reportTotals(104167.30, 10815.99), erp: { query47: { notas: 1, receita: 0, despesa: 10815.99, valor_resultado: -10815.99, placa_nota: { preenchidas: 1, vazias: 0, divergentes: 0 }, transferencias: { linhas: 0 }, detalhes: [] } } };
  const bytes = new Uint8Array(await createVehicleReportPdf(report).arrayBuffer());
  const content = new TextDecoder('windows-1252').decode(bytes);
  assert.match(content, /RELATÓRIO DE CUSTOS DO VEÍCULO/);
  assert.match(content, /MANUTENÇÕES/);
  assert.match(content, /COMPETÊNCIA/);
  assert.match(content, /VEÍCULO FÁBRICA/);
  assert.match(content, /159,2 L/);
  assert.doesNotMatch(content, /\?/);
  assert.match(content, /\/Type \/Page/);
  assert.match(content, /\/Count \d+/);
  assert.match(content, /Pág\./);
  assert.match(content, /Total consolidado/);
  assert.doesNotMatch(content, /Q46|CAIXA|COMPARATIVO ERP/);
});

test('matcher externo usa data + CNPJ, fornecedor normalizado e diagnóstico dos três pares JBJ', () => {
  const fuel = [
    { id: '6XkXIx78YNgehsfi0Jmn', data: '2026-02-11T03:00:00.000Z', quantidadeRaw: 1, fornecedor: 'COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43' },
    { id: 'mlVJI5eITOBKEHqRtzDa', data: '2026-05-15T03:00:00.000Z', quantidadeRaw: 1, fornecedor: 'COM DE COMB V8 LTDA - 10.533.213/0001-32' },
    { id: '6yFtDcRUOMcVLDSKWtHc', data: '2026-06-30T03:00:00.000Z', quantidadeRaw: 1, fornecedor: 'COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43' },
  ];
  const maintenance = [
    { id: 'm1', data: '2026-02-11T12:45:00.000Z', categoria: 'ABASTECIMENTO EXTERNO', fornecedor: 'COML BUFFON COMB E TRANSPS LTDA - 93489243008443' },
    { id: 'm2', data: '2026-05-15', categoria: 'ABASTECIMENTO EXTERNO', fornecedor: 'COM DE COMB V8 LTDA - 10.533.213/0001-32' },
    { id: 'm3', data: '2026-06-30', categoria: 'ABASTECIMENTO EXTERNO', fornecedor: 'COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43' },
  ];
  const result = summarizeInternalFuel(fuel, maintenance);
  assert.deepEqual(result.diagnostics.map(({ matched, reason, fuelDate, maintenanceDate, fuelCnpj, maintenanceCnpj }) => ({ matched, reason, fuelDate, maintenanceDate, fuelCnpj, maintenanceCnpj })), [
    { matched: true, reason: 'data + CNPJ', fuelDate: '2026-02-11', maintenanceDate: '2026-02-11', fuelCnpj: '93489243008443', maintenanceCnpj: '93489243008443' },
    { matched: true, reason: 'data + CNPJ', fuelDate: '2026-05-15', maintenanceDate: '2026-05-15', fuelCnpj: '10533213000132', maintenanceCnpj: '10533213000132' },
    { matched: true, reason: 'data + CNPJ', fuelDate: '2026-06-30', maintenanceDate: '2026-06-30', fuelCnpj: '93489243008443', maintenanceCnpj: '93489243008443' },
  ]);
  assert.equal(result.externos, 3);
  assert.equal(result.internos, 0);
});

test('controles: raw 1 sem manutenção externa é interno e uma manutenção não casa dois documentos', () => {
  const rawFuel = [
    { id: '6XkXIx78YNgehsfi0Jmn', data: '2026-02-11', quantidadeRaw: 1, fornecedor: 'usuÃ¡rio lanÃ§ador', motorista: 'COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43' },
    { id: 'mlVJI5eITOBKEHqRtzDa', data: '2026-05-15', quantidadeRaw: 1, fornecedor: 'usuÃ¡rio lanÃ§ador', motorista: 'COM DE COMB V8 LTDA - 10.533.213/0001-32' },
    { id: '6yFtDcRUOMcVLDSKWtHc', data: '2026-06-30', quantidadeRaw: 1, fornecedor: 'usuÃ¡rio lanÃ§ador', motorista: 'COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43' },
  ];
  assert.deepEqual(rawFuel.map(fuelReportSupplier), [
    'COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43',
    'COM DE COMB V8 LTDA - 10.533.213/0001-32',
    'COML BUFFON COMB E TRANSPS LTDA - 93.489.243/0084-43',
  ]);
  const legacyFuel = rawFuel.map((item) => ({ ...item, fornecedor: fuelReportSupplier(item) }));
  const legacyMaintenance = legacyFuel.map((item, index) => ({ id: `legacy-maintenance-${index}`, data: item.data, categoria: 'ABASTECIMENTO EXTERNO', fornecedor: item.fornecedor }));
  const legacyResult = summarizeInternalFuel(legacyFuel, legacyMaintenance);
  assert.equal(legacyResult.externos, 3);
  assert.equal(legacyResult.internos, 0);

  const maintenance = [{ id: 'only-one', data: '2026-02-11', categoria: 'ABASTECIMENTO EXTERNO', fornecedor: 'Buffon Ltda - 93.489.243/0084-43' }];
  const fuel = [
    { id: 'first', data: '2026-02-11', quantidadeRaw: 1, fornecedor: 'Buffon Ltda - 93.489.243/0084-43' },
    { id: 'second', data: '2026-02-11', quantidadeRaw: 1, fornecedor: 'Buffon Ltda - 93.489.243/0084-43' },
    { id: 'unmatched', data: '2026-02-12', quantidadeRaw: 1, fornecedor: 'Outro fornecedor' },
  ];
  const result = summarizeInternalFuel(fuel, maintenance);
  assert.equal(result.externos, 1);
  assert.equal(result.internos, 2);
  assert.equal(result.itens.some((item) => item.id === 'unmatched'), true);
  assert.equal(normalizeSupplier('Coml Buffon Comb e Transps Ltda - 93.489.243/0084-43'), 'COML BUFFON COMB E TRANSPS LTDA');
  assert.equal(extractCnpj('Coml Buffon - 93.489.243/0084-43'), '93489243008443');
  assert.equal(normalizeCalendarDate('2026-02-11T23:59:59-03:00'), '2026-02-11');
  assert.equal(matchExternalFuelToMaintenance({ id: 'raw-one', data: '2026-02-13', quantidadeRaw: 1, fornecedor: 'Sem manutenção' }, maintenance).matched, false);
});

test('sanitização remove controles e elimina cabeçalho duplicado preservando Unicode válido', () => {
  assert.equal(sanitizePdfText('VEÍCULO: JBJ-4J22 — JBJ-4J22'), 'VEÍCULO: JBJ-4J22');
  assert.equal(sanitizePdfText('VEÍCULOS\u0007 E FINANCEIRO — Nº 1º, ç, á'), 'VEÍCULOS E FINANCEIRO — Nº 1º, ç, á');
});
test('remove o caractere ERP U+FFFE na camada de apresentação e preserva português', () => {
  const controle = '\uFFFE';
  assert.equal(controle.codePointAt(0), 0xFFFE);
  assert.equal('MANUTENÇÃO DE VEÍCULOS￾FINANCEIRO'.indexOf(controle), 22);
  assert.equal(sanitizeErpPresentationText(`MANUTENÇÃO DE VEÍCULOS${controle}FINANCEIRO`), 'MANUTENÇÃO DE VEÍCULOS FINANCEIRO');
  assert.equal(sanitizeErpPresentationText('FONTOURA XAVIER Nº 122/2024'), 'FONTOURA XAVIER Nº 122/2024');
});
test('ERP U+FFFE is reported and removed without ASCII-folding valid text', () => {
  const controle = String.fromCodePoint(0xFFFE);
  const input = `MANUTEN${String.fromCodePoint(0x00C7, 0x00C3)}O DE VE${String.fromCodePoint(0x00CD)}CULOS${controle}FINANCEIRO`;
  assert.equal(controle.codePointAt(0), 0xFFFE);
  assert.equal(input.indexOf(controle), 22);
  assert.equal(sanitizeErpPresentationText(input), `MANUTEN${String.fromCodePoint(0x00C7, 0x00C3)}O DE VE${String.fromCodePoint(0x00CD)}CULOS FINANCEIRO`);
  assert.equal(sanitizeErpPresentationText(`FONTOURA XAVIER N${String.fromCodePoint(0x00BA)} 122/2024`), `FONTOURA XAVIER N${String.fromCodePoint(0x00BA)} 122/2024`);
  assert.equal(sanitizeErpPresentationText('COMPRA DE MERCADORIAS/PEÇAS - VEÍCULOS'), 'COMPRA DE MERCADORIAS/PEÇAS - VEÍCULOS');
});
test('cabeçalho do veículo não repete a placa quando a descrição é igual', () => {
  assert.equal(formatVehicleReportHeader('JBJ-4J22', 'JBJ-4J22'), 'Veículo: JBJ-4J22');
  assert.equal(formatVehicleReportHeader('JBJ-4J22', 'CAMINHÃO MUNCK'), 'Veículo: JBJ-4J22 — CAMINHÃO MUNCK');
});
test('data Q47 é compactada sem aplicar conversão de timezone', () => {
  assert.equal(formatReportDate('2025-04-08T00:00:00'), '08/04/2025');
  assert.equal(formatReportDate('2025-04-08T23:59:59-03:00'), '08/04/2025');
});
