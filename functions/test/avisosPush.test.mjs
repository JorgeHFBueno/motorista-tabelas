import { test } from 'node:test';
import assert from 'node:assert/strict';

const d = await import('../lib/avisosPushDominio.js');

// Push dos avisos do sistema. Só dados fictícios.

test('app do aviso: portal no portal; Friday, logística e o resto na WEB interna', () => {
  assert.equal(d.appDoAviso({ area: 'portal' }), 'portal');
  assert.equal(d.appDoAviso({ area: 'friday' }), 'interno');
  assert.equal(d.appDoAviso({ area: 'logistica' }), 'interno');
  assert.equal(d.appDoAviso({}), 'interno');
});

test('url: a rota com ?aviso=<id> (ou &aviso= quando já tem consulta); rota estranha vira /', () => {
  assert.equal(d.urlDoAviso('a1', '/logistica/cronograma'), '/logistica/cronograma?aviso=a1');
  assert.equal(d.urlDoAviso('a1', '/friday/quadros/12?item=3&aba=atualizacoes'), '/friday/quadros/12?item=3&aba=atualizacoes&aviso=a1');
  assert.equal(d.urlDoAviso('a1', '/x#topo'), '/x?aviso=a1#topo');
  assert.equal(d.urlDoAviso('a 1', 'https://exemplo.com'), '/?aviso=a%201');
  assert.equal(d.urlDoAviso('a1', '//exemplo.com'), '/?aviso=a1');
  assert.equal(d.urlDoAviso('a1', null), '/?aviso=a1');
});

test('dados do push: textos, título com quem gerou (como no sino) e a url', () => {
  assert.deepEqual(d.dadosDoPush('a1', { titulo: 'mencionou você em Pilares', deNome: 'Jorge B', mensagem: ' confere ', rota: '/friday/quadros/1?item=2' }), {
    avisoId: 'a1', titulo: 'Jorge B mencionou você em Pilares', mensagem: 'confere', url: '/friday/quadros/1?item=2&aviso=a1',
  });
  assert.deepEqual(d.dadosDoPush('a2', { titulo: 'Novo Pedido de Nota - Expedição 4521', rota: '/logistica/cronograma' }), {
    avisoId: 'a2', titulo: 'Novo Pedido de Nota - Expedição 4521', mensagem: '', url: '/logistica/cronograma?aviso=a2',
  });
  assert.equal(d.dadosDoPush('a3', {}).titulo, 'Aviso');
});

test('aparelhos: só os do app do aviso e com token', () => {
  const aparelhos = [
    { id: 'w1', data: { app: 'interno', token: 't1' } },
    { id: 'p1', data: { app: 'portal', token: 't2' } },
    { id: 'w2', data: { app: 'interno', token: '' } },
    { id: 'w3', data: { app: 'interno' } },
  ];
  assert.deepEqual(d.aparelhosDoAviso({ area: 'friday' }, aparelhos), [{ id: 'w1', token: 't1' }]);
  assert.deepEqual(d.aparelhosDoAviso({ area: 'portal' }, aparelhos), [{ id: 'p1', token: 't2' }]);
});

test('aparelho morto: token não registrado ou inválido; outros erros não apagam', () => {
  assert.equal(d.aparelhoMorto('messaging/registration-token-not-registered'), true);
  assert.equal(d.aparelhoMorto('messaging/invalid-registration-token'), true);
  assert.equal(d.aparelhoMorto('messaging/internal-error'), false);
  assert.equal(d.aparelhoMorto(undefined), false);
});
