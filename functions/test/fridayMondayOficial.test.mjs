import { test } from 'node:test';
import assert from 'node:assert/strict';

const o = await import('../lib/fridayMondayOficial.js');
const m = await import('../lib/fridayCadastrosExistentes.js');
const obras = m.cadastroExistente('obras-v2');

// Colunas de GESTÃO DE OBRAS como estão hoje no Friday (algumas convertidas depois da importação).
const colEmpresa = { id: 10, tipoMonday: 'dropdown', titulo: 'Empresa', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'LEDUR', cor: '#1' }, { id: '2', texto: 'ARTEBASE', cor: '#2' }, { id: '0', texto: '', cor: '#c' }] } };
const colAno = { id: 11, tipoMonday: 'text', titulo: 'Ano', tipo: 'numero', config: { milhar: false } };
const colFim = { id: 12, tipoMonday: 'date', titulo: 'Fim', tipo: 'data', config: {} };
const colEmpenho = { id: 13, tipoMonday: 'text', titulo: 'Nº Empenho', tipo: 'texto', config: {} };
const colCap = { id: 14, tipoMonday: 'numbers', titulo: 'Cap.', tipo: 'numero', config: { x10: true } };
const colunas = new Map([['empresa', colEmpresa], ['ano', colAno], ['fim', colFim], ['empenho', colEmpenho], ['cap', colCap]].map(([k, c]) => [k, structuredClone(c)]));
const pedidos = [{ caminho: 'empresa', coluna_id: 10 }, { caminho: 'ano', coluna_id: 11 }, { caminho: 'dataFinal', coluna_id: 12 }];
const campos = m.montarCamposExistente(obras, [colEmpresa, colAno, colFim, colEmpenho], pedidos, null).campos;
const cv = (id, text, value = null) => ({ id, type: 'x', text, value: value == null ? null : JSON.stringify(value) });
const ctx = (alteradas = new Set()) => ({ rotulo: o.rotuloPorTexto(alteradas) });

test('número escrito em texto', () => {
  assert.equal(o.numeroDoTexto('2025'), 2025);
  assert.equal(o.numeroDoTexto('20,5 t'), 20.5);
  assert.equal(o.numeroDoTexto('1.234,5'), 1234.5);
  assert.equal(o.numeroDoTexto('1.234'), 1234);
  assert.equal(o.numeroDoTexto('sem número'), null);
});

test('valor do monday no tipo atual da coluna (colunas convertidas pelo "Mudar tipo…")', () => {
  const alteradas = new Set();
  const c = new Map([...colunas].map(([k, v]) => [k, structuredClone(v)]));
  // lista → status: pelo texto; rótulo que não existe é criado (antes do vazio) e a coluna fica marcada para salvar.
  assert.equal(o.valorNoTipoAtual(c.get('empresa'), cv('empresa', 'artebase', { ids: [5] }), ctx(alteradas)), '2');
  assert.equal(o.valorNoTipoAtual(c.get('empresa'), cv('empresa', 'NOVA EMPRESA', { ids: [7] }), { rotulo: o.rotuloPorTexto(alteradas) }), '3');
  assert.deepEqual(c.get('empresa').config.rotulos.map(r => r.id), ['1', '2', '3', '0']);
  assert.deepEqual([...alteradas], [10]);
  // Lista com duas opções não cabe num status.
  assert.equal(o.valorNoTipoAtual(c.get('empresa'), cv('empresa', 'LEDUR, ARTEBASE', { ids: [1, 2] }), ctx()), null);
  // texto → número; número → ×10.
  assert.equal(o.valorNoTipoAtual(c.get('ano'), cv('ano', '2026'), ctx()), 2026);
  assert.equal(o.valorNoTipoAtual(c.get('cap'), cv('cap', '20.5', '20.5'), ctx()), 205);
  assert.equal(o.valorNoTipoAtual(c.get('fim'), cv('fim', '2026-12-31', { date: '2026-12-31' }), ctx()), '2026-12-31');
});

test('plano de um contrato que mudou no monday: ligados vão para o cadastro, livres para o item, o monday vale', () => {
  const c = new Map([...colunas].map(([k, v]) => [k, structuredClone(v)]));
  const existente = { id: 1, nome: 'PONTE A 1/2026', grupo_id: 5, valores: { 13: 'EMP-1', 99: 'coluna do Friday' } };
  const oficial = { nomeObra: 'PONTE A 1/2026', empresa: 'LEDUR', ano: 2025, dataFinal: '2026-06-30' };
  const item = { id: 'm1', name: 'PONTE A 1/2026 (aditivo)', updated_at: 'x', column_values: [
    cv('empresa', 'ARTEBASE', { ids: [2] }), cv('ano', '2026'), cv('fim', '2026-12-31', { date: '2026-12-31' }), cv('empenho', 'EMP-2'),
  ] };
  const p = o.planejarAtualizacao({ item, existente, colunas: c, campos, oficial, nomeTravado: false, grupoId: 6, nomeDoGrupo: g => `G${g}`, ctx: ctx() });
  assert.equal(p.nome, 'PONTE A 1/2026 (aditivo)');
  assert.equal(p.grupo_id, 6);
  assert.deepEqual(p.ligados.map(l => [l.titulo, l.valor]), [['Empresa', '2'], ['Ano', 2026], ['Fim', '2026-12-31']]);
  assert.deepEqual(p.livres, { 13: 'EMP-2' });
  assert.deepEqual(p.mudancas.map(x => `${x.coluna}: ${x.de} → ${x.para}`), [
    'Nome: PONTE A 1/2026 → PONTE A 1/2026 (aditivo)', 'Grupo: G5 → G6', 'Empresa: LEDUR → ARTEBASE', 'Ano: 2025 → 2026', 'Fim: 2026-06-30 → 2026-12-31', 'Nº Empenho: EMP-1 → EMP-2',
  ]);
});

test('sem diferença não grava; valor que não cabe no cadastro é recusado e listado; nome travado não muda', () => {
  const c = new Map([...colunas].map(([k, v]) => [k, structuredClone(v)]));
  const existente = { id: 1, nome: 'X', grupo_id: 5, valores: {} };
  const igual = o.planejarAtualizacao({ item: { id: 'm', name: 'X', column_values: [cv('ano', '2025')] }, existente, colunas: c, campos, oficial: { ano: 2025 },
    nomeTravado: false, grupoId: 5, nomeDoGrupo: String, ctx: ctx() });
  assert.deepEqual([igual.mudancas, igual.ligados, igual.nome, igual.grupo_id], [[], [], null, null]);
  // Ano inteiro no contrato: 2025,5 não cabe.
  const ruim = o.planejarAtualizacao({ item: { id: 'm', name: 'Outro', column_values: [cv('ano', '2025,5')] }, existente, colunas: c, campos, oficial: { ano: 2025 },
    nomeTravado: true, grupoId: null, nomeDoGrupo: String, ctx: ctx() });
  assert.equal(ruim.nome, null);
  assert.deepEqual(ruim.ligados, []);
  assert.match(ruim.mudancas[0].recusa, /inteiro/);
});

test('mesmo valor: vazios equivalem; objetos sem depender da ordem das chaves', () => {
  assert.ok(o.mesmoValor(undefined, null) && o.mesmoValor('', []) && o.mesmoValor({ a: 1, b: 2 }, { b: 2, a: 1 }));
  assert.ok(!o.mesmoValor(['1'], ['2']));
  assert.equal(o.textoDoValor(colEmpresa, '2'), 'ARTEBASE');
  assert.equal(o.textoDoValor(colAno, 2026), '2026');
  assert.equal(o.textoDoValor(colCap, 205), '20,5');
  assert.equal(o.textoDoValor(colFim, null), '—');
});

test('rótulo novo numa coluna ligada a campo de texto entra no campo (mesma regra da gravação do quadro)', () => {
  const empresa = campos.find(x => x.chave === 'empresa');
  const rotulos = [...colEmpresa.config.rotulos, { id: '3', texto: 'NOVA', cor: '#3' }];
  const r = m.campoComRotuloNovo(empresa, rotulos, '3');
  assert.equal(r.mudou, true);
  assert.deepEqual(m.valorParaGravarExistente(r.campo, '3'), { gravar: [['empresa', 'NOVA']] });
  assert.equal(m.campoComRotuloNovo(empresa, rotulos, '1').mudou, false);
});

test('reimportação: arquivo do monday já copiado para o Friday continua a cópia; arquivo novo chega só com o nome', () => {
  const colDoc = { id: 15, tipoMonday: 'file', titulo: 'Doc. Edital', tipo: 'arquivos', config: {} };
  const copia = { id: 500, nome: 'edital.pdf', mime: 'application/pdf', tamanho: 10, url: 'https://x/edital.pdf', monday_asset: 77 };
  const existente = { id: 1, nome: 'X', grupo_id: 5, valores: { 15: [copia] } };
  const files = (...f) => cv('doc', '', { files: f.map(([name, assetId]) => ({ name, assetId, fileType: 'ASSET' })) });
  const plano = (coluna) => o.planejarAtualizacao({ item: { id: 'm', name: 'X', column_values: [coluna] }, existente, colunas: new Map([['doc', colDoc]]), campos: [],
    oficial: {}, nomeTravado: false, grupoId: 5, nomeDoGrupo: String, ctx: ctx() });
  const igual = plano(files(['edital.pdf', 77]));
  assert.deepEqual(igual.mudancas, []);
  assert.deepEqual(igual.livres, { 15: [copia] });
  const novo = plano(files(['edital.pdf', 77], ['aditivo.pdf', 78]));
  assert.deepEqual(novo.livres, { 15: [copia, { nome: 'aditivo.pdf', monday_asset: 78 }] });
  assert.equal(novo.mudancas.length, 1);
});
