import test from 'node:test';
import assert from 'node:assert/strict';
import { destinatariosDaMencao, textoDoAviso, textoSemMarcas } from '../src/features/friday-gestao-interna/avisos.ts';

const nomes: Record<string, string> = { ana: 'Ana Souza', beto: 'Beto Lima' };
const nome = (uid: string) => nomes[uid];
const todos = () => true;

test('marcas @{uid} viram @Nome; pessoa desconhecida vira @alguém', () => {
  assert.equal(textoSemMarcas('Oi @{ana}, veja com @{beto} e @{xyz}', nome), 'Oi @Ana Souza, veja com @Beto Lima e @alguém');
});

test('texto do aviso tem o prefixo e no máximo 300 caracteres', () => {
  assert.equal(textoDoAviso('  @{ana} confere  ', nome), 'mencionou você: @Ana Souza confere');
  assert.equal(textoDoAviso('x'.repeat(400), nome).length, 300);
});

test('cada pessoa marcada recebe um aviso, menos quem escreveu', () => {
  assert.deepEqual(destinatariosDaMencao({ marcados: ['ana', 'beto', 'ana', 'eu'], autor: 'eu', podeReceber: todos }), ['ana', 'beto']);
});

test('na edição, só quem foi marcado agora recebe', () => {
  assert.deepEqual(destinatariosDaMencao({ marcados: ['ana', 'beto'], antes: ['ana'], autor: 'eu', podeReceber: todos }), ['beto']);
  assert.deepEqual(destinatariosDaMencao({ marcados: ['ana'], antes: ['ana', 'beto'], autor: 'eu', podeReceber: todos }), []);
});

test('quem não pode receber (fora do Friday) fica de fora; marcas inválidas são ignoradas', () => {
  assert.deepEqual(destinatariosDaMencao({ marcados: ['ana', 'beto'], autor: 'eu', podeReceber: uid => uid === 'beto' }), ['beto']);
  assert.deepEqual(destinatariosDaMencao({ marcados: null, autor: 'eu', podeReceber: todos }), []);
  assert.deepEqual(destinatariosDaMencao({ marcados: ['', 'ana'], antes: 'x', autor: 'eu', podeReceber: todos }), ['ana']);
});
