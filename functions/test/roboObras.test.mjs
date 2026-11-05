import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const r = await import('../lib/roboObrasDominio.js');
const m = await import('../lib/fridayCadastrosExistentes.js');
const { colunas } = JSON.parse(readFileSync(new URL('./fixtures/gestao-obras-colunas.json', import.meta.url), 'utf8'));

// Colunas do quadro real GESTÃO DE OBRAS (fixture), pelo título, ligadas como na conciliação de 2026-10-27.
const col = (titulo) => { const c = colunas.find(x => x.titulo === titulo); assert.ok(c, titulo); return c; };
const id = (titulo) => String(col(titulo).id);
const LIGACOES = [['Nº Contrato', 'numeroContrato'], ['Ano', 'ano'], ['Empresa', 'empresa'], ['Tipo de Obra', 'tipoObra'], ['Subcentro ERP', 'subcentroErp'],
  ['Ordem de Início', 'ordemInicio'], ['Confir. Recurso', 'confirmacaoRecurso'], ['Início', 'dataInicial'], ['Fim', 'dataFinal']];
const { campos, erros } = m.montarCamposExistente(m.cadastroExistente('obras-v2'), colunas,
  LIGACOES.map(([t, caminho]) => ({ caminho, coluna_id: col(t).id })), { coluna_id: null, caminho: 'nomeObra' });
const CHAVE = 'gestao_obras';
const opcao = (titulo, texto) => { const o = col(titulo).config.opcoes.find(x => x.texto === texto); assert.ok(o, `${titulo}: ${texto}`); return [o.id]; };
const item = (id, nome, criado, valores = {}, extra = {}) => ({ id, nome, criado_em: `${criado} 09:00:00`, valores, vinculo: { cadastro: CHAVE, id: `obra${id}` }, ...extra });
const obra = (campos) => ({ nomeObra: 'x', subcentroErp: null, empresa: null, ano: null, ...campos });

test('ligações do quadro real valem para o robô', () => {
  assert.deepEqual(erros, []);
  const c = r.camposDoRobo(campos);
  assert.ok(!('erro' in c));
  assert.equal(c.subcentro.coluna_id, col('Subcentro ERP').id);
  assert.equal(c.empresa.coluna_id, col('Empresa').id);
});

test('sem Subcentro ERP ou Empresa ligados, o robô recusa', () => {
  const semSubcentro = campos.filter(c => c.chave !== 'subcentroErp');
  assert.match(r.camposDoRobo(semSubcentro).erro, /Subcentro ERP e Empresa/);
  const descontinuada = campos.map(c => (c.chave === 'empresa' ? { ...c, situacao: 'descontinuado' } : c));
  assert.ok('erro' in r.camposDoRobo(descontinuada));
});

test('descrição do subcentro: espaços repetidos viram um e corta em 50', () => {
  assert.equal(r.descricaoSubcentro('  SANTA  MARGARIDA   DO SUL 042-2026 '), 'SANTA MARGARIDA DO SUL 042-2026');
  assert.equal(r.descricaoSubcentro('A'.repeat(60)).length, 50);
});

test('subcentro: só dígitos, em texto', () => {
  assert.equal(r.subcentroValido('219'), true);
  assert.equal(r.subcentroValido('0219'), true);
  for (const v of ['', ' 219', '21a', '2.19', 219, null]) assert.equal(r.subcentroValido(v), false, String(v));
});

test('célula sem conteúdo: rótulo vazio, lista vazia, caixa desmarcada e link vazio', () => {
  assert.equal(r.semConteudo('status', '0'), true);
  assert.equal(r.semConteudo('status', '3'), false);
  assert.equal(r.semConteudo('texto', '0'), false);
  assert.equal(r.semConteudo('lista', []), true);
  assert.equal(r.semConteudo('caixa', false), true);
  assert.equal(r.semConteudo('numero', 0), false);
  assert.equal(r.semConteudo('link', { url: '', texto: ' ' }), true);
  assert.equal(r.semConteudo('texto', '   '), true);
});

test('obras sem subcentro: prontas, aguardando e as que ficam de fora', () => {
  const itens = [
    // pronta: Empresa (ligada) + Ano (ligada) + Nº da Licitação (livre) + Situação (livre)
    item(1, 'ALEGRIA 147/2026', '2026-10-20', { [id('Nº da Licitação')]: '12/2026', [id('Situação')]: opcao('Situação', 'Parada') }),
    // aguardando: sem Empresa
    item(2, 'SÃO VENDELINO 64/2026', '2026-10-21', { [id('Nº da Licitação')]: '9/2026', [id('Situação')]: opcao('Situação', 'Parada') }),
    // aguardando: só Empresa; Pasta Servidor vazia e a fórmula não contam
    item(3, 'SINIMBU 1/2026', '2026-10-22', { [id('Pasta Servidor')]: '  ', [id('Status')]: 'qualquer' }),
    item(4, 'JÁ TEM 2/2026', '2026-10-22', { [id('Nº da Licitação')]: 'x' }),           // já tem subcentro
    item(5, 'ANTIGA 3/2026', '2026-10-01', { [id('Nº da Licitação')]: 'x' }),           // antes da data
    item(6, 'ARQUIVADA 4/2026', '2026-10-23', {}, { arquivado_em: '2026-10-24 10:00:00' }),
    item(7, 'LOTE 1', '2026-10-23', {}, { item_pai_id: 1, vinculo: { cadastro: CHAVE, id: 'obra1', sub: '7' } }),
    { id: 8, nome: 'SOLTA', criado_em: '2026-10-23 09:00:00', valores: {} },              // sem vínculo
  ];
  const oficiais = new Map([
    ['obra1', obra({ empresa: 'LEDUR', ano: 2026 })],
    ['obra2', obra({ ano: 2026 })],
    ['obra3', obra({ empresa: 'ARTEBASE' })],
    ['obra4', obra({ empresa: 'LEDUR', ano: 2026, subcentroErp: '219' })],
    ['obra5', obra({ empresa: 'LEDUR', ano: 2026 })],
    ['obra6', obra({ empresa: 'LEDUR', ano: 2026 })],
  ]);
  const res = r.obrasSemSubcentro({ itens, oficiais, colunas, campos, chaveCadastro: CHAVE, desde: r.INICIO_SUBCENTRO });
  assert.deepEqual(res.prontas.map(o => o.itemId), [1]);
  assert.deepEqual(res.aguardando.map(o => o.itemId), [2, 3]);
  const [p] = res.prontas;
  assert.equal(p.obraId, 'obra1');
  assert.equal(p.descricao, 'ALEGRIA 147/2026');
  assert.equal(p.empresa, 'LEDUR');
  assert.equal(p.preenchidas, 4);
  assert.equal(p.motivo, null);
  assert.match(res.aguardando[0].motivo, /Empresa vazia/);
  assert.equal(res.aguardando[1].preenchidas, 1);
  assert.match(res.aguardando[1].motivo, /mínimo é 3/);
});

test('--desde troca a data de início', () => {
  const itens = [item(5, 'ANTIGA 3/2026', '2026-10-01', { [id('Nº da Licitação')]: 'x', [id('Situação')]: opcao('Situação', 'Parada') })];
  const oficiais = new Map([['obra5', obra({ empresa: 'LEDUR', ano: 2026 })]]);
  const res = r.obrasSemSubcentro({ itens, oficiais, colunas, campos, chaveCadastro: CHAVE, desde: '2026-09-01' });
  assert.deepEqual(res.prontas.map(o => o.itemId), [5]);
});

test('registrar nunca sobrescreve outro subcentro', () => {
  assert.equal(r.decidirRegistro(null, '219'), 'gravar');
  assert.equal(r.decidirRegistro('  ', '219'), 'gravar');
  assert.equal(r.decidirRegistro('219', '219'), 'ja_gravado');
  assert.equal(r.decidirRegistro('218', '219'), 'conflito');
});

test('token: X-Robo-Token com o valor certo; segredo vazio nunca confere', () => {
  assert.equal(r.tokenDoCabecalho('abc123'), 'abc123');
  assert.equal(r.tokenDoCabecalho(' abc123 '), 'abc123');
  assert.equal(r.tokenDoCabecalho('   '), null);
  assert.equal(r.tokenDoCabecalho(undefined), null);
  assert.equal(r.tokenConfere('abc123', 'abc123'), true);
  assert.equal(r.tokenConfere('abc124', 'abc123'), false);
  assert.equal(r.tokenConfere('abc123', ''), false);
  assert.equal(r.tokenConfere(null, 'abc123'), false);
});
