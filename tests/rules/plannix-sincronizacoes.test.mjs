import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

// Sincronizar com o Plannix (Manuscript 01_FIRESTORE/COLECOES/plannix-sincronizacoes.md): a fila do robô, um documento
// por LOTE ({obraId}__{lote}). Área engenharia: 'ver' lê; 'editar' pede, aprova a prévia e cancela. O robô avança os
// outros status pela preFabricadosApi (Admin SDK, fora das Rules).
const projectId = 'demo-firebase-rules';
let env;

const identities = {
  adm2: 'uid-sinc-adm2',
  editar: 'uid-sinc-editar',
  ver: 'uid-sinc-ver',
  logistica: 'uid-sinc-logistica',
  inativo: 'uid-sinc-inativo',
};

const dbAs = (name) => env.authenticatedContext(identities[name]).firestore();
const pessoa = (name) => ({ uid: identities[name], nome: name });
const ID = 'o1__l1';

const pedido = (autor, extra = {}) => ({
  schemaVersion: 1, obraId: 'o1', lote: 'l1', pedido: '953', plannix: 141, status: 'pedido',
  pedidoPor: pessoa(autor), pedidoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
  ...extra,
});

/** Grava o documento como o robô (sem Rules), no status pedido. */
async function comoRobo(id, dados) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'plannix-sincronizacoes', id), {
      schemaVersion: 1, obraId: 'o1', lote: id.split('__')[1], pedido: '953', plannix: 141,
      pedidoPor: pessoa('editar'), pedidoEm: Timestamp.fromMillis(1), atualizadoEm: Timestamp.fromMillis(2),
      ...dados,
    });
  });
}

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const funcionario = (uid, perfis, areas = {}, ativo = true) => setDoc(doc(db, 'funcionarios', uid), {
      nome: uid, email: `${uid}@example.com`, ativo, perfis: { frentista: false, adm2: false, motorista: false, ...perfis }, areas,
    });
    await funcionario(identities.adm2, { adm2: true });
    await funcionario(identities.editar, {}, { engenharia: 'editar' });
    await funcionario(identities.ver, {}, { engenharia: 'ver' });
    await funcionario(identities.logistica, {}, { logistica: 'editar' });
    await funcionario(identities.inativo, {}, { engenharia: 'editar' }, false);
    await setDoc(doc(db, 'obras-v2', 'o1'), { nomeObra: 'ALEGRIA 147/2026', status: 'CONTRATADA' });
  });
}

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile('firestore.rules', 'utf8') } });
  await seed();
});

after(async () => env?.cleanup());

test('[firestore] sincronizar Plannix: a área engenharia lê a fila da obra; outras áreas e inativos não', async () => {
  await comoRobo('o1__leitura', { status: 'concluido' });
  const daObra = (name) => query(collection(dbAs(name), 'plannix-sincronizacoes'), where('obraId', '==', 'o1'));
  await assertSucceeds(getDocs(daObra('ver')));
  await assertSucceeds(getDocs(daObra('adm2')));
  await assertFails(getDocs(daObra('logistica')));
  await assertFails(getDocs(daObra('inativo')));
});

test('[firestore] sincronizar Plannix: editar pede assinado por si, na hora do servidor, no id do LOTE de uma obra que existe', async () => {
  const ref = (name, id = ID) => doc(dbAs(name), 'plannix-sincronizacoes', id);
  await assertFails(setDoc(ref('ver'), pedido('ver')));
  await assertFails(setDoc(ref('inativo'), pedido('inativo')));
  await assertFails(setDoc(ref('editar'), pedido('adm2')));
  await assertFails(setDoc(ref('editar', 'o1__outro'), pedido('editar')));
  await assertFails(setDoc(ref('editar'), pedido('editar', { status: 'aprovado' })));
  await assertFails(setDoc(ref('editar'), pedido('editar', { pedidoEm: Timestamp.fromMillis(5) })));
  await assertFails(setDoc(ref('editar'), pedido('editar', { plannix: 0 })));
  await assertFails(setDoc(ref('editar'), pedido('editar', { pedido: '95 3' })));
  await assertFails(setDoc(ref('editar'), pedido('editar', { previa: 'tudo certo' })));
  await assertFails(setDoc(ref('editar', 'nao-existe__l1'), pedido('editar', { obraId: 'nao-existe' })));
  await assertSucceeds(setDoc(ref('editar'), pedido('editar')));
  await assertFails(deleteDoc(ref('adm2')));
});

test('[firestore] sincronizar Plannix: não pede de novo enquanto a anterior anda; depois de terminada, pede', async () => {
  const ref = (id) => doc(dbAs('adm2'), 'plannix-sincronizacoes', id);
  for (const status of ['pedido', 'simulando', 'previa', 'aprovado', 'gravando']) {
    await comoRobo(`o1__andando-${status}`, { status, lote: `andando-${status}` });
    await assertFails(setDoc(ref(`o1__andando-${status}`), pedido('adm2', { lote: `andando-${status}` })));
  }
  for (const status of ['concluido', 'erro', 'cancelado']) {
    await comoRobo(`o1__fim-${status}`, { status, lote: `fim-${status}`, previa: 'antiga', mensagem: 'antiga' });
    await assertFails(setDoc(ref(`o1__fim-${status}`), { ...pedido('adm2', { lote: `fim-${status}` }), previa: 'antiga' }));
    await assertSucceeds(setDoc(ref(`o1__fim-${status}`), pedido('adm2', { lote: `fim-${status}` })));
  }
});

test('[firestore] sincronizar Plannix: aprovar só a prévia, assinado por si, sem mexer no resto', async () => {
  const ref = (name, id) => doc(dbAs(name), 'plannix-sincronizacoes', id);
  const aprovar = (name, extra = {}) => ({ status: 'aprovado', aprovadoPor: pessoa(name), aprovadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(), ...extra });
  await comoRobo('o1__previa', { status: 'previa', lote: 'previa', previa: '2 peças, 112,7 kg de aço' });
  await assertFails(updateDoc(ref('ver', 'o1__previa'), aprovar('ver')));
  await assertFails(updateDoc(ref('editar', 'o1__previa'), aprovar('adm2')));
  await assertFails(updateDoc(ref('editar', 'o1__previa'), aprovar('editar', { previa: 'outra coisa' })));
  await assertFails(updateDoc(ref('editar', 'o1__previa'), aprovar('editar', { status: 'concluido' })));
  await assertFails(updateDoc(ref('editar', 'o1__previa'), aprovar('editar', { aprovadoEm: Timestamp.fromMillis(9) })));
  await assertSucceeds(updateDoc(ref('editar', 'o1__previa'), aprovar('editar')));
  await comoRobo('o1__sem-previa', { status: 'simulando', lote: 'sem-previa' });
  await assertFails(updateDoc(ref('editar', 'o1__sem-previa'), aprovar('editar')));
});

test('[firestore] sincronizar Plannix: cancelar antes de gravar; aprovada ou gravando, não', async () => {
  const ref = (id) => doc(dbAs('editar'), 'plannix-sincronizacoes', id);
  const cancelar = (extra = {}) => ({ status: 'cancelado', canceladoPor: pessoa('editar'), canceladoEm: serverTimestamp(), atualizadoEm: serverTimestamp(), ...extra });
  for (const status of ['pedido', 'simulando', 'previa']) {
    await comoRobo(`o1__cancela-${status}`, { status, lote: `cancela-${status}` });
    await assertFails(updateDoc(ref(`o1__cancela-${status}`), cancelar({ canceladoPor: pessoa('adm2') })));
    await assertFails(updateDoc(ref(`o1__cancela-${status}`), cancelar({ mensagem: 'parei' })));
    await assertSucceeds(updateDoc(ref(`o1__cancela-${status}`), cancelar()));
  }
  for (const status of ['aprovado', 'gravando', 'concluido']) {
    await comoRobo(`o1__nao-cancela-${status}`, { status, lote: `nao-cancela-${status}` });
    await assertFails(updateDoc(ref(`o1__nao-cancela-${status}`), cancelar()));
  }
  // O robô não é a tela: avançar o status pela tela é recusado.
  await comoRobo('o1__robo', { status: 'pedido', lote: 'robo' });
  await assertFails(updateDoc(ref('o1__robo'), { status: 'simulando', atualizadoEm: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(dbAs('ver'), 'plannix-sincronizacoes', 'o1__robo')));
});

test('[firestore] sincronizar Plannix: o adm2 marca como erro a parada há mais de 30 minutos em simulando ou gravando', async () => {
  const ref = (name, id) => doc(dbAs(name), 'plannix-sincronizacoes', id);
  const destravar = (name, extra = {}) => ({
    status: 'erro', mensagem: 'Marcada como erro: o robô sumiu.', destravadoPor: pessoa(name), destravadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(), ...extra,
  });
  const ha = (min) => Timestamp.fromMillis(Date.now() - min * 60 * 1000);
  for (const status of ['simulando', 'gravando']) {
    await comoRobo(`o1__parada-${status}`, { status, lote: `parada-${status}`, atualizadoEm: ha(31) });
    await assertFails(updateDoc(ref('editar', `o1__parada-${status}`), destravar('editar')));
    await assertFails(updateDoc(ref('adm2', `o1__parada-${status}`), destravar('editar')));
    await assertFails(updateDoc(ref('adm2', `o1__parada-${status}`), destravar('adm2', { mensagem: '' })));
    await assertFails(updateDoc(ref('adm2', `o1__parada-${status}`), destravar('adm2', { previa: 'outra' })));
    await assertSucceeds(updateDoc(ref('adm2', `o1__parada-${status}`), destravar('adm2')));
  }
  await comoRobo('o1__recente', { status: 'gravando', lote: 'recente', atualizadoEm: ha(5) });
  await assertFails(updateDoc(ref('adm2', 'o1__recente'), destravar('adm2')));
  for (const status of ['pedido', 'previa', 'aprovado']) {
    await comoRobo(`o1__nao-destrava-${status}`, { status, lote: `nao-destrava-${status}`, atualizadoEm: ha(60) });
    await assertFails(updateDoc(ref('adm2', `o1__nao-destrava-${status}`), destravar('adm2')));
  }
  // Destravada, pede de novo (o documento volta inteiro a 'pedido').
  await assertSucceeds(setDoc(ref('adm2', 'o1__parada-gravando'), pedido('adm2', { lote: 'parada-gravando' })));
});
