import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidEmailIdentifier,
  normalizePhoneIdentifier,
  prepareLoginIdentifier,
} from '../src/services/loginIdentifier';

test('prepara celular normalizado com o domínio legado', () => {
  assert.equal(normalizePhoneIdentifier('(51) 99999-9999'), '51999999999');
  assert.equal(prepareLoginIdentifier('51999999999', true), '51999999999@example.com');
});

test('não duplica o domínio legado no modo celular', () => {
  assert.equal(prepareLoginIdentifier('51999999999@example.com', true), '51999999999@example.com');
});

test('mantém e-mail completo e remove espaços externos', () => {
  assert.equal(prepareLoginIdentifier(' usuario@empresa.com.br ', false), 'usuario@empresa.com.br');
});

test('valida formato de e-mail antes da autenticação', () => {
  assert.equal(isValidEmailIdentifier('usuario@empresa.com.br'), true);
  assert.equal(isValidEmailIdentifier('usuario@empresa'), false);
  assert.equal(isValidEmailIdentifier('usuario empresa.com.br'), false);
});
