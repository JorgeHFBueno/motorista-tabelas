import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
} from 'firebase/storage';

const projectId = 'demo-firebase-rules';
let env;

const identities = {
  user: { uid: 'uid-user', email: 'user@example.com' },
  adm1: { uid: 'uid-adm1', email: 'adm1@example.com' },
  adm2: { uid: 'uid-adm2', email: 'adm2@example.com' },
  admin: { uid: 'uid-admin', email: 'admin@example.com', admin: true },
  inactive: { uid: 'uid-inactive', email: 'inactive@example.com' },
  missing: { uid: 'uid-missing', email: 'missing@example.com' },
};

function dbAs(name, tokenOverrides = {}) {
  const { uid, ...claims } = identities[name];
  return env.authenticatedContext(uid, { ...claims, ...tokenOverrides }).firestore();
}

function storageAs(name, tokenOverrides = {}) {
  const { uid, ...claims } = identities[name];
  return env.authenticatedContext(uid, { ...claims, ...tokenOverrides }).storage();
}

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const profiles = [
      ['user@example.com', { nome: 'User', ativo: true }],
      ['adm1@example.com', { nome: 'Adm1', ativo: true, adm1: true }],
      ['adm2@example.com', { nome: 'Adm2', ativo: true, adm2: true }],
      ['admin@example.com', { nome: 'Admin claim', ativo: true }],
      ['inactive@example.com', { nome: 'Inactive', ativo: false, adm2: true }],
    ];
    for (const [id, data] of profiles) await setDoc(doc(db, '00-autorizados', id), data);
    await setDoc(doc(db, 'veiculos', 'v1'), { placa: 'ABC1D23', categoria: 'truck', quilometragemUltima: 100, dataUltimaAtualizacao: 1 });
    await setDoc(doc(db, 'bombas', 'diesel_patio'), { nomeBomba: 'Pátio', montanteAtual: 1000, estoqueAtual: 5000, ultimoAbastecimento: 1, ultimoFrentista: 'old', ativo: true });
    await setDoc(doc(db, 'atividades', 'historic'), { tipo: 'saida', motorista: 'uid-user' });
    await setDoc(doc(db, 'atividades', 'historic', 'checklist_saida', 'item'), { criadoPorUid: 'uid-user', status: 'ok' });
    await setDoc(doc(db, '03-combustivel', 'fuel-existing'), { uid: 'uid-user', lf: 10 });
    await setDoc(doc(db, '00-chamados', 'call-existing'), { motorista: 'uid-user', tipo: 'Conflito', data: 1, status: 'ABERTO', mntntInfrmd: 10 });
    await setDoc(doc(db, 'configuracoes', 'checklist_saida'), { atualizadoPor: 'uid-adm2', ativo: true, versao: 1 });
    await setDoc(doc(db, 'notificacoes', 'own-note'), { motoristaUid: 'uid-user', chamadoId: 'c1', tipo: 'combustivel_divergencia', destinatarioPerfil: 'adm2', evento: 'novo' });
    await setDoc(doc(db, 'notificacoes', 'other-note'), { motoristaUid: 'uid-adm1', chamadoId: 'c2', tipo: 'combustivel_divergencia', destinatarioPerfil: 'adm2' });
    await setDoc(doc(db, 'obras', 'o1'), { nome: 'Obra' });
    await setDoc(doc(db, 'notas-categorias', 'cat1'), { nome: 'Categoria' });
    await setDoc(doc(db, 'notas-fornecedores', 'f1'), { nome: 'Fornecedor', numero: 1 });
    await setDoc(doc(db, 'notas-fornecedores-numeros', '1'), { fornecedorId: 'f1', numero: 1 });
    await setDoc(doc(db, 'app-metadata', 'notas-fornecedores-numero'), { ultimoNumero: 1 });
    await setDoc(doc(db, 'motoristas', 'm1'), { nome: 'Motorista', ativo: true });
    await setDoc(doc(db, 'motivos', 'm1'), { nome: 'Motivo', ativo: true });
    await setDoc(doc(db, 'manutencoes', 'maint1'), { status: 'ABERTA' });
  });
}

before(async () => {
  const emulatorConfig = {
    projectId,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  };
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    emulatorConfig.storage = { rules: await readFile('storage.rules', 'utf8') };
  }
  env = await initializeTestEnvironment(emulatorConfig);
  await seed();
});

after(async () => env?.cleanup());

test('[firestore] unauthenticated is denied operational data', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'veiculos', 'v1')));
});
test('[firestore] authenticated profile missing is denied', async () => assertFails(getDoc(doc(dbAs('missing'), 'veiculos', 'v1'))));
test('[firestore] inactive profile is denied', async () => assertFails(getDoc(doc(dbAs('inactive'), 'veiculos', 'v1'))));
test('[firestore] normal authorized reads vehicle', async () => assertSucceeds(getDoc(doc(dbAs('user'), 'veiculos', 'v1'))));
test('[firestore] adm1 remains an authorized operational user', async () => assertSucceeds(getDoc(doc(dbAs('adm1'), 'veiculos', 'v1'))));
test('[firestore] uppercase Auth email resolves lowercase profile ID', async () => assertSucceeds(getDoc(doc(dbAs('user', { email: 'User@Example.COM' }), 'veiculos', 'v1'))));
test('[firestore] own lowercase profile can be read with uppercase Auth email', async () => assertSucceeds(getDoc(doc(dbAs('user', { email: 'User@Example.COM' }), '00-autorizados', 'user@example.com'))));
test('[firestore] normal user cannot list profiles', async () => assertFails(getDocs(collection(dbAs('user'), '00-autorizados'))));
test('[firestore] profile cannot be modified by client', async () => assertFails(updateDoc(doc(dbAs('adm2'), '00-autorizados', 'user@example.com'), { adm2: true })));
test('[firestore] user registers FCM token only under normalized own profile', async () => assertSucceeds(setDoc(doc(dbAs('user'), '00-autorizados', 'user@example.com', 'fcmTokens', 'token-user'), { token: 'token-user', plataforma: 'android', atualizadoEm: 1 })));
test('[firestore] user cannot register FCM token under another profile', async () => assertFails(setDoc(doc(dbAs('user'), '00-autorizados', 'adm1@example.com', 'fcmTokens', 'token-foreign'), { token: 'token-foreign', plataforma: 'android', atualizadoEm: 1 })));
test('[firestore] uppercase profile path is not treated as normalized self path', async () => assertFails(setDoc(doc(dbAs('user', { email: 'User@Example.COM' }), '00-autorizados', 'User@Example.COM', 'fcmTokens', 'token-case'), { token: 'token-case', plataforma: 'android', atualizadoEm: 1 })));

test('[firestore] normal user updates only vehicle mileage', async () => assertSucceeds(updateDoc(doc(dbAs('user'), 'veiculos', 'v1'), { quilometragemUltima: 101, dataUltimaAtualizacao: 2 })));
test('[firestore] normal user cannot alter vehicle plate', async () => assertFails(updateDoc(doc(dbAs('user'), 'veiculos', 'v1'), { placa: 'BAD0000' })));
test('[firestore] normal user cannot alter vehicle category', async () => assertFails(updateDoc(doc(dbAs('user'), 'veiculos', 'v1'), { categoria: 'car' })));
test('[firestore] adm2 can create vehicle', async () => assertSucceeds(setDoc(doc(dbAs('adm2'), 'veiculos', 'v-adm2'), { placa: 'ADM2' })));
test('[firestore] adm2 can administratively edit vehicle', async () => assertSucceeds(updateDoc(doc(dbAs('adm2'), 'veiculos', 'v1'), { categoria: 'admin-edit' })));

test('[firestore] authorized creates activity', async () => assertSucceeds(setDoc(doc(dbAs('user'), 'atividades', 'new-activity'), { tipo: 'saida', motorista: 'uid-user' })));
test('[firestore] authorized reads activity', async () => assertSucceeds(getDoc(doc(dbAs('user'), 'atividades', 'historic'))));
test('[firestore] activity update is denied', async () => assertFails(updateDoc(doc(dbAs('adm2'), 'atividades', 'historic'), { motivo: 'changed' })));
test('[firestore] activity delete is denied', async () => assertFails(deleteDoc(doc(dbAs('adm2'), 'atividades', 'historic'))));
test('[firestore] checklist creator UID must match', async () => assertSucceeds(setDoc(doc(dbAs('user'), 'atividades', 'new-activity', 'checklist_saida', 'ok'), { criadoPorUid: 'uid-user' })));
test('[firestore] checklist foreign creator UID is denied', async () => assertFails(setDoc(doc(dbAs('user'), 'atividades', 'new-activity', 'checklist_saida', 'bad'), { criadoPorUid: 'uid-other' })));
test('[firestore] checklist update is denied', async () => assertFails(updateDoc(doc(dbAs('user'), 'atividades', 'historic', 'checklist_saida', 'item'), { status: 'avaria' })));
test('[firestore] checklist delete is denied', async () => assertFails(deleteDoc(doc(dbAs('adm2'), 'atividades', 'historic', 'checklist_saida', 'item'))));

test('[firestore] authorized creates fuel record without legacy uid', async () => assertSucceeds(setDoc(doc(dbAs('user'), '03-combustivel', 'fuel-no-uid'), { lf: 20, motorista: 'uid-user' })));
test('[firestore] fuel uid must match when present', async () => assertFails(setDoc(doc(dbAs('user'), '03-combustivel', 'fuel-bad-uid'), { uid: 'uid-other', lf: 20 })));
test('[firestore] normal fuel update is denied', async () => assertFails(updateDoc(doc(dbAs('user'), '03-combustivel', 'fuel-existing'), { lf: 30 })));
test('[firestore] normal fuel delete is denied', async () => assertFails(deleteDoc(doc(dbAs('user'), '03-combustivel', 'fuel-existing'))));
test('[firestore] custom claim admin updates fuel', async () => assertSucceeds(updateDoc(doc(dbAs('admin'), '03-combustivel', 'fuel-existing'), { lf: 31 })));
test('[firestore] custom claim admin deletes fuel', async () => { await setDoc(doc(dbAs('user'), '03-combustivel', 'fuel-admin-delete'), { lf: 1 }); await assertSucceeds(deleteDoc(doc(dbAs('admin'), '03-combustivel', 'fuel-admin-delete'))); });

test('[firestore] normal updates exact operational pump fields', async () => assertSucceeds(updateDoc(doc(dbAs('user'), 'bombas', 'diesel_patio'), { montanteAtual: 1100, estoqueAtual: 4900, ultimoAbastecimento: 2, ultimoFrentista: 'user' })));
test('[firestore] normal cannot update any other pump field', async () => assertFails(updateDoc(doc(dbAs('user'), 'bombas', 'diesel_patio'), { ativo: false })));
test('[firestore] adm2 performs pump administration', async () => assertSucceeds(updateDoc(doc(dbAs('adm2'), 'bombas', 'diesel_patio'), { folgaLitros: 200 })));

test('[firestore] authorized creates call', async () => assertSucceeds(setDoc(doc(dbAs('user'), '00-chamados', 'call-new'), { motorista: 'uid-user', tipo: 'Conflito', data: 1, status: 'ABERTO' })));
test('[firestore] operational call fields can be updated', async () => assertSucceeds(updateDoc(doc(dbAs('user'), '00-chamados', 'call-existing'), { status: 'CONCLUIDO', dfrncl: 2 })));
test('[firestore] call driver cannot be changed', async () => assertFails(updateDoc(doc(dbAs('user'), '00-chamados', 'call-existing'), { motorista: 'uid-other' })));
test('[firestore] call type cannot be changed', async () => assertFails(updateDoc(doc(dbAs('user'), '00-chamados', 'call-existing'), { tipo: 'Outro' })));
test('[firestore] call date cannot be changed', async () => assertFails(updateDoc(doc(dbAs('user'), '00-chamados', 'call-existing'), { data: 2 })));
test('[firestore] call delete is denied', async () => assertFails(deleteDoc(doc(dbAs('adm2'), '00-chamados', 'call-existing'))));

test('[firestore] normal reads global configuration', async () => assertSucceeds(getDoc(doc(dbAs('user'), 'configuracoes', 'checklist_saida'))));
test('[firestore] normal cannot write configuration', async () => assertFails(updateDoc(doc(dbAs('user'), 'configuracoes', 'checklist_saida'), { atualizadoPor: 'uid-user', ativo: false })));
test('[firestore] adm2 creates allowed configuration with own UID', async () => assertSucceeds(setDoc(doc(dbAs('adm2'), 'configuracoes', 'combustivel_verificacao'), { atualizadoPor: 'uid-adm2', modo: 'blocking' })));
test('[firestore] adm2 configuration with foreign atualizadoPor is denied', async () => assertFails(setDoc(doc(dbAs('adm2'), 'configuracoes', 'checklist_saida_obrigatorios'), { atualizadoPor: 'uid-other' })));
test('[firestore] unknown configuration ID is denied', async () => assertFails(setDoc(doc(dbAs('adm2'), 'configuracoes', 'unknown'), { atualizadoPor: 'uid-adm2' })));

test('[firestore] user creates own notification', async () => assertSucceeds(setDoc(doc(dbAs('user'), 'notificacoes', 'note-new'), { motoristaUid: 'uid-user', chamadoId: 'c3', tipo: 'combustivel_divergencia', destinatarioPerfil: 'adm2' })));
test('[firestore] foreign notification driver is denied', async () => assertFails(setDoc(doc(dbAs('user'), 'notificacoes', 'note-bad'), { motoristaUid: 'uid-other', chamadoId: 'c4', tipo: 'combustivel_divergencia', destinatarioPerfil: 'adm2' })));
test('[firestore] normal cannot list administrative notifications', async () => assertFails(getDocs(collection(dbAs('user'), 'notificacoes'))));
test('[firestore] adm2 can list notifications', async () => assertSucceeds(getDocs(collection(dbAs('adm2'), 'notificacoes'))));
test('[firestore] user gets own notification', async () => assertSucceeds(getDoc(doc(dbAs('user'), 'notificacoes', 'own-note'))));
test('[firestore] user cannot get another notification', async () => assertFails(getDoc(doc(dbAs('user'), 'notificacoes', 'other-note'))));
for (const field of ['motoristaUid', 'chamadoId', 'tipo', 'destinatarioPerfil']) {
  test(`[firestore] notification identity field ${field} is immutable`, async () => assertFails(updateDoc(doc(dbAs('user'), 'notificacoes', 'own-note'), { [field]: 'changed' })));
}
test('[firestore] owner can update notification event', async () => assertSucceeds(updateDoc(doc(dbAs('user'), 'notificacoes', 'own-note'), { evento: 'updated' })));
test('[firestore] adm2 writes own read receipt', async () => assertSucceeds(setDoc(doc(dbAs('adm2'), 'notificacoes', 'own-note', 'leituras', 'uid-adm2'), { versaoLida: 1 })));
test('[firestore] adm2 cannot write read receipt for another UID', async () => assertFails(setDoc(doc(dbAs('adm2'), 'notificacoes', 'own-note', 'leituras', 'uid-user'), { versaoLida: 1 })));

test('[firestore] authorized reads works', async () => assertSucceeds(getDoc(doc(dbAs('user'), 'obras', 'o1'))));
test('[firestore] only adm2 writes works', async () => assertFails(updateDoc(doc(dbAs('user'), 'obras', 'o1'), { nome: 'No' })));
test('[firestore] adm2 writes works', async () => assertSucceeds(updateDoc(doc(dbAs('adm2'), 'obras', 'o1'), { nome: 'Yes' })));
for (const path of ['notas-categorias/cat1', 'notas-fornecedores/f1', 'notas-fornecedores-numeros/1', 'app-metadata/notas-fornecedores-numero']) {
  test(`[firestore] normal denied administrative catalog ${path}`, async () => assertFails(getDoc(doc(dbAs('user'), ...path.split('/')))));
  test(`[firestore] adm2 reads administrative catalog ${path}`, async () => assertSucceeds(getDoc(doc(dbAs('adm2'), ...path.split('/')))));
}
test('[firestore] authorized reads motorists and reasons', async () => { await assertSucceeds(getDoc(doc(dbAs('user'), 'motoristas', 'm1'))); await assertSucceeds(getDoc(doc(dbAs('user'), 'motivos', 'm1'))); });
test('[firestore] clients cannot write motorists', async () => assertFails(updateDoc(doc(dbAs('adm2'), 'motoristas', 'm1'), { ativo: false })));
test('[firestore] only adm2 reads maintenance', async () => { await assertFails(getDoc(doc(dbAs('user'), 'manutencoes', 'maint1'))); await assertSucceeds(getDoc(doc(dbAs('adm2'), 'manutencoes', 'maint1'))); });
test('[firestore] only adm2 creates maintenance', async () => { await assertFails(setDoc(doc(dbAs('user'), 'manutencoes', 'maint-user'), { status: 'A' })); await assertSucceeds(setDoc(doc(dbAs('adm2'), 'manutencoes', 'maint-adm2'), { status: 'A' })); });
test('[firestore] generic maintenance update requires admin claim', async () => { await assertFails(updateDoc(doc(dbAs('adm2'), 'manutencoes', 'maint1'), { arbitrary: true })); await assertSucceeds(updateDoc(doc(dbAs('admin'), 'manutencoes', 'maint1'), { arbitrary: true })); });
test('[firestore] unknown collection is default denied', async () => assertFails(getDoc(doc(dbAs('adm2'), 'unknown', 'x'))));

test('[firestore] Flutter checklist batch succeeds atomically', async () => {
  const db = dbAs('user'); const batch = writeBatch(db);
  batch.set(doc(db, 'atividades', 'batch-checklist'), { tipo: 'saida', motorista: 'uid-user' });
  batch.set(doc(db, 'atividades', 'batch-checklist', 'checklist_saida', 'i1'), { criadoPorUid: 'uid-user', status: 'ok' });
  batch.set(doc(db, 'atividades', 'batch-checklist', 'checklist_saida', 'i2'), { criadoPorUid: 'uid-user', status: 'avaria' });
  batch.update(doc(db, 'veiculos', 'v1'), { quilometragemUltima: 150, dataUltimaAtualizacao: 3 });
  await assertSucceeds(batch.commit());
});
test('[firestore] Flutter checklist batch fails atomically for foreign creator', async () => {
  const db = dbAs('user'); const batch = writeBatch(db);
  batch.set(doc(db, 'atividades', 'batch-checklist-bad'), { tipo: 'saida', motorista: 'uid-user' });
  batch.set(doc(db, 'atividades', 'batch-checklist-bad', 'checklist_saida', 'i1'), { criadoPorUid: 'uid-other' });
  batch.update(doc(db, 'veiculos', 'v1'), { quilometragemUltima: 151, dataUltimaAtualizacao: 4 });
  await assertFails(batch.commit());
  const adminDb = env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async (ctx) => assert.equal((await getDoc(doc(ctx.firestore(), 'atividades', 'batch-checklist-bad'))).exists(), false));
  void adminDb;
});
test('[firestore] Flutter simple activity transaction succeeds', async () => {
  const db = dbAs('user');
  await assertSucceeds(runTransaction(db, async (tx) => { tx.set(doc(db, 'atividades', 'tx-arrival'), { tipo: 'chegada', motorista: 'uid-user' }); tx.update(doc(db, 'veiculos', 'v1'), { quilometragemUltima: 160, dataUltimaAtualizacao: 5 }); }));
});
test('[firestore] Flutter fuel transaction succeeds across fuel pump vehicle and call', async () => {
  const db = dbAs('user');
  await assertSucceeds(runTransaction(db, async (tx) => {
    await tx.get(doc(db, 'bombas', 'diesel_patio'));
    tx.set(doc(db, '03-combustivel', 'tx-fuel'), { uid: 'uid-user', lf: 1200 });
    tx.update(doc(db, 'bombas', 'diesel_patio'), { montanteAtual: 1200, estoqueAtual: 4800, ultimoAbastecimento: 6, ultimoFrentista: 'user' });
    tx.update(doc(db, 'veiculos', 'v1'), { quilometragemUltima: 170, dataUltimaAtualizacao: 6 });
    tx.update(doc(db, '00-chamados', 'call-existing'), { status: 'CONCLUIDO' });
  }));
});
test('[firestore] Flutter fuel transaction fails atomically for foreign fuel uid', async () => {
  const db = dbAs('user');
  await assertFails(runTransaction(db, async (tx) => {
    await tx.get(doc(db, 'bombas', 'diesel_patio'));
    tx.set(doc(db, '03-combustivel', 'tx-fuel-bad'), { uid: 'uid-other', lf: 1300 });
    tx.update(doc(db, 'bombas', 'diesel_patio'), { montanteAtual: 1300, estoqueAtual: 4700, ultimoAbastecimento: 7, ultimoFrentista: 'user' });
  }));
});

const image = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
test('[storage] authorized user reads checklist photo', async () => {
  const object = ref(storageAs('user'), 'checklists/saidas/storage-read/photo.jpg');
  await assertSucceeds(uploadBytes(object, image, { contentType: 'image/jpeg' }));
  await assertSucceeds(getBytes(object));
});
test('[storage] authorized user creates image', async () => assertSucceeds(uploadBytes(ref(storageAs('user'), 'checklists/saidas/a/image.png'), image, { contentType: 'image/png' })));
test('[storage] non-image is denied', async () => assertFails(uploadBytes(ref(storageAs('user'), 'checklists/saidas/a/file.txt'), image, { contentType: 'text/plain' })));
test('[storage] image above 5 MiB is denied', async () => assertFails(uploadBytes(ref(storageAs('user'), 'checklists/saidas/a/large.jpg'), new Uint8Array(5 * 1024 * 1024 + 1), { contentType: 'image/jpeg' })));
test('[storage] object update is denied', async () => { const object = ref(storageAs('user'), 'checklists/saidas/a/update.jpg'); await assertSucceeds(uploadBytes(object, image, { contentType: 'image/jpeg' })); await assertFails(uploadBytes(object, image, { contentType: 'image/jpeg' })); });
test('[storage] object delete is denied', async () => { const object = ref(storageAs('user'), 'checklists/saidas/a/delete.jpg'); await assertSucceeds(uploadBytes(object, image, { contentType: 'image/jpeg' })); await assertFails(deleteObject(object)); });
test('[storage] unauthorized profile is denied', async () => assertFails(uploadBytes(ref(storageAs('missing'), 'checklists/saidas/a/missing.jpg'), image, { contentType: 'image/jpeg' })));
test('[storage] inactive profile is denied', async () => assertFails(uploadBytes(ref(storageAs('inactive'), 'checklists/saidas/a/inactive.jpg'), image, { contentType: 'image/jpeg' })));
test('[storage] uppercase Auth email resolves lowercase profile ID', async () => assertSucceeds(uploadBytes(ref(storageAs('user', { email: 'User@Example.COM' }), 'checklists/saidas/a/case.jpg'), image, { contentType: 'image/jpeg' })));
