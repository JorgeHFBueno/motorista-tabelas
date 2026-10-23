import assert from 'node:assert/strict';
import test from 'node:test';
import { itemFrotaFromV2, obraFromV2, obraSelecionavel, pessoaFromFuncionario, type ItemFrotaV2, type ObraV2 } from '../src/utils/cadastrosV2.ts';
import {
  ajusteRestante,
  buildSaidaV2,
  encadearLinhas,
  planejarLancamento,
  precoFromEntrada,
  precoNaData,
  registroLedgerFrom,
  validarLote,
  type LinhaLancamento,
  type PlanoLancamento,
  type RegistroLedger,
} from '../src/utils/combustivelLancamento.ts';

const d = (iso: string) => new Date(`${iso}-03:00`);
const saida = (id: string, iso: string, antes: number, q: number, estoque: number, motivo = 'Uso') =>
  registroLedgerFrom(id, { schemaVersion: 2, tipo: 'saida', data: d(iso), motivo, quantidadeAbastecida: q, montanteAntes: antes, montanteAposMovimento: antes + q, estoqueAntes: estoque, estoqueAposMovimento: estoque - q, valorAbastecimento: q * 58 }) as RegistroLedger;
const bomba = { montanteAtual: 2000, estoqueAtual: 9000 };

const item = itemFrotaFromV2('vv1', { schemaVersion: 2, cadastro: { ativo: true }, identificacao: { categoria: 'PLACA', identificador: 'ABC1D23', nome: 'Caminhão 1 ' }, operacional: { quilometragemUltima: 1000 } }) as ItemFrotaV2;
const maquina = itemFrotaFromV2('vm1', { schemaVersion: 2, cadastro: { ativo: true }, identificacao: { categoria: 'EXTRA', identificador: 'CARREG', nome: 'Carregadeira' } }) as ItemFrotaV2;
const obra = obraFromV2('ob1', { codObra: 89, siglaObra: 'LEDUR', nomeObra: 'FABRICA', local: 'Palmeira das Missões - RS', status: 'EM ANDAMENTO' }) as ObraV2;
const linha = (overrides: Partial<LinhaLancamento> = {}): LinhaLancamento => ({
  data: d('2026-10-10T10:00'), quantidade: 100, arla: 0, modalidade: 'direto', item, obra,
  frentista: { uid: 'f1', nome: 'Frentista' }, motoristaOperador: { uid: 'm1', nome: 'Motorista' }, motivo: 'Uso', observacao: '',
  medidor: { tipo: 'quilometragem', valor: 1200 }, ...overrides,
});

test('cadastros V2: snapshot do item e da obra iguais ao cadastro; obra finalizada e pessoa inativa ficam fora', () => {
  assert.equal(item.nome, 'Caminhão 1 ');
  assert.equal(itemFrotaFromV2('x', { identificacao: { categoria: 'PLACA', identificador: 'A', nome: 'A' } }), null);
  assert.equal(obraSelecionavel(obraFromV2('o2', { codObra: 1, siglaObra: 'X', nomeObra: 'Y', local: 'Z', status: 'FINALIZADA' }) as ObraV2), false);
  assert.equal(pessoaFromFuncionario('u', { nome: 'Fulano', ativo: false }), null);
  assert.deepEqual(pessoaFromFuncionario('u', { nome: 'Fulano', ativo: true, perfis: { frentista: true, adm2: 'sim' } })?.perfis, { frentista: true, adm2: false });
});

test('data depois do último registro é lançamento atual, a partir da bomba', () => {
  const ultimo = saida('s1', '2026-10-20T08:00', 1900, 100, 9100);
  const plano = planejarLancamento({ data: d('2026-10-21T08:00'), ultimo, antes: [ultimo], depois: [], bomba });
  assert.deepEqual(plano, { modo: 'atual', montantePartida: 2000, estoquePartida: 9000, desde: ultimo.data });
});

test('data entre dois registros mede o furo pelo salto do montante; entrada sem montante é pulada', () => {
  const anterior = saida('s1', '2026-10-09T08:00', 1000, 100, 9500);
  const entrada = registroLedgerFrom('e1', { schemaVersion: 2, tipo: 'entrada', data: d('2026-10-09T09:00'), litrosComprados: 5000, montanteSnapshot: null, estoqueAntes: 9400, estoqueAposMovimento: 14400 }) as RegistroLedger;
  const seguinte = saida('s2', '2026-10-11T08:00', 1450, 50, 14400);
  const plano = planejarLancamento({ data: d('2026-10-10T10:00'), ultimo: seguinte, antes: [entrada, anterior], depois: [seguinte], bomba });
  assert.ok(!('erro' in plano) && plano.modo === 'correcao');
  assert.equal(plano.furo, 350);
  assert.equal(plano.montantePartida, 1100);
  assert.equal(plano.estoquePartida, 14400);
  assert.equal(plano.ajuste, null);
  assert.equal(plano.desde.getTime(), entrada.data.getTime());
});

test('furo coberto pelo ajuste automático parte do próprio ajuste', () => {
  const anterior = saida('s1', '2026-10-09T08:00', 1000, 100, 9500);
  const ajuste = saida('aj', '2026-10-11T07:59', 1100, 350, 9400, 'Ajuste de montante');
  const plano = planejarLancamento({ data: d('2026-10-10T10:00'), ultimo: ajuste, antes: [anterior], depois: [ajuste], bomba });
  assert.ok(!('erro' in plano) && plano.modo === 'correcao');
  assert.equal(plano.ajuste?.id, 'aj');
  assert.equal(plano.furo, 350);
  assert.equal(plano.estoquePartida, 9400);
});

test('sem salto no montante não há furo para corrigir', () => {
  const anterior = saida('s1', '2026-10-09T08:00', 1000, 100, 9500);
  const seguinte = saida('s2', '2026-10-11T08:00', 1100, 50, 9400);
  assert.deepEqual(planejarLancamento({ data: d('2026-10-10T10:00'), ultimo: seguinte, antes: [anterior], depois: [seguinte], bomba }), { erro: 'Não há furo nesse ponto: o montante do registro seguinte continua o do anterior.' });
});

test('vários abastecimentos num furo: montante e estoque encadeados pela data, soma limitada ao furo', () => {
  const anterior = saida('s1', '2026-10-09T08:00', 1000, 100, 9500);
  const seguinte = saida('s2', '2026-10-12T08:00', 1450, 50, 9400);
  const plano = planejarLancamento({ data: d('2026-10-10T10:00'), ultimo: seguinte, antes: [anterior], depois: [seguinte], bomba }) as PlanoLancamento;
  const linhas = [linha({ data: d('2026-10-11T09:00'), quantidade: 150 }), linha({ data: d('2026-10-10T09:00'), quantidade: 200 })];
  const cadeia = encadearLinhas(linhas, plano.montantePartida, plano.estoquePartida);
  assert.deepEqual(cadeia.map((c) => [c.linha.quantidade, c.montanteAntes, c.montanteAposMovimento, c.estoqueAntes, c.estoqueAposMovimento]), [[200, 1100, 1300, 9400, 9200], [150, 1300, 1450, 9200, 9050]]);
  assert.deepEqual(validarLote(plano, linhas, d('2026-10-23T12:00'), 5000), []);
  assert.ok(validarLote(plano, [...linhas, linha({ quantidade: 1 })], d('2026-10-23T12:00'), 5000).includes('A soma dos abastecimentos passa do furo.'));
  assert.ok(validarLote(plano, [linha({ data: d('2026-10-12T09:00') })], d('2026-10-23T12:00'), 5000)[0].includes('entre o registro anterior e o seguinte'));
});

test('validação do medidor: galão sem medidor, máquina com horímetro, lançamento atual sem regressão', () => {
  const atual: PlanoLancamento = { modo: 'atual', montantePartida: 2000, estoquePartida: 9000, desde: d('2026-10-09T08:00') };
  const agora = d('2026-10-23T12:00');
  assert.deepEqual(validarLote(atual, [linha({ modalidade: 'galao', medidor: null })], agora, 5000), []);
  assert.equal(validarLote(atual, [linha({ modalidade: 'galao' })], agora, 5000).length, 1);
  assert.equal(validarLote(atual, [linha({ item: maquina, medidor: { tipo: 'quilometragem', valor: 5 } })], agora, 5000).length, 1);
  assert.deepEqual(validarLote(atual, [linha({ item: maquina, medidor: { tipo: 'horimetro', valor: 8752 } })], agora, 5000), []);
  assert.deepEqual(validarLote(atual, [linha({ medidor: 'sem-odometro' })], agora, 5000), []);
  assert.equal(validarLote(atual, [linha({ medidor: { tipo: 'quilometragem', valor: 999 } })], agora, 5000).length, 1);
  assert.equal(validarLote(atual, [linha({ data: d('2026-10-24T08:00') })], agora, 5000).length, 1);
});

test('saída V2 no formato do contrato, com snapshots e preço da entrada', () => {
  const preco = precoFromEntrada({ schemaVersion: 2, data: d('2026-10-01T08:00'), preco: 2900000, litrosComprados: 50000, precoLitro: 580, lote: '1006' }, 'e1');
  const payload = buildSaidaV2({ linha: linha(), encadeado: { montanteAntes: 1100, montanteAposMovimento: 1200, estoqueAntes: 9400, estoqueAposMovimento: 9300 }, preco, criadoPor: { uid: 'adm', nome: 'Responsável' }, dataFirestore: 'TS' });
  assert.deepEqual(payload, {
    schemaVersion: 2, tipo: 'saida', data: 'TS', modalidadeAbastecimento: 'direto', quantidadeAbastecida: 100, valorAbastecimento: 5800,
    origemPreco: { movimentoId: 'e1', lote: '1006', precoLitro: 580 }, montanteAntes: 1100, montanteAposMovimento: 1200, estoqueAntes: 9400, estoqueAposMovimento: 9300,
    frentista: { uid: 'f1', nome: 'Frentista' }, motoristaOperador: { uid: 'm1', nome: 'Motorista' }, criadoPor: { uid: 'adm', nome: 'Responsável' },
    item_frota_id: 'vv1', item_frota_snapshot: { categoria: 'PLACA', identificador: 'ABC1D23', nome: 'Caminhão 1 ' },
    id_obra: 'ob1', id_obra_snap: { codObra: 89, siglaObra: 'LEDUR', nomeObra: 'FABRICA', local: 'Palmeira das Missões - RS' },
    motivo: 'Uso', arla: 0, quilometragem: 1200,
  });
  const semPreco = buildSaidaV2({ linha: linha({ medidor: 'sem-odometro', motoristaOperador: { uid: null, nome: ' Terceiro ' } }), encadeado: { montanteAntes: 0, montanteAposMovimento: 100, estoqueAntes: 100, estoqueAposMovimento: 0 }, preco: null, criadoPor: { uid: 'adm', nome: 'R' }, dataFirestore: 'TS' });
  assert.equal(semPreco.semKm, 'Sem Odometro');
  assert.equal(semPreco.valorAbastecimento, 0);
  assert.deepEqual(semPreco.motoristaOperador, { uid: null, nome: 'Terceiro' });
  assert.ok(!('quilometragem' in semPreco));
});

test('preço da correção é o da entrada mais recente até a data', () => {
  const p = (iso: string, precoLitro: number) => ({ movimentoId: iso, lote: null, preco: precoLitro * 100, litrosComprados: 1000, precoLitro, data: d(iso) });
  assert.equal(precoNaData([p('2026-10-15T08:00', 600), p('2026-09-01T08:00', 550), p('2026-10-01T08:00', 580)], d('2026-10-10T10:00'))?.precoLitro, 580);
  assert.equal(precoNaData([p('2026-10-15T08:00', 600)], d('2026-10-10T10:00')), null);
});

test('ajuste parcialmente explicado continua com a diferença; explicado por inteiro é apagado', () => {
  const ultimo = { montanteAntes: 1100, montanteAposMovimento: 1300, estoqueAntes: 9400, estoqueAposMovimento: 9200 };
  assert.deepEqual(ajusteRestante({ quantidadeAbastecida: 350, valorAbastecimento: 3500 }, 200, ultimo), { quantidadeAbastecida: 150, valorAbastecimento: 1500, montanteAntes: 1300, estoqueAntes: 9200 });
  assert.equal(ajusteRestante({ quantidadeAbastecida: 350, valorAbastecimento: 3500 }, 350, ultimo), null);
});
