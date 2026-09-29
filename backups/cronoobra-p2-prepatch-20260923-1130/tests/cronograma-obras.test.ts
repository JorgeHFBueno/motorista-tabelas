import test from 'node:test';
import assert from 'node:assert/strict';
import { CRONOGRAMA_2026_RAW } from '../src/features/cronograma-obras/data/cronograma2026.raw';
import { assessDataQuality, buildWorkloads, consolidateAllocation, CRONOGRAMA_2026, filterObras, normalizeObra, todayPosition } from '../src/features/cronograma-obras/domain/cronograma';

test('transforma as 35 linhas reais em 48 semanas sem inventar datas', () => {
  assert.equal(CRONOGRAMA_2026.length, 35);
  const fontoura = CRONOGRAMA_2026.find((obra) => obra.local === 'FONTOURA XAVIER 98m');
  assert.ok(fontoura);
  assert.equal(fontoura.allocations.length, 12);
  assert.deepEqual(fontoura.allocations.find((item) => item.weekIndex === 5), { weekIndex: 5, monthIndex: 1, weekOfMonth: 2, days: 3 });
  assert.ok(CRONOGRAMA_2026.every((obra) => obra.allocations.every((item) => item.weekIndex >= 0 && item.weekIndex < 48)));
});

test('consolida semanas contínuas respeitando a fronteira dos meses', () => {
  const obra = CRONOGRAMA_2026.find((item) => item.local === 'FONTOURA XAVIER 96m');
  assert.ok(obra);
  assert.deepEqual(consolidateAllocation(obra).slice(0, 2), ['JAN · Sem 2–4', 'FEV · Sem 1–2']);
  assert.ok(consolidateAllocation(obra).includes('JUL · Sem 1–3'));
});

test('calcula carga semanal, disponibilidade e conflitos por mestre', () => {
  const workloads = buildWorkloads(CRONOGRAMA_2026);
  const dilamar = workloads.find((item) => item.mestre === 'DILAMAR');
  assert.ok(dilamar);
  assert.ok(dilamar.occupiedWeeks > 0);
  assert.equal(dilamar.freeWeeks, 48 - dilamar.occupiedWeeks);
  assert.ok(dilamar.conflictWeeks > 0);
  assert.ok(dilamar.weekly.some((week) => week.conflict && week.obras.length > 1));
});

test('filtros combinam busca, empresa, mestre, status e período', () => {
  const results = filterObras(CRONOGRAMA_2026, { search: 'passa sete', status: 'EM ANDAMENTO', empresa: 'ARTEBASE', mestre: 'EVERALDO', period: '12-23' });
  assert.equal(results.length, 1);
  assert.equal(results[0].contrato, '059/2025');
  assert.equal(filterObras(CRONOGRAMA_2026, { search: '043/2026', status: '', empresa: '', mestre: '', period: 'year' })[0].local, 'SANTO AUGUSTO');
});

test('qualidade preserva erros, ausências, percentuais acima de 100 e aliases', () => {
  const santoAugusto = CRONOGRAMA_2026_RAW.find((obra) => obra.local === 'SANTO AUGUSTO');
  const corpoEAlma = CRONOGRAMA_2026_RAW.find((obra) => obra.local === 'CORPO E ALMA');
  const carlosGomes = CRONOGRAMA_2026_RAW.find((obra) => obra.local === 'CARLOS GOMES');
  const sobradinho = CRONOGRAMA_2026_RAW.find((obra) => obra.local === 'SOBRADINHO I');
  assert.ok(santoAugusto && corpoEAlma && carlosGomes && sobradinho);
  assert.ok(assessDataQuality(santoAugusto).some((issue) => issue.code === 'INVALID_PROGRESS'));
  assert.ok(assessDataQuality(corpoEAlma).some((issue) => issue.code === 'PROGRESS_OVER_100'));
  assert.ok(assessDataQuality(carlosGomes).some((issue) => issue.code === 'MISSING_PREV'));
  assert.ok(assessDataQuality(sobradinho).some((issue) => issue.code === 'POSSIBLE_MASTER_ALIAS'));
  assert.equal(normalizeObra(santoAugusto).progressRaw, '#DIV/0!');
  assert.equal(normalizeObra(santoAugusto).progressPercent, null);
});

test('marcador de hoje só aparece no ano do cronograma', () => {
  assert.equal(todayPosition(new Date(2025, 8, 22)), null);
  const september = todayPosition(new Date(2026, 8, 22));
  assert.ok(september !== null && september >= 32 && september < 36);
});
