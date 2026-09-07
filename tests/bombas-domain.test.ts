import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateStockAfterEntry,
  calculateUnitPrice,
  calcularCustoAbastecimentoCentavos,
  centavosParaReais,
  applyDieselEntryToPump,
  buildDieselEntryRecord,
  buildDieselLatestEntrySnapshot,
  formatFlutterFuelDocumentId,
  getPumpIndicators,
  litrosParaUnidadeBomba,
  normalizeFuelMovement,
  parsePtBrNumber,
  reaisParaCentavos,
  unidadeBombaParaLitros,
  suggestBatch,
} from '../src/utils/bombasDomain';

test('converte dinheiro explicitamente entre reais e centavos', () => {
  assert.equal(reaisParaCentavos(29_000), 2_900_000);
  assert.equal(reaisParaCentavos(5.8), 580);
  assert.equal(reaisParaCentavos(5.86), 586);
  assert.equal(centavosParaReais(2_900_000), 29_000);
  assert.equal(centavosParaReais(580), 5.8);
});

test('calcula custo absoluto pela compra e não pelo snapshot', () => {
  assert.equal(calcularCustoAbastecimentoCentavos(873, 2_900_000, 50_000), 50_634);
  assert.equal(centavosParaReais(50_634), 506.34);
  assert.equal(calcularCustoAbastecimentoCentavos(30_000, 2_900_000, 49_500), 1_757_576);
  assert.throws(() => calcularCustoAbastecimentoCentavos(1, 100, 0));
  assert.throws(() => calcularCustoAbastecimentoCentavos(1.5, 100, 10));
});

test('cria ultimaEntrada v2 com dinheiro em centavos', () => {
  const snapshot = buildDieselLatestEntrySnapshot({
    movimentoId: 'movement-1', data: new Date(), litrosComprados: 50_000,
    totalPrice: 29_000, unitPrice: 5.8, batch: ' LT-2026-09 ',
    responsavelId: 'adm2@example.com', responsavelNome: 'Operador',
  });
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.preco, 2_900_000);
  assert.equal(snapshot.precoLitro, 580);
  assert.equal(snapshot.litrosComprados, 50_000);
});

test('interpreta valores pt-BR sem armazenar formatação', () => {
  assert.equal(parsePtBrNumber('R$ 20.000,00'), 20_000);
  assert.equal(parsePtBrNumber('5.000'), 5_000);
  assert.equal(parsePtBrNumber('4,25'), 4.25);
  assert.ok(Number.isNaN(parsePtBrNumber('')));
});

test('converte litros para a unidade em décimos usada pelo Flutter', () => {
  assert.equal(litrosParaUnidadeBomba(5_000), 50_000);
  assert.equal(litrosParaUnidadeBomba(1.5), 15);
  assert.equal(litrosParaUnidadeBomba(12.3), 123);
  assert.equal(unidadeBombaParaLitros(34_000), 3_400);
  assert.equal(unidadeBombaParaLitros(50_000), 5_000);
  assert.equal(unidadeBombaParaLitros(15), 1.5);
});

test('calcula preço por litro e protege divisão inválida', () => {
  assert.equal(calculateUnitPrice(20_000, 5_000), 4);
  assert.equal(calculateUnitPrice(29_000, unidadeBombaParaLitros(50_000)!), 5.8);
  assert.equal(calculateUnitPrice(20_000, 0), null);
  assert.equal(calculateUnitPrice(Number.NaN, 5_000), null);
});

test('entrada aumenta estoque armazenado sem perder a precisão do Flutter', () => {
  assert.equal(calculateStockAfterEntry(34_000, 50_000), 84_000);
  assert.ok(Number.isNaN(calculateStockAfterEntry(34_000, 0)));
});

test('card VI usa montanteAtual e card VII usa estoqueAtual como conceitos distintos', () => {
  assert.deepEqual(
    getPumpIndicators({ montanteAtual: 123_500, estoqueAtual: 34_000 }),
    { montanteLiters: 12_350, stockLiters: 3_400 },
  );
});

test('entrada de 1.000 L aumenta só o estoque e preserva o montante', () => {
  const before = { montanteAtual: 123_500, estoqueAtual: 34_000 };
  const after = applyDieselEntryToPump(before, litrosParaUnidadeBomba(1_000));

  assert.deepEqual(after, { montanteAtual: 123_500, estoqueAtual: 44_000 });
  assert.equal(after.montanteAtual, before.montanteAtual);
  assert.deepEqual(getPumpIndicators(after), {
    montanteLiters: 12_350,
    stockLiters: 4_400,
  });
});

test('gera lote sugerido e ID no padrão exato do Flutter', () => {
  assert.equal(suggestBatch('2026-08-15'), 'LT-2026-08');
  const date = new Date(2026, 7, 15, 9, 7, 4);
  assert.equal(formatFlutterFuelDocumentId(date, 'uid-123'), '15_08_26 - 0907-04 uid-123');
});

test('mapeia o novo schema e conserva somente a compatibilidade necessária ao histórico Flutter', () => {
  const date = new Date(2026, 7, 15, 9, 7, 4);
  const record = buildDieselEntryRecord({
    date,
    bombaId: 'diesel_patio',
    responsavelId: 'jorge@example.com',
    responsavelNome: 'JORGE H. F. BUENO',
    estoqueAntes: 34_000,
    estoqueAposMovimento: 84_000,
    montanteSnapshot: 12_345,
    litrosComprados: 50_000,
    totalPrice: 20_000,
    unitPrice: 4,
    batch: ' LT-2026-08 ',
  });

  assert.deepEqual(record, {
    schemaVersion: 2,
    data: date,
    tipo: 'entrada',
    bombaId: 'diesel_patio',
    litrosComprados: 50_000,
    preco: 2_000_000,
    precoLitro: 400,
    lote: 'LT-2026-08',
    responsavel: { id: 'jorge@example.com', nome: 'JORGE H. F. BUENO' },
    estoqueAntes: 34_000,
    estoqueAposMovimento: 84_000,
    montanteSnapshot: 12_345,
  });
  for (const field of ['litrosComprados', 'preco', 'precoLitro', 'estoqueAntes', 'estoqueAposMovimento', 'montanteSnapshot']) {
    assert.equal(Number.isInteger(record[field as keyof typeof record]), true, field);
  }

  for (const field of ['qa', 'diesel', 'lf', 'motorista', 'id_motorista', 'id_motorista_snap', 'motivo', 'obra', 'precoTotal', 'precoPorLitro']) {
    assert.equal(field in record, false, `campo legado ${field}`);
  }
});

test('normaliza uma entrada nova para o histórico e prioriza os campos canônicos', () => {
  const movement = normalizeFuelMovement({
    id: 'new-entry',
    data: new Date(2026, 8, 4),
    schemaVersion: 2,
    tipo: 'entrada',
    litrosComprados: 50_000,
    qa: 1,
    preco: 2_000_000,
    precoTotal: 2,
    precoLitro: 400,
    precoPorLitro: 3,
    responsavel: { id: 'jorge@example.com', nome: 'JORGE H. F. BUENO' },
    estoqueAposMovimento: 84_000,
    montanteSnapshot: 491_264,
    lote: 'LT-2026-09',
  });

  assert.equal(movement.tipo, 'entrada');
  assert.equal(movement.litrosComprados, 50_000);
  assert.equal(movement.preco, 20_000);
  assert.equal(movement.precoLitro, 4);
  assert.deepEqual(movement.responsavel, { id: 'jorge@example.com', nome: 'JORGE H. F. BUENO' });
  assert.equal(movement.estoqueAposMovimento, 84_000);
  assert.equal(movement.montanteSnapshot, 491_264);
});

test('converte dinheiro do schema v2 para exibição', () => {
  const movement = normalizeFuelMovement({
    id: 'v2-entry', data: new Date(), schemaVersion: 2, tipo: 'entrada',
    litrosComprados: 50_000, preco: 2_900_000, precoLitro: 580,
  });
  assert.equal(movement.preco, 29_000);
  assert.equal(movement.precoLitro, 5.8);
});

test('preserva dinheiro histórico sem schemaVersion', () => {
  const movement = normalizeFuelMovement({
    id: 'intermediate-entry', data: new Date(), tipo: 'entrada',
    litrosComprados: 50_000, preco: 29_000, precoLitro: 5.8,
  });
  assert.equal(movement.preco, 29_000);
  assert.equal(movement.precoLitro, 5.8);
});

test('normaliza uma entrada legada sem removê-la do histórico', () => {
  const movement = normalizeFuelMovement({
    id: 'legacy-entry',
    data: new Date(2026, 7, 15),
    motivo: 'Abastecimento de Diesel',
    qa: 50_000,
    precoTotal: 20_000,
    precoPorLitro: 4,
    motorista: 'JORGE H. F. BUENO',
  });

  assert.deepEqual(
    {
      tipo: movement.tipo,
      litrosComprados: movement.litrosComprados,
      preco: movement.preco,
      precoLitro: movement.precoLitro,
      responsavel: movement.responsavel,
    },
    {
      tipo: 'entrada',
      litrosComprados: 50_000,
      preco: 20_000,
      precoLitro: 4,
      responsavel: { id: '', nome: 'JORGE H. F. BUENO' },
    },
  );
});
