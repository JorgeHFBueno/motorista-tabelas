import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { agruparPorVeiculo, custoCombustivel, custoErp, fleetMetrics, kmRodado, leiturasLimpas, mesesDoPeriodo, monthlyMetrics, periodoKpi, placaParaErp, vehicleMetrics, type VehicleData } from '../src/services/frota-analytics.service';
import { custoPorAbastecimento } from '../src/services/vehicle-report-core';

const d = (x: string) => new Date(`${x}T12:00:00`);
const a = { id: 'A', placa: 'ABC-1234', identificador: 'ABC-1234' };
const b = { id: 'B', placa: 'DEF-5678', identificador: 'DEF-5678' };
const todo = periodoKpi(new Date(2026, 9, 31));
const veiculo = (parcial: Partial<VehicleData>): VehicleData => ({ activities: [], fuel: [], maintenance: [], erp: null, ...parcial });

test('período do KPI: de 01/01/2025 até o fim do dia de hoje; meses do eixo com os vazios e recortados', () => {
  assert.equal(todo.start.toDateString(), new Date(2025, 0, 1).toDateString());
  assert.equal(todo.end.getDate(), 31);
  const meses = mesesDoPeriodo({ start: new Date(2026, 4, 10), end: new Date(2026, 6, 5, 23, 59) });
  assert.deepEqual(meses.map((m) => m.label), ['mai/26', 'jun/26', 'jul/26']);
  assert.equal(meses[0].period.start.getDate(), 10);
  assert.equal(meses[2].period.end.getDate(), 5);
});

test('viagens: só saídas do veículo no período (pelo ID ou pela placa)', () => {
  const g = agruparPorVeiculo([{ id: '1', tipo: 'saida', data: d('2026-01-01'), placa: 'abc1234' }, { id: '2', tipo: 'chegada', data: d('2026-01-01'), veiculoId: 'A' }, { id: '3', tipo: 'saida', data: d('2026-02-01'), veiculoId: 'B' }, { id: '4', tipo: 'saida', data: d('2024-12-31'), veiculoId: 'A' }], [], [], [a, b]);
  assert.equal(vehicleMetrics(g.get('A')!, todo).viagens, 1);
  assert.equal(vehicleMetrics(g.get('B')!, todo).viagens, 1);
});

test('KM junta abastecimentos e atividades e ignora a leitura solta em vez de descartar o veículo', () => {
  const fuel = [{ id: 'f1', itemFrotaUid: 'A', data: d('2026-01-01'), km: 1000 }, { id: 'f2', itemFrotaUid: 'A', data: d('2026-01-10'), km: 10_000_0 }, { id: 'f3', itemFrotaUid: 'A', data: d('2026-01-20'), km: 1800 }];
  const activities = [{ id: 'a1', tipo: 'saida', veiculoId: 'A', data: d('2026-01-15'), km: 1500 }, { id: 'a2', tipo: 'chegada', veiculoId: 'A', data: d('2026-01-16'), km: 0 }];
  const data = veiculo({ fuel, activities });
  const { leituras, ignoradas } = leiturasLimpas(data);
  assert.deepEqual(leituras.map((l) => l.km), [1000, 1500, 1800]);
  assert.equal(ignoradas.length, 2); // o salto de 100.000 e o 0
  const km = kmRodado(data, todo);
  assert.equal(km.value, 800);
  assert.equal(km.quality, 'PARTIAL');
  assert.equal(kmRodado(veiculo({ fuel: [fuel[0]] }), todo).value, null);
});

test('KM por mês: cada trecho entra no mês da leitura final e a soma bate com o total', () => {
  const fuel = [{ id: '1', itemFrotaUid: 'A', data: d('2026-01-05'), km: 1000 }, { id: '2', itemFrotaUid: 'A', data: d('2026-01-25'), km: 1300 }, { id: '3', itemFrotaUid: 'A', data: d('2026-02-10'), km: 1500 }];
  const g = agruparPorVeiculo([], fuel, [], [a]);
  const meses = monthlyMetrics([g.get('A')!], { start: new Date(2026, 0, 1), end: new Date(2026, 1, 28, 23, 59) });
  assert.deepEqual(meses.map((m) => [m.label, m.kmRodado]), [['jan/26', 300], ['fev/26', 200]]);
  assert.equal(vehicleMetrics(g.get('A')!, todo).kmRodado, 500);
});

test('custo: diesel interno a R$ 5,90/L, externo já lançado na manutenção não conta duas vezes', () => {
  const fuel = [
    { id: 'interno', itemFrotaUid: 'A', data: d('2026-03-01'), quantidadeAbastecida: 1000 }, // 100 L
    { id: 'externo', itemFrotaUid: 'A', data: d('2026-03-02'), quantidadeAbastecida: 500, fornecedorNomeSnapshot: 'Posto X' },
  ];
  const maintenance = [{ id: 'm1', item_frota_id: 'A', data: d('2026-03-02'), valor: 300, categoriaNomeSnapshot: 'ABASTECIMENTO EXTERNO', fornecedorNomeSnapshot: 'Posto X' }];
  assert.equal(custoCombustivel({ fuel, maintenance }, todo), 590);
  const m = vehicleMetrics(veiculo({ fuel, maintenance }), todo);
  assert.equal(m.custoManutencao, 300);
  assert.equal(m.custoTotal, 890);
  assert.equal(m.custoErp, null);
  assert.equal(m.erpCompleto, false);
});

test('detalhe do veículo usa a mesma regra por abastecimento', () => {
  const valores = custoPorAbastecimento(
    [{ id: 'i', data: '2026-03-01', quantidadeRaw: 1000 }, { id: 'e', data: '2026-03-02', quantidadeRaw: 500, fornecedor: 'Posto X' }],
    [{ id: 'm', data: '2026-03-02', categoria: 'ABASTECIMENTO EXTERNO', fornecedor: 'Posto X' }],
  );
  assert.equal(valores.get('i'), 590);
  assert.equal(valores.get('e'), null);
});

test('ERP: só DESPESA da Query 47 no período; entra no total e no R$/km', () => {
  const erp = [{ data_emissao: '2026-04-10', tipo_movimento: 'DESPESA', valor_rateio: 1000 }, { data_emissao: '2026-04-11', tipo_movimento: 'RECEITA', valor_rateio: 50 }, { data_emissao: '2024-12-01', tipo_movimento: 'DESPESA', valor_rateio: 999 }];
  assert.equal(custoErp({ erp }, todo), 1000);
  assert.equal(custoErp({ erp: null }, todo), null);
  const fuel = [{ id: '1', itemFrotaUid: 'A', data: d('2026-04-01'), km: 1000 }, { id: '2', itemFrotaUid: 'A', data: d('2026-04-20'), km: 1500 }];
  const m = vehicleMetrics(veiculo({ fuel, erp }), todo);
  assert.equal(m.custoTotal, 1000);
  assert.equal(m.rsKm, 2);
  assert.equal(m.erpCompleto, true);
});

test('frota: soma veículos; R$/km só com os veículos que têm KM; ERP parcial é marcado', () => {
  const comKm = vehicleMetrics(veiculo({ fuel: [{ id: '1', itemFrotaUid: 'A', data: d('2026-01-01'), km: 100 }, { id: '2', itemFrotaUid: 'A', data: d('2026-01-02'), km: 200 }], maintenance: [{ id: 'm', item_frota_id: 'A', data: d('2026-01-02'), valor: 500 }], erp: [] }), todo);
  const semKm = vehicleMetrics(veiculo({ maintenance: [{ id: 'n', item_frota_id: 'B', data: d('2026-01-02'), valor: 700 }] }), todo);
  const frota = fleetMetrics([comKm, semKm]);
  assert.equal(frota.kmRodado, 100);
  assert.equal(frota.custoTotal, 1200);
  assert.equal(frota.rsKm, 5);
  assert.equal(frota.kmQuality, 'PARTIAL');
  assert.equal(frota.custoErp, 0);
  assert.equal(frota.erpCompleto, false);
});

test('manutenção e abastecimento ligam pelo ID; a placa em texto só vale sem ID', () => {
  const v = { id: 'auto-id-1', identificador: 'ABC-1234', placa: 'ABC-1234' };
  const g = agruparPorVeiculo([], [
    { id: '1', itemFrotaUid: 'auto-id-1', data: d('2026-01-01'), km: 100 }, { id: '2', itemFrotaUid: 'auto-id-1', data: d('2026-01-02'), km: 200 },
    { id: '3', itemFrotaUid: 'auto-id-2', identificadorSnapshot: 'ABC-1234', data: d('2026-01-03'), km: 900 },
  ], [
    { id: 'novo', item_frota_id: 'auto-id-1', data: d('2026-01-02'), valor: 100 }, { id: 'sem-id', data: d('2026-01-03'), valor: 50 }, { id: 'outro', item_frota_id: 'auto-id-2', data: d('2026-01-04'), valor: 999 },
  ], [v]);
  const m = vehicleMetrics(g.get('auto-id-1')!, todo);
  assert.equal(m.kmRodado, 100);
  assert.equal(m.custoManutencao, 100);
});

test('placa para o ERP: sem hífen, sem sufixo; EXTRA não tem placa', () => {
  assert.equal(placaParaErp('ILW-2A23 - MICRO'), 'ILW2A23');
  assert.equal(placaParaErp('APG-6A02'), 'APG6A02');
  assert.equal(placaParaErp('GERADOR 991'), null);
  assert.equal(placaParaErp(undefined), null);
});

test('a tela não tem mais o período piloto nem "Obras visitadas"', () => {
  const tela = readFileSync('src/components/FrotaAnalyticsPanel.tsx', 'utf8') + readFileSync('src/pages/FrotaAnalyticsPage.tsx', 'utf8');
  assert.doesNotMatch(tela, /piloto|PILOT_|Obras visitadas|31\/08\/2026/i);
});
