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
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

// PDFs dos pré-fabricados no detalhe da obra (Manuscript 01_FIRESTORE/COLECOES/obras-pre-fabricados-pdfs.md):
// obras-pre-fabricados-pdfs e os arquivos em obras/pre-fabricados/{obraId}/. Área engenharia: 'ver' lê; 'editar'
// anexa, substitui e exclui.
const projectId = 'demo-firebase-rules';
let env;

const identities = {
  adm2: 'uid-pf-adm2',
  editar: 'uid-pf-editar',
  ver: 'uid-pf-ver',
  logistica: 'uid-pf-logistica', // só a área logistica
  inativo: 'uid-pf-inativo',
};

const dbAs = (name) => env.authenticatedContext(identities[name]).firestore();
const storageAs = (name) => env.authenticatedContext(identities[name]).storage();
const pessoa = (name) => ({ uid: identities[name], nome: name });

const pdfDoc = (autor, extra = {}) => ({
  schemaVersion: 1, obraId: 'o1', lote: 'l1', plannix: 112, item: 'VIGA|VL - 25X70X1000', nome: 'longarina.pdf',
  tamanho: 2048, caminho: 'obras/pre-fabricados/o1/1-longarina.pdf', anexadoPor: pessoa(autor), anexadoEm: serverTimestamp(),
  ...extra,
});

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
    await setDoc(doc(db, 'obras-v2', 'o1'), { nomeObra: 'LAGOA BONITA DO SUL 16/2026', siglaObra: '', codObra: 44, local: 'Lagoa Bonita do Sul - RS', status: 'CONTRATADA' });
    await setDoc(doc(db, 'obras-pre-fabricados-pdfs', 'p1'), { ...pdfDoc('editar'), anexadoEm: Timestamp.fromMillis(1) });
  });
}

before(async () => {
  const emulatorConfig = { projectId, firestore: { rules: await readFile('firestore.rules', 'utf8') } };
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) emulatorConfig.storage = { rules: await readFile('storage.rules', 'utf8') };
  env = await initializeTestEnvironment(emulatorConfig);
  await seed();
});

after(async () => env?.cleanup());

test('[firestore] pré-fabricados: a área engenharia lê os PDFs da obra; outras áreas e inativos não', async () => {
  const daObra = (name) => query(collection(dbAs(name), 'obras-pre-fabricados-pdfs'), where('obraId', '==', 'o1'));
  await assertSucceeds(getDocs(daObra('ver')));
  await assertSucceeds(getDocs(daObra('adm2')));
  await assertFails(getDocs(daObra('logistica')));
  await assertFails(getDocs(daObra('inativo')));
});

test('[firestore] pré-fabricados: editar anexa assinado por si, na hora do servidor, numa obra que existe', async () => {
  const col = (name) => collection(dbAs(name), 'obras-pre-fabricados-pdfs');
  await assertSucceeds(setDoc(doc(col('editar'), 'p2'), pdfDoc('editar')));
  await assertSucceeds(setDoc(doc(col('adm2'), 'p3'), pdfDoc('adm2')));
  await assertFails(setDoc(doc(col('ver'), 'p4'), pdfDoc('ver')));
  await assertFails(setDoc(doc(col('editar'), 'p4'), pdfDoc('adm2')));
  await assertFails(setDoc(doc(col('editar'), 'p4'), pdfDoc('editar', { anexadoEm: Timestamp.fromMillis(5) })));
  await assertFails(setDoc(doc(col('editar'), 'p4'), pdfDoc('editar', { obraId: 'nao-existe', caminho: 'obras/pre-fabricados/nao-existe/x.pdf' })));
  await assertFails(setDoc(doc(col('editar'), 'p4'), pdfDoc('editar', { caminho: 'obras/pre-fabricados/outra/1-longarina.pdf' })));
  await assertFails(setDoc(doc(col('editar'), 'p4'), pdfDoc('editar', { caminho: 'logistica/notas/x/1.pdf' })));
  await assertFails(setDoc(doc(col('editar'), 'p4'), pdfDoc('editar', { plannix: 0 })));
  await assertFails(setDoc(doc(col('editar'), 'p4'), pdfDoc('editar', { tamanho: 25 * 1024 * 1024 + 1 })));
  await assertFails(setDoc(doc(col('editar'), 'p4'), pdfDoc('editar', { extra: true })));
});

test('[firestore] pré-fabricados: substituir troca o arquivo do mesmo documento, sem mudar obra, LOTE nem item', async () => {
  const ref1 = doc(dbAs('editar'), 'obras-pre-fabricados-pdfs', 'p1');
  const novo = { nome: 'longarina-rev1.pdf', tamanho: 4096, caminho: 'obras/pre-fabricados/o1/2-longarina-rev1.pdf', anexadoPor: pessoa('editar'), anexadoEm: serverTimestamp() };
  await assertSucceeds(updateDoc(ref1, novo));
  await assertFails(updateDoc(ref1, { ...novo, item: 'PILAR|P01' }));
  await assertFails(updateDoc(ref1, { ...novo, lote: 'l2' }));
  await assertFails(updateDoc(ref1, { ...novo, anexadoPor: pessoa('adm2') }));
  await assertFails(updateDoc(doc(dbAs('ver'), 'obras-pre-fabricados-pdfs', 'p1'), { ...novo, anexadoPor: pessoa('ver') }));
});

test('[firestore] pré-fabricados: editar exclui; ver não', async () => {
  await assertFails(deleteDoc(doc(dbAs('ver'), 'obras-pre-fabricados-pdfs', 'p1')));
  await assertSucceeds(deleteDoc(doc(dbAs('editar'), 'obras-pre-fabricados-pdfs', 'p1')));
});

const storageTest = (name, fn) => test(name, { skip: !process.env.FIREBASE_STORAGE_EMULATOR_HOST }, fn);
const pdf = new Uint8Array([37, 80, 68, 70]);

storageTest('[storage] pré-fabricados: só PDF, até 25 MB, sem sobrescrever; ver lê, editar envia e apaga', async () => {
  const caminho = 'obras/pre-fabricados/o1/1-longarina.pdf';
  await assertFails(uploadBytes(ref(storageAs('ver'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(uploadBytes(ref(storageAs('editar'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(storageAs('editar'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(storageAs('editar'), 'obras/pre-fabricados/o1/2-foto.jpg'), pdf, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageAs('editar'), 'obras/pre-fabricados/o1/3-grande.pdf'), new Uint8Array(25 * 1024 * 1024 + 1), { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(storageAs('ver'), caminho)));
  await assertFails(getBytes(ref(storageAs('logistica'), caminho)));
  await assertFails(deleteObject(ref(storageAs('ver'), caminho)));
  await assertSucceeds(deleteObject(ref(storageAs('editar'), caminho)));
});
