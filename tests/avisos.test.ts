import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparAvisos, filtrarAvisos, lerAviso, periodoDoAviso, rotaSegura, tempoRelativo } from '../src/services/avisosCore.ts';

test('documento vira aviso: textos aparados, lida só com true, data do Timestamp; título padrão', () => {
  const quando = new Date(2026, 10, 13, 9, 0, 0);
  assert.deepEqual(lerAviso('a1', { area: 'friday', tipo: 'mencao', titulo: ' mencionou você ', mensagem: ' oi ', rota: '/friday/quadros/1', local: 'TAREFAS', deNome: 'Ana', lida: true, criadoEm: { toDate: () => quando } }), {
    id: 'a1', area: 'friday', tipo: 'mencao', titulo: 'mencionou você', mensagem: 'oi', rota: '/friday/quadros/1', local: 'TAREFAS', deNome: 'Ana', lida: true, criadoEm: quando,
  });
  const vazio = lerAviso('a2', { lida: 1, criadoEm: '2026-11-13' });
  assert.deepEqual([vazio.titulo, vazio.lida, vazio.criadoEm, vazio.deNome, vazio.local, vazio.rota], ['Aviso', false, null, null, null, null]);
});

test('rota: só caminhos do próprio sistema abrem', () => {
  assert.equal(rotaSegura('/friday/quadros/12?item=3'), '/friday/quadros/12?item=3');
  assert.equal(rotaSegura('https://exemplo.com'), null);
  assert.equal(rotaSegura('//exemplo.com/x'), null);
  assert.equal(rotaSegura('friday'), null);
  assert.equal(rotaSegura(null), null);
});

test('período: hoje, últimos 7 dias (hoje e os 6 dias antes) e mais antigos', () => {
  const agora = new Date(2026, 10, 12, 15, 0, 0);
  assert.equal(periodoDoAviso(new Date(2026, 10, 12, 0, 0, 0), agora), 'Hoje');
  assert.equal(periodoDoAviso(new Date(2026, 10, 11, 23, 59, 59), agora), 'Últimos 7 dias');
  assert.equal(periodoDoAviso(new Date(2026, 10, 6, 0, 0, 0), agora), 'Últimos 7 dias');
  assert.equal(periodoDoAviso(new Date(2026, 10, 5, 23, 59, 59), agora), 'Mais antigos');
  assert.equal(periodoDoAviso(null, agora), 'Mais antigos');
});

test('grupos na ordem Hoje, Últimos 7 dias, Mais antigos, sem grupo vazio e mantendo a ordem da lista', () => {
  const agora = new Date(2026, 10, 12, 15, 0, 0);
  const lista = [{ id: 1, em: new Date(2026, 10, 12, 10) }, { id: 2, em: new Date(2026, 9, 1, 10) }, { id: 3, em: new Date(2026, 10, 12, 9) }];
  assert.deepEqual(agruparAvisos(lista, agora, n => n.em).map(g => [g.periodo, g.avisos.map(n => n.id)]), [['Hoje', [1, 3]], ['Mais antigos', [2]]]);
});

test('busca: todas as palavras, sem acento nem maiúsculas, em pessoa, título, local ou trecho', () => {
  const lista = [
    { id: 1, de: 'João Silva', titulo: 'mencionou você em Pavilhão Norte', local: 'GESTÃO DE OBRAS' },
    { id: 2, de: 'Ana Souza', titulo: 'mencionou você em Lote 3', local: null },
  ];
  const textos = (n: (typeof lista)[number]) => [n.de, n.titulo, n.local];
  assert.deepEqual(filtrarAvisos(lista, 'joao gestao', textos).map(n => n.id), [1]);
  assert.deepEqual(filtrarAvisos(lista, 'PAVILHAO', textos).map(n => n.id), [1]);
  assert.deepEqual(filtrarAvisos(lista, 'lote ana', textos).map(n => n.id), [2]);
  assert.deepEqual(filtrarAvisos(lista, '  ', textos).map(n => n.id), [1, 2]);
  assert.deepEqual(filtrarAvisos(lista, 'xyz', textos), []);
});

test('tempo relativo: agora, minutos, horas, ontem e data', () => {
  const agora = new Date(2026, 10, 13, 15, 0, 0);
  assert.equal(tempoRelativo(new Date(2026, 10, 13, 14, 59, 30), agora), 'agora');
  assert.equal(tempoRelativo(new Date(2026, 10, 13, 14, 55, 0), agora), 'há 5 min');
  assert.equal(tempoRelativo(new Date(2026, 10, 13, 12, 0, 0), agora), 'há 3 h');
  assert.match(tempoRelativo(new Date(2026, 10, 12, 14, 30, 0), agora), /^ontem 14:30$/);
  assert.match(tempoRelativo(new Date(2026, 10, 1, 9, 5, 0), agora), /^1 (de )?nov 09:05$/);
  assert.equal(tempoRelativo(null, agora), '');
});
