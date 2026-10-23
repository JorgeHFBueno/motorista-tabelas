import assert from 'node:assert/strict';
import test from 'node:test';
import { horasFromX10, isSemOdometro, litrosFromX10, normalizarMovimentoCombustivel, reaisFromCentavos } from '../src/services/combustivel-normalizer.ts';
import { formatarHorimetroX10, formatarKm, formatarLitrosX10, formatarMoedaCentavos, parseDigitosX10 } from '../src/utils/formatters.ts';

const contrato = {
  schemaVersion: 2, tipo: 'saida', data: new Date(), quantidadeAbastecida: 4444, valorAbastecimento: 257752,
  montanteAntes: 522417, montanteAposMovimento: 526861, estoqueAntes: 5402, estoqueAposMovimento: 958, arla: 0,
  motivo: 'Buscar Motorista', modalidadeAbastecimento: 'direto', semKm: 'Sem Odometro',
  origemPreco: { movimentoId: 'm1', lote: '1006', precoLitro: 580 },
  criadoPor: { uid: 'c', nome: 'Autor' }, frentista: { uid: 'f', nome: 'Frentista' }, motoristaOperador: { uid: 'p', nome: 'Operador' },
  id_obra: 'o1', id_obra_snap: { codObra: 89, local: 'Palmeira das Missões - RS', nomeObra: 'FABRICA', siglaObra: 'LEDUR' },
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

test('lê a saída V2 do contrato: veículo, máquina e galão', () => {
  const placa = normalizarMovimentoCombustivel({ ...contrato, item_frota_id: 'v1', item_frota_snapshot: { categoria: 'PLACA', identificador: 'ITU-3353', nome: 'Basculante' }, quilometragem: 125430 }, 's1');
  assert.equal(placa.schema, 'saida-v2'); assert.equal(placa.isFuelOutput, true); assert.equal(placa.foraDoContrato, undefined);
  assert.equal(placa.itemFrotaUid, 'v1'); assert.equal(placa.itemFrotaTipo, 'veiculo'); assert.equal(placa.identificadorSnapshot, 'ITU-3353');
  assert.equal(placa.placa, 'ITU-3353'); assert.equal(placa.extra, null); assert.equal(placa.km, 125430);
  assert.equal(placa.frentista, 'Frentista'); assert.equal(placa.motorista, 'Frentista');
  assert.equal(placa.paraQuem, 'Operador'); assert.equal(placa.para_quem, 'Operador'); assert.equal(placa.autorLancamento, 'Autor');
  assert.equal(placa.obraUid, 'o1'); assert.equal(placa.obra, 'FABRICA'); assert.equal(placa.local, 'Palmeira das Missões - RS');
  assert.equal(placa.qa, 4444); assert.equal(placa.li, 522417); assert.equal(placa.lf, 526861);

  const extra = normalizarMovimentoCombustivel({ ...contrato, item_frota_id: 'm1', item_frota_snapshot: { categoria: 'EXTRA', identificador: 'CASE', nome: 'Carregadeira' }, horimetro: 8752 }, 'm1');
  assert.equal(extra.itemFrotaTipo, 'maquina'); assert.equal(extra.extra, 'CASE'); assert.equal(extra.placa, null);
  assert.equal(extra.horimetro, 8752); assert.equal(extra.km, null);

  // Galão also identifies the fleet item that receives the fuel.
  const galao = normalizarMovimentoCombustivel({ ...contrato, modalidadeAbastecimento: 'galao', item_frota_id: 'v1', item_frota_snapshot: { categoria: 'PLACA', identificador: 'ITU-3353', nome: 'Basculante' } }, 'g1');
  assert.equal(galao.modalidadeAbastecimento, 'galao'); assert.equal(galao.itemFrotaTipo, 'veiculo'); assert.equal(galao.placa, 'ITU-3353');
});

test('lê registro migrado do legado com campos nulos', () => {
  const migrado = normalizarMovimentoCombustivel({ ...contrato, migradoDoLegado: true, frentista: { uid: null, nome: 'ERRO' }, item_frota_id: null, item_frota_snapshot: null, id_obra: null, id_obra_snap: { codObra: null, local: null, nomeObra: 'Ainda não havia sido implementado', siglaObra: null }, estoqueAntes: null, estoqueAposMovimento: null }, 'mig');
  assert.equal(migrado.schema, 'saida-v2'); assert.equal(migrado.itemFrotaTipo, null); assert.equal(migrado.placa, null);
  assert.equal(migrado.frentista, 'ERRO'); assert.equal(migrado.obra, 'Ainda não havia sido implementado'); assert.equal(migrado.estoqueAposMovimento, undefined);
});

test('lê a entrada V2 pelo criadoPor do contrato', () => {
  const entrada = normalizarMovimentoCombustivel({ schemaVersion: 2, tipo: 'entrada', litrosComprados: 50000, preco: 2900000, precoLitro: 580, lote: '1006', criadoPor: { uid: 'u', nome: 'Comprador' } }, 'e1');
  assert.equal(entrada.schema, 'entrada-v2'); assert.equal(entrada.isFuelOutput, false);
  assert.equal(entrada.preco, 2900000); assert.equal(entrada.responsavel, 'Comprador');
});

test('fora do contrato V2 fica marcado e nenhum campo antigo é interpretado', () => {
  const legado = normalizarMovimentoCombustivel({ placa: 'ABC', tipoPlaca: true, km: 125430, qa: 873, motorista: 'Fulano', para_quem: 'Beltrano', semKm: 'Sem Odômetro' }, 'l1');
  assert.equal(legado.schema, 'fora-do-contrato'); assert.equal(legado.foraDoContrato, true); assert.equal(legado.isFuelOutput, true);
  assert.equal(legado.motivo, 'Fora do contrato V2');
  for (const campo of ['placa', 'km', 'qa', 'motorista', 'para_quem', 'semKm', 'quantidadeAbastecida']) assert.equal((legado as unknown as Record<string, unknown>)[campo], undefined, campo);
  assert.equal(normalizarMovimentoCombustivel({ schemaVersion: 1, tipo: 'saida', quantidadeAbastecida: 10 }).foraDoContrato, true);
});

test('"sem odômetro" só na grafia do contrato', () => {
  assert.equal(isSemOdometro('Sem Odometro'), true);
  assert.equal(isSemOdometro('Sem Odômetro'), false);
  assert.equal(isSemOdometro('Galao'), false);
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

test('unidades V2 permanecem separadas', () => {
  assert.equal(litrosFromX10(873), 87.3); assert.equal(reaisFromCentavos(50634), 506.34);
  assert.equal(horasFromX10(8752), 875.2);
});
