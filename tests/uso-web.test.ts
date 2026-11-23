import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { diaBrasilia, diasDoPeriodo, registroDeUso, resumirUso, TELAS, telaDaRota, type PessoaDoUso } from '../src/features/uso-web/usoWebCore';

test('every App.tsx route (except login and privacidade) is a counted screen', () => {
  const rotas = [...readFileSync('src/App.tsx', 'utf8').matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
  const contadas = new Set(TELAS.map((t) => t.rota));
  const faltando = rotas.filter((r) => r !== 'login' && r !== 'privacidade' && !contadas.has(r));
  assert.deepEqual(faltando, []);
  assert.equal(new Set(TELAS.map((t) => t.rota)).size, TELAS.length);
});

test('telaDaRota maps paths to route patterns', () => {
  assert.equal(telaDaRota('/'), 'inicio');
  assert.equal(telaDaRota('/logistica/kpi'), 'logistica/kpi');
  assert.equal(telaDaRota('/logistica/kpi/'), 'logistica/kpi');
  assert.equal(telaDaRota('/mecanica/veiculos/abc123'), 'mecanica/veiculos/:id');
  assert.equal(telaDaRota('/motorista/revisao/historico'), 'motorista/revisao/historico');
  assert.equal(telaDaRota('/motorista/revisao/historico/r1'), 'motorista/revisao/historico/:id');
  assert.equal(telaDaRota('/motorista/revisao/r1'), 'motorista/revisao/:id');
  assert.equal(telaDaRota('/friday'), 'friday/*');
  assert.equal(telaDaRota('/friday/quadros/q1'), 'friday/*');
  assert.equal(telaDaRota('/the-manuscript/mapa'), 'the-manuscript/mapa');
  assert.equal(telaDaRota('/the-manuscript/01_FIRESTORE/x.md'), 'the-manuscript/*');
  assert.equal(telaDaRota('/login'), null);
  assert.equal(telaDaRota('/rota-que-nao-existe'), null);
});

test('days are counted in Brasília time', () => {
  assert.equal(diaBrasilia(new Date('2026-11-24T02:59:00Z')), '2026-11-23');
  assert.equal(diaBrasilia(new Date('2026-11-24T03:00:00Z')), '2026-11-24');
  assert.deepEqual(diasDoPeriodo(new Date('2026-12-01T12:00:00Z'), 3), ['2026-11-29', '2026-11-30', '2026-12-01']);
});

test('registroDeUso drops invalid fields', () => {
  assert.equal(registroDeUso({ dia: '2026-11-23' }), null);
  assert.deepEqual(registroDeUso({ uid: 'a', dia: '2026-11-23', telas: { inicio: 2, x: 'y', z: 0 } }), { uid: 'a', dia: '2026-11-23', telas: { inicio: 2 } });
});

test('resumirUso adds up screens, areas, people and days, without adm2 by default', () => {
  const dias = ['2026-11-21', '2026-11-22', '2026-11-23'];
  const pessoas: PessoaDoUso[] = [
    { uid: 'ana', nome: 'Ana', adm2: false, temAreaWeb: true },
    { uid: 'bia', nome: 'Bia', adm2: false, temAreaWeb: true },
    { uid: 'chefe', nome: 'Chefe', adm2: true, temAreaWeb: false },
    { uid: 'motorista', nome: 'Motorista', adm2: false, temAreaWeb: false },
  ];
  const registros = [
    { uid: 'ana', dia: '2026-11-22', telas: { 'logistica/kpi': 3, inicio: 1 } },
    { uid: 'ana', dia: '2026-11-23', telas: { 'logistica/kpi': 1 } },
    { uid: 'chefe', dia: '2026-11-23', telas: { 'cadastros/uso': 5 } },
    { uid: 'ana', dia: '2026-11-01', telas: { inicio: 9 } }, // outside the period
  ];

  const r = resumirUso(registros, pessoas, dias, false);
  assert.equal(r.pessoas, 1);
  assert.equal(r.aberturas, 5);
  assert.equal(r.mediaPessoasPorDia, 2 / 3);
  const kpi = r.porTela.find((t) => t.rota === 'logistica/kpi')!;
  assert.deepEqual([kpi.aberturas, kpi.pessoas, kpi.ultimoDia], [4, 1, '2026-11-23']);
  assert.equal(r.porTela[0].rota, 'logistica/kpi');
  assert.equal(r.porTela.find((t) => t.rota === 'cadastros/uso')!.aberturas, 0);
  const logistica = r.porGrupo.find((g) => g.chave === 'logistica')!;
  assert.deepEqual([logistica.aberturas, logistica.pessoas, logistica.telasSemUso], [4, 1, 4]);
  // Bia has a WEB area and did not use it; the app-only driver and adm2 do not show.
  assert.deepEqual(r.porPessoa.map((p) => [p.nome, p.dias, p.aberturas]), [['Ana', 2, 5], ['Bia', 0, 0]]);
  assert.deepEqual(r.porPessoa[0].principais, ['KPI', 'Início']);
  assert.deepEqual(r.porDia.map((d) => [d.dia, d.pessoas, d.aberturas]), [['2026-11-23', 1, 1], ['2026-11-22', 1, 4], ['2026-11-21', 0, 0]]);

  const comAdm2 = resumirUso(registros, pessoas, dias, true);
  assert.equal(comAdm2.pessoas, 2);
  assert.equal(comAdm2.porTela.find((t) => t.rota === 'cadastros/uso')!.aberturas, 5);
});

test('screens recorded under an unknown route still show up', () => {
  const r = resumirUso([{ uid: 'a', dia: '2026-11-23', telas: { 'rota/antiga': 2 } }], [], ['2026-11-23'], true);
  assert.deepEqual(r.porTela[0], { rota: 'rota/antiga', rotulo: 'rota/antiga', grupo: 'outros', aberturas: 2, pessoas: 1, ultimoDia: '2026-11-23' });
});
