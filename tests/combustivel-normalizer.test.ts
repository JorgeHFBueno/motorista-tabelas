import assert from 'node:assert/strict';
import test from 'node:test';
import { horasFromX10, litrosFromX10, normalizarMovimentoCombustivel, reaisFromCentavos } from '../src/services/combustivel-normalizer.ts';

const base = {
  schemaVersion: 2, tipo: 'saida', data: new Date(), quantidadeAbastecida: 873,
  valorAbastecimento: 50634, montanteAntes: 492539, montanteAposMovimento: 493412,
  estoqueAntes: 50000, estoqueAposMovimento: 49127, arla: 0, motivo: 'Uso',
  modalidadeAbastecimento: 'direto', origemPreco: { movimentoId: 'm1', lote: '1006', precoLitro: 580 },
  frentista: { uid: 'f', nomeSnapshot: 'Frentista' }, paraQuem: { uid: 'p', nomeSnapshot: 'Operador' },
  autorLancamento: { uid: 'a', nomeSnapshot: 'Autor' }, obra: { uid: 'o', nomeSnapshot: 'Obra', localSnapshot: null },
};

test('normaliza saída V2 de veículo com aliases compatíveis', () => {
  const result = normalizarMovimentoCombustivel({ ...base, itemFrota: { uid: 'v1', tipo: 'veiculo', identificadorSnapshot: 'ABC1D23', km: 125430 } }, 's1');
  assert.equal(result.schema, 'saida-v2'); assert.equal(result.isFuelOutput, true);
  assert.equal(result.qa, 873); assert.equal(result.li, 492539); assert.equal(result.lf, 493412);
  assert.equal(result.placa, 'ABC1D23'); assert.equal(result.km, 125430); assert.equal(result.horimetro, undefined);
  assert.equal(result.motorista, 'Frentista'); assert.equal(result.para_quem, 'Operador');
});

test('normaliza máquina e galão sem transformar horímetro em KM', () => {
  const result = normalizarMovimentoCombustivel({ ...base, modalidadeAbastecimento: 'galao', itemFrota: { uid: 'm1', tipo: 'maquina', identificadorSnapshot: 'CARREGADEIRA CASE', horimetro: 8752 } });
  assert.equal(result.modalidadeAbastecimento, 'galao'); assert.equal(result.itemFrotaTipo, 'maquina');
  assert.equal(result.identificadorSnapshot, 'CARREGADEIRA CASE'); assert.equal(result.horimetro, 8752); assert.equal(result.km, null);
});

test('preserva entrada V2 e legado sem inferência por magnitude', () => {
  assert.equal(normalizarMovimentoCombustivel({ schemaVersion: 2, tipo: 'entrada', qa: 873 }).isFuelOutput, false);
  const legacy = normalizarMovimentoCombustivel({ placa: 'ABC', tipoPlaca: true, km: 125430, qa: 873, semKm: 'Galao' });
  assert.equal(legacy.schema, 'legado'); assert.equal(legacy.placa, 'ABC'); assert.equal(legacy.semKm, 'Galao'); assert.equal(legacy.isFuelOutput, true);
});

test('unidades V2 permanecem separadas', () => {
  assert.equal(litrosFromX10(873), 87.3); assert.equal(reaisFromCentavos(50634), 506.34);
  assert.equal(125430, 125430); assert.equal(horasFromX10(8752), 875.2);
});
