import { test } from 'node:test';
import assert from 'node:assert/strict';

const d = await import('../lib/logisticaPedidoNotaDominio.js');

// Avisos "Novo Pedido de Nota" e "Nota anexada" do Cronograma Logístico. Só dados fictícios.
const funcionario = (perfis, ativo = true) => ({ ativo, perfis });

test('Ag. NF: pelo id da etiqueta com esse nome, pelo padrão sem lista e pelo nome nas linhas de antes', () => {
  assert.deepEqual([...d.idsAgNf(undefined)], ['2']);
  const ids = d.idsAgNf([{ id: '2', nome: 'Em viagem' }, { id: '20', nome: ' ag. nf ' }]);
  assert.deepEqual([...ids], ['20']);
  assert.equal(d.ehAgNf('20', ids), true);
  assert.equal(d.ehAgNf('2', ids), false);
  assert.equal(d.ehAgNf('Ag. NF', ids), true);
  assert.equal(d.ehAgNf('', ids), false);
  assert.equal(d.ehAgNf(null, ids), false);
});

test('só avisa ao entrar em Ag. NF: não na troca do nome para o id nem quando já estava', () => {
  const ids = new Set(['2']);
  assert.equal(d.entrouEmAgNf({ status: '1' }, { status: '2' }, ids), true);
  assert.equal(d.entrouEmAgNf(undefined, { status: '2' }, ids), true);
  assert.equal(d.entrouEmAgNf({ status: 'Ag. NF' }, { status: '2' }, ids), false);
  assert.equal(d.entrouEmAgNf({ status: '2' }, { status: '3' }, ids), false);
  assert.equal(d.entrouEmAgNf({ status: '2' }, undefined, ids), false);
});

test('destinatários: até 3, sem repetir, ativos com logistica ou adm2, menos quem mudou o status', () => {
  const funcionarios = new Map([
    ['ana', funcionario({ logistica: true })],
    ['chefe', funcionario({ adm2: true })],
    ['escritorio', funcionario({ escritorio: true })],
    ['inativo', funcionario({ logistica: true }, false)],
    ['autor', funcionario({ logistica: true })],
    ['quarto', funcionario({ logistica: true })],
  ]);
  assert.deepEqual(d.destinatariosPedidoNota(['ana', 'chefe', 'ana', 'escritorio'], 'x', funcionarios), ['ana', 'chefe']);
  assert.deepEqual(d.destinatariosPedidoNota(['inativo', 'sumido', 'autor'], 'autor', funcionarios), []);
  assert.deepEqual(d.destinatariosPedidoNota(['ana', 'chefe', 'autor', 'quarto'], 'autor', funcionarios), ['ana', 'chefe']);
  assert.deepEqual(d.destinatariosPedidoNota(null, 'x', funcionarios), []);
});

test('aviso: título com a expedição, detalhe com item, obra e quem pediu, abre o cronograma', () => {
  const p = { expedicao: ' 4521 ', item: 'Pilares', obra: { id: 'o1', nome: 'Obra A' }, atualizadoPorNome: 'Jorge B' };
  assert.deepEqual(d.avisoPedidoNota('prog1', p), {
    area: 'logistica', tipo: 'pedido_nota', titulo: 'Novo Pedido de Nota - Expedição 4521',
    mensagem: 'Pilares · Obra A · pedido por Jorge B', rota: '/logistica/cronograma', local: 'Cronograma Logístico',
    origem: { colecao: 'logistica-programacoes', id: 'prog1' }, lida: false,
  });
  const vazio = d.avisoPedidoNota('prog2', { expedicao: '  ' });
  assert.equal(vazio.titulo, 'Novo Pedido de Nota - Expedição (sem número)');
  assert.equal(vazio.mensagem, '');
});

test('id do aviso: o mesmo evento e pessoa dão o mesmo id; outro evento, outro id', () => {
  assert.equal(d.idAvisoPedidoNota('ev1', 'ana'), d.idAvisoPedidoNota('ev1', 'ana'));
  assert.notEqual(d.idAvisoPedidoNota('ev1', 'ana'), d.idAvisoPedidoNota('ev2', 'ana'));
  assert.match(d.idAvisoPedidoNota('ev1', 'ana'), /^pnf_[0-9a-f]{28}$/);
});

test('nota anexada: só quando a programação recebe o PDF (não na troca nem ao tirar)', () => {
  const nota = { caminho: 'logistica/notas/p/1-nf.pdf', url: 'u', nome: 'nf.pdf', tamanho: 1 };
  assert.equal(d.recebeuNota({ nota: null }, { nota }), true);
  assert.equal(d.recebeuNota(undefined, { nota }), true);
  assert.equal(d.recebeuNota({}, { nota }), true);
  assert.equal(d.recebeuNota({ nota }, { nota: { ...nota, caminho: 'logistica/notas/p/2-nf.pdf' } }), false);
  assert.equal(d.recebeuNota({ nota }, { nota: null }), false);
  assert.equal(d.recebeuNota({ nota: null }, { nota: { caminho: '' } }), false);
});

test('aviso de nota anexada: título com a expedição, detalhe com quem anexou; id próprio', () => {
  const p = { expedicao: '4521', item: 'Pilares', obra: { id: 'o1', nome: 'Obra A' }, atualizadoPorNome: 'Ana' };
  assert.deepEqual(d.avisoNotaAnexada('prog1', p), {
    area: 'logistica', tipo: 'nota_anexada', titulo: 'Nota anexada - Expedição 4521',
    mensagem: 'Pilares · Obra A · anexada por Ana', rota: '/logistica/cronograma', local: 'Cronograma Logístico',
    origem: { colecao: 'logistica-programacoes', id: 'prog1' }, lida: false,
  });
  assert.match(d.idAvisoNotaAnexada('ev1', 'ana'), /^nta_[0-9a-f]{28}$/);
  assert.notEqual(d.idAvisoNotaAnexada('ev1', 'ana'), d.idAvisoPedidoNota('ev1', 'ana'));
});
