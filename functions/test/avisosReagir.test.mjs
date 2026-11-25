import { test } from 'node:test';
import assert from 'node:assert/strict';

const r = await import('../lib/avisosReagirDominio.js');
const g = await import('../lib/avisosGrupo.js');
const d = await import('../lib/devAvisosDominio.js');

// Reações aos avisos, grupo do aviso e convite/JOGUE do /dev. Só dados fictícios.

test('grupo: envolvidos sem repetir, sem vazios, até 50', () => {
  const a = g.comGrupo({ titulo: 'x' }, 'pedido_nota:ev1', ['autor', 'ana', 'ana', '', null, 'bia']);
  assert.deepEqual(a, { titulo: 'x', grupo: 'pedido_nota:ev1', envolvidos: ['autor', 'ana', 'bia'] });
  assert.equal(g.comGrupo({}, 'g', Array.from({ length: 80 }, (_, i) => `u${i}`)).envolvidos.length, 50);
});

test('emojis: só os da fileira', () => {
  for (const e of ['👍', '👀', '✅', '❤️', '🙏', '😂', '❌', '😡', '🫡']) assert.equal(r.emojiValido(e), true);
  assert.equal(r.emojiValido('🔥'), false);
  assert.equal(r.emojiValido(null), false);
});

test('aceita reação: com grupo e quem reage entre os envolvidos (aviso antigo ou do portal, não)', () => {
  assert.equal(r.aceitaReacao({ grupo: 'g', envolvidos: ['ana', 'bia'] }, 'ana'), true);
  assert.equal(r.aceitaReacao({ grupo: 'g', envolvidos: ['bia'] }, 'ana'), false);
  assert.equal(r.aceitaReacao({ titulo: 'antigo' }, 'ana'), false);
  assert.equal(r.aceitaReacao(undefined, 'ana'), false);
});

test('destinatários da reação: todos os envolvidos (quem gerou e quem recebeu), menos quem reagiu', () => {
  assert.deepEqual(r.destinatariosReacao(['autor', 'ana', 'bia', 'ana'], 'ana'), ['autor', 'bia']);
  assert.deepEqual(r.destinatariosReacao(null, 'ana'), []);
});

test('aviso da reação: "reagiu 👍", com o título original ou, quando ele é relativo (menção), o trecho; sem grupo', () => {
  const nota = { area: 'logistica', titulo: 'Nota anexada - Expedição 1762', mensagem: 'Pilares', rota: '/logistica/cronograma', local: 'Cronograma Logístico', grupo: 'nota_anexada:ev1' };
  assert.deepEqual(r.avisoDeReacao(nota, { uid: 'jorge', nome: 'Jorge B' }, '👍'), {
    area: 'logistica', tipo: 'reacao', titulo: 'reagiu 👍', mensagem: 'Nota anexada - Expedição 1762', rota: '/logistica/cronograma',
    local: 'Cronograma Logístico', deUid: 'jorge', deNome: 'Jorge B', origem: { colecao: 'avisos', id: 'nota_anexada:ev1' }, lida: false,
  });
  const mencao = { area: 'friday', titulo: 'mencionou você em Pilares', deNome: 'Jorge B', mensagem: 'confere a planta', grupo: 'mencao:1:2' };
  assert.equal(r.avisoDeReacao(mencao, { uid: 'sam', nome: 'Samuel' }, '🫡').mensagem, 'confere a planta');
  assert.equal(r.idAvisoReacao('g', 'a', 'b'), r.idAvisoReacao('g', 'a', 'b'));
  assert.notEqual(r.idAvisoReacao('g', 'a', 'b'), r.idAvisoReacao('g', 'a', 'c'));
});

test('convite do /dev: Retr0 ativos, fora da sala, sem quem convida, até 10', () => {
  const retr0 = (ativo = true) => ({ ativo, perfis: { retr0: true } });
  const funcionarios = new Map([['ana', retr0()], ['bia', retr0()], ['adm', { ativo: true, perfis: { adm2: true } }], ['velho', retr0(false)]]);
  const sala = { jogadores: ['eu', 'bia'] };
  assert.deepEqual(d.convidaveis(['ana', 'bia', 'adm', 'velho', 'eu', 'ana'], 'eu', sala, funcionarios), ['ana']);
});

test('JOGUE: só para quem está com a vez, numa partida em jogo, chamado por outro jogador', () => {
  const sala = { estado: 'jogando', vez: 'ana', jogadores: ['eu', 'ana'] };
  assert.equal(d.chamado(sala, 'eu'), 'ana');
  assert.equal(d.chamado(sala, 'ana'), null);
  assert.equal(d.chamado({ ...sala, estado: 'aberta' }, 'eu'), null);
  assert.equal(d.chamado(sala, 'fora'), null);
});

test('aviso do /dev: título, sala e a rota que abre o jogo na sala', () => {
  const sala = { jogo: 'xadrez', nomes: ['JORGE'], jogadores: ['eu'], max: 2 };
  assert.deepEqual(d.avisoDev('convite', 's1', sala, { uid: 'eu', nome: 'Jorge B' }), {
    area: 'dev', tipo: 'convite', titulo: 'convidou você para Xadrez', mensagem: 'Sala de JORGE (1/2)', rota: '/dev?jogo=xadrez&sala=s1',
    local: 'DEV', deUid: 'eu', deNome: 'Jorge B', origem: { colecao: 'dev-salas', id: 's1' }, lida: false,
  });
  assert.equal(d.avisoDev('jogue', 's1', { ...sala, jogo: 'neo' }, { uid: 'eu', nome: 'Jorge B' }).titulo, 'chamou você: JOGUE! (NEO)');
});
