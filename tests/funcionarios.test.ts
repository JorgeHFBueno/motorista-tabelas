import assert from 'node:assert/strict';
import test from 'node:test';
import { camposExtrasFuncionario, iniciais, perfisMarcados } from '../src/services/funcionarios';

test('profile page lists only the true credentials, in the list order', () => {
  assert.deepEqual(perfisMarcados({ user: true, adm1: true, motorista: true, adm2: true, mecanico: true, engenharia: true, escritorio: false, novo: true }), ['Adm2', 'Motorista', 'Mecânico', 'Engenharia']);
  assert.deepEqual(perfisMarcados(undefined), []);
  assert.deepEqual(perfisMarcados('adm2'), []);
});

test('profile page shows funcionarios fields beyond the known ones', () => {
  const extras = camposExtrasFuncionario({ nome: 'A', email: 'a@x.com', ativo: true, perfis: {}, motorista: { ordem: 1 }, createdAt: 1, updatedAt: 2, ultimoAcesso: 3, telefone: '51', cpf: '1' });
  assert.deepEqual(extras, [['cpf', '1'], ['telefone', '51']]);
});

test('avatar initials use the first two words, without e-mail domain', () => {
  assert.equal(iniciais('Jorge Henrique Fiel'), 'JH');
  assert.equal(iniciais('jorge@example.com'), 'J');
  assert.equal(iniciais(''), '?');
});
