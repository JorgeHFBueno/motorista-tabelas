import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateStockAfterEntry,
  calculateUnitPrice,
  applyDieselEntryToPump,
  buildDieselEntryRecord,
  formatFlutterFuelDocumentId,
  getPumpIndicators,
  litersToStoredTenths,
  normalizeFuelMovement,
  parsePtBrNumber,
  storedTenthsToLiters,
  suggestBatch,
} from '../src/utils/bombasDomain';

test('interpreta valores pt-BR sem armazenar formatação', () => {
  assert.equal(parsePtBrNumber('R$ 20.000,00'), 20_000);
  assert.equal(parsePtBrNumber('5.000'), 5_000);
  assert.equal(parsePtBrNumber('4,25'), 4.25);
  assert.ok(Number.isNaN(parsePtBrNumber('')));
});

test('converte litros para a unidade em décimos usada pelo Flutter', () => {
  assert.equal(litersToStoredTenths(5_000), 50_000);
  assert.equal(litersToStoredTenths(12.3), 123);
  assert.equal(storedTenthsToLiters(34_000), 3_400);
});

test('calcula preço por litro e protege divisão inválida', () => {
  assert.equal(calculateUnitPrice(20_000, 5_000), 4);
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
  const after = applyDieselEntryToPump(before, litersToStoredTenths(1_000));

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
    motoristaDocumentId: 'jorge@example.com',
    motoristaName: 'JORGE H. F. BUENO',
    authUid: 'uid-123',
    pumpStoredTenths: 12_345,
    entryStoredTenths: 50_000,
    newStock: 84_000,
    totalPrice: 20_000,
    unitPrice: 4,
    batch: ' LT-2026-08 ',
  });

  assert.deepEqual(record, {
    data: date,
    diesel: 84_000,
    lf: 12_345,
    id_motorista: 'jorge@example.com',
    id_motorista_snap: 'JORGE H. F. BUENO',
    litrosComprados: 50_000,
    preco: 20_000,
    precoLitro: 4,
    lote: 'LT-2026-08',
    tipo: 'entrada',
    motorista: 'uid-123',
    qa: 50_000,
  });

  assert.equal('motivo' in record, false);
  assert.equal('obra' in record, false);
  assert.equal('precoTotal' in record, false);
  assert.equal('precoPorLitro' in record, false);
});

test('normaliza uma entrada nova para o histórico e prioriza os campos canônicos', () => {
  const movement = normalizeFuelMovement({
    id: 'new-entry',
    data: new Date(2026, 8, 4),
    tipo: 'entrada',
    litrosComprados: 50_000,
    qa: 1,
    preco: 20_000,
    precoTotal: 2,
    precoLitro: 4,
    precoPorLitro: 3,
    id_motorista: 'jorge@example.com',
    id_motorista_snap: 'JORGE H. F. BUENO',
    motorista: 'uid-123',
    diesel: 84_000,
    lf: 491_264,
    lote: 'LT-2026-09',
  });

  assert.equal(movement.tipo, 'entrada');
  assert.equal(movement.litrosComprados, 50_000);
  assert.equal(movement.preco, 20_000);
  assert.equal(movement.precoLitro, 4);
  assert.equal(movement.responsavel, 'JORGE H. F. BUENO');
  assert.equal(movement.diesel, 84_000);
  assert.equal(movement.lf, 491_264);
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
      responsavel: 'JORGE H. F. BUENO',
    },
  );
});
