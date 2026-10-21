import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFuncionario, camposExtrasFuncionario, iniciais, namesAreEquivalent, normalizeName, perfisMarcados } from '../src/services/funcionarios';

test('normalizes names only for non-destructive suggestions', () => {
  assert.equal(normalizeName('  Ámilton  Pinheiro-Fortes '), 'amilton pinheiro fortes');
  assert.equal(namesAreEquivalent('AMILTON PINHEIRO FORTES', 'amilton pinheiro-fortes'), true);
  assert.equal(namesAreEquivalent('Ana', 'Amanda'), false);
});

test('builds canonical employee with Auth email attribute and motorista order', () => {
  const employee = buildFuncionario({
    nome: ' Amilton Pinheiro Fortes ', email: 'AMILTON@example.com', ativo: true,
    autorizado: { id: 'legacy@example.com', nome: 'Legacy', adm1: false, adm2: true },
    motorista: { id: 'amilton-pinheiro-fortes', nome: 'AMILTON PINHEIRO FORTES', ordem: 7 },
  });
  assert.equal(employee.email, 'amilton@example.com');
  assert.equal(employee.perfis.adm2, true);
  assert.equal(employee.perfis.motorista, true);
  assert.equal(employee.motorista?.ordem, 7);
  assert.equal('origem' in employee, false);
  assert.equal('legacyId' in employee, false);
});

test('builds non-driver employee without motorista object', () => {
  const employee = buildFuncionario({ nome: 'User', email: 'user@example.com', ativo: false, autorizado: { id: 'user@example.com', adm1: true } });
  assert.equal(employee.perfis.adm1, true);
  assert.equal(employee.perfis.motorista, false);
  assert.equal('motorista' in employee, false);
});

test('profile page lists only true perfis, known ones first', () => {
  assert.deepEqual(perfisMarcados({ user: true, adm1: false, motorista: true, adm2: true, mecanico: true, novo: true, outro: false }), ['Adm2', 'Motorista', 'Mecânico', 'User', 'novo']);
  assert.deepEqual(perfisMarcados(undefined), []);
  assert.deepEqual(perfisMarcados('adm2'), []);
});

test('profile page shows funcionarios fields beyond the known ones', () => {
  const extras = camposExtrasFuncionario({ nome: 'A', email: 'a@x.com', ativo: true, perfis: {}, motorista: { ordem: 1 }, createdAt: 1, updatedAt: 2, telefone: '51', cpf: '1' });
  assert.deepEqual(extras, [['cpf', '1'], ['telefone', '51']]);
});

test('avatar initials use the first two words, without e-mail domain', () => {
  assert.equal(iniciais('Jorge Henrique Fiel'), 'JH');
  assert.equal(iniciais('jorge@example.com'), 'J');
  assert.equal(iniciais(''), '?');
});
