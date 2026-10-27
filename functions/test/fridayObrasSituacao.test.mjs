import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { calcularSituacao, hojeEmBrasilia } = await import('../lib/fridayObrasSituacao.js');
const m = await import('../lib/fridayCadastrosExistentes.js');
const { colunas } = JSON.parse(readFileSync(new URL('./fixtures/gestao-obras-colunas.json', import.meta.url), 'utf8'));

// Colunas do quadro real GESTÃO DE OBRAS (fixture), pelo título.
const col = (titulo) => { const c = colunas.find(x => x.titulo === titulo); assert.ok(c, titulo); return c; };
const id = (titulo) => String(col(titulo).id);
const obras = m.cadastroExistente('obras-v2');
// Campos oficiais como a conciliação vai ligar: as colunas que viram campo de obras-v2.
const LIGACOES = [['Nº Contrato', 'numeroContrato'], ['Ano', 'ano'], ['Empresa', 'empresa'], ['Tipo de Obra', 'tipoObra'], ['Subcentro ERP', 'subcentroErp'],
  ['Ordem de Início', 'ordemInicio'], ['Confir. Recurso', 'confirmacaoRecurso'], ['Início', 'dataInicial'], ['Fim', 'dataFinal']];
const { campos, erros } = m.montarCamposExistente(obras, colunas, LIGACOES.map(([t, caminho]) => ({ caminho, coluna_id: col(t).id })), { coluna_id: null, caminho: 'nomeObra' });
const registro = { chave: 'obras_v2_t', modo: 'existente', situacao: 'ativo', colecao: 'obras-v2', campos, formula_situacao: { coluna_id: col('Status').id } };
const opcao = (titulo, texto) => { const o = col(titulo).config.opcoes.find(x => x.texto === texto); assert.ok(o, `${titulo}: ${texto}`); return [o.id]; };
const hoje = new Date(2026, 9, 27, 10, 0);

test('as colunas que viram campo de obras-v2 ligam sem erro (Empresa etc. já são rótulo)', () => {
  assert.deepEqual(erros, []);
  assert.equal(campos.length, LIGACOES.length);
  assert.equal(campos.find(c => c.chave === 'subcentroErp').exato, true);
});

test('obra pública entregue com termo definitivo, CND e pagamento OK → "Obra Finalizada" → FINALIZADA', () => {
  const item = { id: 1, nome: 'LAGOA BONITA DO SUL', valores: { [id('Situação')]: opcao('Situação', 'Entregue'), [id('Termo de Receb.')]: opcao('Termo de Receb.', 'Definitivo'), [id('CND')]: opcao('CND', 'OK'), [id('Pagamento')]: opcao('Pagamento', 'OK') } };
  const doc = { tipoObra: 'Pública', situacao: 'Solicitar termo Definitivo', status: 'CONTRATADA' };
  const r = calcularSituacao(obras, registro, colunas, item, doc, hoje);
  assert.equal(r.resultado, 'Obra Finalizada');
  assert.deepEqual(r.gravar, [['situacao', 'Obra Finalizada'], ['status', 'FINALIZADA']]);
});

test('obra parada → "Obra Parada" → CONTRATADA (continua no app)', () => {
  const item = { id: 2, nome: 'SINIMBU', valores: { [id('Situação')]: opcao('Situação', 'Parada') } };
  const r = calcularSituacao(obras, registro, colunas, item, { tipoObra: 'Pública', status: 'FINALIZADA' }, hoje);
  assert.deepEqual(r.gravar, [['situacao', 'Obra Parada'], ['status', 'CONTRATADA']]);
});

test('a fórmula usa os valores que vivem em obras-v2 (tipo, número, ano, empresa, datas) e a data de hoje', () => {
  const valores = { [id('Cont. Assinado')]: opcao('Cont. Assinado', 'OK'), [id('ART')]: opcao('ART', 'OK'), [id('CNO')]: opcao('CNO', 'OK') };
  const doc = { tipoObra: 'Privada', numeroContrato: '1029', ano: 2026, empresa: 'LEDUR', dataInicial: '2026-06-01', dataFinal: '2026-12-31' };
  assert.equal(calcularSituacao(obras, registro, colunas, { id: 3, nome: 'RECICLE', valores }, doc, hoje).resultado, 'Obra em Andamento');
  assert.equal(calcularSituacao(obras, registro, colunas, { id: 3, nome: 'RECICLE', valores }, doc, new Date(2026, 11, 26, 9)).resultado, 'Solicitar Aditivo de Prazo');
  assert.equal(calcularSituacao(obras, registro, colunas, { id: 3, nome: 'RECICLE', valores }, { ...doc, numeroContrato: null }, hoje).resultado, 'Qual o número do contrato?');
  assert.equal(calcularSituacao(obras, registro, colunas, { id: 3, nome: 'RECICLE', valores }, { ...doc, tipoObra: null }, hoje).resultado, 'Obra Pública ou Privada?');
});

test('nada muda quando o documento já tem o resultado', () => {
  const item = { id: 2, nome: 'SINIMBU', valores: { [id('Situação')]: opcao('Situação', 'Parada') } };
  assert.deepEqual(calcularSituacao(obras, registro, colunas, item, { situacao: 'Obra Parada', status: 'CONTRATADA' }, hoje).gravar, []);
});

test('sem fórmula ligada, ou em outro cadastro, não calcula', () => {
  assert.equal(calcularSituacao(obras, { ...registro, formula_situacao: undefined }, colunas, { valores: {} }, {}, hoje), null);
  assert.equal(calcularSituacao(m.cadastroExistente('veiculos-v2'), registro, colunas, { valores: {} }, {}, hoje), null);
  assert.equal(calcularSituacao(obras, { ...registro, formula_situacao: { coluna_id: col('Empresa').id } }, colunas, { valores: {} }, {}, hoje), null);
});

test('hoje em Brasília: 02:00 UTC ainda é o dia anterior', () => {
  const d = hojeEmBrasilia(Date.UTC(2026, 9, 27, 2, 0));
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 9, 26, 23]);
});

test('contrato arquivado ou na lixeira no Friday → FINALIZADA (sai do app); restaurado → volta pela fórmula', () => {
  const valores = { [id('Situação')]: opcao('Situação', 'Parada') };
  const doc = { tipoObra: 'Pública', situacao: 'Obra Parada', status: 'CONTRATADA' };
  const arquivado = calcularSituacao(obras, registro, colunas, { id: 3, nome: 'X', valores, arquivado_em: '2026-10-27 17:00:00' }, doc, hoje);
  assert.deepEqual(arquivado.gravar, [['status', 'FINALIZADA']]); // a situação (resultado da fórmula) fica
  const lixeira = calcularSituacao(obras, registro, colunas, { id: 3, nome: 'X', valores, excluido_em: '2026-10-27 17:00:00' }, doc, hoje);
  assert.deepEqual(lixeira.gravar, [['status', 'FINALIZADA']]);
  const restaurado = calcularSituacao(obras, registro, colunas, { id: 3, nome: 'X', valores, arquivado_em: null }, { ...doc, status: 'FINALIZADA' }, hoje);
  assert.deepEqual(restaurado.gravar, [['status', 'CONTRATADA']]);
});

test('contrato novo criado no Friday: obras-v2 cria o registro com os padrões, o nome do item e os campos ligados', () => {
  assert.equal(obras.cria_registro, true);
  assert.equal(m.cadastroExistente('veiculos-v2').cria_registro, undefined);
  const item = { id: 9, nome: '  NOVO CONTRATO 12/2026 ', valores: { [id('Empresa')]: [col('Empresa').config.rotulos.find(r => r.texto === 'LEDUR').id][0], [id('Fim')]: '2026-12-20' } };
  const { doc, erros: e } = m.novoRegistro(obras, campos, item, { coluna_id: null, caminho: 'nomeObra' });
  assert.deepEqual(e, []);
  assert.equal(doc.nomeObra, 'NOVO CONTRATO 12/2026');
  assert.equal(doc.siglaObra, ''); assert.equal(doc.codObra, 0); assert.equal(doc.local, 'CORRIGIR'); assert.equal(doc.status, 'CONTRATADA');
  assert.equal(doc.empresa, 'LEDUR'); assert.equal(doc.dataFinal, '2026-12-20');
  assert.equal(m.caminhoDaMarca(obras), 'friday.ok');
});
