import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chaveDoSubitem, colunaNoTipo, colunaSoNoTipo, colunasUsadas, combinacoes, limparMapa, marcarColunaNoTipo, tipoDoItem, tiposDoSub, tiposItemDo,
} from '../src/features/friday-gestao-interna/quadro/tiposSubitem.ts';

// Item: coluna 10 = tipo do item (A = PÚBLICA, B = PRIVADA), coluna 11 = tipo dos subitens (1 = PONTE, 2 = PAVILHÃO).
const ti = { coluna_id: 10, colunas: { 30: ['A'] } };          // coluna 30 do quadro só em PÚBLICA
const ts = { coluna_item: 10, coluna_id: 11, colunas: { 21: ['A:1', 'B:1'], 22: ['A:2'] } };
const item = (a?: string, b?: string) => ({ valores: { ...(a ? { 10: a } : {}), ...(b ? { 11: b } : {}) } });

test('configuração ausente ou sem coluna não esconde nada', () => {
  assert.equal(tiposItemDo({}), null);
  assert.equal(tiposItemDo({ tipos_item: null }), null);
  assert.equal(tiposDoSub({ tipos: { colunas: {} } }), null);
  assert.deepEqual(tiposDoSub({ tipos: { coluna_item: 10, coluna_id: null } }), { coluna_item: 10, coluna_id: null });
  assert.equal(chaveDoSubitem(null, item('A', '1')), null);
  assert.equal(colunaNoTipo(null, 21, null), true);
});

test('tipo do item e combinação dos subitens vêm do item; faltando um lado, mostra tudo', () => {
  assert.equal(tipoDoItem(ti, item('B')), 'B');
  assert.equal(tipoDoItem(ti, item()), null);
  assert.equal(tipoDoItem(ti, { valores: { 10: '0' } }), null);
  assert.equal(chaveDoSubitem(ts, item('A', '2')), 'A:2');
  assert.equal(chaveDoSubitem(ts, item('A')), null);
  assert.equal(chaveDoSubitem({ coluna_id: 11 }, item(undefined, '1')), '1'); // só o tipo do subitem
  assert.equal(chaveDoSubitem({ coluna_item: 10 }, item('B')), 'B');          // só o tipo do item
});

test('cada combinação mostra as comuns e as suas', () => {
  const visiveis = (chave: string | null) => [20, 21, 22].filter(id => colunaNoTipo(ts, id, chave));
  assert.deepEqual(visiveis('A:1'), [20, 21]);
  assert.deepEqual(visiveis('B:1'), [20, 21]);
  assert.deepEqual(visiveis('A:2'), [20, 22]);
  assert.deepEqual(visiveis('B:2'), [20]);
  assert.deepEqual(visiveis(null), [20, 21, 22]);
});

test('combinações: os dois lados, ou só um', () => {
  const A = { id: 'A' }, B = { id: 'B' }, um = { id: '1' }, dois = { id: '2' };
  assert.deepEqual(combinacoes([A, B], [um, dois]).map(c => c.chave), ['A:1', 'A:2', 'B:1', 'B:2']);
  assert.deepEqual(combinacoes(null, [um, dois]).map(c => c.chave), ['1', '2']);
  assert.deepEqual(combinacoes([A], null).map(c => c.chave), ['A']);
});

test('tabela do quadro: coluna que nenhum item mostrado usa sai; item sem tipo mantém todas', () => {
  const cols = [{ id: 30 }, { id: 31 }];
  assert.deepEqual(colunasUsadas(ti, cols, [item('B')]).map(c => c.id), [31]);
  assert.deepEqual(colunasUsadas(ti, cols, [item('B'), item('A')]).map(c => c.id), [30, 31]);
  assert.deepEqual(colunasUsadas(ti, cols, [item('B'), item()]).map(c => c.id), [30, 31]);
  assert.deepEqual(colunasUsadas(null, cols, [item('B')]).map(c => c.id), [30, 31]);
});

test('marcar em todas volta a ser comum; limpar tira chaves que não existem mais', () => {
  const todos = ['A:1', 'A:2', 'B:1', 'B:2'];
  assert.equal(marcarColunaNoTipo(ts, 21, 'A:2', true, ['A:1', 'A:2', 'B:1']).colunas?.['21'], undefined);
  assert.deepEqual(marcarColunaNoTipo(ts, 20, 'B:2', false, todos).colunas?.['20'], ['A:1', 'A:2', 'B:1']);
  assert.deepEqual(colunaSoNoTipo(ts, 23, 'B:2').colunas?.['23'], ['B:2']);
  assert.deepEqual(limparMapa({ 21: ['A:1', 'B:1', 'C:1'], 22: ['A:1', 'A:2'] }, ['A:1', 'A:2']), { 21: ['A:1'] });
});
