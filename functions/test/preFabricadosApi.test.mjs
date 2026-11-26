import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  EntradaInvalida, StatusFora, formatoChavePreFabricados, hashChavePreFabricados, passoDoRobo, pdfIdValido, pdfsAtuaisDoLote, pedidoDaRota,
  pessoaDaChavePreFabricados, sincronizacaoIdValido, sincronizacaoParaRobo,
} from '../lib/preFabricadosApiDominio.js';

const CHAVE = `enpf_${'A1b2C3d4E5'.repeat(4)}`;

test('Pré-Fabricados key: format enpf_ + 40 and SHA-256 equal to the browser hash', () => {
  assert.equal(formatoChavePreFabricados(CHAVE), true);
  assert.equal(formatoChavePreFabricados(`encr_${'a'.repeat(40)}`), false);
  assert.equal(formatoChavePreFabricados(`fri_${'a'.repeat(40)}`), false);
  assert.equal(formatoChavePreFabricados(`enpf_${'a'.repeat(39)}`), false);
  assert.equal(formatoChavePreFabricados(undefined), false);
  assert.equal(hashChavePreFabricados(CHAVE), createHash('sha256').update(CHAVE).digest('hex'));
});

test('Pré-Fabricados key person: not revoked, active employee who sees the Engenharia area (or adm2)', () => {
  const registro = { uid: 'u1', nome: 'Robô', revogada_em: null };
  const engenharia = { ativo: true, nome: 'Samuel', areas: { engenharia: 'ver' } };
  assert.deepEqual(pessoaDaChavePreFabricados(registro, engenharia), { uid: 'u1', nome: 'Samuel', adm2: false });
  assert.deepEqual(pessoaDaChavePreFabricados(registro, { ativo: true, nome: 'Jorge', perfis: { adm2: true } }), { uid: 'u1', nome: 'Jorge', adm2: true });
  assert.equal(pessoaDaChavePreFabricados(registro, { ativo: true, areas: { friday: 'editar' } }), null, 'sem a área Engenharia');
  assert.equal(pessoaDaChavePreFabricados({ ...registro, revogada_em: '2026-11-24 10:00:00' }, engenharia), null);
  assert.equal(pessoaDaChavePreFabricados(registro, { ...engenharia, ativo: false }), null);
  assert.equal(pessoaDaChavePreFabricados(undefined, engenharia), null);
});

test('pedido from the route and PDF id', () => {
  assert.equal(pedidoDaRota('953'), '953');
  assert.equal(pedidoDaRota('%20953%20'), '953');
  assert.equal(pedidoDaRota('PED-12.a'), 'PED-12.a');
  assert.throws(() => pedidoDaRota(''), EntradaInvalida);
  assert.throws(() => pedidoDaRota('9 53'), EntradaInvalida);
  assert.throws(() => pedidoDaRota('%E0%A4%A'), EntradaInvalida, 'malformed escape');
  assert.equal(pdfIdValido('AbC_12-x'), true);
  assert.equal(pdfIdValido('../x'), false);
});

test('current PDF per item of the LOTE, revision numbered like the screen (Rev. 0 is the oldest)', () => {
  const ts = (iso) => ({ toDate: () => new Date(iso) });
  const pdf = (id, lote, item, quando, extra = {}) => ({ id, data: { lote, item, nome: `${id}.pdf`, tamanho: 100, anexadoEm: ts(quando), anexadoPor: { uid: 'u', nome: 'Ana' }, ...extra } });
  const itens = pdfsAtuaisDoLote([
    pdf('v0', 'l1', 'VIGA|VL - 25X50X750', '2026-11-20T10:00:00Z'),
    pdf('v2', 'l1', 'VIGA|VL - 25X50X750', '2026-11-24T10:00:00Z'),
    pdf('v1', 'l1', 'VIGA|VL - 25X50X750', '2026-11-22T10:00:00Z'),
    pdf('c1', 'l1', 'VIGA|VL - 25X50X750', '2026-11-25T10:00:00Z', { parte: 'console' }),
    pdf('c0', 'l1', 'VIGA|VL - 25X50X750', '2026-11-21T10:00:00Z', { parte: 'console' }),
    pdf('t0', 'l1', 'VIGOTA|TR16745 L = 1,43M 20PC', '2026-11-21T10:00:00Z'),
    pdf('outro-lote', 'l2', 'VIGA|VL - 25X50X750', '2026-11-25T10:00:00Z'),
    { id: 'vazio', data: undefined },
  ], 'l1');
  assert.deepEqual(itens.map((i) => [i.produto, i.nome, i.parte, i.pdfId, i.revisao, i.revisoes]), [
    ['VIGA', 'VL - 25X50X750', 'principal', 'v2', 2, 3],
    ['VIGA', 'VL - 25X50X750', 'console', 'c1', 1, 2],
    ['VIGOTA', 'TR16745 L = 1,43M 20PC', 'principal', 't0', 0, 1],
  ]);
  assert.deepEqual([itens[0].arquivo, itens[0].tamanho, itens[0].anexadoEm, itens[0].anexadoPor], ['v2.pdf', 100, '2026-11-24T10:00:00.000Z', 'Ana']);
  assert.deepEqual(pdfsAtuaisDoLote([], 'l1'), []);
});

test('Sincronizar: the robot steps pedido → simulando → previa, aprovado → gravando → concluido, and erro from any of them', () => {
  assert.deepEqual(passoDoRobo('pedido', { status: 'simulando' }), { status: 'simulando' });
  assert.deepEqual(passoDoRobo('simulando', { status: 'previa', previa: '  2 peças, 112,7 kg  ' }), { status: 'previa', previa: '2 peças, 112,7 kg' });
  assert.deepEqual(passoDoRobo('aprovado', { status: 'gravando' }), { status: 'gravando' });
  assert.deepEqual(passoDoRobo('gravando', { status: 'concluido', mensagem: 'VL registrada' }), { status: 'concluido', mensagem: 'VL registrada' });
  for (const atual of ['pedido', 'simulando', 'aprovado', 'gravando']) {
    assert.deepEqual(passoDoRobo(atual, { status: 'erro', mensagem: 'sem sessão no Plannix' }), { status: 'erro', mensagem: 'sem sessão no Plannix' });
  }
  // Fora de ordem ou depois do fim: 409.
  assert.throws(() => passoDoRobo('pedido', { status: 'previa', previa: 'x' }), StatusFora);
  assert.throws(() => passoDoRobo('previa', { status: 'gravando' }), StatusFora, 'gravar só depois de aprovada na tela');
  assert.throws(() => passoDoRobo('simulando', { status: 'aprovado' }), StatusFora, 'aprovar é da tela');
  for (const fim of ['concluido', 'erro', 'cancelado']) assert.throws(() => passoDoRobo(fim, { status: 'erro', mensagem: 'x' }), StatusFora);
  // Corpo inválido: 400.
  assert.throws(() => passoDoRobo('pedido', undefined), EntradaInvalida);
  assert.throws(() => passoDoRobo('pedido', { status: 'voando' }), EntradaInvalida);
  assert.throws(() => passoDoRobo('simulando', { status: 'previa' }), EntradaInvalida, 'prévia sem texto');
  assert.throws(() => passoDoRobo('pedido', { status: 'simulando', previa: 'x' }), EntradaInvalida, 'prévia fora do status previa');
  assert.throws(() => passoDoRobo('pedido', { status: 'erro' }), EntradaInvalida, 'erro sem mensagem');
  assert.throws(() => passoDoRobo('pedido', { status: 'simulando', aprovadoPor: 'robô' }), EntradaInvalida, 'campo desconhecido');
  assert.throws(() => passoDoRobo('simulando', { status: 'previa', previa: 'x'.repeat(20001) }), EntradaInvalida);
});

test('Sincronizar: document id {obraId}__{lote} and the shape the robot receives', () => {
  assert.equal(sincronizacaoIdValido('Eq8D8fNDtoCsfBkgsaqN__1795'), true);
  assert.equal(sincronizacaoIdValido('Eq8D8fNDtoCsfBkgsaqN'), false);
  assert.equal(sincronizacaoIdValido('a/b__c'), false);
  const quando = { toDate: () => new Date('2026-11-25T18:00:00Z') };
  assert.deepEqual(sincronizacaoParaRobo('o1__l1', {
    obraId: 'o1', lote: 'l1', pedido: '953', plannix: 141, status: 'aprovado', pedidoPor: { uid: 'u1', nome: 'Brayan' }, pedidoEm: quando,
    aprovadoPor: { uid: 'u2', nome: 'Jorge' }, aprovadoEm: quando, previa: '2 peças', atualizadoEm: quando,
  }, { obra: 'ALEGRIA 147/2026', lote: 'LOTE 1' }), {
    id: 'o1__l1', obraId: 'o1', obra: 'ALEGRIA 147/2026', lote: 'l1', loteNome: 'LOTE 1', pedido: '953', plannix: 141, status: 'aprovado',
    pedidoPor: 'Brayan', pedidoEm: '2026-11-25T18:00:00.000Z', aprovadoPor: 'Jorge', aprovadoEm: '2026-11-25T18:00:00.000Z',
    previa: '2 peças', mensagem: null, atualizadoEm: '2026-11-25T18:00:00.000Z',
  });
});

test('Sincronizar: a note (only "mensagem") keeps the step, in simulando and gravando only', () => {
  assert.deepEqual(passoDoRobo('simulando', { mensagem: ' baixando os PDFs ' }), { status: 'simulando', mensagem: 'baixando os PDFs' });
  assert.deepEqual(passoDoRobo('gravando', { status: 'gravando', mensagem: 'registrando P01 de 5' }), { status: 'gravando', mensagem: 'registrando P01 de 5' });
  for (const atual of ['pedido', 'previa', 'aprovado', 'concluido', 'erro', 'cancelado']) {
    assert.throws(() => passoDoRobo(atual, { mensagem: 'oi' }), StatusFora, atual);
  }
  assert.throws(() => passoDoRobo('simulando', {}), EntradaInvalida, 'recado sem texto');
  assert.throws(() => passoDoRobo('simulando', { mensagem: '   ' }), EntradaInvalida);
  assert.throws(() => passoDoRobo('simulando', { previa: 'x' }), EntradaInvalida, 'prévia sem trocar de passo');
  assert.throws(() => passoDoRobo('gravando', { mensagem: 'x'.repeat(2001) }), EntradaInvalida);
});
