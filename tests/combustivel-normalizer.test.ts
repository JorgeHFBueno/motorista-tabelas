import assert from 'node:assert/strict';
import test from 'node:test';
import { horasFromX10, litrosFromX10, normalizarMovimentoCombustivel, reaisFromCentavos } from '../src/services/combustivel-normalizer.ts';
import { formatarHorimetroX10, formatarKm, formatarLitrosX10, formatarMoedaCentavos, parseDigitosX10 } from '../src/utils/formatters.ts';

const base = {
  schemaVersion: 2, tipo: 'saida', data: new Date(), quantidadeAbastecida: 873,
  valorAbastecimento: 50634, montanteAntes: 492539, montanteAposMovimento: 493412,
  estoqueAntes: 50000, estoqueAposMovimento: 49127, arla: 0, motivo: 'Uso',
  modalidadeAbastecimento: 'direto', origemPreco: { movimentoId: 'm1', lote: '1006', precoLitro: 580 },
  frentista: { uid: 'f', nomeSnapshot: 'Frentista' }, paraQuem: { uid: 'p', nomeSnapshot: 'Operador' },
  autorLancamento: { uid: 'a', nomeSnapshot: 'Autor' }, obra: { uid: 'o', nomeSnapshot: 'Obra', localSnapshot: null },
};

test('aceita somente dígitos na representação de entrada ×10', () => {
  assert.equal(parseDigitosX10('5'), 5);
  assert.equal(formatarLitrosX10(parseDigitosX10('5')), '0,5 L');
  assert.equal(parseDigitosX10('50'), 50);
  assert.equal(formatarLitrosX10(parseDigitosX10('50')), '5,0 L');
  assert.equal(parseDigitosX10('873'), 873);
  assert.equal(formatarLitrosX10(parseDigitosX10('873')), '87,3 L');
  assert.equal(parseDigitosX10('492539'), 492539);
  assert.equal(formatarLitrosX10(parseDigitosX10('492539')), '49.253,9 L');
  assert.equal(parseDigitosX10('12,3'), 123);
  assert.equal(parseDigitosX10('12.3'), 123);
  assert.equal(parseDigitosX10('abc123'), 123);
});

test('normaliza saída V2 de veículo com aliases compatíveis', () => {
  const result = normalizarMovimentoCombustivel({ ...base, itemFrota: { uid: 'v1', tipo: 'veiculo', identificadorSnapshot: 'ABC1D23', km: 125430 } }, 's1');
  assert.equal(result.schema, 'saida-v2'); assert.equal(result.isFuelOutput, true);
  assert.equal(result.qa, 873); assert.equal(result.li, 492539); assert.equal(result.lf, 493412);
  assert.equal(result.placa, 'ABC1D23'); assert.equal(result.km, 125430); assert.equal(result.horimetro, undefined);
  assert.equal(result.extra, null);
  assert.equal(result.motorista, 'Frentista'); assert.equal(result.para_quem, 'Operador');
});

test('normaliza máquina e galão sem transformar horímetro em KM', () => {
  const result = normalizarMovimentoCombustivel({ ...base, modalidadeAbastecimento: 'galao', itemFrota: { uid: 'm1', tipo: 'maquina', identificadorSnapshot: 'CARREGADEIRA CASE', horimetro: 8752 } });
  assert.equal(result.modalidadeAbastecimento, 'galao'); assert.equal(result.itemFrotaTipo, 'maquina');
  assert.equal(result.identificadorSnapshot, 'CARREGADEIRA CASE'); assert.equal(result.horimetro, 8752); assert.equal(result.km, null);
  assert.equal(result.placa, null); assert.equal(result.extra, 'CARREGADEIRA CASE');
});

test('formata unidades internas para a apresentação pt-BR', () => {
  assert.equal(formatarLitrosX10(873), '87,3 L');
  assert.equal(formatarLitrosX10(492539), '49.253,9 L');
  assert.equal(formatarKm(125430), '125.430');
  assert.equal(formatarHorimetroX10(8752), '875,2 h');
  assert.equal(formatarMoedaCentavos(50634), 'R$ 506,34');
});

test('calcula os três campos do abastecimento em unidade interna', () => {
  const montanteAntes = 492539;
  const quantidadeAbastecida = 873;
  assert.equal(montanteAntes + quantidadeAbastecida, 493412);
  assert.equal(formatarLitrosX10(montanteAntes), '49.253,9 L');
  assert.equal(formatarLitrosX10(quantidadeAbastecida), '87,3 L');
  assert.equal(formatarLitrosX10(montanteAntes + quantidadeAbastecida), '49.341,2 L');
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

test('normaliza os seis formatos simultaneamente sem maps na camada de consumo', () => {
  const entrada = normalizarMovimentoCombustivel({ schemaVersion: 2, tipo: 'entrada', data: new Date(), litrosComprados: 50000, preco: 2900000, precoLitro: 580, lote: '1006', responsavel: { id: 'u', nome: 'Comprador' } }, 'e1');
  const legado = normalizarMovimentoCombustivel({ tipo: 'saida', placa: 'LEG', motorista: 'Motorista', para_quem: 'Pessoa', qa: 10 }, 'l1');
  const veiculo = normalizarMovimentoCombustivel({ ...base, itemFrota: { uid: 'v', tipo: 'veiculo', identificadorSnapshot: 'ABC1D23', km: 125430 } }, 'v1');
  const maquina = normalizarMovimentoCombustivel({ ...base, itemFrota: { uid: 'm', tipo: 'maquina', identificadorSnapshot: 'CASE', horimetro: 8752 } }, 'm1');
  const galaoVeiculo = normalizarMovimentoCombustivel({ ...base, modalidadeAbastecimento: 'galao', itemFrota: { uid: 'v', tipo: 'veiculo', identificadorSnapshot: 'ABC1D23' } }, 'gv');
  const galaoMaquina = normalizarMovimentoCombustivel({ ...base, modalidadeAbastecimento: 'galao', itemFrota: { uid: 'm', tipo: 'maquina', identificadorSnapshot: 'CASE' } }, 'gm');
  assert.deepEqual([entrada.schema, legado.schema, veiculo.schema, maquina.schema, galaoVeiculo.schema, galaoMaquina.schema], ['entrada-v2', 'legado', 'saida-v2', 'saida-v2', 'saida-v2', 'saida-v2']);
  assert.equal(entrada.preco, 2900000); assert.equal(entrada.responsavel, 'Comprador'); assert.equal(maquina.km, null); assert.equal(maquina.horimetro, 8752); assert.equal(galaoVeiculo.identificadorSnapshot, 'ABC1D23'); assert.equal(galaoMaquina.itemFrotaTipo, 'maquina');
});
