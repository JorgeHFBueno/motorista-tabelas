import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizationProfileFromData } from '../src/services/authorizationProfileCore';
import { areasDoFuncionario, areasValidas } from '../src/services/areasWeb';
import { editaArea, temAlgumaCredencial, temCredencial, veArea } from '../src/services/credenciais';

// Áreas da WEB (decisão de 2026-11-16; The Manuscript, funcionarios.md).
const perfil = (data: Record<string, unknown>) => authorizationProfileFromData('uid', { nome: 'Pessoa', ativo: true, ...data });

test('areas: a document with the map uses only it; ver lets in, editar also edits', () => {
  const p = perfil({ perfis: { engenharia: true }, areas: { logistica: 'ver', mecanica: 'editar' } });
  assert.equal(veArea(p, 'logistica'), true);
  assert.equal(editaArea(p, 'logistica'), false);
  assert.equal(veArea(p, 'mecanica'), true);
  assert.equal(editaArea(p, 'mecanica'), true);
  assert.equal(veArea(p, 'engenharia'), false, 'with the map, the old engenharia credential no longer counts');
});

test('areas: without the map there is no WEB area, old credentials included (cleanup of 2026-11-16)', () => {
  assert.deepEqual(perfil({ perfis: { mecanico: true, escritorio: true, engenharia: true, autor: true, logistica: true } }).areas, {});
});

test('areas: adm2 sees and edits every area; an inactive person none', () => {
  const adm2 = perfil({ perfis: { adm2: true }, areas: {} });
  assert.equal(editaArea(adm2, 'cadastros'), true);
  assert.equal(veArea(adm2, 'manuscript'), true);
  assert.equal(temCredencial(adm2, 'retr0'), false, 'DEV stays retr0 only');
  const inativo = authorizationProfileFromData('uid', { ativo: false, areas: { logistica: 'editar' } });
  assert.equal(veArea(inativo, 'logistica'), false);
});

test('areas: invalid keys and levels are dropped; Friday has one level', () => {
  assert.deepEqual(areasValidas({ logistica: 'ver', friday: 'ver', x: 'editar', mecanica: 'admin' }), { logistica: 'ver', friday: 'editar' });
  assert.deepEqual(areasDoFuncionario({ areas: null }), {});
});

test('areas: a person with only WEB areas (no app credential) enters the WEB', () => {
  assert.equal(temAlgumaCredencial(perfil({ perfis: {}, areas: { portal: 'ver' } })), true);
  assert.equal(temAlgumaCredencial(perfil({ perfis: {}, areas: {} })), false);
});

test('areas: Tools (Ferramentas ao lado do sino) has one level; adm2 always has it (2026-11-19)', () => {
  assert.deepEqual(areasValidas({ tools: 'ver' }), { tools: 'editar' });
  assert.equal(veArea(perfil({ perfis: {}, areas: { tools: 'editar' } }), 'tools'), true);
  assert.equal(veArea(perfil({ perfis: {}, areas: { friday: 'editar' } }), 'tools'), false);
  assert.equal(veArea(perfil({ perfis: { adm2: true }, areas: {} }), 'tools'), true);
});

test('areas: Comercial has ver and editar; adm2 always has it (2026-11-23)', () => {
  assert.deepEqual(areasValidas({ comercial: 'ver' }), { comercial: 'ver' });
  assert.equal(veArea(perfil({ perfis: {}, areas: { comercial: 'ver' } }), 'comercial'), true);
  assert.equal(editaArea(perfil({ perfis: {}, areas: { comercial: 'ver' } }), 'comercial'), false);
  assert.equal(veArea(perfil({ perfis: { adm2: true }, areas: {} }), 'comercial'), true);
});
