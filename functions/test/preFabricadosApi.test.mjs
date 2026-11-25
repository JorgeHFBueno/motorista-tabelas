import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  EntradaInvalida, formatoChavePreFabricados, hashChavePreFabricados, pdfIdValido, pdfsAtuaisDoLote, pedidoDaRota, pessoaDaChavePreFabricados,
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
