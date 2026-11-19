import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dataLocal, gerarChave, sha256Hex } from '../src/services/chaveApi';

// As Functions acham a chave pelo SHA-256 (hashChave em functions/fridayApiDominio.ts) e conferem o formato
// (prefixo + 40 letras e números). O que a tela grava como id precisa bater com isso.

test('chave do sistema: "sis_" + 40 letras e números, sorteada a cada vez', () => {
  const a = gerarChave('sis_');
  const b = gerarChave('sis_');
  assert.match(a, /^sis_[A-Za-z0-9]{40}$/);
  assert.notEqual(a, b);
});

test('chave do Friday continua no formato que a fridayApi aceita', () => {
  assert.match(gerarChave('fri_'), /^fri_[A-Za-z0-9]{40}$/);
});

test('o hash gravado pela tela é o mesmo que as Functions calculam', async () => {
  for (const chave of [gerarChave('sis_'), gerarChave('fri_'), 'sis_Ação é texto com acento']) {
    assert.equal(await sha256Hex(chave), createHash('sha256').update(chave).digest('hex'));
  }
  assert.match(await sha256Hex(gerarChave('sis_')), /^[0-9a-f]{64}$/);
});

test('data local no formato das chaves (AAAA-MM-DD HH:MM:SS)', () => {
  assert.match(dataLocal(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const d = new Date(2026, 10, 18, 9, 5, 7);
  assert.equal(dataLocal(d), '2026-11-18 09:05:07');
});
