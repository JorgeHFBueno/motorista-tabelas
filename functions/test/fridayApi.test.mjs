import { test } from 'node:test';
import assert from 'node:assert/strict';

const d = await import('../lib/fridayApiDominio.js');

// API de leitura do Friday por chave. Só dados fictícios.
// Áreas da WEB (2026-11-16): entra no Friday quem tem a área friday (ou adm2).
const funcionario = (perfis, ativo = true, areas = {}) => ({ ativo, perfis, areas });
const friday = { friday: 'editar' };

test('chave: formato fri_ + 40 letras/números; o banco guarda só o SHA-256', () => {
  const chave = `fri_${'aB3'.repeat(13)}x`;
  assert.equal(d.formatoChave(chave), true);
  assert.equal(d.formatoChave('fri_curta'), false);
  assert.equal(d.formatoChave(`fri_${'a'.repeat(39)}!`), false);
  assert.equal(d.formatoChave(undefined), false);
  assert.match(d.hashChave(chave), /^[0-9a-f]{64}$/);
  assert.notEqual(d.hashChave(chave), chave);
});

test('a chave vale pela pessoa: ativa, com a área friday ou adm2, e chave não revogada', () => {
  const reg = { uid: 'uid-ana', nome: 'Robô' };
  assert.deepEqual(d.pessoaDaChave(reg, funcionario({}, true, friday)), { uid: 'uid-ana', adm2: false, escrita: false });
  assert.deepEqual(d.pessoaDaChave(reg, funcionario({ adm2: true })), { uid: 'uid-ana', adm2: true, escrita: false });
  assert.deepEqual(d.pessoaDaChave(reg, funcionario({ mecanico: true }, true, friday)), { uid: 'uid-ana', adm2: false, escrita: false });
  assert.deepEqual(d.pessoaDaChave(reg, { ativo: true, perfis: {}, areas: { friday: 'editar' } }), { uid: 'uid-ana', adm2: false, escrita: false }, 'área friday');
  assert.equal(d.pessoaDaChave(reg, { ativo: true, perfis: { escritorio: true }, areas: { portal: 'editar' } }), null, 'migrado sem a área friday');
  assert.equal(d.pessoaDaChave({ ...reg, revogada_em: '2026-11-10 10:00:00' }, funcionario({}, true, friday)), null, 'revogada');
  assert.equal(d.pessoaDaChave(reg, funcionario({}, false, friday)), null, 'desligada');
  assert.equal(d.pessoaDaChave(reg, funcionario({ motorista: true })), null, 'sem acesso ao Friday');
  assert.equal(d.pessoaDaChave(reg, { ativo: true, perfis: { escritorio: true, mecanico: true } }), null, 'credencial antiga sem áreas');
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
  assert.equal(d.pessoaDaChave({ uid: 'u', escrita: true }, funcionario({}, true, friday)).escrita, true);
  assert.equal(d.pessoaDaChave({ uid: 'u' }, funcionario({}, true, friday)).escrita, false, 'chave antiga = só consulta');
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

test('arquivos pela API: nome do envio, coluna de arquivos recusada no /valor, formato da resposta e da célula', () => {
  assert.equal(d.nomeDoEnvio('  ../pasta\\Proposta 2026.pdf '), '.._pasta_Proposta 2026.pdf');
  assert.equal(d.nomeDoEnvio('a\u0000b\nc.pdf'), 'abc.pdf');
  assert.equal(d.nomeDoEnvio('x'.repeat(300)).length, 200);
  assert.throws(() => d.nomeDoEnvio(''), d.EntradaInvalida);
  assert.throws(() => d.nomeDoEnvio(undefined), d.EntradaInvalida);
  assert.throws(() => d.valorDaEntrada({ tipo: 'arquivos', titulo: 'Doc. Edital' }, 'x', { pessoa: () => null }), /POST \/itens\/\{id\}\/arquivos/);
  assert.equal(d.LIMITE_ENVIO, 25 * 1024 * 1024);
  const anexo = { id: 7, nome: 'Edital.pdf', mime: 'application/pdf', tamanho: 1234, coluna_id: 30, atualizacao_id: null, criado_em: '2026-11-11 12:00:00', url: 'https://x/y', arquivo: 'friday/1/2/7-Edital.pdf', via: 'api' };
  assert.deepEqual(d.anexoLegivel(anexo, id => (id === 30 ? 'Doc. Edital' : null)), {
    id: 7, nome: 'Edital.pdf', mime: 'application/pdf', tamanho: 1234, coluna: 'Doc. Edital', atualizacao: null, criado_em: '2026-11-11 12:00:00', url: 'https://x/y',
  });
  assert.equal(d.anexoLegivel({ ...anexo, coluna_id: null, atualizacao_id: 99 }, () => 'nunca').coluna, null);
  assert.deepEqual(d.entradaDaCelula(anexo), { id: 7, nome: 'Edital.pdf', mime: 'application/pdf', tamanho: 1234, url: 'https://x/y' });
});

test('aviso de menção pela API: cada marcado uma vez, nunca o autor, só quem entra no Friday', () => {
  const funcionarios = new Map([
    ['ana', funcionario({}, true, friday)],
    ['beto', funcionario({ mecanico: true }, true, friday)],
    ['chefe', funcionario({ adm2: true })],
    ['inativo', funcionario({}, false, friday)],
    ['motorista', funcionario({ motorista: true })],
    ['autor', funcionario({}, true, friday)],
  ]);
  assert.deepEqual(d.destinatariosDaMencao(['ana', 'beto', 'ana', 'chefe', 'inativo', 'motorista', 'autor', 'sumido', ''], 'autor', funcionarios), ['ana', 'beto', 'chefe']);
  assert.deepEqual(d.destinatariosDaMencao([], 'autor', funcionarios), []);
});

test('aviso de menção pela API: igual ao da tela (título com o item, trecho com @Nome até 300 caracteres, rota do item)', () => {
  const nome = uid => ({ ana: 'Ana Souza' })[uid];
  const base = { quadroId: 12, itemId: 34, itemNome: ' Pedido de ART ', quadroNome: 'TAREFAS', atualizacaoId: 56, deUid: 'autor', deNome: 'Jorge B', nome };
  assert.deepEqual(d.avisoDeMencao({ ...base, texto: '  Confere: @{ana} e @{xyz}  ' }), {
    area: 'friday', tipo: 'mencao', titulo: 'mencionou você em Pedido de ART', mensagem: 'Confere: @Ana Souza e @alguém',
    rota: '/friday/quadros/12?item=34&aba=atualizacoes', local: 'TAREFAS', deUid: 'autor', deNome: 'Jorge B',
    origem: { colecao: 'friday-atualizacoes', id: '56' }, lida: false,
  });
  assert.equal(d.avisoDeMencao({ ...base, texto: 'x'.repeat(400) }).mensagem.length, 300);
  const semItem = d.avisoDeMencao({ ...base, quadroId: null, itemNome: null, quadroNome: '', texto: 'oi' });
  assert.equal(semItem.titulo, 'mencionou você em um item');
  assert.equal(semItem.rota, '/friday/');
  assert.equal(semItem.local, null);
});

// Sunday (app de tarefas da equipe): GET /sunday. Só dados fictícios.
const rotulos = [
  { id: '0', texto: 'Não iniciado', cor: '#c4c4c4' },
  { id: '1', texto: 'Parado', cor: '#e2445c' },
  { id: '2', texto: 'Feito', cor: '#00c875', concluido: true },
];
const colunasSunday = [
  { id: 30, titulo: 'Prioridade', tipo: 'status', posicao: 1, config: { rotulos: [{ id: '1', texto: 'Alta' }] } },
  { id: 20, titulo: 'Status', tipo: 'status', posicao: 2, config: { rotulos } },
  { id: 10, titulo: 'Colaboradores', tipo: 'pessoa', posicao: 0, config: {} },
  { id: 11, titulo: 'Responsavel', tipo: 'pessoa', posicao: 3, config: {} },
];

test('sunday: status principal é o primeiro com rótulo de concluído (como statusPrincipal da WEB); sem ele, o primeiro de status', () => {
  assert.equal(d.statusPrincipal(colunasSunday).id, 20);
  assert.equal(d.statusPrincipal([colunasSunday[1], colunasSunday[0]].map(c => ({ ...c, config: { rotulos: [{ id: '1', texto: 'x' }] } }))).id, 30);
  assert.equal(d.statusPrincipal([colunasSunday[2]]), undefined);
});

test('sunday: responsável é a coluna de pessoa "Responsável" (sem acento também); sem ela, a primeira de pessoa', () => {
  assert.equal(d.pessoaPrincipal(colunasSunday).id, 11);
  assert.equal(d.pessoaPrincipal(colunasSunday.filter(c => c.id !== 11)).id, 10);
  assert.equal(d.pessoaPrincipal([colunasSunday[0]]), undefined);
});

test('sunday: rótulos, rótulo de concluído e rótulo do valor (vazio = "0")', () => {
  const st = colunasSunday[1];
  assert.equal(d.rotuloConcluido(st), '2');
  assert.equal(d.rotuloConcluido(colunasSunday[0]), null);
  assert.deepEqual(d.rotuloDoValor(st, '1'), { id: '1', texto: 'Parado', cor: '#e2445c', concluido: false });
  assert.deepEqual(d.rotuloDoValor(st, 2), { id: '2', texto: 'Feito', cor: '#00c875', concluido: true });
  assert.deepEqual(d.rotuloDoValor(st, null), { id: '0', texto: 'Não iniciado', cor: '#c4c4c4', concluido: false });
  assert.deepEqual(d.rotuloDoValor(st, '9'), { id: '9', texto: '', cor: null, concluido: false });
  assert.equal(d.rotulosDaColuna(st).length, 3);
});

test('sunday: quadros (1 a 10 ids) e desde (AAAA-MM-DD HH:mm:ss) do pedido', () => {
  assert.deepEqual(d.quadrosDaConsulta('12, 7,12'), [12, 7]);
  assert.throws(() => d.quadrosDaConsulta(''), d.EntradaInvalida);
  assert.throws(() => d.quadrosDaConsulta('12,abc'), d.EntradaInvalida);
  assert.throws(() => d.quadrosDaConsulta(Array.from({ length: 11 }, (_, k) => k + 1).join(',')), d.EntradaInvalida);
  assert.equal(d.desdeDaConsulta(undefined), null);
  assert.equal(d.desdeDaConsulta(''), null);
  assert.equal(d.desdeDaConsulta(' 2026-11-27 14:05:09 '), '2026-11-27 14:05:09');
  assert.throws(() => d.desdeDaConsulta('2026-11-27T14:05:09Z'), d.EntradaInvalida);
});

test('sunday: a janela começa 10 minutos antes do desde (relógio de quem gravou), virando o dia e o mês', () => {
  assert.equal(d.inicioDaJanela('2026-11-27 14:05:09'), '2026-11-27 13:55:09');
  assert.equal(d.inicioDaJanela('2026-12-01 00:03:00'), '2026-11-30 23:53:00');
  assert.equal(d.inicioDaJanela('2026-11-27 14:05:09', 0), '2026-11-27 14:05:09');
});

test('sunday: item com nome, status, responsáveis com nome e se continua no Sunday', () => {
  const item = { id: 5, quadro_id: 9, nome: 'Arrumar os saldos', atualizado_em: '2026-11-27 14:00:00' };
  const valores = { 20: '1', 11: ['uidA', 'uidB'] };
  const nome = uid => ({ uidA: 'Ana Souza' })[uid] ?? '?';
  assert.deepEqual(d.itemDoSunday(item, valores, true, colunasSunday[1], colunasSunday[3], nome), {
    id: 5, quadro: 9, nome: 'Arrumar os saldos', sunday: true,
    status: { id: '1', texto: 'Parado', cor: '#e2445c', concluido: false },
    responsaveis: [{ uid: 'uidA', nome: 'Ana Souza' }, { uid: 'uidB', nome: '?' }],
    atualizado_em: '2026-11-27 14:00:00',
  });
  const semColunas = d.itemDoSunday(item, {}, false, undefined, undefined, nome);
  assert.equal(semColunas.sunday, false);
  assert.equal(semColunas.status, null);
  assert.deepEqual(semColunas.responsaveis, []);
});
