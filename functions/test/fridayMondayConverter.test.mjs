import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configDe, converterFormulaMonday, dataLocal, decidirItem, mesclarOpcoesLista, mesclarRotulosStatus, mesclarValores,
  pessoasDosValores, prefixosBusca, quadrosDeSubitens, resolverLigacoes, tipoFriday, valorDe, valoresDoItem,
} from '../lib/fridayMondayConverter.js';

const statusCol = {
  id: 'status', title: 'Status', type: 'status',
  settings_str: JSON.stringify({ labels: { 0: 'Em andamento', 1: 'Feito', 2: 'Parado', 5: '' }, labels_colors: { 1: { color: '#00c875' } }, done_colors: [1] }),
};

test('status: índices do monday viram ids do Friday, com rótulo concluído e vazio', () => {
  const cfg = configDe(statusCol);
  assert.deepEqual(cfg.rotulos.map(r => [r.id, r.texto, !!r.concluido]), [['1', 'Em andamento', false], ['2', 'Feito', true], ['3', 'Parado', false], ['0', '', false]]);
  assert.deepEqual(cfg.origem_rotulos, { 0: '1', 1: '2', 2: '3', 5: null });
  const col = { id: 10, tipoMonday: 'status', config: cfg };
  assert.equal(valorDe(col, { id: 'status', type: 'status', text: 'Feito', value: '{"index":1}' }, {}), '2');
  assert.equal(valorDe(col, { id: 'status', type: 'status', text: '', value: '{"index":5}' }, {}), null);
});

test('status: reimportação acrescenta rótulos novos sem mexer nos existentes', () => {
  const cfg = configDe(statusCol);
  cfg.rotulos[0].texto = 'Fazendo (renomeado no Friday)';
  const novo = mesclarRotulosStatus(cfg, { labels: { 0: 'Em andamento', 1: 'Feito', 2: 'Parado', 3: 'Aguardando' } });
  assert.equal(novo.rotulos[0].texto, 'Fazendo (renomeado no Friday)');
  assert.equal(novo.origem_rotulos['3'], '4');
  assert.equal(novo.rotulos.at(-1).id, '0');
  assert.equal(novo.rotulos.filter(r => r.id === '4').length, 1);
});

test('lista suspensa: opções novas entram pelo id do monday', () => {
  const cfg = configDe({ id: 'd', title: 'Setor', type: 'dropdown', settings_str: JSON.stringify({ labels: [{ id: 1, name: 'Fábrica' }] }) });
  const novo = mesclarOpcoesLista(cfg, { labels: [{ id: 1, name: 'Fábrica' }, { id: 7, name: 'Montagem' }] });
  assert.deepEqual(novo.opcoes.map(o => o.id), ['1', '7']);
});

test('tipos: colunas calculadas pelo monday são ignoradas e desconhecidas viram texto', () => {
  assert.equal(tipoFriday('last_updated'), null);
  assert.equal(tipoFriday('subtasks'), null);
  assert.equal(tipoFriday('tipo_que_nao_existe'), 'texto');
  assert.equal(tipoFriday('timeline'), 'periodo');
});

test('valores: pessoas, período, número, link, caixa e ligações', () => {
  const cols = new Map([
    ['pessoas', { id: 1, tipoMonday: 'people', config: {} }],
    ['crono', { id: 2, tipoMonday: 'timeline', config: {} }],
    ['valor', { id: 3, tipoMonday: 'numbers', config: {} }],
    ['site', { id: 4, tipoMonday: 'link', config: {} }],
    ['ok', { id: 5, tipoMonday: 'checkbox', config: {} }],
    ['obra', { id: 6, tipoMonday: 'board_relation', config: {} }],
  ]);
  const item = {
    id: '900', name: 'Viagem', created_at: '', updated_at: '', group: null, parent_item: null, column_values: [
      { id: 'pessoas', type: 'people', text: 'Ana', value: JSON.stringify({ personsAndTeams: [{ id: 11, kind: 'person' }, { id: 99, kind: 'team' }, { id: 12, kind: 'person' }] }) },
      { id: 'crono', type: 'timeline', text: '', value: JSON.stringify({ from: '2026-10-01', to: '2026-10-09' }) },
      { id: 'valor', type: 'numbers', text: '1500.5', value: '"1500.5"' },
      { id: 'site', type: 'link', text: '', value: JSON.stringify({ url: 'https://ledur.com.br', text: 'Site' }) },
      { id: 'ok', type: 'checkbox', text: '', value: JSON.stringify({ checked: 'true' }) },
      { id: 'obra', type: 'board_relation', text: '', value: null, linked_item_ids: ['501', '502'] },
      { id: 'ignorada', type: 'text', text: 'x', value: null },
    ],
  };
  // Pessoas do monday não são importadas: a coluna de pessoa chega vazia.
  const r = valoresDoItem(item, cols, {});
  assert.deepEqual(r.valores, { 2: { inicio: '2026-10-01', fim: '2026-10-09' }, 3: 1500.5, 4: { url: 'https://ledur.com.br', texto: 'Site' }, 5: true });
  assert.deepEqual(r.ligacoes, { 6: ['501', '502'] });
  const lig = resolverLigacoes(r.ligacoes, id => (id === '501' ? 77 : undefined));
  assert.deepEqual(lig.valores, { 6: [77] });
  assert.deepEqual(lig.pendentes, { 6: ['502'] });
});

test('fórmulas: ids das colunas do monday viram ids do Friday', () => {
  const mapa = new Map([['status', { id: 10, tipoMonday: 'status' }], ['name', { id: null, tipoMonday: 'name' }], ['tempo', { id: 12, tipoMonday: 'time_tracking' }]]);
  assert.equal(converterFormulaMonday('IF({status#Labels}="Feito", {name}, {tempo} & {sumiu})', mapa), 'IF({@10#Labels}="Feito", {@nome}, ({@12}*3600) & {?sumiu})');
});

test('reimportação: criar, preservar editado no Friday, igual e atualizar', () => {
  assert.equal(decidirItem(undefined, 'a'), 'criar');
  assert.equal(decidirItem({ importado_em: 'x', atualizado_em: 'y', monday_atualizado_em: 'a' }, 'b'), 'preservar');
  assert.equal(decidirItem({ atualizado_em: 'y' }, 'b'), 'preservar');
  assert.equal(decidirItem({ importado_em: 'x', atualizado_em: 'x', monday_atualizado_em: 'a' }, 'a'), 'igual');
  assert.equal(decidirItem({ importado_em: 'x', atualizado_em: 'x', monday_atualizado_em: 'a' }, 'b'), 'atualizar');
});

test('reimportação: colunas criadas no Friday sobrevivem, as do monday são substituídas', () => {
  assert.deepEqual(mesclarValores({ 1: 'velho', 2: 'apagado no monday', 9: 'do Friday' }, { 1: 'novo' }, [1, 2]), { 1: 'novo', 9: 'do Friday' });
});

test('índices e datas seguem as mesmas regras da WEB', () => {
  assert.deepEqual(prefixosBusca('Pó Ç'), ['p', 'po', 'c']);
  assert.ok(prefixosBusca('Viagem Obra Ponte').includes('pon'));
  assert.deepEqual(pessoasDosValores({ 1: ['uidA', 'uidB', 5], 2: ['uidC'], 3: 'x' }, new Set(['1', '3'])), ['uidA', 'uidB']);
  assert.equal(dataLocal('2026-10-19T17:30:00Z'), '2026-10-19 14:30:00');
});

test('subitens: quadro apontado pela coluna subtasks', () => {
  assert.deepEqual(quadrosDeSubitens([{ id: 'subitems', title: 'Subitens', type: 'subtasks', settings_str: JSON.stringify({ boardIds: [123] }) }]), ['123']);
});
