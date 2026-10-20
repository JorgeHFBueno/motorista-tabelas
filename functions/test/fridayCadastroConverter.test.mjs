import test from 'node:test';
import assert from 'node:assert/strict';
import { camposDoItem, chaveValida, dataDoFriday, montarCampos, rotulosOficiais, situacaoDoItem, sugerirChave, valorOficial } from '../lib/fridayCadastroConverter.js';

const colunas = [
  { id: 1, titulo: 'Vão (m)', tipo: 'numero' },
  { id: 2, titulo: 'Status', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'Em andamento', cor: '#fdab3d' }, { id: '2', texto: 'Feito', cor: '#00a36c', concluido: true }, { id: '0', texto: '', cor: '#c4c4c4' }] } },
  { id: 3, titulo: 'Responsável', tipo: 'pessoa' },
  { id: 4, titulo: 'Cálculo', tipo: 'formula' },
  { id: 5, titulo: 'Setores', tipo: 'lista', config: { opcoes: [{ id: '7', texto: 'Fábrica' }, { id: '8', texto: 'Montagem' }] } },
];

test('chaves: sugestão a partir do título e validação', () => {
  assert.equal(sugerirChave('Vão (m)'), 'vao_m');
  assert.equal(sugerirChave('2ª etapa'), 'c_2a_etapa');
  assert.equal(sugerirChave('***'), 'campo');
  assert.ok(chaveValida('vao_m'));
  assert.ok(!chaveValida('Vao'));
  assert.ok(!chaveValida('1a'));
});

test('rótulos ganham código estável e o rótulo vazio fica de fora', () => {
  assert.deepEqual(rotulosOficiais([{ id: '1', texto: 'Em andamento' }, { id: '2', texto: 'Em andamento!' }, { id: '0', texto: '' }]).map(r => r.codigo), ['em_andamento', 'em_andamento_2']);
});

test('montarCampos valida tipo, chave reservada, repetição e coluna de outro quadro', () => {
  const ok = montarCampos(colunas, [{ coluna_id: 1, chave: 'vao_m' }, { coluna_id: 2, chave: 'status' }]);
  assert.deepEqual(ok.erros, []);
  assert.deepEqual(ok.campos[1].rotulos.map(r => [r.codigo, r.friday_id, !!r.concluido]), [['em_andamento', '1', false], ['feito', '2', true]]);
  const ruim = montarCampos(colunas, [{ coluna_id: 4, chave: 'calc' }, { coluna_id: 1, chave: 'nome' }, { coluna_id: 99, chave: 'x' }, { coluna_id: 3, chave: 'resp' }, { coluna_id: 3, chave: 'resp2' }]);
  assert.equal(ruim.campos.length, 1);
  assert.equal(ruim.erros.length, 4);
  assert.equal(montarCampos(colunas, []).erros.length, 1);
});

test('valores livres viram valores oficiais', () => {
  const { campos } = montarCampos(colunas, [{ coluna_id: 1, chave: 'vao_m' }, { coluna_id: 2, chave: 'status' }, { coluna_id: 3, chave: 'responsavel' }, { coluna_id: 5, chave: 'setores' }]);
  const uid = { 10: 'uid-ana', 11: 'uid-beto' };
  const r = camposDoItem(campos, { 1: '24.5', 2: '2', 3: [10, 99, 11], 5: ['8', '7'], 4: 'ignorada' }, id => uid[id]);
  assert.deepEqual(r.valores, { vao_m: 24.5, status: 'feito', responsavel: ['uid-ana', 'uid-beto'], setores: ['montagem', 'fabrica'] });
  assert.equal(r.pessoasSemFuncionario, 1);
  assert.equal(valorOficial(campos[1], '0', () => undefined), undefined);
  assert.deepEqual(valorOficial({ tipo: 'link' }, { url: 'https://x', texto: 'X' }, () => undefined), { url: 'https://x', texto: 'X' });
  assert.deepEqual(valorOficial({ tipo: 'periodo' }, { inicio: '2026-01-01' }, () => undefined), { inicio: '2026-01-01', fim: null });
  assert.equal(valorOficial({ tipo: 'data' }, '2026-03-06', () => undefined), '2026-03-06');
  assert.equal(valorOficial({ tipo: 'caixa' }, true, () => undefined), true);
});

test('situação e datas do Friday', () => {
  assert.equal(situacaoDoItem({}), 'ativo');
  assert.equal(situacaoDoItem({ arquivado_em: 'x' }), 'arquivado');
  assert.equal(situacaoDoItem({ arquivado_em: 'x', excluido_em: 'y' }), 'excluido');
  assert.equal(dataDoFriday('2026-10-19 14:30:00').toISOString(), '2026-10-19T17:30:00.000Z');
  assert.equal(dataDoFriday('lixo'), null);
});

test('rótulos novos do Friday ganham código sem mudar os existentes', async () => {
  const { acrescentarRotulos, indicePessoas } = await import('../lib/fridayCadastroConverter.js');
  const campo = { chave: 'status', tipo: 'status', coluna_id: 2, situacao: 'ativo', rotulos: [{ codigo: 'feito', texto: 'Feito', cor: '#0f0', friday_id: '2' }] };
  const r = acrescentarRotulos(campo, [{ id: '2', texto: 'Concluído (renomeado)' }, { id: '5', texto: 'Feito' }, { id: '0', texto: '' }]);
  assert.equal(r.mudou, true);
  assert.deepEqual(r.campo.rotulos.map(x => [x.codigo, x.friday_id]), [['feito', '2'], ['feito_2', '5']]);
  assert.equal(acrescentarRotulos(r.campo, [{ id: '2', texto: 'x' }]).mudou, false);
  const idx = indicePessoas({ 9: [1, 2], 8: [3] }, new Set(['9']), [{ chave: 'resp', tipo: 'pessoa', situacao: 'ativo' }], { resp: ['u4', 'u-desconhecido'] }, uid => (uid === 'u4' ? 4 : undefined));
  assert.deepEqual(idx.sort(), [1, 2, 4]);
});

test('C3: valor de volta, rótulos sincronizados e entrada de subitem', async () => {
  const { valorDoOficial, sincronizarRotulos, entradaSubitem } = await import('../lib/fridayCadastroConverter.js');
  const status = { chave: 'status', tipo: 'status', coluna_id: 2, situacao: 'ativo', rotulos: [{ codigo: 'feito', texto: 'Feito', cor: '#0f0', friday_id: '2', concluido: true }] };
  assert.equal(valorDoOficial(status, 'feito', () => undefined), '2');
  assert.equal(valorDoOficial(status, 'sumiu', () => undefined), undefined);
  assert.deepEqual(valorDoOficial({ tipo: 'pessoa' }, ['u1', 'x'], uid => (uid === 'u1' ? 7 : undefined)), [7]);
  assert.equal(valorDoOficial({ tipo: 'numero' }, 3, () => undefined), 3);
  const s = sincronizarRotulos(status, [{ id: '2', texto: 'Concluído', cor: '#0a0' }, { id: '9', texto: 'Novo' }]);
  assert.equal(s.mudou, true);
  assert.deepEqual(s.campo.rotulos.map(r => [r.codigo, r.texto, r.cor, !!r.concluido]), [['feito', 'Concluído', '#0a0', false], ['novo', 'Novo', '#c4c4c4', false]]);
  assert.equal(sincronizarRotulos(s.campo, [{ id: '2', texto: 'Concluído', cor: '#0a0' }, { id: '9', texto: 'Novo', cor: '#c4c4c4' }]).mudou, false);
  const e = entradaSubitem([{ chave: 'status', tipo: 'status', coluna_id: 5, situacao: 'ativo', rotulos: [{ codigo: 'ok', texto: 'Ok', cor: '#0f0', friday_id: '1' }] }], { nome: 'Fundação', posicao: 2, valores: { 5: '1' } }, () => undefined);
  assert.deepEqual(e.entrada, { posicao: 2, nome: 'Fundação', situacao: 'ativo', status: 'ok' });
});

test('grupo oficial: chave em conflito com campos, subitens e grupo', async () => {
  const { conflitoDeChave } = await import('../lib/fridayCadastroConverter.js');
  const registro = { campos: [{ chave: 'status', situacao: 'descontinuado' }], subitens: { chave: 'lotes' }, grupo: { chave: 'grupo' } };
  assert.match(conflitoDeChave(registro, 'status'), /já foi usada/);
  assert.match(conflitoDeChave(registro, 'lotes'), /subitens/);
  assert.match(conflitoDeChave(registro, 'grupo'), /grupo oficial/);
  assert.equal(conflitoDeChave(registro, 'fase'), null);
  assert.equal(conflitoDeChave({}, 'grupo'), null);
});
