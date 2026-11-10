import { test } from 'node:test';
import assert from 'node:assert/strict';

const d = await import('../lib/fridayApiDominio.js');

// API de leitura do Friday por chave. Só dados fictícios.
const funcionario = (perfis, ativo = true) => ({ ativo, perfis });

test('chave: formato fri_ + 40 letras/números; o banco guarda só o SHA-256', () => {
  const chave = `fri_${'aB3'.repeat(13)}x`;
  assert.equal(d.formatoChave(chave), true);
  assert.equal(d.formatoChave('fri_curta'), false);
  assert.equal(d.formatoChave(`fri_${'a'.repeat(39)}!`), false);
  assert.equal(d.formatoChave(undefined), false);
  assert.match(d.hashChave(chave), /^[0-9a-f]{64}$/);
  assert.notEqual(d.hashChave(chave), chave);
});

test('a chave vale pela pessoa: ativa, com escritorio ou adm2, e chave não revogada', () => {
  const reg = { uid: 'uid-ana', nome: 'Robô' };
  assert.deepEqual(d.pessoaDaChave(reg, funcionario({ escritorio: true })), { uid: 'uid-ana', adm2: false, escrita: false });
  assert.deepEqual(d.pessoaDaChave(reg, funcionario({ adm2: true })), { uid: 'uid-ana', adm2: true, escrita: false });
  assert.equal(d.pessoaDaChave({ ...reg, revogada_em: '2026-11-10 10:00:00' }, funcionario({ escritorio: true })), null, 'revogada');
  assert.equal(d.pessoaDaChave(reg, funcionario({ escritorio: true }, false)), null, 'desligada');
  assert.equal(d.pessoaDaChave(reg, funcionario({ motorista: true })), null, 'sem acesso ao Friday');
  assert.equal(d.pessoaDaChave(undefined, funcionario({ adm2: true })), null, 'chave inexistente');
});

test('quadros: aberto para todos, restrito só para quem está em "acesso", adm2 vê todos; arquivo e lixeira não', () => {
  const ana = { uid: 'uid-ana', adm2: false }, chefe = { uid: 'uid-chefe', adm2: true };
  assert.equal(d.podeVerQuadro({ restrito: 0 }, ana), true);
  assert.equal(d.podeVerQuadro({ restrito: 1, acesso: ['uid-ana'] }, ana), true);
  assert.equal(d.podeVerQuadro({ restrito: 1, acesso: ['uid-bia'] }, ana), false);
  assert.equal(d.podeVerQuadro({ restrito: 1, acesso: [] }, chefe), true);
  assert.equal(d.podeVerQuadro({ restrito: 0, arquivado_em: '2026-11-01' }, chefe), false);
  assert.equal(d.podeVerQuadro(undefined, chefe), false);
});

test('valores em texto legível, como na tela', () => {
  const ctx = { nomePessoa: u => ({ 'uid-ana': 'Ana' })[u] ?? '?', nomeItem: id => (id === 7 ? 'Obra ligada' : null) };
  const t = (tipo, v, config = {}) => d.textoCelula({ tipo, config }, v, ctx);
  assert.equal(t('status', '2', { rotulos: [{ id: '2', texto: 'Obra Parada' }] }), 'Obra Parada');
  assert.equal(t('lista', ['a', 'b'], { opcoes: [{ id: 'a', texto: 'LEDUR' }] }), 'LEDUR, b');
  assert.equal(t('pessoa', ['uid-ana', 'uid-x']), 'Ana, ?');
  assert.equal(t('data', '2026-03-05'), '05/03/2026');
  assert.equal(t('periodo', { inicio: '2026-01-02', fim: '2026-02-03' }), '02/01/2026 a 03/02/2026');
  assert.equal(t('numero', 205, { x10: true }), '20.5');
  assert.equal(t('caixa', true), 'Sim');
  assert.equal(t('link', { url: 'https://x', texto: 'Pasta' }), 'Pasta — https://x');
  assert.equal(t('ligacao', [7, 9]), 'Obra ligada, #9', 'item de quadro que a pessoa não vê: só o número');
  assert.equal(t('tempo', { sessoes: [{ inicio: '2026-11-10T08:00:00Z', fim: '2026-11-10T09:30:00Z' }] }), '1h 30m');
  assert.equal(t('texto', '208'), '208');
  assert.equal(t('texto', ''), null);
  assert.deepEqual(d.valoresPorTitulo([{ id: 1, titulo: 'Status' }, { id: 2, titulo: 'Status' }], id => `v${id}`), { Status: 'v1', 'Status (2)': 'v2' });
});

test('busca: cada palavra começa uma palavra do nome, sem acento', () => {
  const p = d.palavrasDaBusca('coqueiros 070');
  assert.deepEqual(p, ['coqueiros', '070']);
  assert.equal(d.casaBusca('COQUEIROS DO SUL 070/2026', p), true);
  assert.equal(d.casaBusca('COQUEIROS DO SUL 071/2026', p), false);
  assert.equal(d.casaBusca('IBIRUBÁ 139/2026', d.palavrasDaBusca('ibiruba')), true);
  assert.deepEqual(d.palavrasDaBusca('  '), []);
});

test('escrita: só a chave criada com escrita; coluna pelo título ou id', () => {
  assert.equal(d.pessoaDaChave({ uid: 'u', escrita: true }, funcionario({ escritorio: true })).escrita, true);
  assert.equal(d.pessoaDaChave({ uid: 'u' }, funcionario({ escritorio: true })).escrita, false, 'chave antiga = só consulta');
  const cols = [{ id: 1, titulo: 'Situação' }, { id: 2, titulo: 'Nº Contrato' }, { id: 3, titulo: 'Obs' }, { id: 4, titulo: 'Obs' }];
  assert.equal(d.colunaDoPedido(cols, 'situacao').id, 1);
  assert.equal(d.colunaDoPedido(cols, 2).id, 2);
  assert.equal(d.colunaDoPedido(cols, '2').id, 2);
  assert.throws(() => d.colunaDoPedido(cols, 'Obs'), d.EntradaInvalida, 'título repetido');
  assert.throws(() => d.colunaDoPedido(cols, 'Nada'), d.EntradaInvalida);
});

test('escrita: valor como uma pessoa escreveria vira o formato do Friday; o que não existe é recusado', () => {
  const ctx = { pessoa: x => ({ 'Ana Teste': 'uid-ana', 'uid-bia': 'uid-bia' })[x] ?? null };
  const v = (tipo, entrada, config = {}) => d.valorDaEntrada({ tipo, titulo: 'Col', config }, entrada, ctx);
  const rotulos = { rotulos: [{ id: '0', texto: '' }, { id: '3', texto: 'Parado' }, { id: '1', texto: 'Em andamento' }] };
  assert.equal(v('status', 'parado', rotulos), '3');
  assert.equal(v('status', '1', rotulos), '1');
  assert.equal(v('status', '0', rotulos), undefined, 'rótulo vazio = limpar');
  assert.throws(() => v('status', 'Concluído', rotulos), d.EntradaInvalida);
  const opcoes = { opcoes: [{ id: 'a', texto: 'Entregue' }, { id: 'b', texto: 'Finalizada' }] };
  assert.deepEqual(v('lista', 'entregue, Finalizada', opcoes), ['a', 'b']);
  assert.throws(() => v('lista', ['Parada'], opcoes), d.EntradaInvalida);
  assert.deepEqual(v('pessoa', ['ana teste'.replace('ana teste', 'Ana Teste'), 'uid-bia'], {}), ['uid-ana', 'uid-bia']);
  assert.throws(() => v('pessoa', 'Ninguém', {}), d.EntradaInvalida);
  assert.equal(v('data', '05/03/2026'), '2026-03-05');
  assert.equal(v('data', '2026-03-05'), '2026-03-05');
  assert.throws(() => v('data', '31/02/2026'), d.EntradaInvalida);
  assert.deepEqual(v('periodo', '01/02/2026 a 10/02/2026'), { inicio: '2026-02-01', fim: '2026-02-10' });
  assert.throws(() => v('periodo', { inicio: '2026-02-10', fim: '2026-02-01' }), d.EntradaInvalida);
  assert.equal(v('numero', 'R$ 1.234,56'), 1234.56);
  assert.equal(v('numero', '20,5', { x10: true }), 205);
  assert.throws(() => v('numero', 'abc'), d.EntradaInvalida);
  assert.equal(v('caixa', 'sim'), true);
  assert.equal(v('caixa', false), undefined);
  assert.deepEqual(v('link', 'https://x.com'), { url: 'https://x.com' });
  assert.throws(() => v('link', 'x.com'), d.EntradaInvalida);
  assert.equal(v('texto', 208), '208');
  assert.equal(v('texto', ''), undefined, 'vazio = limpar');
  for (const tipo of ['formula', 'ligacao', 'arquivos', 'tempo']) assert.throws(() => v(tipo, 'x'), d.EntradaInvalida, tipo);
  assert.deepEqual(d.mencoesDoTexto('Oi @{uid-ana} e @{uid-ana}, ver @{uid-bia}'), ['uid-ana', 'uid-bia']);
});
