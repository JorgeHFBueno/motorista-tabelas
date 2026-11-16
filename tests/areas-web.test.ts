import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizationProfileFromData } from '../src/services/authorizationProfileCore';
import { areasDoFuncionario, areasValidas } from '../src/services/areasWeb';
import { editaArea, temAlgumaCredencial, temCredencial, veArea } from '../src/services/credenciais';

// Áreas da WEB (decisão de 2026-11-16; The Manuscript, funcionarios.md).
const perfil = (data: Record<string, unknown>) => authorizationProfileFromData('uid', { nome: 'Pessoa', ativo: true, ...data });

test('areas: a document with the map uses only it; ver lets in, editar also edits', () => {
  const p = perfil({ perfis: { logistica: true }, areas: { combustivel: 'ver', frota: 'editar' } });
  assert.equal(veArea(p, 'combustivel'), true);
  assert.equal(editaArea(p, 'combustivel'), false);
  assert.equal(veArea(p, 'frota'), true);
  assert.equal(editaArea(p, 'frota'), true);
  assert.equal(veArea(p, 'logistica'), false, 'with the map, the old logistica credential no longer counts');
});

test('areas: without the map there is no WEB area, old credentials included (cleanup of 2026-11-16)', () => {
  assert.deepEqual(perfil({ perfis: { mecanico: true, escritorio: true, engenharia: true, autor: true, logistica: true } }).areas, {});
});

test('areas: adm2 sees and edits every area; an inactive person none', () => {
  const adm2 = perfil({ perfis: { adm2: true }, areas: {} });
  assert.equal(editaArea(adm2, 'cadastros'), true);
  assert.equal(veArea(adm2, 'manuscript'), true);
  assert.equal(temCredencial(adm2, 'retr0'), false, 'DEV stays retr0 only');
  const inativo = authorizationProfileFromData('uid', { ativo: false, areas: { combustivel: 'editar' } });
  assert.equal(veArea(inativo, 'combustivel'), false);
});

test('areas: invalid keys and levels are dropped; Friday has one level', () => {
  assert.deepEqual(areasValidas({ combustivel: 'ver', friday: 'ver', x: 'editar', frota: 'admin' }), { combustivel: 'ver', friday: 'editar' });
  assert.deepEqual(areasDoFuncionario({ areas: null }), {});
});

test('areas: a person with only WEB areas (no app credential) enters the WEB', () => {
  assert.equal(temAlgumaCredencial(perfil({ perfis: {}, areas: { portal: 'ver' } })), true);
  assert.equal(temAlgumaCredencial(perfil({ perfis: {}, areas: {} })), false);
});
