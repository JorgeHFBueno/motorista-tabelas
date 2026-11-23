import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

// Comercial (Manuscript 01_FIRESTORE/COLECOES/comercial.md): comercial-negocios (com atualizacoes), comercial-contatos e
// os arquivos em comercial/negocios/. Área comercial: 'ver' lê, 'editar' grava; ninguém apaga negócio nem contato.
const projectId = 'demo-firebase-rules';
let env;

const identities = {
  adm2: 'uid-com-adm2',
  editar: 'uid-com-editar',
  ver: 'uid-com-ver',
  friday: 'uid-com-friday', // só a área friday
  inativo: 'uid-com-inativo',
};

const dbAs = (name) => env.authenticatedContext(identities[name]).firestore();
const storageAs = (name) => env.authenticatedContext(identities[name]).storage();
const pessoa = (name) => ({ uid: identities[name], nome: name });

const negocio = (autor, extra = {}) => ({
  schemaVersion: 1, titulo: 'Pavilhão', cliente: 'Cliente A', segmento: 'privado', tipo: 'negocio', etapa: 'lead',
  responsaveis: [], prioridade: 'alta', origem: 'indicacao', valor: 100000, metragem: 500, dataCriacao: '2026-11-23',
  dataFechamento: null, motivoPerda: null, contatoIds: [], arquivos: [], origemFriday: null,
  criadoPor: pessoa(autor), registradoEm: serverTimestamp(), atualizadoPor: pessoa(autor), atualizadoEm: serverTimestamp(),
  excluidoEm: null, excluidoPor: null, ...extra,
});

const contato = (autor, extra = {}) => ({
  schemaVersion: 1, nome: 'Fulano', tipo: 'cliente', categoria: 'particular', empresa: null, cargo: null, email: null,
  telefone: '51999999999', notas: null, origemFriday: null,
  criadoPor: pessoa(autor), registradoEm: serverTimestamp(), atualizadoPor: pessoa(autor), atualizadoEm: serverTimestamp(),
  excluidoEm: null, excluidoPor: null, ...extra,
});

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const funcionario = (uid, perfis, areas = {}, ativo = true) => setDoc(doc(db, 'funcionarios', uid), {
      nome: uid, email: `${uid}@example.com`, ativo, perfis: { frentista: false, adm2: false, motorista: false, ...perfis }, areas,
    });
    await funcionario(identities.adm2, { adm2: true });
    await funcionario(identities.editar, {}, { comercial: 'editar' });
    await funcionario(identities.ver, {}, { comercial: 'ver' });
    await funcionario(identities.friday, {}, { friday: 'editar' });
    await funcionario(identities.inativo, {}, { comercial: 'editar' }, false);
    const t = Timestamp.fromMillis(1);
    await setDoc(doc(db, 'comercial-negocios', 'n1'), {
      ...negocio('adm2'), registradoEm: t, atualizadoEm: t, origemFriday: { quadroId: 1, itemId: 2 },
    });
    await setDoc(doc(db, 'comercial-negocios', 'n1', 'atualizacoes', 'a1'), { texto: 'Ligar amanhã', autor: pessoa('editar'), criadoEm: t });
    await setDoc(doc(db, 'comercial-negocios', 'n1', 'atualizacoes', 'a2'), { texto: 'Do Friday', autor: pessoa('adm2'), criadoEm: t });
    await setDoc(doc(db, 'comercial-contatos', 'c1'), { ...contato('adm2'), registradoEm: t, atualizadoEm: t });
  });
}

before(async () => {
  const emulatorConfig = { projectId, firestore: { rules: await readFile('firestore.rules', 'utf8') } };
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) emulatorConfig.storage = { rules: await readFile('storage.rules', 'utf8') };
  env = await initializeTestEnvironment(emulatorConfig);
  await seed();
});

after(async () => env?.cleanup());

test('[firestore] comercial: the comercial area reads; other areas and inactive people do not', async () => {
  await assertSucceeds(getDocs(collection(dbAs('ver'), 'comercial-negocios')));
  await assertSucceeds(getDocs(collection(dbAs('editar'), 'comercial-contatos')));
  await assertSucceeds(getDocs(collection(dbAs('ver'), 'comercial-negocios', 'n1', 'atualizacoes')));
  await assertSucceeds(getDoc(doc(dbAs('adm2'), 'comercial-negocios', 'n1')));
  await assertFails(getDocs(collection(dbAs('friday'), 'comercial-negocios')));
  await assertFails(getDoc(doc(dbAs('inativo'), 'comercial-contatos', 'c1')));
});

test('[firestore] comercial: the comercial area picks the responsible person from funcionarios', async () => {
  await assertSucceeds(getDocs(collection(dbAs('ver'), 'funcionarios')));
});

test('[firestore] comercial: editar creates a deal signed by itself; ver and invalid deals fail', async () => {
  await assertSucceeds(setDoc(doc(dbAs('editar'), 'comercial-negocios', 'n2'), negocio('editar')));
  await assertSucceeds(setDoc(doc(dbAs('adm2'), 'comercial-negocios', 'n3'), negocio('adm2', { segmento: 'publico', etapa: 'licitado', tipo: 'projeto' })));
  await assertFails(setDoc(doc(dbAs('ver'), 'comercial-negocios', 'n4'), negocio('ver')));
  await assertFails(setDoc(doc(dbAs('editar'), 'comercial-negocios', 'n4'), negocio('adm2')));
  await assertFails(setDoc(doc(dbAs('editar'), 'comercial-negocios', 'n4'), negocio('editar', { etapa: 'fechado' })));
  await assertFails(setDoc(doc(dbAs('editar'), 'comercial-negocios', 'n4'), negocio('editar', { titulo: '' })));
  await assertFails(setDoc(doc(dbAs('editar'), 'comercial-negocios', 'n4'), negocio('editar', { valor: -1 })));
  await assertFails(setDoc(doc(dbAs('editar'), 'comercial-negocios', 'n4'), negocio('editar', { dataCriacao: '23/11/2026' })));
  await assertFails(setDoc(doc(dbAs('editar'), 'comercial-negocios', 'n4'), negocio('editar', { extra: true })));
  await assertFails(setDoc(doc(dbAs('editar'), 'comercial-negocios', 'n4'), negocio('editar', { excluidoEm: serverTimestamp(), excluidoPor: pessoa('editar') })));
});

test('[firestore] comercial: editar changes, moves to the trash and restores; never deletes nor rewrites the origin', async () => {
  const ref = doc(dbAs('editar'), 'comercial-negocios', 'n1');
  const assina = { atualizadoPor: pessoa('editar'), atualizadoEm: serverTimestamp() };
  await assertSucceeds(updateDoc(ref, { etapa: 'proposta_enviada', ...assina }));
  await assertSucceeds(updateDoc(ref, { excluidoEm: serverTimestamp(), excluidoPor: pessoa('editar'), ...assina }));
  await assertSucceeds(updateDoc(ref, { excluidoEm: null, excluidoPor: null, ...assina }));
  await assertFails(updateDoc(ref, { etapa: 'ganho' }));
  await assertFails(updateDoc(ref, { etapa: 'ganho', atualizadoPor: pessoa('adm2'), atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(ref, { origemFriday: null, ...assina }));
  await assertFails(updateDoc(ref, { criadoPor: pessoa('editar'), ...assina }));
  await assertFails(updateDoc(doc(dbAs('ver'), 'comercial-negocios', 'n1'), { etapa: 'ganho', atualizadoPor: pessoa('ver'), atualizadoEm: serverTimestamp() }));
  await assertFails(deleteDoc(doc(dbAs('adm2'), 'comercial-negocios', 'n1')));
});

test('[firestore] comercial: timeline notes are signed by the author, never edited, deleted only by the author', async () => {
  const col = (name) => collection(dbAs(name), 'comercial-negocios', 'n1', 'atualizacoes');
  await assertSucceeds(setDoc(doc(col('editar'), 'a3'), { texto: 'Proposta enviada por e-mail', autor: pessoa('editar'), criadoEm: serverTimestamp() }));
  await assertFails(setDoc(doc(col('editar'), 'a4'), { texto: 'x', autor: pessoa('adm2'), criadoEm: serverTimestamp() }));
  await assertFails(setDoc(doc(col('editar'), 'a4'), { texto: '', autor: pessoa('editar'), criadoEm: serverTimestamp() }));
  await assertFails(setDoc(doc(col('ver'), 'a4'), { texto: 'x', autor: pessoa('ver'), criadoEm: serverTimestamp() }));
  await assertFails(updateDoc(doc(col('editar'), 'a1'), { texto: 'mudou' }));
  await assertFails(deleteDoc(doc(col('editar'), 'a2')));
  await assertSucceeds(deleteDoc(doc(col('editar'), 'a1')));
});

test('[firestore] comercial: contacts follow the same signing rules', async () => {
  await assertSucceeds(setDoc(doc(dbAs('editar'), 'comercial-contatos', 'c2'), contato('editar')));
  await assertFails(setDoc(doc(dbAs('editar'), 'comercial-contatos', 'c3'), contato('editar', { tipo: 'amigo' })));
  await assertFails(setDoc(doc(dbAs('ver'), 'comercial-contatos', 'c3'), contato('ver')));
  await assertSucceeds(updateDoc(doc(dbAs('editar'), 'comercial-contatos', 'c1'), { email: 'a@b.com', atualizadoPor: pessoa('editar'), atualizadoEm: serverTimestamp() }));
  await assertFails(deleteDoc(doc(dbAs('editar'), 'comercial-contatos', 'c1')));
});

const storageTest = (name, fn) => test(name, { skip: !process.env.FIREBASE_STORAGE_EMULATOR_HOST }, fn);
const pdf = new Uint8Array([37, 80, 68, 70]);

storageTest('[storage] comercial: deal files by the comercial area (ver reads, editar sends and deletes, no overwrite)', async () => {
  const caminho = 'comercial/negocios/n1/1-proposta.pdf';
  await assertFails(uploadBytes(ref(storageAs('ver'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(uploadBytes(ref(storageAs('editar'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(storageAs('editar'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(storageAs('ver'), caminho)));
  await assertFails(getBytes(ref(storageAs('friday'), caminho)));
  await assertFails(uploadBytes(ref(storageAs('editar'), 'comercial/negocios/n1/2-grande.bin'), new Uint8Array(25 * 1024 * 1024 + 1)));
  await assertFails(deleteObject(ref(storageAs('ver'), caminho)));
  await assertSucceeds(deleteObject(ref(storageAs('editar'), caminho)));
});
