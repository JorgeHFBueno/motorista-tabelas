import assert from 'node:assert/strict';
import test from 'node:test';
import {
  descreverLogin,
  formatarCelular,
  isValidEmailIdentifier,
  normalizePhoneIdentifier,
  prepareLoginIdentifier,
} from '../src/services/loginIdentifier';

test('sem @ é celular: só os dígitos com o domínio legado', () => {
  assert.equal(normalizePhoneIdentifier('(51) 99999-9999'), '51999999999');
  assert.equal(prepareLoginIdentifier('51999999999'), '51999999999@example.com');
  assert.equal(prepareLoginIdentifier(' (51) 99999-9999 '), '51999999999@example.com');
  assert.equal(prepareLoginIdentifier('   '), '');
  assert.equal(prepareLoginIdentifier('abc'), '');
});

test('com @ é e-mail: sem espaços externos e em minúsculas', () => {
  assert.equal(prepareLoginIdentifier(' Usuario@Empresa.com.br '), 'usuario@empresa.com.br');
  assert.equal(prepareLoginIdentifier('51999999999@example.com'), '51999999999@example.com');
});

test('valida formato de e-mail antes da autenticação', () => {
  assert.equal(isValidEmailIdentifier('usuario@empresa.com.br'), true);
  assert.equal(isValidEmailIdentifier('usuario@empresa'), false);
  assert.equal(isValidEmailIdentifier('usuario empresa.com.br'), false);
});

test('descreve o login de celular sem o domínio legado', () => {
  assert.deepEqual(descreverLogin('991662971@example.com'), { tipo: 'celular', valor: '991662971' });
  assert.deepEqual(descreverLogin(' Jorge@Ledur.com.br '), { tipo: 'email', valor: 'jorge@ledur.com.br' });
  assert.deepEqual(descreverLogin(null), { tipo: 'email', valor: '' });
});

test('formata o celular para exibição', () => {
  assert.equal(formatarCelular('51991662971'), '(51) 99166-2971');
  assert.equal(formatarCelular('5132221234'), '(51) 3222-1234');
  assert.equal(formatarCelular('991662971'), '99166-2971');
  assert.equal(formatarCelular('123'), '123');
});
