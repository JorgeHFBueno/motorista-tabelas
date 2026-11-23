import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

// Uso do sistema (Manuscript 01_FIRESTORE/COLECOES/uso-web.md): cada pessoa ativa soma no próprio documento do dia;
// só o adm2 lê; ninguém apaga.
const projectId = 'demo-firebase-rules';
const DIA = '2026-11-23';
let env;

const ids = {
  adm2: 'uid-uso-adm2',
  engenharia: 'uid-uso-engenharia',
  inativo: 'uid-uso-inativo',
  semCadastro: 'uid-uso-sem-cadastro',
};

const dbAs = (name) => env.authenticatedContext(ids[name]).firestore();
const usoDe = (db, uid, dia = DIA) => doc(db, 'uso-web', `${uid}_${dia}`);
const abrir = (db, uid, tela = 'engenharia/cronograma', extra = {}) => setDoc(
  usoDe(db, uid),
  { uid, dia: DIA, telas: { [tela]: increment(1) }, atualizadoEm: serverTimestamp(), ...extra },
  { merge: true },
);

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const funcionario = (uid, ativo, perfis, areas = {}) => setDoc(doc(db, 'funcionarios', uid), {
      nome: uid, email: `${uid}@example.com`, ativo, perfis: { adm2: false, ...perfis }, areas,
    });
    await funcionario(ids.adm2, true, { adm2: true });
    await funcionario(ids.engenharia, true, {}, { engenharia: 'editar', cadastros: 'editar' });
    await funcionario(ids.inativo, false, {}, { engenharia: 'editar' });
  });
});

after(async () => env?.cleanup());

test('[firestore] uso-web: active person adds to their own day document, creating and then incrementing', async () => {
  const db = dbAs('engenharia');
  await assertSucceeds(abrir(db, ids.engenharia));
  await assertSucceeds(abrir(db, ids.engenharia));
  await assertSucceeds(abrir(db, ids.engenharia, 'engenharia/obras'));
  await env.withSecurityRulesDisabled(async (context) => {
    const salvo = (await getDoc(usoDe(context.firestore(), ids.engenharia))).data();
    if (salvo.telas['engenharia/cronograma'] !== 2 || salvo.telas['engenharia/obras'] !== 1) throw new Error(JSON.stringify(salvo.telas));
  });
});

test('[firestore] uso-web: nobody writes for someone else, with a wrong id, extra fields or client time', async () => {
  const db = dbAs('engenharia');
  await assertFails(abrir(db, ids.adm2));
  await assertFails(setDoc(usoDe(db, ids.engenharia, '2026-11-22'), { uid: ids.engenharia, dia: DIA, telas: {}, atualizadoEm: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'uso-web', 'qualquer'), { uid: ids.engenharia, dia: DIA, telas: {}, atualizadoEm: serverTimestamp() }));
  await assertFails(abrir(db, ids.engenharia, 'inicio', { nome: 'x' }));
  await assertFails(setDoc(usoDe(db, ids.engenharia), { uid: ids.engenharia, dia: DIA, telas: {}, atualizadoEm: new Date() }));
  await assertFails(setDoc(usoDe(db, ids.engenharia, '23-11-2026'), { uid: ids.engenharia, dia: '23-11-2026', telas: {}, atualizadoEm: serverTimestamp() }));
  await assertFails(setDoc(usoDe(db, ids.engenharia), { uid: ids.engenharia, dia: DIA, telas: 'x', atualizadoEm: serverTimestamp() }));
});

test('[firestore] uso-web: inactive or unregistered accounts and signed-out visitors do not write', async () => {
  await assertFails(abrir(dbAs('inativo'), ids.inativo));
  await assertFails(abrir(dbAs('semCadastro'), ids.semCadastro));
  const anonimo = env.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(anonimo, 'uso-web', `x_${DIA}`), { uid: 'x', dia: DIA, telas: {}, atualizadoEm: serverTimestamp() }));
});

test('[firestore] uso-web: only adm2 reads and lists; nobody deletes', async () => {
  await assertSucceeds(abrir(dbAs('adm2'), ids.adm2));
  await assertSucceeds(getDocs(query(collection(dbAs('adm2'), 'uso-web'), where('dia', '>=', '2026-11-01'))));
  await assertSucceeds(getDoc(usoDe(dbAs('adm2'), ids.engenharia)));
  await assertFails(getDoc(usoDe(dbAs('engenharia'), ids.engenharia)));
  await assertFails(getDocs(query(collection(dbAs('engenharia'), 'uso-web'), where('dia', '>=', '2026-11-01'))));
  await assertFails(deleteDoc(usoDe(dbAs('engenharia'), ids.engenharia)));
  await assertFails(deleteDoc(usoDe(dbAs('adm2'), ids.engenharia)));
});
