import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encaixarItens } from '../src/features/friday-gestao-interna/quadro/aoVivo.ts';
import type { Dados } from '../src/features/friday-gestao-interna/quadro/useQuadro.ts';
import type { Item } from '../src/features/friday-gestao-interna/quadro/tipos.ts';

// Quadro 1 (grupos 10 e 11 na tela), quadro de subitens 2. Item 100 com dois subitens; item 101 sem.
const it = (id: number, campos: Partial<Item> = {}): Item => ({ id, quadro_id: 1, grupo_id: 10, item_pai_id: null, nome: `item ${id}`, posicao: id, valores: {}, ...campos });
const sub = (id: number, pai: number, campos: Partial<Item> = {}): Item => it(id, { quadro_id: 2, grupo_id: 20, item_pai_id: pai, ...campos });
const dados = (): Dados => ({
  quadro: { id: 1 }, grupos: [{ id: 10, posicao: 1 }, { id: 11, posicao: 2 }] as never, colunas: [], visoes: [],
  itens: [it(100, { valores: { 5: 'Feito' }, n_atualizacoes: 3, atualizacoes_novas: true, n_anexos: 1, n_subitens: 2 }), it(101, { n_subitens: 0 })],
  sub: { quadro_id: 2, grupo_id: 20, colunas: [], itens: [sub(200, 100), sub(201, 100)] },
});

test('valor mudado fora da tela entra no item e os contadores da tela ficam', () => {
  const d = encaixarItens(dados(), [it(100, { valores: { 5: 'Em andamento' } })]);
  const i = d.itens.find(x => x.id === 100)!;
  assert.deepEqual(i.valores, { 5: 'Em andamento' });
  assert.equal(i.n_atualizacoes, 3);
  assert.equal(i.atualizacoes_novas, true);
  assert.equal(i.n_anexos, 1);
  assert.equal(i.n_subitens, 2);
  assert.equal(d.itens.length, 2);
});

test('item novo entra com contadores zerados; sem mudança, a tela fica a mesma', () => {
  const antes = dados();
  assert.equal(encaixarItens(antes, []), antes);
  const d = encaixarItens(antes, [it(102, { grupo_id: 11 })]);
  assert.deepEqual(d.itens.map(i => i.id), [100, 101, 102]);
  assert.equal(d.itens[2].n_atualizacoes, 0);
  assert.equal(d.itens[2].n_subitens, 0);
});

test('arquivado, na lixeira, removido ou num grupo fora da tela sai; os subitens dele também', () => {
  assert.deepEqual(encaixarItens(dados(), [it(101, { arquivado_em: '2026-11-27 10:00:00' })]).itens.map(i => i.id), [100]);
  assert.deepEqual(encaixarItens(dados(), [it(101, { grupo_id: 99 })]).itens.map(i => i.id), [100]);
  assert.deepEqual(encaixarItens(dados(), [it(102, { grupo_id: 99 })]).itens.map(i => i.id), [100, 101]);
  const d = encaixarItens(dados(), [it(100, { excluido_em: '2026-11-27 10:00:00' })]);
  assert.deepEqual(d.itens.map(i => i.id), [101]);
  assert.deepEqual(d.sub!.itens, []);
  assert.deepEqual(encaixarItens(dados(), [], [101]).itens.map(i => i.id), [100]);
});

test('subitem novo, mudado ou excluído atualiza a lista e a contagem do item pai', () => {
  let d = encaixarItens(dados(), [sub(202, 101), sub(200, 100, { nome: 'renomeado' })]);
  assert.deepEqual(d.sub!.itens.map(s => s.id), [200, 201, 202]);
  assert.equal(d.sub!.itens[0].nome, 'renomeado');
  assert.equal(d.itens.find(i => i.id === 101)!.n_subitens, 1);
  d = encaixarItens(d, [sub(201, 100, { excluido_em: '2026-11-27 10:00:00' })]);
  assert.equal(d.itens.find(i => i.id === 100)!.n_subitens, 1);
  assert.deepEqual(encaixarItens(dados(), [sub(203, 999)]).sub!.itens.map(s => s.id), [200, 201]);
});
