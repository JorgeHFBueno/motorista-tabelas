import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  serverTimestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
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
  frentista: { uid: 'uid-frentista', email: 'frentista@example.com' },
  adm2: { uid: 'uid-adm2', email: 'adm2@example.com' },
  admin: { uid: 'uid-admin', email: 'admin@example.com', admin: true },
  inactive: { uid: 'uid-inactive', email: 'inactive@example.com' },
  missing: { uid: 'uid-missing', email: 'missing@example.com' },
  canonicalFrentista: { uid: 'uid-canonical-frentista', email: 'canonical-frentista@example.com' },
  canonicalAdm2: { uid: 'uid-canonical-adm2', email: 'canonical-adm2@example.com' },
  canonicalUser: { uid: 'uid-canonical-user', email: 'canonical-user@example.com' },
  canonicalInactive: { uid: 'uid-canonical-inactive', email: 'canonical-inactive@example.com' },
  canonicalPrecedence: { uid: 'uid-canonical-precedence', email: 'canonical-precedence@example.com' },
  canonicalInactivePrecedence: { uid: 'uid-canonical-inactive-precedence', email: 'canonical-inactive-precedence@example.com' },
  legacyOnly: { uid: 'uid-legacy-only', email: 'legacy-only@example.com' },
  mecanico: { uid: 'uid-mecanico', email: 'mecanico@example.com' },
  escritorio: { uid: 'uid-escritorio', email: 'escritorio@example.com' },
  escritorioFora: { uid: 'uid-escritorio-fora', email: 'escritorio-fora@example.com' },
  engenharia: { uid: 'uid-engenharia', email: 'engenharia@example.com' },
  logistica: { uid: 'uid-logistica', email: 'logistica@example.com' },
  autor: { uid: 'uid-autor', email: 'autor@example.com' },
  retr0: { uid: 'uid-retr0', email: 'retr0@example.com' },
  retr0b: { uid: 'uid-retr0b', email: 'retr0b@example.com' },
  retr0c: { uid: 'uid-retr0c', email: 'retr0c@example.com' },
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
      ['frentista@example.com', { nome: 'Adm1', ativo: true, adm1: true }],
      ['adm2@example.com', { nome: 'Adm2', ativo: true, adm2: true }],
      ['admin@example.com', { nome: 'Admin claim', ativo: true }],
      ['inactive@example.com', { nome: 'Inactive', ativo: false, adm2: true }],
    ];
    for (const [id, data] of profiles) await setDoc(doc(db, '00-autorizados', id), data);
    await setDoc(doc(db, 'funcionarios', 'uid-user'), {
      nome: 'User', email: 'user@example.com', ativo: true,
      perfis: { frentista: false, adm2: false, motorista: true }, motorista: { ordem: 1 },
      createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1),
    });
    const canonicalEmployee = (uid, email, ativo, perfis) => setDoc(doc(db, 'funcionarios', uid), {
      nome: uid, email, ativo, perfis, createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1),
    });
    await canonicalEmployee('uid-canonical-frentista', 'canonical-frentista@example.com', true, { frentista: true, adm2: false, motorista: false });
    await canonicalEmployee('uid-canonical-adm2', 'canonical-adm2@example.com', true, { frentista: false, adm2: true, motorista: false });
    await canonicalEmployee('uid-canonical-user', 'canonical-user@example.com', true, { frentista: false, adm2: false, motorista: false });
    await canonicalEmployee('uid-canonical-inactive', 'canonical-inactive@example.com', false, { frentista: false, adm2: true, motorista: false });
    await canonicalEmployee('uid-canonical-precedence', 'canonical-precedence@example.com', true, { frentista: false, adm2: false, motorista: false });
    await canonicalEmployee('uid-canonical-inactive-precedence', 'canonical-inactive-precedence@example.com', false, { frentista: false, adm2: true, motorista: false });
    await setDoc(doc(db, '00-autorizados', 'canonical-precedence@example.com'), { nome: 'Legacy elevation', ativo: true, adm2: true });
    await setDoc(doc(db, '00-autorizados', 'canonical-inactive-precedence@example.com'), { nome: 'Legacy active', ativo: true, adm2: true });
    // 00-autorizados no longer authorizes: the legacy identities also have their funcionarios document.
    const employeeLike = (uid, nome, email, ativo, perfis) => setDoc(doc(db, 'funcionarios', uid), {
      nome, email, ativo, perfis: { frentista: false, adm2: false, motorista: false, ...perfis },
      createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1),
    });
    await employeeLike('uid-frentista', 'Frentista', 'frentista@example.com', true, { frentista: true });
    await employeeLike('uid-adm2', 'Adm2', 'adm2@example.com', true, { adm2: true });
    await employeeLike('uid-admin', 'Admin claim', 'admin@example.com', true, {});
    await employeeLike('uid-inactive', 'Inactive', 'inactive@example.com', false, { adm2: true });
    await employeeLike('uid-mecanico', 'Mecanico', 'mecanico@example.com', true, { mecanico: true });
    await employeeLike('uid-escritorio', 'Escritorio', 'escritorio@example.com', true, { escritorio: true });
    await employeeLike('uid-escritorio-fora', 'Escritorio fora', 'escritorio-fora@example.com', true, { escritorio: true });
    await employeeLike('uid-engenharia', 'Engenharia', 'engenharia@example.com', true, { engenharia: true });
    await employeeLike('uid-logistica', 'Logistica', 'logistica@example.com', true, { logistica: true });
    await employeeLike('uid-autor', 'Autor', 'autor@example.com', true, { autor: true });
    await employeeLike('uid-retr0', 'Retr0', 'retr0@example.com', true, { retr0: true });
    await employeeLike('uid-retr0b', 'Retr0 B', 'retr0b@example.com', true, { retr0: true });
    await employeeLike('uid-retr0c', 'Retr0 C', 'retr0c@example.com', true, { retr0: true });
    await setDoc(doc(db, '00-autorizados', 'legacy-only@example.com'), { nome: 'Legacy only', ativo: true, adm2: true });
    await setDoc(doc(db, 'veiculos-v2', 'vv-inativo'), {
      schemaVersion: 2, cadastro: { ativo: false }, identificacao: { categoria: 'PLACA', identificador: 'OLD1A23', nome: 'Caminhão parado' },
      operacional: { quilometragemUltima: 90000 },
    });
    await setDoc(doc(db, 'veiculos-v2', 'vv-correcao'), {
      schemaVersion: 2, cadastro: { ativo: true }, identificacao: { categoria: 'PLACA', identificador: 'COR1R23', nome: 'Caminhão KM errado' },
      operacional: { quilometragemUltima: 500000 },
    });
    await setDoc(doc(db, 'veiculos', 'v1'), { placa: 'ABC1D23', categoria: 'truck', quilometragemUltima: 100, dataUltimaAtualizacao: 1 });
    await setDoc(doc(db, 'bombas', 'diesel_patio'), { nomeBomba: 'Pátio', montanteAtual: 1000, estoqueAtual: 5000, ultimoAbastecimento: 1, ultimoFrentista: 'old', ativo: true });
    await setDoc(doc(db, 'atividades', 'historic'), { tipo: 'saida', motorista: 'uid-user' });
    await setDoc(doc(db, 'atividades', 'historic', 'checklist_saida', 'item'), { criadoPorUid: 'uid-user', status: 'ok' });
    await setDoc(doc(db, '03-combustivel', 'fuel-existing'), { uid: 'uid-user', lf: 10 });
    await setDoc(doc(db, '00-chamados', 'call-existing'), { motorista: 'uid-user', tipo: 'Conflito', data: 1, status: 'ABERTO', mntntInfrmd: 10 });
    await setDoc(doc(db, 'configuracoes', 'checklist_saida'), { atualizadoPor: 'uid-adm2', ativo: true, versao: 1 });
    await setDoc(doc(db, 'notificacoes', 'own-note'), { motoristaUid: 'uid-user', chamadoId: 'c1', tipo: 'combustivel_divergencia', destinatarioPerfil: 'adm2', evento: 'novo' });
    await setDoc(doc(db, 'notificacoes', 'other-note'), { motoristaUid: 'uid-frentista', chamadoId: 'c2', tipo: 'combustivel_divergencia', destinatarioPerfil: 'adm2' });
    await setDoc(doc(db, 'obras', 'o1'), { nome: 'Obra' });
    await setDoc(doc(db, 'notas-categorias', 'cat1'), { nome: 'Categoria' });
    await setDoc(doc(db, 'notas-fornecedores', 'f1'), { nome: 'Fornecedor', numero: 1 });
    await setDoc(doc(db, 'notas-fornecedores-numeros', '1'), { fornecedorId: 'f1', numero: 1 });
    await setDoc(doc(db, 'app-metadata', 'notas-fornecedores-numero'), { ultimoNumero: 1 });
    await setDoc(doc(db, 'motoristas', 'm1'), { nome: 'Motorista', ativo: true });
    await setDoc(doc(db, 'motivos', 'm1'), { nome: 'Motivo', ativo: true });
    await setDoc(doc(db, 'manutencoes', 'maint1'), { status: 'ABERTA' });
    // Revisão das Rules (2026-10-20): frota e obras V2, monday, Friday e cadastros oficiais.
    await setDoc(doc(db, 'veiculos-v2', 'vv1'), {
      schemaVersion: 2, cadastro: { ativo: true }, identificacao: { categoria: 'PLACA', identificador: 'ABC1D23', nome: 'Caminhão 1' },
      operacional: { quilometragemUltima: 125000, dataUltimaAtualizacao: Timestamp.fromMillis(1) },
    });
    await setDoc(doc(db, 'veiculos-v2', 'vm1'), {
      schemaVersion: 2, cadastro: { ativo: true }, identificacao: { categoria: 'EXTRA', identificador: 'CARREGADEIRA', nome: 'Carregadeira Case' },
      operacional: { quilometragemUltima: 8700 },
    });
    await setDoc(doc(db, 'obras-v2', 'ob1'), { nomeObra: 'Obra V2', local: 'Ledur', codObra: 101, siglaObra: 'OBV' });
    await setDoc(doc(db, 'monday-obras', 'mo1'), { nome: 'Obra monday' });
    await setDoc(doc(db, 'monday-mestres', 'dine'), { nome: 'Dine', cor: '#123456' });
    await setDoc(doc(db, 'manutencoes-legado', 'legacy1'), { status: 'OK' });
    await setDoc(doc(db, 'logistica-semanas', '2026-W45'), { schemaVersion: 1, inicio: '2026-11-02', fim: '2026-11-08', abertura: 'automatica', criadoPorUid: 'uid-canonical-adm2', criadoEm: Timestamp.fromMillis(1) });
    await setDoc(doc(db, 'logistica-programacoes', 'lp1'), { schemaVersion: 1, semanaId: '2026-W45', item: 'Transporte', status: '', inicio: null, fim: null, motorista: null, auxiliar: null, veiculo: null, obra: null, posicao: 1, criadoPorUid: 'uid-other', criadoEm: Timestamp.fromMillis(1), atualizadoPorUid: 'uid-other', atualizadoEm: Timestamp.fromMillis(1) });
    await setDoc(doc(db, 'erp-veiculos', 'vv1'), { schemaVersion: 1, placa: 'ABC1D23', status: 'ok', linhas: [] });
    await setDoc(doc(db, 'kioskCredentials', 'uid-user'), { pinHash: 'x' });
    await setDoc(doc(db, 'friday-quadros', '10'), { id: 10, nome: 'Quadro', cadastro: null, restrito: 0 });
    await setDoc(doc(db, 'friday-quadros', '15'), { id: 15, nome: 'Quadro da área 1', area_id: 1, pasta_id: 50, cadastro: null, restrito: 0 });
    await setDoc(doc(db, 'friday-pastas', '50'), { id: 50, nome: 'Pasta', area_id: 1, pasta_pai_id: null });
    await setDoc(doc(db, 'friday-quadros', '11'), { id: 11, nome: 'Quadro oficial', cadastro: 'pontes', restrito: 0 });
    await setDoc(doc(db, 'friday-itens', '20'), { id: 20, quadro_id: 10, nome: 'Item', valores: {}, vinculo: null, importado_em: null });
    await setDoc(doc(db, 'friday-itens', '21'), { id: 21, quadro_id: 11, nome: 'Item oficial', valores: {}, vinculo: { cadastro: 'pontes', id: 'abc' } });
    await setDoc(doc(db, 'friday-importacoes', '123'), { board_id: '123', situacao: 'ok' });
    await setDoc(doc(db, 'friday-cadastros', 'pontes'), { chave: 'pontes', colecao: 'cadastro-pontes', situacao: 'ativo' });
    await setDoc(doc(db, 'cadastro-pontes', 'abc'), { nome: 'Ponte', situacao: 'ativo' });
    await setDoc(doc(db, 'friday-anexos', '30'), { id: 30, item_id: 20, quadro_id: 10 });
    // Quadro restrito (permissão por quadro): só uid-escritorio na lista; o quadro de subitens copia a lista.
    await setDoc(doc(db, 'friday-quadros', '100'), { id: 100, nome: 'RH', cadastro: null, restrito: 1, acesso: ['uid-escritorio'] });
    await setDoc(doc(db, 'friday-quadros', '101'), { id: 101, nome: 'Subitens de RH', tipo: 'subitens', quadro_pai_id: 100, cadastro: null, restrito: 1, acesso: ['uid-escritorio'] });
    await setDoc(doc(db, 'friday-itens', '200'), { id: 200, quadro_id: 100, nome: 'Sigiloso', valores: {}, pessoas: ['uid-escritorio', 'uid-escritorio-fora'], arquivado_em: '2026-11-06 10:00:00', vinculo: null });
    await setDoc(doc(db, 'friday-itens', '201'), { id: 201, quadro_id: 101, item_pai_id: 200, nome: 'Subitem sigiloso', valores: {}, vinculo: null });
    await setDoc(doc(db, 'friday-colunas', '210'), { id: 210, quadro_id: 100, titulo: 'Status', tipo: 'status' });
    await setDoc(doc(db, 'friday-execucoes', '220'), { id: 220, quadro_id: 100, criado_em: '2026-11-06 10:00:00' });
    await setDoc(doc(db, 'friday-anexos', '230'), { id: 230, item_id: 200, quadro_id: 100, arquivo: 'friday/100/200/230-rh.pdf' });
    await setDoc(doc(db, 'friday-atividades', '240'), { id: 240, quadro_id: 100, item_id: 200, acao: 'criou' });
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
test('[firestore] canonical active adm1 is authorized', async () => assertSucceeds(getDoc(doc(dbAs('canonicalFrentista'), 'motivos', 'm1'))));
test('[firestore] canonical active adm2 is authorized', async () => assertSucceeds(getDoc(doc(dbAs('canonicalAdm2'), 'motivos', 'm1'))));

test('[firestore] erp-veiculos: a Frota (mecanico, logistica, adm2) lê; ninguém grava pelo cliente', async () => {
  await assertSucceeds(getDoc(doc(dbAs('canonicalAdm2'), 'erp-veiculos', 'vv1')));
  await assertSucceeds(getDoc(doc(dbAs('mecanico'), 'erp-veiculos', 'vv1')));
  await assertSucceeds(getDoc(doc(dbAs('logistica'), 'erp-veiculos', 'vv1')));
  await assertFails(getDoc(doc(dbAs('canonicalFrentista'), 'erp-veiculos', 'vv1')));
  await assertFails(getDoc(doc(dbAs('engenharia'), 'erp-veiculos', 'vv1')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'erp-veiculos', 'vv1')));
  await assertFails(setDoc(doc(dbAs('canonicalAdm2'), 'erp-veiculos', 'vv1'), { status: 'ok' }));
  await assertFails(setDoc(doc(dbAs('canonicalAdm2'), 'erp-veiculos', 'novo'), { status: 'ok' }));
});
test('[firestore] canonical active user without admin permission is operationally authorized', async () => assertSucceeds(getDoc(doc(dbAs('canonicalUser'), 'motivos', 'm1'))));
test('[firestore] canonical inactive employee is denied', async () => assertFails(getDoc(doc(dbAs('canonicalInactive'), 'motivos', 'm1'))));
test('[firestore] canonical employee denies legacy privilege elevation', async () => assertFails(setDoc(doc(dbAs('canonicalPrecedence'), 'configuracoes', 'canonical-precedence'), { enabled: true })));
test('[firestore] canonical inactive employee denies legacy authorization', async () => assertFails(getDoc(doc(dbAs('canonicalInactivePrecedence'), 'motivos', 'm1'))));
test('[firestore] normal authorized reads reasons', async () => assertSucceeds(getDoc(doc(dbAs('user'), 'motivos', 'm1'))));
test('[firestore] adm1 remains an authorized operational user', async () => assertSucceeds(getDoc(doc(dbAs('frentista'), 'motivos', 'm1'))));
test('[firestore] legacy-only profile (00-autorizados, no funcionarios) is denied, even active adm2', async () => {
  const db = dbAs('legacyOnly');
  await assertFails(getDoc(doc(db, 'motivos', 'm1')));
  await assertFails(getDocs(collection(db, 'notificacoes')));
  await assertFails(setDoc(doc(db, 'configuracoes', 'legacy-only'), { enabled: true }));
  await assertFails(getDocs(collection(db, 'funcionarios')));
});
test('[firestore] own lowercase profile can be read with uppercase Auth email', async () => assertSucceeds(getDoc(doc(dbAs('user', { email: 'User@Example.COM' }), '00-autorizados', 'user@example.com'))));
test('[firestore] normal user cannot get an arbitrary profile', async () => assertFails(getDoc(doc(dbAs('user'), '00-autorizados', 'frentista@example.com'))));
test('[firestore] adm2 can get an arbitrary profile', async () => assertSucceeds(getDoc(doc(dbAs('adm2'), '00-autorizados', 'user@example.com'))));
test('[firestore] normal user cannot list profiles', async () => assertFails(getDocs(collection(dbAs('user'), '00-autorizados'))));
test('[firestore] frentista cannot list legacy profiles (only adm2)', async () => assertFails(getDocs(collection(dbAs('frentista'), '00-autorizados'))));
test('[firestore] adm2 can list profiles administratively', async () => assertSucceeds(getDocs(collection(dbAs('adm2'), '00-autorizados'))));
test('[firestore] profile cannot be modified by client', async () => assertFails(updateDoc(doc(dbAs('adm2'), '00-autorizados', 'user@example.com'), { adm2: true })));
test('[firestore] user registers FCM token only under normalized own profile', async () => assertSucceeds(setDoc(doc(dbAs('user'), '00-autorizados', 'user@example.com', 'fcmTokens', 'token-user'), { token: 'token-user', plataforma: 'android', atualizadoEm: 1 })));
test('[firestore] user cannot register FCM token under another profile', async () => assertFails(setDoc(doc(dbAs('user'), '00-autorizados', 'frentista@example.com', 'fcmTokens', 'token-foreign'), { token: 'token-foreign', plataforma: 'android', atualizadoEm: 1 })));
test('[firestore] uppercase profile path is not treated as normalized self path', async () => assertFails(setDoc(doc(dbAs('user', { email: 'User@Example.COM' }), '00-autorizados', 'User@Example.COM', 'fcmTokens', 'token-case'), { token: 'token-case', plataforma: 'android', atualizadoEm: 1 })));
test('[firestore] employee identity is readable by its owner', async () => assertSucceeds(getDoc(doc(dbAs('user'), 'funcionarios', 'uid-user'))));
test('[firestore] employee identity is not writable by its owner', async () => assertFails(updateDoc(doc(dbAs('user'), 'funcionarios', 'uid-user'), { 'perfis.adm2': true })));
test('[firestore] employee identity is readable by adm2 but written only by the Admin SDK', async () => {
  await assertSucceeds(getDoc(doc(dbAs('adm2'), 'funcionarios', 'uid-user')));
  await assertFails(updateDoc(doc(dbAs('adm2'), 'funcionarios', 'uid-user'), { nome: 'User updated by adm2' }));
});
test('[firestore] employee identity cannot be created by client', async () => assertFails(setDoc(doc(dbAs('adm2'), 'funcionarios', 'uid-new'), {
  nome: 'New', email: 'new@example.com', ativo: true,
  perfis: { frentista: false, adm2: false, motorista: false },
  createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1),
})));

const cronogramaAlocacao = (criadoPorFuncionarioId = 'uid-engenharia') => ({
  obraId: '13053086105', contratoId: '12806288209', mestreId: 'dine',
  inicio: '2026-09-01', tempoPlanejado: 7, criadoPorFuncionarioId,
  criadoEm: Timestamp.fromMillis(1), atualizadoEm: Timestamp.fromMillis(1),
});

test('[firestore] cronograma denies unauthenticated and missing-profile clients', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'monday-cronograma', 'allocation')));
  await assertFails(getDoc(doc(dbAs('missing'), 'monday-cronograma', 'allocation')));
});
test('[firestore] cronograma: engenharia reads and creates own allocation; other credentials cannot', async () => {
  await assertFails(setDoc(doc(dbAs('user'), 'monday-cronograma', 'allocation-motorista'), cronogramaAlocacao('uid-user')));
  await assertFails(getDocs(collection(dbAs('user'), 'monday-cronograma')));
  const db = dbAs('engenharia'); const reference = doc(db, 'monday-cronograma', 'allocation-own');
  await assertSucceeds(setDoc(reference, cronogramaAlocacao()));
  await assertSucceeds(getDoc(reference));
});
test('[firestore] cronograma rejects forged creator and immutable authorship changes', async () => {
  const db = dbAs('engenharia'); const forged = doc(db, 'monday-cronograma', 'allocation-forged');
  await assertFails(setDoc(forged, cronogramaAlocacao('uid-other')));
  const owned = doc(db, 'monday-cronograma', 'allocation-immutable');
  await assertSucceeds(setDoc(owned, cronogramaAlocacao()));
  await assertFails(updateDoc(owned, { criadoPorFuncionarioId: 'uid-other' }));
  await assertFails(updateDoc(owned, { criadoEm: Timestamp.fromMillis(2) }));
});
test('[firestore] cronograma authorized update and delete preserve the valid schema', async () => {
  const db = dbAs('engenharia'); const reference = doc(db, 'monday-cronograma', 'allocation-crud');
  await assertSucceeds(setDoc(reference, cronogramaAlocacao()));
  await assertSucceeds(updateDoc(reference, { inicio: '2026-09-08', tempoPlanejado: 14, atualizadoEm: Timestamp.fromMillis(2) }));
  await assertSucceeds(deleteDoc(reference));
});

test('[firestore] normal user updates only vehicle mileage', async () => assertSucceeds(updateDoc(doc(dbAs('user'), 'veiculos', 'v1'), { quilometragemUltima: 101, dataUltimaAtualizacao: 2 })));
test('[firestore] normal user cannot alter vehicle plate', async () => assertFails(updateDoc(doc(dbAs('user'), 'veiculos', 'v1'), { placa: 'BAD0000' })));
test('[firestore] normal user cannot alter vehicle category', async () => assertFails(updateDoc(doc(dbAs('user'), 'veiculos', 'v1'), { categoria: 'car' })));
test('[firestore] adm2 can create vehicle', async () => assertSucceeds(setDoc(doc(dbAs('adm2'), 'veiculos', 'v-adm2'), { placa: 'ADM2' })));
test('[firestore] adm2 can administratively edit vehicle', async () => assertSucceeds(updateDoc(doc(dbAs('adm2'), 'veiculos', 'v1'), { categoria: 'admin-edit' })));

test('[firestore] normal user creates own activity with additional fields', async () => assertSucceeds(setDoc(doc(dbAs('user'), 'atividades', 'new-activity'), {
  tipo: 'saida', motorista: 'User', motoristaUid: 'uid-user', criadoPorUid: 'uid-user', futureMetadata: { version: 3 },
})));
test('[firestore] normal user cannot create activity for another driver', async () => assertFails(setDoc(doc(dbAs('user'), 'atividades', 'foreign-activity'), {
  tipo: 'saida', motoristaUid: 'uid-other', criadoPorUid: 'uid-user',
})));
test('[firestore] mecanico creates legacy activity for another driver; frentista cannot', async () => {
  await assertSucceeds(setDoc(doc(dbAs('mecanico'), 'atividades', 'mecanico-activity'), { tipo: 'saida', motoristaUid: 'uid-user', criadoPorUid: 'uid-mecanico' }));
  await assertFails(setDoc(doc(dbAs('frentista'), 'atividades', 'frentista-activity'), { tipo: 'saida', motoristaUid: 'uid-user', criadoPorUid: 'uid-frentista' }));
});
test('[firestore] adm2 creates activity for another driver', async () => assertSucceeds(setDoc(doc(dbAs('adm2'), 'atividades', 'adm2-activity'), {
  tipo: 'chegada', motoristaUid: 'uid-user', criadoPorUid: 'uid-adm2',
})));
test('[firestore] activity forged creator is denied', async () => assertFails(setDoc(doc(dbAs('user'), 'atividades', 'forged-activity'), {
  tipo: 'saida', motoristaUid: 'uid-user', criadoPorUid: 'uid-other',
})));
test('[firestore] atividades: the driver reads their own (Histórico) and the id about to be created; not others', async () => {
  const db = dbAs('user');
  await assertSucceeds(getDoc(doc(db, 'atividades', 'historic')));
  await assertSucceeds(getDoc(doc(db, 'atividades', 'ainda-nao-existe')));
  for (const campo of ['motorista.uid', 'motorista', 'motoristaUid', 'criadoPor.uid', 'criadoPorUid']) {
    await assertSucceeds(getDocs(query(collection(db, 'atividades'), where(campo, '==', 'uid-user'), limit(60))));
  }
  await assertFails(getDocs(collection(db, 'atividades')));
  await assertFails(getDocs(query(collection(db, 'atividades'), where('motoristaUid', '==', 'uid-frentista'))));
  await assertSucceeds(getDocs(collection(db, 'atividades', 'historic', 'checklist_saida')));
  await assertFails(getDoc(doc(dbAs('frentista'), 'atividades', 'historic')));
  await assertFails(getDocs(collection(dbAs('frentista'), 'atividades', 'historic', 'checklist_saida')));
  await assertFails(getDocs(collection(dbAs('autor'), 'atividades')));
});
test('[firestore] atividades: Frota (mecanico, logistica, adm2) and Engenharia list everything', async () => {
  for (const quem of ['mecanico', 'logistica', 'adm2', 'engenharia']) {
    await assertSucceeds(getDocs(collection(dbAs(quem), 'atividades')));
    await assertSucceeds(getDocs(collection(dbAs(quem), 'atividades', 'historic', 'checklist_saida')));
  }
});
test('[firestore] activity update is denied', async () => assertFails(updateDoc(doc(dbAs('adm2'), 'atividades', 'historic'), { motivo: 'changed' })));
test('[firestore] KM normalization: logistica and adm2 correct only an activity km, as a non-negative integer', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'veiculos-v2', 'vv-normalizacao'), {
      schemaVersion: 2, cadastro: { ativo: true }, identificacao: { categoria: 'PLACA', identificador: 'NOR1M23', nome: 'Caminhão normalização' },
      operacional: { quilometragemUltima: 1812730 },
    });
    await setDoc(doc(ctx.firestore(), 'atividades', 'km-errado'), { schemaVersion: 2, tipo: 'saida', item_frota_id: 'vv-normalizacao', km: 1807831, motivo: 'obra' });
  });
  const ref_ = (quem) => doc(dbAs(quem), 'atividades', 'km-errado');
  await assertSucceeds(updateDoc(ref_('logistica'), { km: 180783 }));
  await assertSucceeds(updateDoc(ref_('adm2'), { km: 180784 }));
  await assertFails(updateDoc(ref_('mecanico'), { km: 180785 }));
  await assertFails(updateDoc(ref_('user'), { km: 180785 }));
  await assertFails(updateDoc(ref_('logistica'), { km: 180785, motivo: 'outro' }));
  await assertFails(updateDoc(ref_('logistica'), { km: 180785.5 }));
  await assertFails(updateDoc(ref_('logistica'), { km: -1 }));
  await assertFails(updateDoc(ref_('logistica'), { km: '180785' }));
  await assertFails(deleteDoc(ref_('logistica')));
});
test('[firestore] KM normalization: logistica sets the last meter reading in either direction; nothing else', async () => {
  const ref_ = (quem) => doc(dbAs(quem), 'veiculos-v2', 'vv-normalizacao');
  await assertSucceeds(updateDoc(ref_('logistica'), { 'operacional.quilometragemUltima': 50000 }));
  await assertSucceeds(updateDoc(ref_('logistica'), { 'operacional.quilometragemUltima': 50001 }));
  await assertFails(updateDoc(ref_('logistica'), { 'operacional.quilometragemUltima': 40000, 'operacional.dataUltimaAtualizacao': Timestamp.fromMillis(9) }));
  await assertFails(updateDoc(ref_('logistica'), { 'operacional.quilometragemUltima': 40000.5 }));
  await assertFails(updateDoc(ref_('logistica'), { 'operacional.quilometragemUltima': -1 }));
  await assertFails(updateDoc(ref_('engenharia'), { 'operacional.quilometragemUltima': 40000 }));
  await assertFails(updateDoc(ref_('canonicalUser'), { 'operacional.quilometragemUltima': 40000 }));
});
test('[firestore] KM normalization: one transaction corrects activity, fuel and the last reading', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'atividades', 'km-tx'), { schemaVersion: 2, tipo: 'chegada', item_frota_id: 'vv-normalizacao', km: 2000000 });
    await setDoc(doc(db, '03-combustivel', 'km-tx'), { schemaVersion: 2, tipo: 'saida', item_frota_id: 'vv-normalizacao', quilometragem: 2000100 });
  });
  const db = dbAs('logistica');
  await assertSucceeds(runTransaction(db, async (tx) => {
    for (const [c, id] of [['atividades', 'km-tx'], ['03-combustivel', 'km-tx'], ['veiculos-v2', 'vv-normalizacao']]) await tx.get(doc(db, c, id));
    tx.update(doc(db, 'atividades', 'km-tx'), { km: 200000 });
    tx.update(doc(db, '03-combustivel', 'km-tx'), { quilometragem: 200010 });
    tx.update(doc(db, 'veiculos-v2', 'vv-normalizacao'), { 'operacional.quilometragemUltima': 200010 });
  }));
});
test('[firestore] activity delete is denied', async () => assertFails(deleteDoc(doc(dbAs('adm2'), 'atividades', 'historic'))));
test('[firestore] checklist creator UID must match', async () => assertSucceeds(setDoc(doc(dbAs('user'), 'atividades', 'new-activity', 'checklist_saida', 'ok'), { criadoPorUid: 'uid-user' })));
test('[firestore] checklist output accepts future additional field', async () => assertSucceeds(setDoc(doc(dbAs('user'), 'atividades', 'new-activity', 'checklist_saida', 'future'), { criadoPorUid: 'uid-user', futureSensor: true })));
test('[firestore] checklist foreign creator UID is denied', async () => assertFails(setDoc(doc(dbAs('user'), 'atividades', 'new-activity', 'checklist_saida', 'bad'), { criadoPorUid: 'uid-other' })));
test('[firestore] checklist update is denied', async () => assertFails(updateDoc(doc(dbAs('user'), 'atividades', 'historic', 'checklist_saida', 'item'), { status: 'avaria' })));
test('[firestore] checklist delete is denied', async () => assertFails(deleteDoc(doc(dbAs('adm2'), 'atividades', 'historic', 'checklist_saida', 'item'))));
test('[firestore] arrival checklist accepts catalog v2', async () => assertSucceeds(setDoc(doc(dbAs('user'), 'atividades', 'new-activity', 'checklist_chegada', 'arrival-v2'), { criadoPorUid: 'uid-user', catalogoVersao: 'v2' })));
test('[firestore] arrival checklist accepts future catalog v3 and extra field', async () => assertSucceeds(setDoc(doc(dbAs('user'), 'atividades', 'new-activity', 'checklist_chegada', 'arrival-v3'), { criadoPorUid: 'uid-user', catalogoVersao: 'v3', futureField: ['ok'] })));
test('[firestore] arrival checklist update is denied', async () => assertFails(updateDoc(doc(dbAs('user'), 'atividades', 'new-activity', 'checklist_chegada', 'arrival-v2'), { status: 'changed' })));
test('[firestore] arrival checklist delete is denied', async () => assertFails(deleteDoc(doc(dbAs('adm2'), 'atividades', 'new-activity', 'checklist_chegada', 'arrival-v2'))));

test('[firestore] authorized creates fuel record without legacy uid', async () => assertSucceeds(setDoc(doc(dbAs('user'), '03-combustivel', 'fuel-no-uid'), { lf: 20, motorista: 'uid-user' })));
test('[firestore] additional fuel fields do not break an own record', async () => assertSucceeds(setDoc(doc(dbAs('user'), '03-combustivel', 'fuel-future-field'), { uid: 'uid-user', criadoPorUid: 'uid-user', motoristaUid: 'uid-user', futureMetadata: { version: 3 } })));
test('[firestore] fuel uid must match when present', async () => assertFails(setDoc(doc(dbAs('user'), '03-combustivel', 'fuel-bad-uid'), { uid: 'uid-other', lf: 20 })));
test('[firestore] normal fuel motoristaUid must be self when present', async () => assertFails(setDoc(doc(dbAs('user'), '03-combustivel', 'fuel-bad-driver'), { motoristaUid: 'uid-other', criadoPorUid: 'uid-user', lf: 20 })));
test('[firestore] adm1 can register fuel for another driver with own authorship', async () => assertSucceeds(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-adm1-other'), { uid: 'uid-frentista', criadoPorUid: 'uid-frentista', motoristaUid: 'uid-user', futureField: true })));
test('[firestore] adm2 can register fuel for another driver with own authorship', async () => assertSucceeds(setDoc(doc(dbAs('adm2'), '03-combustivel', 'fuel-adm2-other'), { uid: 'uid-adm2', criadoPorUid: 'uid-adm2', motoristaUid: 'uid-user' })));
test('[firestore] normal user cannot register administrative diesel entry', async () => assertFails(setDoc(doc(dbAs('user'), '03-combustivel', 'fuel-stock-entry-user'), { motorista: 'uid-user', motivo: 'Abastecimento de Diesel', qa: 5000, diesel: 9000 })));
test('[firestore] adm2 registers administrative diesel entry', async () => assertSucceeds(setDoc(doc(dbAs('adm2'), '03-combustivel', 'fuel-stock-entry-adm2'), { motorista: 'uid-adm2', motivo: 'Abastecimento de Diesel', qa: 5000, diesel: 9000, precoTotal: 2000, precoPorLitro: 4, lote: 'LT-2026-08' })));
function entradaV2(overrides = {}) {
  return {
    data: Timestamp.fromDate(new Date('2026-09-04T12:00:00Z')), schemaVersion: 2, tipo: 'entrada', bombaId: 'diesel_patio',
    movimentoId: 'mov-entrada-1', litrosComprados: 50000, preco: 2000000, precoLitro: 400, lote: 'LT-2026-09',
    estoqueAntes: 34000, estoqueAposMovimento: 84000, montanteSnapshot: null,
    criadoPor: { uid: 'uid-canonical-adm2', nome: 'uid-canonical-adm2' }, motivo: 'Abastecimento de Diesel', ...overrides,
  };
}
test('[firestore] adm2 registers the contract diesel entry (montanteSnapshot int or null)', async () => {
  await assertSucceeds(setDoc(doc(dbAs('canonicalAdm2'), '03-combustivel', 'fuel-entrada-v2-null'), entradaV2()));
  await assertSucceeds(setDoc(doc(dbAs('canonicalAdm2'), '03-combustivel', 'fuel-entrada-v2-int'), entradaV2({ montanteSnapshot: 491264 })));
});
test('[firestore] diesel entry volume and money fields must be integers; the stock sum is not checked', async () => {
  await assertFails(setDoc(doc(dbAs('canonicalAdm2'), '03-combustivel', 'fuel-entrada-v2-decimal'), entradaV2({ litrosComprados: 50000.5, estoqueAposMovimento: 84000.5 })));
  await assertFails(setDoc(doc(dbAs('canonicalAdm2'), '03-combustivel', 'fuel-entrada-v2-price-decimal'), entradaV2({ preco: 29000.5 })));
  await assertFails(setDoc(doc(dbAs('canonicalAdm2'), '03-combustivel', 'fuel-entrada-v2-unit-decimal'), entradaV2({ precoLitro: 5.8 })));
  await assertSucceeds(setDoc(doc(dbAs('canonicalAdm2'), '03-combustivel', 'fuel-entrada-v2-other-stock'), entradaV2({ estoqueAposMovimento: 1 })));
  await assertSucceeds(setDoc(doc(dbAs('canonicalAdm2'), '03-combustivel', 'fuel-entrada-v2-negative-stock'), entradaV2({ estoqueAntes: -3000, estoqueAposMovimento: 47000 })));
});
test('[firestore] only adm2 registers the diesel entry', async () => {
  await assertFails(setDoc(doc(dbAs('canonicalUser'), '03-combustivel', 'fuel-entrada-v2-user'), entradaV2({ criadoPor: { uid: 'uid-canonical-user', nome: 'uid-canonical-user' } })));
  await assertFails(setDoc(doc(dbAs('canonicalFrentista'), '03-combustivel', 'fuel-entrada-v2-adm1'), entradaV2({ criadoPor: { uid: 'uid-canonical-frentista', nome: 'uid-canonical-frentista' } })));
});
test('[firestore] diesel entry cannot forge its author uid; the name is not compared', async () => {
  await assertFails(setDoc(doc(dbAs('canonicalAdm2'), '03-combustivel', 'fuel-entrada-v2-forged-uid'), entradaV2({ criadoPor: { uid: 'uid-user', nome: 'User' } })));
  await assertSucceeds(setDoc(doc(dbAs('canonicalAdm2'), '03-combustivel', 'fuel-entrada-v2-other-name'), entradaV2({ criadoPor: { uid: 'uid-canonical-adm2', nome: 'Outra pessoa' } })));
});
test('[firestore] old WEB diesel entry shape (responsavel) is denied', async () => assertFails(setDoc(doc(dbAs('canonicalAdm2'), '03-combustivel', 'fuel-entrada-web-antiga'), {
  data: Timestamp.fromDate(new Date('2026-09-04T12:00:00Z')), schemaVersion: 2, tipo: 'entrada', bombaId: 'diesel_patio', litrosComprados: 50000,
  preco: 2000000, precoLitro: 400, lote: 'LT-2026-09', responsavel: { id: 'uid-canonical-adm2', nome: 'uid-canonical-adm2' },
  estoqueAntes: 34000, estoqueAposMovimento: 84000, montanteSnapshot: 491264,
})));
test('[firestore] fuel forged creator is denied', async () => assertFails(setDoc(doc(dbAs('adm2'), '03-combustivel', 'fuel-forged-author'), { criadoPorUid: 'uid-user', motoristaUid: 'uid-user' })));
test('[firestore] 03-combustivel: frentista, Kiosk and the WEB areas read everything; others only their own', async () => {
  for (const quem of ['frentista', 'logistica', 'mecanico', 'engenharia', 'adm2']) {
    await assertSucceeds(getDocs(query(collection(dbAs(quem), '03-combustivel'), orderBy('data', 'desc'), limit(1))));
  }
  await assertSucceeds(getDocs(query(collection(dbAs('frentista'), '03-combustivel'), where('tipo', '==', 'entrada'))));
  const db = dbAs('user');
  await assertSucceeds(getDoc(doc(db, '03-combustivel', 'fuel-existing')));
  for (const campo of ['frentista.uid', 'motoristaOperador.uid', 'criadoPor.uid']) {
    await assertSucceeds(getDocs(query(collection(db, '03-combustivel'), where(campo, '==', 'uid-user'), limit(60))));
  }
  await assertFails(getDocs(query(collection(db, '03-combustivel'), orderBy('data', 'desc'), limit(1))));
  await assertFails(getDoc(doc(dbAs('canonicalUser'), '03-combustivel', 'fuel-existing')));
  await assertFails(getDocs(collection(dbAs('escritorio'), '03-combustivel')));
});
test('[firestore] bombas: frentista and the WEB areas read; logistica/mecanico change only the fuel state', async () => {
  await assertFails(getDoc(doc(dbAs('user'), 'bombas', 'diesel_patio')));
  await assertFails(getDoc(doc(dbAs('engenharia'), 'bombas', 'diesel_patio')));
  for (const quem of ['frentista', 'logistica', 'mecanico', 'adm2']) await assertSucceeds(getDoc(doc(dbAs(quem), 'bombas', 'diesel_patio')));
  await assertSucceeds(updateDoc(doc(dbAs('logistica'), 'bombas', 'diesel_patio'), { estoqueAtual: 4990, atualizadoEm: Timestamp.fromMillis(9) }));
  await assertFails(updateDoc(doc(dbAs('mecanico'), 'bombas', 'diesel_patio'), { nomeBomba: 'Outra' }));
  await assertFails(updateDoc(doc(dbAs('escritorio'), 'bombas', 'diesel_patio'), { estoqueAtual: 1 }));
});
test('[firestore] veiculos-v2: Frota (mecanico, logistica) renames and sets the initial meter; nothing else', async () => {
  const ref_ = (quem) => doc(dbAs(quem), 'veiculos-v2', 'vv-inativo');
  await assertSucceeds(updateDoc(ref_('mecanico'), { 'identificacao.nome': 'Caminhão novo nome' }));
  await assertSucceeds(updateDoc(ref_('logistica'), { 'operacional.quilometragemInicial': 1000, 'operacional.dataQuilometragemInicial': null, 'operacional.origemQuilometragemInicial': 'manual' }));
  await assertFails(updateDoc(ref_('mecanico'), { 'identificacao.identificador': 'XXX0000' }));
  await assertFails(updateDoc(ref_('logistica'), { 'cadastro.ativo': true }));
  await assertFails(updateDoc(ref_('engenharia'), { 'identificacao.nome': 'Não' }));
});
test('[firestore] normal fuel update is denied', async () => assertFails(updateDoc(doc(dbAs('user'), '03-combustivel', 'fuel-existing'), { lf: 30 })));
test('[firestore] normal fuel delete is denied', async () => assertFails(deleteDoc(doc(dbAs('user'), '03-combustivel', 'fuel-existing'))));
test('[firestore] custom claim admin updates fuel', async () => assertSucceeds(updateDoc(doc(dbAs('admin'), '03-combustivel', 'fuel-existing'), { lf: 31 })));
test('[firestore] custom claim admin deletes fuel', async () => { await setDoc(doc(dbAs('user'), '03-combustivel', 'fuel-admin-delete'), { lf: 1 }); await assertSucceeds(deleteDoc(doc(dbAs('admin'), '03-combustivel', 'fuel-admin-delete'))); });
test('[firestore] adm2 corrects and deletes fuel records (WEB document inspector); adm1 cannot', async () => {
  await setDoc(doc(dbAs('user'), '03-combustivel', 'fuel-adm2-inspector'), { lf: 1 });
  await assertFails(updateDoc(doc(dbAs('canonicalFrentista'), '03-combustivel', 'fuel-adm2-inspector'), { lf: 2 }));
  await assertFails(updateDoc(doc(dbAs('mecanico'), '03-combustivel', 'fuel-adm2-inspector'), { lf: 2 }));
  await assertSucceeds(updateDoc(doc(dbAs('logistica'), '03-combustivel', 'fuel-adm2-inspector'), { lf: 4 }));
  await assertSucceeds(updateDoc(doc(dbAs('canonicalAdm2'), '03-combustivel', 'fuel-adm2-inspector'), { lf: 3 }));
  await assertFails(deleteDoc(doc(dbAs('canonicalFrentista'), '03-combustivel', 'fuel-adm2-inspector')));
  await assertSucceeds(deleteDoc(doc(dbAs('canonicalAdm2'), '03-combustivel', 'fuel-adm2-inspector')));
});

// Saída V2 no formato do contrato (Manuscript 02_PROCESSOS/combustivel-saida-v2.md), como o app grava.
function v2Output(overrides = {}) {
  return {
    schemaVersion: 2, tipo: 'saida', data: Timestamp.fromMillis(1757000000000), modalidadeAbastecimento: 'direto',
    quantidadeAbastecida: 10, valorAbastecimento: 100, origemPreco: { movimentoId: 'entry-1', lote: '1006', precoLitro: 580 },
    estoqueAntes: 5000, estoqueAposMovimento: 4990, montanteAntes: 1100, montanteAposMovimento: 1110, arla: 0,
    frentista: { uid: 'uid-canonical-frentista', nome: 'uid-canonical-frentista' },
    motoristaOperador: { uid: 'uid-user', nome: 'User' },
    criadoPor: { uid: 'uid-frentista', nome: 'Frentista' },
    item_frota_id: 'vv1', item_frota_snapshot: { categoria: 'PLACA', identificador: 'ABC1D23', nome: 'Caminhão 1' },
    id_obra: 'ob1', id_obra_snap: { codObra: 101, siglaObra: 'OBV', nomeObra: 'Obra V2', local: 'Ledur' },
    motivo: 'Uso', quilometragem: 125430, ...overrides,
  };
}

// Transação T2 do app: movimento, bomba (campos V2) e quilometragem do item de frota.
async function coherentV2Write(name, changes = {}, identity = 'frentista') {
  const db = dbAs(identity); const movement = doc(db, '03-combustivel', name); const pump = doc(db, 'bombas', 'diesel_patio');
  await assertSucceeds(runTransaction(db, async (transaction) => {
    const current = (await transaction.get(pump)).data();
    const output = Object.fromEntries(Object.entries(v2Output({ estoqueAntes: current.estoqueAtual, estoqueAposMovimento: current.estoqueAtual - 10, montanteAntes: current.montanteAtual, ...changes }))
      .filter(([, v]) => v !== undefined));
    transaction.set(movement, output);
    transaction.update(pump, {
      estoqueAtual: output.estoqueAposMovimento, montanteAtual: output.montanteAposMovimento, ultimoAbastecimento: output.data, ultimoFrentista: output.frentista.nome,
      ultimaMovimentacao: { movimentoId: name, tipo: 'saida', data: output.data }, atualizadoEm: output.data,
    });
    const medidor = output.quilometragem ?? output.horimetro;
    if (medidor != null) transaction.update(doc(db, 'veiculos-v2', output.item_frota_id), { 'operacional.quilometragemUltima': medidor });
  }));
}

test('[firestore] V2 vehicle direct output is accepted with atomic pump and fleet state', async () => coherentV2Write('fuel-v2-vehicle'));
test('[firestore] V2 machine, gallon, no-odometer and anonymous operator outputs are accepted', async () => {
  await coherentV2Write('fuel-v2-machine', { item_frota_id: 'vm1', item_frota_snapshot: { categoria: 'EXTRA', identificador: 'CARREGADEIRA', nome: 'Carregadeira Case' }, quilometragem: undefined, horimetro: 8752 });
  await coherentV2Write('fuel-v2-gallon', { modalidadeAbastecimento: 'galao', quilometragem: undefined });
  await coherentV2Write('fuel-v2-sem-odometro', { semKm: 'Sem Odometro', quilometragem: undefined });
  await coherentV2Write('fuel-v2-operador-anonimo', { motoristaOperador: { uid: null, nome: 'Terceiro' } });
});
test('[firestore] Kiosk employee (frentista) can be the frentista; a motorista-only employee cannot', async () => {
  await coherentV2Write('fuel-v2-kiosk', { frentista: { uid: 'uid-frentista', nome: 'Frentista' } });
  await assertFails(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-frentista-sem-credencial'), v2Output({ frentista: { uid: 'uid-user', nome: 'User' } })));
});
test('[firestore] V2 output needs frentista or adm2; motorista/operador with uid needs the motorista credential', async () => {
  await assertFails(setDoc(doc(dbAs('user'), '03-combustivel', 'fuel-v2-motorista'), v2Output({ criadoPor: { uid: 'uid-user', nome: 'User' } })));
  await assertFails(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-operador-sem-credencial'), v2Output({ motoristaOperador: { uid: 'uid-mecanico', nome: 'Mecanico' } })));
  await assertSucceeds(setDoc(doc(dbAs('adm2'), '03-combustivel', 'fuel-v2-adm2'), v2Output({ criadoPor: { uid: 'uid-adm2', nome: 'Adm2' } })));
});
test('[firestore] V2 rejects fractional numbers and a forged author uid; meters and names are not compared', async () => {
  await assertFails(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-bad-km'), v2Output({ quilometragem: 10.5 })));
  await assertFails(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-bad-amount'), v2Output({ quantidadeAbastecida: 10.5 })));
  await assertFails(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-bad-arla'), v2Output({ arla: 0.5 })));
  await assertFails(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-bad-author'), v2Output({ criadoPor: { uid: 'uid-other', nome: 'Other' } })));
  await assertSucceeds(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-machine-km'), v2Output({ item_frota_id: 'vm1', item_frota_snapshot: { categoria: 'EXTRA', identificador: 'CARREGADEIRA', nome: 'Carregadeira Case' } })));
  await assertSucceeds(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-author-name'), v2Output({ criadoPor: { uid: 'uid-frentista', nome: 'Outro nome' } })));
  await assertSucceeds(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-null-meter'), v2Output({ quilometragem: null, modalidadeAbastecimento: 'galao', motivo: 'Motivo novo' })));
});
test('[firestore] V2 requires a real item, obra and active frentista by ID; snapshots, names and stock sums are not compared', async () => {
  await assertFails(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-no-item'), v2Output({ item_frota_id: 'nao-existe' })));
  await assertFails(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-no-obra'), v2Output({ id_obra: 'nao-existe' })));
  await assertFails(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-no-frentista'), v2Output({ frentista: null })));
  await assertFails(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-inactive-frentista'), v2Output({ frentista: { uid: 'uid-canonical-inactive', nome: 'uid-canonical-inactive' } })));
  await assertSucceeds(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-wrong-snapshot'), v2Output({ item_frota_snapshot: { categoria: 'PLACA', identificador: 'XYZ', nome: 'Caminhão 1' } })));
  await assertSucceeds(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-frentista-name'), v2Output({ frentista: { uid: 'uid-canonical-frentista', nome: 'Outro' } })));
  await assertSucceeds(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-other-stock'), v2Output({ estoqueAposMovimento: 1 })));
});
// Purchases are not always registered before the outputs, so the pump stock can go below zero.
test('[firestore] negative stock is accepted in the V2 output and in the pump', async () => {
  const db = dbAs('frentista'); const pump = doc(db, 'bombas', 'diesel_patio');
  await assertSucceeds(runTransaction(db, async (transaction) => {
    const current = (await transaction.get(pump)).data();
    transaction.set(doc(db, '03-combustivel', 'fuel-v2-negativo'), v2Output({ estoqueAntes: -200, estoqueAposMovimento: -210, montanteAntes: current.montanteAtual }));
    transaction.update(pump, { estoqueAtual: -210, montanteAtual: current.montanteAtual + 10, atualizadoEm: Timestamp.fromMillis(9) });
  }));
  await assertFails(updateDoc(pump, { estoqueAtual: -210.5, atualizadoEm: Timestamp.fromMillis(10) }));
});
test('[firestore] old WEB V2 output shape is denied', async () => assertFails(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-web-antiga'), {
  schemaVersion: 2, tipo: 'saida', data: Timestamp.fromMillis(1757000000000), modalidadeAbastecimento: 'direto',
  quantidadeAbastecida: 10, valorAbastecimento: 100, origemPreco: { movimentoId: 'entry-1', lote: '1006', precoLitro: 580 },
  estoqueAntes: 5000, estoqueAposMovimento: 4990, montanteAntes: 1100, montanteAposMovimento: 1110,
  frentista: { uid: 'uid-user', nomeSnapshot: 'User' }, paraQuem: { uid: 'uid-user', nomeSnapshot: 'User' },
  autorLancamento: { uid: 'uid-user', nomeSnapshot: 'User' }, itemFrota: { uid: 'v1', tipo: 'veiculo', identificadorSnapshot: 'ABC1D23', km: 125430 },
  obra: { uid: 'o1', nomeSnapshot: 'Obra', localSnapshot: null }, motivo: 'Uso', arla: 0,
})));
test('[firestore] V2 movement remains compatible when pump is updated in a separate write', async () => {
  await assertSucceeds(setDoc(doc(dbAs('frentista'), '03-combustivel', 'fuel-v2-no-pump-update'), v2Output()));
});
test('[firestore] V2 pump update requires integer stock and amount', async () => assertFails(updateDoc(doc(dbAs('frentista'), 'bombas', 'diesel_patio'), { estoqueAtual: 10.5, montanteAtual: 1, atualizadoEm: 3 })));

test('[firestore] motorista-only cannot update the pump', async () => assertFails(updateDoc(doc(dbAs('user'), 'bombas', 'diesel_patio'), { montanteAtual: 1100 })));
test('[firestore] frentista updates exact operational pump fields', async () => assertSucceeds(updateDoc(doc(dbAs('frentista'), 'bombas', 'diesel_patio'), { montanteAtual: 1100, estoqueAtual: 4900, ultimoAbastecimento: 2, ultimoFrentista: 'user' })));
test('[firestore] frentista cannot update any other pump field', async () => assertFails(updateDoc(doc(dbAs('frentista'), 'bombas', 'diesel_patio'), { ativo: false })));
test('[firestore] adm2 performs pump administration', async () => assertSucceeds(updateDoc(doc(dbAs('adm2'), 'bombas', 'diesel_patio'), { folgaLitros: 200 })));

test('[firestore] authorized creates call', async () => assertSucceeds(setDoc(doc(dbAs('user'), '00-chamados', 'call-new'), { motorista: 'uid-user', tipo: 'Conflito', data: 1, status: 'ABERTO' })));
test('[firestore] operational call fields can be updated', async () => assertSucceeds(updateDoc(doc(dbAs('user'), '00-chamados', 'call-existing'), { status: 'CONCLUIDO', dfrncl: 2 })));
test('[firestore] new operational call field can be introduced', async () => assertSucceeds(updateDoc(doc(dbAs('user'), '00-chamados', 'call-existing'), { futureOperationalState: 'ok' })));
test('[firestore] call driver cannot be changed', async () => assertFails(updateDoc(doc(dbAs('user'), '00-chamados', 'call-existing'), { motorista: 'uid-other' })));
test('[firestore] call type cannot be changed', async () => assertFails(updateDoc(doc(dbAs('user'), '00-chamados', 'call-existing'), { tipo: 'Outro' })));
test('[firestore] call date cannot be changed', async () => assertFails(updateDoc(doc(dbAs('user'), '00-chamados', 'call-existing'), { data: 2 })));
test('[firestore] call motoristaUid cannot be changed', async () => assertFails(updateDoc(doc(dbAs('user'), '00-chamados', 'call-existing'), { motoristaUid: 'uid-other' })));
test('[firestore] call delete is denied', async () => assertFails(deleteDoc(doc(dbAs('adm2'), '00-chamados', 'call-existing'))));

test('[firestore] normal reads global configuration', async () => assertSucceeds(getDoc(doc(dbAs('user'), 'configuracoes', 'checklist_saida'))));
test('[firestore] normal cannot write configuration', async () => assertFails(updateDoc(doc(dbAs('user'), 'configuracoes', 'checklist_saida'), { atualizadoPor: 'uid-user', ativo: false })));
test('[firestore] adm2 creates known configuration', async () => assertSucceeds(setDoc(doc(dbAs('adm2'), 'configuracoes', 'combustivel_verificacao'), { atualizadoPor: 'uid-adm2', modo: 'blocking' })));
test('[firestore] adm2 creates a new configuration ID without a Rules change', async () => assertSucceeds(setDoc(doc(dbAs('adm2'), 'configuracoes', 'future-feature'), { arbitrarySchema: { enabled: true } })));
test('[firestore] adm2 adds a new configuration field', async () => assertSucceeds(updateDoc(doc(dbAs('adm2'), 'configuracoes', 'checklist_saida'), { futureField: 42 })));
test('[firestore] configuration delete remains denied', async () => assertFails(deleteDoc(doc(dbAs('adm2'), 'configuracoes', 'checklist_saida'))));

test('[firestore] user creates own notification', async () => assertSucceeds(setDoc(doc(dbAs('user'), 'notificacoes', 'note-new'), { motoristaUid: 'uid-user', chamadoId: 'c3', tipo: 'combustivel_divergencia', destinatarioPerfil: 'adm2' })));
test('[firestore] foreign notification driver is denied', async () => assertFails(setDoc(doc(dbAs('user'), 'notificacoes', 'note-bad'), { motoristaUid: 'uid-other', chamadoId: 'c4', tipo: 'combustivel_divergencia', destinatarioPerfil: 'adm2' })));
test('[firestore] normal cannot list administrative notifications', async () => assertFails(getDocs(collection(dbAs('user'), 'notificacoes'))));
test('[firestore] adm2 can list notifications', async () => assertSucceeds(getDocs(collection(dbAs('adm2'), 'notificacoes'))));
test('[firestore] user gets own notification', async () => assertSucceeds(getDoc(doc(dbAs('user'), 'notificacoes', 'own-note'))));
test('[firestore] user cannot get another notification', async () => assertFails(getDoc(doc(dbAs('user'), 'notificacoes', 'other-note'))));
test('[firestore] user cannot update another notification', async () => assertFails(updateDoc(doc(dbAs('user'), 'notificacoes', 'other-note'), { evento: 'tampered' })));
for (const field of ['motoristaUid', 'chamadoId', 'tipo', 'destinatarioPerfil']) {
  test(`[firestore] notification identity field ${field} is immutable`, async () => assertFails(updateDoc(doc(dbAs('user'), 'notificacoes', 'own-note'), { [field]: 'changed' })));
}
test('[firestore] owner can update notification event', async () => assertSucceeds(updateDoc(doc(dbAs('user'), 'notificacoes', 'own-note'), { evento: 'updated' })));
test('[firestore] owner can add a future notification field', async () => assertSucceeds(updateDoc(doc(dbAs('user'), 'notificacoes', 'own-note'), { futurePresentationField: true })));
test('[firestore] adm2 writes own read receipt', async () => assertSucceeds(setDoc(doc(dbAs('adm2'), 'notificacoes', 'own-note', 'leituras', 'uid-adm2'), { versaoLida: 1 })));
test('[firestore] adm2 cannot write read receipt for another UID', async () => assertFails(setDoc(doc(dbAs('adm2'), 'notificacoes', 'own-note', 'leituras', 'uid-user'), { versaoLida: 1 })));

test('[firestore] legacy obras: only adm2 reads (2026-11-06)', async () => { await assertFails(getDoc(doc(dbAs('user'), 'obras', 'o1'))); await assertFails(getDoc(doc(dbAs('engenharia'), 'obras', 'o1'))); await assertSucceeds(getDoc(doc(dbAs('adm2'), 'obras', 'o1'))); });
test('[firestore] only adm2 writes works', async () => assertFails(updateDoc(doc(dbAs('user'), 'obras', 'o1'), { nome: 'No' })));
test('[firestore] adm2 writes works', async () => assertSucceeds(updateDoc(doc(dbAs('adm2'), 'obras', 'o1'), { nome: 'Yes' })));
for (const path of ['notas-categorias/cat1', 'notas-fornecedores/f1', 'notas-fornecedores-numeros/1', 'app-metadata/notas-fornecedores-numero']) {
  test(`[firestore] normal denied administrative catalog ${path}`, async () => assertFails(getDoc(doc(dbAs('user'), ...path.split('/')))));
  test(`[firestore] adm2 reads administrative catalog ${path}`, async () => assertSucceeds(getDoc(doc(dbAs('adm2'), ...path.split('/')))));
  test(`[firestore] Frota (mecanico, logistica) reads catalog ${path}; engenharia cannot`, async () => {
    await assertSucceeds(getDoc(doc(dbAs('mecanico'), ...path.split('/'))));
    await assertSucceeds(getDoc(doc(dbAs('logistica'), ...path.split('/'))));
    await assertFails(getDoc(doc(dbAs('engenharia'), ...path.split('/'))));
  });
}
test('[firestore] legacy motoristas: only adm2 reads; motivos stay open to employees', async () => { await assertFails(getDoc(doc(dbAs('user'), 'motoristas', 'm1'))); await assertSucceeds(getDoc(doc(dbAs('adm2'), 'motoristas', 'm1'))); await assertSucceeds(getDoc(doc(dbAs('user'), 'motivos', 'm1'))); });
test('[firestore] clients cannot write motorists', async () => assertFails(updateDoc(doc(dbAs('adm2'), 'motoristas', 'm1'), { ativo: false })));
test('[firestore] only adm2 reads maintenance', async () => { await assertFails(getDoc(doc(dbAs('user'), 'manutencoes', 'maint1'))); await assertSucceeds(getDoc(doc(dbAs('adm2'), 'manutencoes', 'maint1'))); });
test('[firestore] only adm2 creates maintenance', async () => { await assertFails(setDoc(doc(dbAs('user'), 'manutencoes', 'maint-user'), { status: 'A' })); await assertSucceeds(setDoc(doc(dbAs('adm2'), 'manutencoes', 'maint-adm2'), { status: 'A' })); });
test('[firestore] adm2 and the admin claim edit maintenance records; others cannot', async () => { await assertSucceeds(updateDoc(doc(dbAs('adm2'), 'manutencoes', 'maint1'), { arbitrary: true })); await assertSucceeds(updateDoc(doc(dbAs('admin'), 'manutencoes', 'maint1'), { arbitrary2: true })); await assertFails(updateDoc(doc(dbAs('frentista'), 'manutencoes', 'maint1'), { arbitrary3: true })); await assertFails(updateDoc(doc(dbAs('user'), 'manutencoes', 'maint1'), { arbitrary3: true })); });
test('[firestore] unknown collection is default denied', async () => assertFails(getDoc(doc(dbAs('adm2'), 'unknown', 'x'))));
test('[firestore] unknown collection write is default denied', async () => assertFails(setDoc(doc(dbAs('adm2'), 'future-undeclared', 'x'), { value: true })));

test('[firestore] Flutter checklist batch succeeds atomically', async () => {
  const db = dbAs('user'); const batch = writeBatch(db);
  batch.set(doc(db, 'atividades', 'batch-checklist'), { tipo: 'saida', motorista: 'uid-user', motoristaUid: 'uid-user', criadoPorUid: 'uid-user' });
  batch.set(doc(db, 'atividades', 'batch-checklist', 'checklist_saida', 'i1'), { criadoPorUid: 'uid-user', status: 'ok' });
  batch.set(doc(db, 'atividades', 'batch-checklist', 'checklist_saida', 'i2'), { criadoPorUid: 'uid-user', status: 'avaria' });
  batch.update(doc(db, 'veiculos', 'v1'), { quilometragemUltima: 150, dataUltimaAtualizacao: 3 });
  await assertSucceeds(batch.commit());
});
test('[firestore] Flutter checklist batch fails atomically for foreign creator', async () => {
  const db = dbAs('user'); const batch = writeBatch(db);
  batch.set(doc(db, 'atividades', 'batch-checklist-bad'), { tipo: 'saida', motorista: 'uid-user', motoristaUid: 'uid-user', criadoPorUid: 'uid-user' });
  batch.set(doc(db, 'atividades', 'batch-checklist-bad', 'checklist_saida', 'i1'), { criadoPorUid: 'uid-other' });
  batch.update(doc(db, 'veiculos', 'v1'), { quilometragemUltima: 151, dataUltimaAtualizacao: 4 });
  await assertFails(batch.commit());
  const adminDb = env.unauthenticatedContext().firestore();
  await env.withSecurityRulesDisabled(async (ctx) => assert.equal((await getDoc(doc(ctx.firestore(), 'atividades', 'batch-checklist-bad'))).exists(), false));
  void adminDb;
});
test('[firestore] Flutter simple activity transaction succeeds', async () => {
  const db = dbAs('user');
  await assertSucceeds(runTransaction(db, async (tx) => { tx.set(doc(db, 'atividades', 'tx-arrival'), { tipo: 'chegada', motorista: 'uid-user', motoristaUid: 'uid-user', criadoPorUid: 'uid-user' }); tx.update(doc(db, 'veiculos', 'v1'), { quilometragemUltima: 160, dataUltimaAtualizacao: 5 }); }));
});
test('[firestore] Flutter fuel transaction succeeds across fuel pump vehicle and call', async () => {
  const db = dbAs('frentista');
  await assertSucceeds(runTransaction(db, async (tx) => {
    await tx.get(doc(db, 'bombas', 'diesel_patio'));
    tx.set(doc(db, '03-combustivel', 'tx-fuel'), { uid: 'uid-frentista', lf: 1200 });
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
async function seedStorageObject(path) {
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), path), image, { contentType: 'image/jpeg' });
  });
}

test('[storage] adm1 reads existing departure checklist photo', async () => {
  const path = 'checklists/saidas/storage-read/adm1.jpg';
  await seedStorageObject(path);
  await assertSucceeds(getBytes(ref(storageAs('frentista'), path)));
});
test('[storage] adm2 reads existing departure checklist photo', async () => {
  const path = 'checklists/saidas/storage-read/adm2.jpg';
  await seedStorageObject(path);
  await assertSucceeds(getBytes(ref(storageAs('adm2'), path)));
});
test('[storage] any authorized employee reads departure checklist photo', async () => {
  const path = 'checklists/saidas/storage-read/user.jpg';
  await seedStorageObject(path);
  await assertSucceeds(getBytes(ref(storageAs('user'), path)));
});
test('[storage] canonical employee without a legacy profile reads checklist photo', async () => {
  const path = 'checklists/saidas/storage-read/canonical.jpg';
  await seedStorageObject(path);
  await assertSucceeds(getBytes(ref(storageAs('canonicalAdm2'), path)));
  await assertFails(getBytes(ref(storageAs('canonicalInactive'), path)));
});
test('[storage] authorized employee uploads a well-named checklist image', async () => {
  await assertSucceeds(uploadBytes(ref(storageAs('canonicalUser'), 'checklists/saidas/at1/pneus_20261020_101500.jpg'), image, { contentType: 'image/jpeg' }));
  await assertSucceeds(uploadBytes(ref(storageAs('canonicalUser'), 'checklists/chegadas/at1/pneus_20261020_101500_2.png'), image, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(storageAs('canonicalUser'), 'checklists/saidas/at1/documento_20261020_101500.pdf'), image, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(storageAs('canonicalUser'), 'checklists/outros/at1/pneus_20261020_101500.jpg'), image, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageAs('missing'), 'checklists/saidas/at1/pneus_20261020_101501.jpg'), image, { contentType: 'image/jpeg' }));
});
test('[storage] client upload remains denied', async () => assertFails(uploadBytes(ref(storageAs('adm2'), 'checklists/saidas/a/image.png'), image, { contentType: 'image/png' })));
test('[storage] object overwrite remains denied', async () => {
  const path = 'checklists/saidas/a/update.jpg';
  await seedStorageObject(path);
  await assertFails(uploadBytes(ref(storageAs('adm2'), path), image, { contentType: 'image/jpeg' }));
});
test('[storage] a well-named existing checklist photo cannot be overwritten', async () => {
  const path = 'checklists/saidas/a/pneus_20261021_101500.jpg';
  await seedStorageObject(path);
  await assertFails(uploadBytes(ref(storageAs('canonicalUser'), path), image, { contentType: 'image/jpeg' }));
});
test('[storage] Friday attachments: escritorio and adm2 upload, read and delete up to 25 MB; no overwrite', async () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const caminho = 'friday/10/20/31-edital.pdf';
  await assertSucceeds(uploadBytes(ref(storageAs('escritorio'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(storageAs('adm2'), caminho)));
  await assertFails(uploadBytes(ref(storageAs('escritorio'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertFails(getBytes(ref(storageAs('canonicalUser'), caminho)));
  await assertFails(uploadBytes(ref(storageAs('canonicalUser'), 'friday/10/20/32-x.pdf'), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(storageAs('escritorio'), 'friday/10/20/33-grande.bin'), new Uint8Array(25 * 1024 * 1024 + 1)));
  await assertFails(uploadBytes(ref(storageAs('escritorio'), 'friday/10/34-fora.pdf'), pdf, { contentType: 'application/pdf' }));
  await assertFails(deleteObject(ref(storageAs('canonicalUser'), caminho)));
  await assertSucceeds(deleteObject(ref(storageAs('escritorio'), caminho)));
});
test('[storage] Logística: arquivos das observações (logistica, mecanico, adm2), até 25 MB, sem sobrescrever', async () => {
  const foto = new Uint8Array([0xff, 0xd8, 0xff]);
  const caminho = 'logistica/observacoes/o1/1-carga.jpg';
  await assertSucceeds(uploadBytes(ref(storageAs('logistica'), caminho), foto, { contentType: 'image/jpeg' }));
  await assertSucceeds(getBytes(ref(storageAs('mecanico'), caminho)));
  await assertSucceeds(getBytes(ref(storageAs('adm2'), caminho)));
  await assertFails(uploadBytes(ref(storageAs('logistica'), caminho), foto, { contentType: 'image/jpeg' }));
  await assertFails(getBytes(ref(storageAs('engenharia'), caminho)));
  await assertFails(uploadBytes(ref(storageAs('engenharia'), 'logistica/observacoes/o1/2-x.jpg'), foto, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageAs('logistica'), 'logistica/observacoes/o1/3-grande.bin'), new Uint8Array(25 * 1024 * 1024 + 1)));
  await assertFails(uploadBytes(ref(storageAs('logistica'), 'logistica/fora.jpg'), foto, { contentType: 'image/jpeg' }));
  await assertFails(deleteObject(ref(storageAs('engenharia'), caminho)));
  await assertSucceeds(deleteObject(ref(storageAs('adm2'), caminho)));
});
test('[storage] Friday attachments of a restricted board follow its list (adm2 always)', async () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const caminho = 'friday/100/200/231-rh.pdf';
  await assertSucceeds(uploadBytes(ref(storageAs('escritorio'), caminho), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(storageAs('escritorio'), caminho)));
  await assertSucceeds(getBytes(ref(storageAs('adm2'), caminho)));
  await assertFails(getBytes(ref(storageAs('escritorioFora'), caminho)));
  await assertFails(uploadBytes(ref(storageAs('escritorioFora'), 'friday/100/200/232-x.pdf'), pdf, { contentType: 'application/pdf' }));
  await assertFails(deleteObject(ref(storageAs('escritorioFora'), caminho)));
  await assertSucceeds(uploadBytes(ref(storageAs('escritorioFora'), 'friday/10/20/233-aberto.pdf'), pdf, { contentType: 'application/pdf' }));
});
test('[storage] object delete remains denied', async () => {
  const path = 'checklists/saidas/a/delete.jpg';
  await seedStorageObject(path);
  await assertFails(deleteObject(ref(storageAs('adm2'), path)));
});
test('[storage] arrival photos are readable as in production', async () => {
  const path = 'checklists/chegadas/a/arrival.jpg';
  await seedStorageObject(path);
  await assertSucceeds(getBytes(ref(storageAs('adm2'), path)));
});
test('[storage] other paths stay closed', async () => {
  const path = 'outros/a/file.jpg';
  await seedStorageObject(path);
  await assertFails(getBytes(ref(storageAs('adm2'), path)));
});
test('[storage] unauthorized profile is denied', async () => {
  const path = 'checklists/saidas/a/missing.jpg';
  await seedStorageObject(path);
  await assertFails(getBytes(ref(storageAs('missing'), path)));
});
test('[storage] inactive legacy profile is denied even carrying adm2', async () => {
  const path = 'checklists/saidas/a/inactive.jpg';
  await seedStorageObject(path);
  await assertFails(getBytes(ref(storageAs('inactive'), path)));
});

// ------------------------------------------------------------------ revisão das Rules (2026-10-20)
test('[firestore] who picks people lists funcionarios (app pickers, Friday, Frota/Logística); others cannot', async () => {
  for (const quem of ['frentista', 'mecanico', 'escritorio', 'logistica', 'adm2']) {
    await assertSucceeds(getDocs(collection(dbAs(quem), 'funcionarios')));
    await assertSucceeds(getDoc(doc(dbAs(quem), 'funcionarios', 'uid-user')));
  }
  for (const quem of ['user', 'canonicalUser', 'engenharia', 'autor']) {
    await assertFails(getDocs(collection(dbAs(quem), 'funcionarios')));
    await assertFails(getDoc(doc(dbAs(quem), 'funcionarios', 'uid-frentista')));
  }
  await assertSucceeds(getDoc(doc(dbAs('user'), 'funcionarios', 'uid-user')));
  await assertFails(getDocs(collection(dbAs('legacyOnly'), 'funcionarios')));
  await assertFails(getDocs(collection(dbAs('canonicalInactive'), 'funcionarios')));
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'funcionarios')));
});
test('[firestore] Kiosk collections and schema-info are closed to clients', async () => {
  await assertFails(getDoc(doc(dbAs('adm2'), 'kioskCredentials', 'uid-user')));
  await assertFails(setDoc(doc(dbAs('canonicalAdm2'), 'kioskAudit', 'e1'), { ok: true }));
  await assertFails(getDoc(doc(dbAs('canonicalAdm2'), 'schema-info', 'x')));
});

test('[firestore] veiculos-v2: read and operational meter update', async () => {
  await assertSucceeds(getDocs(collection(dbAs('canonicalUser'), 'veiculos-v2')));
  await assertSucceeds(updateDoc(doc(dbAs('canonicalUser'), 'veiculos-v2', 'vv1'), { 'operacional.quilometragemUltima': 125500, 'operacional.dataUltimaAtualizacao': Timestamp.fromMillis(2) }));
});
test('[firestore] veiculos-v2: no regression, no other field, no fractional meter', async () => {
  await assertFails(updateDoc(doc(dbAs('canonicalUser'), 'veiculos-v2', 'vv1'), { 'operacional.quilometragemUltima': 100 }));
  await assertFails(updateDoc(doc(dbAs('canonicalUser'), 'veiculos-v2', 'vv1'), { 'operacional.quilometragemUltima': 130000.5 }));
  await assertFails(updateDoc(doc(dbAs('canonicalUser'), 'veiculos-v2', 'vv1'), { 'identificacao.nome': 'Outro' }));
  await assertFails(updateDoc(doc(dbAs('canonicalUser'), 'veiculos-v2', 'vv1'), { 'operacional.quilometragemUltima': 130000, 'cadastro.ativo': false }));
  await assertFails(updateDoc(doc(dbAs('canonicalUser'), 'veiculos-v2', 'vv1'), { 'operacional.outro': 1 }));
});
test('[firestore] veiculos-v2: adm2 administers; nobody deletes', async () => {
  await assertSucceeds(updateDoc(doc(dbAs('canonicalAdm2'), 'veiculos-v2', 'vm1'), { 'identificacao.nome': 'Carregadeira Case 2' }));
  await assertSucceeds(updateDoc(doc(dbAs('canonicalAdm2'), 'veiculos-v2', 'vm1'), { 'identificacao.nome': 'Carregadeira Case' }));
  await assertFails(deleteDoc(doc(dbAs('canonicalAdm2'), 'veiculos-v2', 'vm1')));
});
test('[firestore] obras-v2: read by employees, written by adm2', async () => {
  await assertSucceeds(getDocs(collection(dbAs('canonicalUser'), 'obras-v2')));
  await assertFails(updateDoc(doc(dbAs('canonicalUser'), 'obras-v2', 'ob1'), { nomeObra: 'X' }));
  await assertFails(getDocs(collection(dbAs('missing'), 'obras-v2')));
});

test('[firestore] obras-v2: engenharia fills in only the work site (local) and the synonym (siglaObra)', async () => {
  await assertSucceeds(updateDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob1'), { local: 'Lagoa Bonita do Sul - RS' }));
  await assertFails(updateDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob1'), { local: '' }));
  await assertFails(updateDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob1'), { local: 'X'.repeat(201) }));
  await assertFails(updateDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob1'), { local: 'Outro', nomeObra: 'X' }));
  await assertFails(updateDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob1'), { status: 'FINALIZADA' }));
  await assertSucceeds(updateDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob1'), { siglaObra: 'PONTE DO ARROIO' }));
  await assertSucceeds(updateDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob1'), { siglaObra: '' }));
  await assertSucceeds(updateDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob1'), { local: 'Ledur', siglaObra: 'OBV' }));
  await assertFails(updateDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob1'), { siglaObra: 'X'.repeat(101) }));
  await assertFails(updateDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob1'), { siglaObra: 7 }));
  await assertFails(updateDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob1'), { siglaObra: 'X', codObra: 5 }));
  await assertFails(setDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob-nova'), { nomeObra: 'Nova', local: 'X', codObra: 0, siglaObra: '' }));
  await assertFails(deleteDoc(doc(dbAs('engenharia'), 'obras-v2', 'ob1')));
  await assertFails(updateDoc(doc(dbAs('canonicalUser'), 'obras-v2', 'ob1'), { local: 'Outro' }));
  await assertSucceeds(updateDoc(doc(dbAs('canonicalAdm2'), 'obras-v2', 'ob1'), { local: 'Ledur' }));
});

test('[firestore] monday-obras: read by employees, written only by Functions', async () => {
  await assertSucceeds(getDocs(collection(dbAs('canonicalAdm2'), 'monday-obras')));
  await assertFails(setDoc(doc(dbAs('canonicalAdm2'), 'monday-obras', 'mo2'), { nome: 'X' }));
});
test('[firestore] monday-mestres: adm2 creates {nome, cor}; nothing else', async () => {
  await assertSucceeds(getDocs(collection(dbAs('engenharia'), 'monday-mestres')));
  await assertFails(getDocs(collection(dbAs('canonicalUser'), 'monday-mestres')));
  await assertSucceeds(setDoc(doc(dbAs('canonicalAdm2'), 'monday-mestres', 'joao'), { nome: 'João', cor: '#abcdef' }));
  await assertFails(setDoc(doc(dbAs('canonicalAdm2'), 'monday-mestres', 'maria'), { nome: 'Maria', cor: '#abcdef', extra: 1 }));
  await assertFails(setDoc(doc(dbAs('canonicalUser'), 'monday-mestres', 'pedro'), { nome: 'Pedro', cor: '#abcdef' }));
  await assertFails(deleteDoc(doc(dbAs('canonicalAdm2'), 'monday-mestres', 'dine')));
});
test('[firestore] cronograma accepts contract-level allocations (no obraId) and keeps targets immutable', async () => {
  const { obraId, ...semObra } = cronogramaAlocacao('uid-canonical-adm2');
  void obraId;
  const db = dbAs('canonicalAdm2');
  await assertSucceeds(setDoc(doc(db, 'monday-cronograma', 'contrato-sem-obra'), semObra));
  await assertSucceeds(updateDoc(doc(db, 'monday-cronograma', 'contrato-sem-obra'), { tempoPlanejado: 9, atualizadoEm: Timestamp.fromMillis(2) }));
  await assertFails(updateDoc(doc(db, 'monday-cronograma', 'contrato-sem-obra'), { contratoId: 'outro', atualizadoEm: Timestamp.fromMillis(3) }));
  await assertFails(updateDoc(doc(db, 'monday-cronograma', 'contrato-sem-obra'), { obraId: '1', atualizadoEm: Timestamp.fromMillis(3) }));
  await assertFails(setDoc(doc(db, 'monday-cronograma', 'obra-vazia'), { ...semObra, obraId: '' }));
});

function atividadeV2(overrides = {}) {
  return {
    schemaVersion: 2, tipo: 'saida', data: Timestamp.fromMillis(1757000000000), destino: 'Obra V2', local: 'Ledur', km: 125600, motivo: 'Serviço',
    motorista: { uid: 'uid-user', nome: 'User' }, criadoPor: { uid: 'uid-user', nome: 'User' },
    item_frota_id: 'vv1', item_frota_snapshot: { categoria: 'PLACA', identificador: 'ABC1D23', nome: 'Caminhão 1' },
    id_obra: 'ob1', id_obra_snap: { codObra: 101, siglaObra: 'OBV', nomeObra: 'Obra V2', local: 'Ledur' }, ...overrides,
  };
}
test('[firestore] V2 activity: own Saída with fleet km update in one transaction', async () => {
  const db = dbAs('user');
  await assertSucceeds(runTransaction(db, async (transaction) => {
    await transaction.get(doc(db, 'obras-v2', 'ob1'));
    transaction.set(doc(db, 'atividades', 'saida - v2 - user'), atividadeV2());
    transaction.update(doc(db, 'veiculos-v2', 'vv1'), { 'operacional.quilometragemUltima': 125600, 'operacional.dataUltimaAtualizacao': Timestamp.fromMillis(3) });
  }));
});
test('[firestore] V2 activity: mecanico/adm2 register for someone with motorista; the item is checked by ID only', async () => {
  await assertFails(setDoc(doc(dbAs('canonicalUser'), 'atividades', 'v2-forjada'), atividadeV2({ criadoPor: { uid: 'uid-canonical-user', nome: 'uid-canonical-user' } })));
  await assertFails(setDoc(doc(dbAs('canonicalFrentista'), 'atividades', 'v2-frentista-outro'), atividadeV2({ criadoPor: { uid: 'uid-canonical-frentista', nome: 'uid-canonical-frentista' } })));
  await assertSucceeds(setDoc(doc(dbAs('mecanico'), 'atividades', 'v2-mecanico-outro'), atividadeV2({ criadoPor: { uid: 'uid-mecanico', nome: 'Mecanico' } })));
  await assertFails(setDoc(doc(dbAs('mecanico'), 'atividades', 'v2-mecanico-sem-motorista'), atividadeV2({ motorista: { uid: 'uid-frentista', nome: 'Frentista' }, criadoPor: { uid: 'uid-mecanico', nome: 'Mecanico' } })));
  await assertFails(setDoc(doc(dbAs('frentista'), 'atividades', 'v2-propria-sem-motorista'), atividadeV2({ motorista: { uid: 'uid-frentista', nome: 'Frentista' }, criadoPor: { uid: 'uid-frentista', nome: 'Frentista' } })));
  await assertFails(setDoc(doc(dbAs('user'), 'atividades', 'v2-autor-forjado'), atividadeV2({ criadoPor: { uid: 'uid-canonical-frentista', nome: 'X' } })));
  await assertFails(setDoc(doc(dbAs('user'), 'atividades', 'v2-sem-item'), atividadeV2({ item_frota_id: 'nao-existe' })));
  await assertSucceeds(setDoc(doc(dbAs('user'), 'atividades', 'v2-snapshot-diferente'), atividadeV2({ item_frota_snapshot: { categoria: 'PLACA', identificador: 'ZZZ', nome: 'Caminhão 1' } })));
  await assertSucceeds(setDoc(doc(dbAs('user'), 'atividades', 'v2-extra'), atividadeV2({ item_frota_id: 'vm1', item_frota_snapshot: { categoria: 'EXTRA', identificador: 'CARREGADEIRA', nome: 'Carregadeira Case' } })));
});
test('[firestore] app automatic adjustment (legacy shape, id = chamado) is accepted', async () => {
  await assertSucceeds(setDoc(doc(dbAs('canonicalUser'), '03-combustivel', 'chamado-ajuste-1'), {
    semKm: 'Sem Odometro', tipoPlaca: false, li: 1000, lf: 1010, qa: 10, data: Timestamp.fromMillis(5), para_quem: 'ERRO', motivo: 'Uso Fábrica',
    local: '', placa: '', arla: 0, obra: '', motorista: 'ERRO', observacao: 'Ajuste | UID: uid-canonical-user', diesel: 4990,
  }));
});
// Ajuste automático do app como saída V2 (Manuscript 04_APP_FLUTTER/06_COMBUSTIVEL.md, "Ajuste automático de divergência").
function ajusteV2(overrides = {}) {
  return {
    schemaVersion: 2, tipo: 'saida', motivo: 'Ajuste de montante', modalidadeAbastecimento: 'direto', semKm: 'Sem Odometro', arla: 0,
    data: Timestamp.fromMillis(1757000000000), quantidadeAbastecida: 25, valorAbastecimento: 1450,
    origemPreco: { movimentoId: 'entry-1', lote: '1006', precoLitro: 580 },
    estoqueAntes: 5000, estoqueAposMovimento: 4975, montanteAntes: 1000, montanteAposMovimento: 1025,
    frentista: { uid: null, nome: 'ERRO' }, motoristaOperador: { uid: null, nome: 'ERRO' },
    criadoPor: { uid: 'uid-frentista', nome: 'Frentista' },
    item_frota_id: null, item_frota_snapshot: null, id_obra: null, id_obra_snap: null,
    observacao: 'Diferencial no montante, ajuste automático | Chamado: call-existing', ...overrides,
  };
}
test('[firestore] V2 automatic adjustment: movement, pump and chamado in one transaction', async () => {
  const db = dbAs('frentista'); const pump = doc(db, 'bombas', 'diesel_patio'); const movement = doc(db, '03-combustivel', 'ajuste-v2');
  await assertSucceeds(runTransaction(db, async (transaction) => {
    const current = (await transaction.get(pump)).data();
    const output = ajusteV2({ estoqueAntes: current.estoqueAtual, estoqueAposMovimento: current.estoqueAtual - 25, montanteAntes: current.montanteAtual, montanteAposMovimento: current.montanteAtual + 25 });
    transaction.set(movement, output);
    transaction.update(pump, {
      estoqueAtual: output.estoqueAposMovimento, montanteAtual: output.montanteAposMovimento, ultimoAbastecimento: output.data, ultimoFrentista: 'ERRO',
      ultimaMovimentacao: { movimentoId: 'ajuste-v2', tipo: 'saida', data: output.data }, atualizadoEm: output.data,
    });
    transaction.update(doc(db, '00-chamados', 'call-existing'), { mntntInfrmd: output.montanteAposMovimento, dfrncl: 25, status: 'AJUSTADO' });
  }));
});
test('[firestore] V2 automatic adjustment without price reference and by adm2 is accepted', async () => {
  await assertSucceeds(setDoc(doc(dbAs('frentista'), '03-combustivel', 'ajuste-v2-sem-preco'), ajusteV2({ valorAbastecimento: 0, origemPreco: { movimentoId: null, lote: null, precoLitro: 0 } })));
  await assertSucceeds(setDoc(doc(dbAs('adm2'), '03-combustivel', 'ajuste-v2-adm2'), ajusteV2({ criadoPor: { uid: 'uid-adm2', nome: 'Adm2' } })));
});
test('[firestore] V2 automatic adjustment keeps integers, author uid and credential; values and sums are not compared', async () => {
  const db = dbAs('frentista');
  const write = (name, overrides) => setDoc(doc(db, '03-combustivel', name),
    Object.fromEntries(Object.entries(ajusteV2(overrides)).filter(([, v]) => v !== undefined)));
  await assertFails(write('ajuste-v2-fracao', { quantidadeAbastecida: 25.5, estoqueAposMovimento: 4974.5, montanteAposMovimento: 1025.5 }));
  await assertFails(write('ajuste-v2-autor', { criadoPor: { uid: 'uid-adm2', nome: 'Adm2' } }));
  await assertFails(write('ajuste-v2-motivo', { motivo: 'Uso' }));
  await assertFails(setDoc(doc(dbAs('user'), '03-combustivel', 'ajuste-v2-motorista'), ajusteV2({ criadoPor: { uid: 'uid-user', nome: 'User' } })));
  await assertSucceeds(write('ajuste-v2-frentista-uid', { frentista: { uid: 'uid-frentista', nome: 'ERRO' } }));
  await assertSucceeds(write('ajuste-v2-sem-chave-obra', { id_obra: undefined }));
  await assertSucceeds(write('ajuste-v2-km', { quilometragem: 125000 }));
  await assertSucceeds(write('ajuste-v2-montante', { montanteAposMovimento: 1030 }));
  await assertSucceeds(write('ajuste-v2-negativo', { estoqueAntes: -100, estoqueAposMovimento: -125 }));
});
test('[firestore] maintenance legacy: adm2 edits and deletes, nobody creates', async () => {
  await assertSucceeds(updateDoc(doc(dbAs('canonicalAdm2'), 'manutencoes-legado', 'legacy1'), { status: 'REVISTO' }));
  await assertFails(setDoc(doc(dbAs('canonicalAdm2'), 'manutencoes-legado', 'legacy2'), { status: 'NOVO' }));
  await assertSucceeds(deleteDoc(doc(dbAs('canonicalAdm2'), 'manutencoes-legado', 'legacy1')));
});

test('[firestore] Friday: boards cannot be created official nor have "cadastro" changed by clients', async () => {
  const db = dbAs('escritorio');
  await assertSucceeds(setDoc(doc(db, 'friday-quadros', '12'), { id: 12, nome: 'Novo', cadastro: null, restrito: 0 }));
  await assertFails(setDoc(doc(db, 'friday-quadros', '13'), { id: 13, nome: 'Forjado', cadastro: 'pontes' }));
  await assertSucceeds(updateDoc(doc(db, 'friday-quadros', '11'), { nome: 'Renomeado' }));
  await assertFails(updateDoc(doc(db, 'friday-quadros', '11'), { cadastro: null }));
  await assertFails(updateDoc(doc(db, 'friday-quadros', '10'), { cadastro: 'pontes' }));
});
test('[firestore] Friday: only adm2 moves folders and boards to another workspace (area_id)', async () => {
  const esc = dbAs('escritorio');
  await assertSucceeds(updateDoc(doc(esc, 'friday-pastas', '50'), { nome: 'Renomeada', posicao: 2 }));
  await assertSucceeds(updateDoc(doc(esc, 'friday-quadros', '15'), { pasta_id: null }));
  await assertFails(updateDoc(doc(esc, 'friday-pastas', '50'), { area_id: 2 }));
  await assertFails(updateDoc(doc(esc, 'friday-quadros', '15'), { area_id: 2 }));
  const adm = dbAs('adm2');
  await assertSucceeds(updateDoc(doc(adm, 'friday-pastas', '50'), { area_id: 2, pasta_pai_id: null }));
  await assertSucceeds(updateDoc(doc(adm, 'friday-quadros', '15'), { area_id: 2 }));
  await assertSucceeds(setDoc(doc(esc, 'friday-pastas', '51'), { id: 51, nome: 'Nova', area_id: 2, pasta_pai_id: null }));
  await assertSucceeds(deleteDoc(doc(esc, 'friday-pastas', '51')));
});
test('[firestore] Friday: API keys (friday-chaves-api) listed, created (read-only or with write, fixed) and revoked only by adm2, never deleted', async () => {
  const hash = 'a'.repeat(64);
  const chave = (extra = {}) => ({ uid: 'uid-escritorio', nome: 'Robô', sufixo: 'abcd', criado_por: 'uid-adm2', criado_em: '2026-11-10 10:00:00', revogada_em: null, ...extra });
  const esc = dbAs('escritorio');
  await assertFails(setDoc(doc(esc, 'friday-chaves-api', hash), chave({ criado_por: 'uid-escritorio' })));
  await assertFails(getDocs(collection(esc, 'friday-chaves-api')));
  const adm = dbAs('adm2');
  await assertFails(setDoc(doc(adm, 'friday-chaves-api', 'nao-e-hash'), chave()));
  await assertFails(setDoc(doc(adm, 'friday-chaves-api', hash), chave({ criado_por: 'uid-escritorio' })), 'em nome de outra pessoa');
  await assertFails(setDoc(doc(adm, 'friday-chaves-api', hash), chave({ revogada_em: '2026-11-10 10:00:00' })), 'já nasce revogada');
  await assertFails(setDoc(doc(adm, 'friday-chaves-api', hash), chave({ chave: 'fri_segredo' })), 'campo a mais (a chave em claro)');
  await assertFails(setDoc(doc(adm, 'friday-chaves-api', hash), chave({ escrita: 'sim' })), 'escrita só sim/não');
  await assertSucceeds(setDoc(doc(adm, 'friday-chaves-api', 'b'.repeat(64)), chave({ escrita: true })), 'chave com escrita');
  await assertFails(updateDoc(doc(adm, 'friday-chaves-api', 'b'.repeat(64)), { escrita: false }), 'escrita não muda depois');
  await assertSucceeds(setDoc(doc(adm, 'friday-chaves-api', hash), chave()));
  await assertSucceeds(getDocs(collection(adm, 'friday-chaves-api')));
  await assertFails(updateDoc(doc(adm, 'friday-chaves-api', hash), { uid: 'uid-adm2' }), 'trocar a pessoa');
  await assertFails(updateDoc(doc(esc, 'friday-chaves-api', hash), { revogada_em: '2026-11-10 11:00:00', revogada_por: 'uid-escritorio' }));
  await assertSucceeds(updateDoc(doc(adm, 'friday-chaves-api', hash), { revogada_em: '2026-11-10 11:00:00', revogada_por: 'uid-adm2' }));
  await assertFails(updateDoc(doc(adm, 'friday-chaves-api', hash), { revogada_em: '2026-11-10 12:00:00', revogada_por: 'uid-adm2' }), 'revogada não volta');
  await assertFails(deleteDoc(doc(adm, 'friday-chaves-api', hash)));
});
test('[firestore] Friday: items keep "vinculo" and import control written only by Functions', async () => {
  const db = dbAs('escritorio');
  await assertSucceeds(setDoc(doc(db, 'friday-itens', '22'), { id: 22, quadro_id: 10, nome: 'Novo', valores: {}, vinculo: null, importado_em: null }));
  await assertFails(setDoc(doc(db, 'friday-itens', '23'), { id: 23, quadro_id: 11, nome: 'Forjado', vinculo: { cadastro: 'pontes', id: 'abc' } }));
  await assertFails(setDoc(doc(db, 'friday-itens', '24'), { id: 24, quadro_id: 10, nome: 'Forjado', importado_em: '2026-10-20 10:00:00' }));
  await assertSucceeds(updateDoc(doc(db, 'friday-itens', '21'), { nome: 'Renomeado', 'valores.5': 'x', pessoas: [1], busca: ['re'] }));
  await assertFails(updateDoc(doc(db, 'friday-itens', '21'), { vinculo: null }));
  await assertFails(updateDoc(doc(db, 'friday-itens', '20'), { importado_em: '2026-10-20 10:00:00' }));
});
test('[firestore] Friday: generic resources open to escritorio and adm2 only', async () => {
  await assertFails(setDoc(doc(dbAs('canonicalUser'), 'friday-grupos', '43'), { id: 43, quadro_id: 10, nome: 'Sem credencial' }));
  await assertFails(setDoc(doc(dbAs('engenharia'), 'friday-grupos', '44'), { id: 44, quadro_id: 10, nome: 'Engenharia' }));
  await assertSucceeds(setDoc(doc(dbAs('adm2'), 'friday-grupos', '45'), { id: 45, quadro_id: 10, nome: 'Adm2' }));
  await assertSucceeds(setDoc(doc(dbAs('escritorio'), 'friday-grupos', '40'), { id: 40, quadro_id: 10, nome: 'Grupo' }));
  await assertFails(setDoc(doc(dbAs('legacyOnly'), 'friday-grupos', '41'), { id: 41, quadro_id: 10, nome: 'Legado' }));
  await assertFails(setDoc(doc(dbAs('canonicalInactive'), 'friday-grupos', '42'), { id: 42, quadro_id: 10, nome: 'Inativo' }));
});
test('[firestore] Friday: attachments carry the sender and a friday/ path; executions read/delete only; imports closed; meta only "indices"', async () => {
  const db = dbAs('escritorio');
  const anexo = (id, extra = {}) => ({ id, item_id: 20, quadro_id: 10, nome: 'a.pdf', arquivo: `friday/10/20/${id}-a.pdf`, usuario_id: 'uid-escritorio', origem_id: null, ...extra });
  await assertSucceeds(getDoc(doc(db, 'friday-anexos', '30')));
  await assertSucceeds(setDoc(doc(db, 'friday-anexos', '31'), anexo(31)));
  await assertFails(updateDoc(doc(db, 'friday-anexos', '31'), { nome: 'b.pdf' }));
  await assertFails(setDoc(doc(db, 'friday-anexos', '32'), { id: 32 }));
  await assertFails(setDoc(doc(db, 'friday-anexos', '33'), anexo(33, { usuario_id: 'uid-adm2' })));
  await assertFails(setDoc(doc(db, 'friday-anexos', '34'), anexo(34, { arquivo: 'checklists/saidas/x/a.jpg' })));
  await assertFails(setDoc(doc(db, 'friday-anexos', '35'), anexo(35, { origem_id: 'monday:1' })));
  await assertFails(setDoc(doc(dbAs('canonicalUser'), 'friday-anexos', '36'), anexo(36, { usuario_id: 'uid-canonical-user' })));
  await assertFails(setDoc(doc(db, 'friday-execucoes', '50'), { id: 50 }));
  await assertSucceeds(deleteDoc(doc(db, 'friday-anexos', '30')));
  await assertFails(getDoc(doc(db, 'friday-importacoes', '123')));
  await assertFails(setDoc(doc(dbAs('canonicalAdm2'), 'friday-importacoes', '124'), { situacao: 'ok' }));
  await assertSucceeds(setDoc(doc(db, 'friday-meta', 'indices'), { versao: 1, itens: 3 }));
  await assertSucceeds(getDoc(doc(db, 'friday-meta', 'indices')));
  await assertFails(setDoc(doc(db, 'friday-meta', 'outro'), { x: 1 }));
  await assertFails(deleteDoc(doc(db, 'friday-meta', 'indices')));
});
test('[firestore] Friday: official registries are readable, never writable by clients', async () => {
  const db = dbAs('escritorio');
  await assertSucceeds(getDoc(doc(db, 'friday-cadastros', 'pontes')));
  await assertFails(getDocs(collection(db, 'friday-cadastros')));
  await assertFails(setDoc(doc(dbAs('canonicalAdm2'), 'friday-cadastros', 'novo'), { chave: 'novo' }));
  await assertSucceeds(getDoc(doc(db, 'cadastro-pontes', 'abc')));
  await assertFails(updateDoc(doc(dbAs('canonicalAdm2'), 'cadastro-pontes', 'abc'), { nome: 'X' }));
  await assertFails(getDoc(doc(dbAs('missing'), 'cadastro-pontes', 'abc')));
});
test('[firestore] funcionarios: an active person writes only their own last access, with the server time', async () => {
  const proprio = doc(dbAs('canonicalFrentista'), 'funcionarios', 'uid-canonical-frentista');
  await assertSucceeds(updateDoc(proprio, { ultimoAcesso: serverTimestamp() }));
  await assertFails(updateDoc(proprio, { ultimoAcesso: Timestamp.fromMillis(5) }));
  await assertFails(updateDoc(proprio, { ultimoAcesso: serverTimestamp(), nome: 'Outro nome' }));
  await assertFails(updateDoc(proprio, { perfis: { frentista: true, adm2: true, motorista: false } }));
  await assertFails(updateDoc(doc(dbAs('canonicalFrentista'), 'funcionarios', 'uid-canonical-adm2'), { ultimoAcesso: serverTimestamp() }));
  await assertFails(updateDoc(doc(dbAs('canonicalInactive'), 'funcionarios', 'uid-canonical-inactive'), { ultimoAcesso: serverTimestamp() }));
});
// App (notification_service.dart): set on login and on token refresh, delete on sign-out (also when inactive).
test('[firestore] funcionarios/fcmTokens: the person writes and deletes only their own device token', async () => {
  const token = (identity, uid, id) => doc(dbAs(identity), 'funcionarios', uid, 'fcmTokens', id);
  const dados = (id) => ({ token: id, plataforma: 'android', atualizadoEm: serverTimestamp() });
  await assertSucceeds(setDoc(token('canonicalFrentista', 'uid-canonical-frentista', 'tok-1'), dados('tok-1')));
  await assertSucceeds(setDoc(token('canonicalFrentista', 'uid-canonical-frentista', 'tok-1'), dados('tok-1')));
  await assertFails(getDoc(token('canonicalFrentista', 'uid-canonical-frentista', 'tok-1')));
  await assertFails(setDoc(token('canonicalFrentista', 'uid-canonical-frentista', 'tok-2'), dados('outro')));
  await assertSucceeds(setDoc(token('canonicalFrentista', 'uid-canonical-frentista', 'tok-3'), { ...dados('tok-3'), atualizadoEm: Timestamp.fromMillis(1) }));
  await assertSucceeds(setDoc(token('canonicalFrentista', 'uid-canonical-frentista', 'tok-4'), { ...dados('tok-4'), extra: true }));
  await assertFails(setDoc(token('canonicalFrentista', 'uid-canonical-adm2', 'tok-5'), dados('tok-5')));
  await assertFails(setDoc(token('canonicalInactive', 'uid-canonical-inactive', 'tok-6'), dados('tok-6')));
  await assertFails(setDoc(token('legacyOnly', 'uid-legacy-only', 'tok-7'), dados('tok-7')));
  await assertFails(deleteDoc(token('canonicalAdm2', 'uid-canonical-frentista', 'tok-1')));
  await assertSucceeds(deleteDoc(token('canonicalFrentista', 'uid-canonical-frentista', 'tok-1')));
  await assertSucceeds(deleteDoc(token('canonicalInactive', 'uid-canonical-inactive', 'tok-sair')));
});
// Permissão por quadro (2026-11-06): restrito = só a lista (acesso); adm2 vê todos; registros seguem o quadro.
test('[firestore] Friday: a restricted board and its records are only for its list and adm2', async () => {
  const dentro = dbAs('escritorio'), fora = dbAs('escritorioFora'), adm = dbAs('canonicalAdm2');
  const itens = (db) => collection(db, 'friday-itens');
  await assertSucceeds(getDocs(query(itens(dentro), where('quadro_id', '==', 100))));
  await assertFails(getDocs(query(itens(fora), where('quadro_id', '==', 100))));
  await assertSucceeds(getDocs(query(itens(fora), where('quadro_id', '==', 10))));
  await assertSucceeds(getDocs(query(itens(adm), where('quadro_id', '==', 100))));
  await assertSucceeds(getDoc(doc(dentro, 'friday-itens', '201')));
  await assertFails(getDoc(doc(fora, 'friday-itens', '201')));
  await assertFails(getDoc(doc(fora, 'friday-quadros', '100')));
  for (const col of ['friday-colunas', 'friday-execucoes', 'friday-anexos', 'friday-atividades']) {
    await assertSucceeds(getDocs(query(collection(dentro, col), where('quadro_id', '==', 100))));
    await assertFails(getDocs(query(collection(fora, col), where('quadro_id', '==', 100))));
  }
  await assertFails(setDoc(doc(fora, 'friday-itens', '202'), { id: 202, quadro_id: 100, nome: 'Intruso', valores: {}, vinculo: null }));
  await assertSucceeds(setDoc(doc(dentro, 'friday-itens', '203'), { id: 203, quadro_id: 100, nome: 'Da lista', valores: {}, vinculo: null }));
  await assertFails(updateDoc(doc(fora, 'friday-itens', '20'), { quadro_id: 100 }));
  await assertFails(setDoc(doc(fora, 'friday-grupos', '204'), { id: 204, quadro_id: 100, nome: 'Grupo' }));
  await assertFails(setDoc(doc(fora, 'friday-anexos', '205'), { id: 205, item_id: 200, quadro_id: 100, arquivo: 'friday/100/200/205-a.pdf', usuario_id: 'uid-escritorio-fora', origem_id: null }));
});
test('[firestore] Friday: cross-board reads must name the boards (in up to 10); lists of boards prove access', async () => {
  const dentro = dbAs('escritorio'), fora = dbAs('escritorioFora'), adm = dbAs('canonicalAdm2');
  const itens = (db) => collection(db, 'friday-itens');
  await assertFails(getDocs(query(itens(dentro), where('pessoas', 'array-contains', 'uid-escritorio'))));
  await assertSucceeds(getDocs(query(itens(adm), where('pessoas', 'array-contains', 'uid-escritorio'))));
  await assertSucceeds(getDocs(query(itens(dentro), where('quadro_id', 'in', [10, 100]), where('pessoas', 'array-contains', 'uid-escritorio'))));
  await assertFails(getDocs(query(itens(fora), where('quadro_id', 'in', [10, 100]), where('pessoas', 'array-contains', 'uid-escritorio-fora'))));
  await assertSucceeds(getDocs(query(itens(dentro), where('quadro_id', 'in', [100]), where('arquivado_em', '!=', null))));
  const quadros = (db) => collection(db, 'friday-quadros');
  await assertSucceeds(getDocs(query(quadros(fora), where('restrito', '==', 0))));
  await assertSucceeds(getDocs(query(quadros(dentro), where('acesso', 'array-contains', 'uid-escritorio'))));
  await assertFails(getDocs(quadros(fora)));
  await assertFails(getDocs(query(quadros(fora), where('restrito', '==', 1))));
  await assertSucceeds(getDocs(quadros(adm)));
});
test('[firestore] Friday: only adm2 changes restrito/acesso; a restricted copy needs the creator on the list', async () => {
  const dentro = dbAs('escritorio'), fora = dbAs('escritorioFora'), adm = dbAs('canonicalAdm2');
  await assertFails(updateDoc(doc(dentro, 'friday-quadros', '100'), { acesso: ['uid-escritorio', 'uid-escritorio-fora'] }));
  await assertFails(updateDoc(doc(fora, 'friday-quadros', '10'), { restrito: 1, acesso: ['uid-escritorio-fora'] }));
  await assertSucceeds(updateDoc(doc(dentro, 'friday-quadros', '100'), { nome: 'RH 2' }));
  await assertSucceeds(setDoc(doc(dentro, 'friday-quadros', '102'), { id: 102, nome: 'Cópia de RH', cadastro: null, restrito: 1, acesso: ['uid-escritorio'] }));
  await assertFails(setDoc(doc(fora, 'friday-quadros', '103'), { id: 103, nome: 'Fora da lista', cadastro: null, restrito: 1, acesso: ['uid-escritorio'] }));
  await assertSucceeds(updateDoc(doc(adm, 'friday-quadros', '102'), { acesso: ['uid-escritorio', 'uid-escritorio-fora'] }));
  await assertSucceeds(getDoc(doc(fora, 'friday-quadros', '102')));
});
test('[firestore] Friday: friday-usuarios no longer exists in the rules', async () => {
  await assertFails(getDoc(doc(dbAs('canonicalFrentista'), 'friday-usuarios', 'uid-canonical-frentista')));
  await assertFails(setDoc(doc(dbAs('canonicalFrentista'), 'friday-usuarios', 'uid-canonical-frentista'), { id: 1, uid: 'uid-canonical-frentista', nome: 'A', acesso: 'membro', ativo: 1 }));
});

// ------------------------------------------------------------------ revisão das Rules (2026-10-21)
// Item de frota inativo: o cliente decide o que oferece; as Rules aceitam medidor, combustível e Saída nele.
test('[firestore] inactive fleet item: meter update, fuel V2 output and V2 activity are accepted', async () => {
  await assertSucceeds(updateDoc(doc(dbAs('canonicalUser'), 'veiculos-v2', 'vv-inativo'), { 'operacional.quilometragemUltima': 90100, 'operacional.dataUltimaAtualizacao': Timestamp.fromMillis(2) }));
  await assertFails(updateDoc(doc(dbAs('canonicalUser'), 'veiculos-v2', 'vv-inativo'), { 'operacional.quilometragemUltima': 80000 }));
  const inativo = { item_frota_id: 'vv-inativo', item_frota_snapshot: { categoria: 'PLACA', identificador: 'OLD1A23', nome: 'Caminhão parado' } };
  await coherentV2Write('fuel-v2-inativo', { ...inativo, quilometragem: 90200 });
  await assertSucceeds(setDoc(doc(dbAs('user'), 'atividades', 'v2-inativo'), atividadeV2({ ...inativo, km: 90300 })));
});

function checklistV2(overrides = {}) {
  return {
    schemaVersion: 1, tipo: 'saida', catalogo: 'veiculos', catalogoVersao: '1',
    item_frota_id: 'vv1', item_frota_snapshot: { categoria: 'PLACA', identificador: 'ABC1D23', nome: 'Caminhão 1' },
    medidor: { tipo: 'km', valor: 126000, anterior: 125000 }, guincho: false,
    motoristaOperador: { uid: 'uid-user', nome: 'User' },
    assinatura: { status: 'ausente', motivo: 'Motorista em viagem', em: Timestamp.fromMillis(2) },
    criadoPor: { uid: 'uid-mecanico', nome: 'Mecanico' }, criadoPorUid: 'uid-mecanico',
    iniciadoEm: Timestamp.fromMillis(1), concluidoEm: Timestamp.fromMillis(2), registradoEm: Timestamp.fromMillis(3),
    totais: { ok: 1, avaria: 0, naoSeAplica: 0 },
    itens: [{ itemId: 'frente_farolete', parte: 'frente', titulo: 'Farolete', status: 'ok', observacao: null, fotos: [] }],
    ...overrides,
  };
}

test('[firestore] checklists-v2: mechanic saves in one transaction (read before create, meter update)', async () => {
  const db = dbAs('mecanico');
  const checklist = doc(db, 'checklists-v2', 'AbCdEfGhIjKlMnOpQrSt');
  const veiculo = doc(db, 'veiculos-v2', 'vv-inativo');
  await assertSucceeds(runTransaction(db, async (tx) => {
    if ((await tx.get(checklist)).exists()) return;
    await tx.get(veiculo);
    tx.set(checklist, checklistV2({
      item_frota_id: 'vv-inativo', item_frota_snapshot: { categoria: 'PLACA', identificador: 'OLD1A23', nome: 'Caminhão parado' },
      medidor: { tipo: 'km', valor: 95000, anterior: 90100 },
    }));
    tx.update(veiculo, { 'operacional.quilometragemUltima': 95000, 'operacional.dataUltimaAtualizacao': Timestamp.fromMillis(4) });
  }));
});
test('[firestore] checklists-v2: mechanic corrects the meter downwards in the saving transaction; others cannot', async () => {
  await assertFails(updateDoc(doc(dbAs('canonicalUser'), 'veiculos-v2', 'vv-correcao'), { 'operacional.quilometragemUltima': 50000 }));
  await assertFails(updateDoc(doc(dbAs('canonicalFrentista'), 'veiculos-v2', 'vv-correcao'), { 'operacional.quilometragemUltima': 50000 }));
  const db = dbAs('mecanico');
  const id = 'CorrecaoKmParaBaixo1';
  const checklist = doc(db, 'checklists-v2', id);
  const veiculo = doc(db, 'veiculos-v2', 'vv-correcao');
  await assertSucceeds(runTransaction(db, async (tx) => {
    if ((await tx.get(checklist)).exists()) return;
    await tx.get(veiculo);
    tx.set(checklist, checklistV2({
      item_frota_id: 'vv-correcao', item_frota_snapshot: { categoria: 'PLACA', identificador: 'COR1R23', nome: 'Caminhão KM errado' },
      medidor: { tipo: 'km', valor: 50000, anterior: 500000, corrigido: true },
      assinatura: { status: 'assinada', path: `checklists-v2/${id}/assinatura_1.jpg`, em: Timestamp.fromMillis(2), bytes: 30000, largura: 1200, altura: 600 },
    }));
    tx.update(veiculo, { 'operacional.quilometragemUltima': 50000, 'operacional.dataUltimaAtualizacao': Timestamp.fromMillis(4) });
  }));
  // Still only the meter fields, as integers.
  await assertFails(updateDoc(doc(db, 'veiculos-v2', 'vv-correcao'), { 'operacional.quilometragemUltima': 40000.5 }));
  await assertFails(updateDoc(doc(db, 'veiculos-v2', 'vv-correcao'), { 'operacional.quilometragemUltima': 40000, 'identificacao.nome': 'Outro' }));
  await assertSucceeds(updateDoc(doc(db, 'veiculos-v2', 'vv-correcao'), { 'operacional.quilometragemUltima': 40000 }));
});
test('[firestore] checklists-v2: driver/operator and signature are validated on create', async () => {
  const db = dbAs('mecanico');
  const bad = {
    'sem-motorista': { motoristaOperador: null },
    'motorista-sem-nome': { motoristaOperador: { uid: null, nome: '  ' } },
    'motorista-inexistente': { motoristaOperador: { uid: 'uid-nao-existe', nome: 'X' } },
    'motorista-inativo': { motoristaOperador: { uid: 'uid-inactive', nome: 'Inactive' } },
    'sem-assinatura': { assinatura: null },
    'assinatura-status': { assinatura: { status: 'talvez', em: Timestamp.fromMillis(2) } },
    'assinatura-outro-path': { assinatura: { status: 'assinada', path: 'checklists-v2/outro/assinatura_1.jpg', em: Timestamp.fromMillis(2) } },
    'ausente-sem-motivo': { assinatura: { status: 'ausente', motivo: ' ', em: Timestamp.fromMillis(2) } },
  };
  for (const [id, change] of Object.entries(bad)) {
    await assertFails(setDoc(doc(db, 'checklists-v2', `bad-${id}`), checklistV2(change)));
  }
  await assertSucceeds(setDoc(doc(db, 'checklists-v2', 'ok-nome-digitado'), checklistV2({ motoristaOperador: { uid: null, nome: 'Fulano terceirizado' } })));
  await assertSucceeds(setDoc(doc(db, 'checklists-v2', 'ok-assinada'), checklistV2({
    assinatura: { status: 'assinada', path: 'checklists-v2/ok-assinada/assinatura_1.jpg', em: Timestamp.fromMillis(2), bytes: 30000, largura: 1200, altura: 600 },
  })));
});
test('[firestore] checklists-v2: mechanic and adm2 read all; other employees and legacy-only cannot', async () => {
  await assertSucceeds(getDocs(query(collection(dbAs('mecanico'), 'checklists-v2'), where('item_frota_id', '==', 'vv-inativo'))));
  await assertSucceeds(getDocs(collection(dbAs('canonicalAdm2'), 'checklists-v2')));
  await assertSucceeds(getDoc(doc(dbAs('mecanico'), 'checklists-v2', 'ainda-nao-existe')));
  await assertFails(getDocs(collection(dbAs('canonicalUser'), 'checklists-v2')));
  await assertFails(getDocs(collection(dbAs('canonicalFrentista'), 'checklists-v2')));
  await assertFails(getDocs(collection(dbAs('legacyOnly'), 'checklists-v2')));
});
test('[firestore] checklists-v2: adm2 creates; plain employee cannot', async () => {
  await assertSucceeds(setDoc(doc(dbAs('canonicalAdm2'), 'checklists-v2', 'adm2-checklist'), checklistV2({ criadoPor: { uid: 'uid-canonical-adm2', nome: 'uid-canonical-adm2' }, criadoPorUid: 'uid-canonical-adm2' })));
  await assertFails(setDoc(doc(dbAs('canonicalUser'), 'checklists-v2', 'user-checklist'), checklistV2({ criadoPor: { uid: 'uid-canonical-user', nome: 'x' }, criadoPorUid: 'uid-canonical-user' })));
});
test('[firestore] checklists-v2: rejects forged author, missing vehicle and non-integer meter; values are not compared', async () => {
  const db = dbAs('mecanico');
  const bad = {
    'forged-uid': { criadoPorUid: 'uid-other' },
    'forged-snapshot': { criadoPor: { uid: 'uid-other', nome: 'Mecanico' } },
    'no-vehicle': { item_frota_id: 'nao-existe' },
    'fractional-meter': { medidor: { tipo: 'km', valor: 10.5, anterior: null } },
    'no-meter': { medidor: null },
    'itens-map': { itens: { a: 1 } },
  };
  for (const [id, change] of Object.entries(bad)) {
    await assertFails(setDoc(doc(db, 'checklists-v2', `bad-${id}`), checklistV2(change)));
  }
  const accepted = {
    schema: { schemaVersion: 2 },
    tipo: { tipo: 'outro' },
    catalogo: { catalogo: 'outros' },
  };
  for (const [id, change] of Object.entries(accepted)) {
    await assertSucceeds(setDoc(doc(db, 'checklists-v2', `ok-${id}`), checklistV2(change)));
  }
});
test('[firestore] checklists-v2: immutable', async () => {
  await assertSucceeds(setDoc(doc(dbAs('mecanico'), 'checklists-v2', 'imutavel'), checklistV2()));
  await assertFails(updateDoc(doc(dbAs('mecanico'), 'checklists-v2', 'imutavel'), { guincho: true }));
  await assertFails(updateDoc(doc(dbAs('canonicalAdm2'), 'checklists-v2', 'imutavel'), { guincho: true }));
  await assertFails(deleteDoc(doc(dbAs('canonicalAdm2'), 'checklists-v2', 'imutavel')));
});

test('[storage] legacy-only profile (00-autorizados, no funcionarios) is denied', async () => {
  const path = 'checklists/saidas/a/legacy-only.jpg';
  await seedStorageObject(path);
  await assertFails(getBytes(ref(storageAs('legacyOnly'), path)));
  await assertFails(uploadBytes(ref(storageAs('legacyOnly'), 'checklists/saidas/at1/pneus_20261021_101500.jpg'), image, { contentType: 'image/jpeg' }));
});
test('[storage] checklists-v2: mechanic and adm2 upload photos and thumbnails; others cannot', async () => {
  await assertSucceeds(uploadBytes(ref(storageAs('mecanico'), 'checklists-v2/ck1/frente_farolete_1.jpg'), image, { contentType: 'image/jpeg' }));
  await assertSucceeds(uploadBytes(ref(storageAs('mecanico'), 'checklists-v2/ck1/miniaturas/frente_farolete_1.jpg'), image, { contentType: 'image/jpeg' }));
  await assertSucceeds(uploadBytes(ref(storageAs('canonicalAdm2'), 'checklists-v2/ck2/parte_mecanica_pneu_suplente_2.jpg'), image, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageAs('canonicalUser'), 'checklists-v2/ck3/frente_farolete_1.jpg'), image, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageAs('canonicalFrentista'), 'checklists-v2/ck3/frente_farolete_1.jpg'), image, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(storageAs('legacyOnly'), 'checklists-v2/ck3/frente_farolete_1.jpg'), image, { contentType: 'image/jpeg' }));
});
test('[storage] checklists-v2: JPEG only, size limits and file name', async () => {
  const st = storageAs('mecanico');
  await assertFails(uploadBytes(ref(st, 'checklists-v2/ck4/frente_farolete_1.png'), image, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(st, 'checklists-v2/ck4/frente_farolete_1.jpg'), image, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(st, 'checklists-v2/ck4/foto.jpg'), image, { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(st, 'checklists-v2/ck4/outra/frente_farolete_1.jpg'), image, { contentType: 'image/jpeg' }));
  await assertSucceeds(uploadBytes(ref(st, 'checklists-v2/ck4/frente_farolete_2.jpg'), new Uint8Array(2 * 1024 * 1024), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(st, 'checklists-v2/ck4/frente_farolete_3.jpg'), new Uint8Array(2 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }));
  await assertSucceeds(uploadBytes(ref(st, 'checklists-v2/ck4/miniaturas/frente_farolete_2.jpg'), new Uint8Array(200 * 1024), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(ref(st, 'checklists-v2/ck4/miniaturas/frente_farolete_3.jpg'), new Uint8Array(200 * 1024 + 1), { contentType: 'image/jpeg' }));
});
test('[storage] checklists-v2: read by mechanic and adm2; never overwritten or deleted', async () => {
  const path = 'checklists-v2/ck5/frente_farolete_1.jpg';
  await seedStorageObject(path);
  await assertSucceeds(getBytes(ref(storageAs('mecanico'), path)));
  await assertSucceeds(getBytes(ref(storageAs('canonicalAdm2'), path)));
  await assertFails(getBytes(ref(storageAs('canonicalUser'), path)));
  await assertFails(uploadBytes(ref(storageAs('mecanico'), path), image, { contentType: 'image/jpeg' }));
  await assertFails(deleteObject(ref(storageAs('canonicalAdm2'), path)));
});

// ------------------------------------------------------------------ bateria do tablet Kiosk (2026-10-27)
// App docs/KIOSK_BATERIA.md: o Kiosk grava deslogado; formato fechado; só o adm2 lê.
function bateria(medidoEm, overrides = {}) {
  return { medidoEm, motivo: 'hora', nivel: 57, carregando: false, fonte: 'nenhuma', temperaturaC: 27.5, tensaoMv: 3850, saude: 'boa', ...overrides };
}
function terminalBateria(medidoEm, overrides = {}) {
  return { ...bateria(medidoEm), recebidoEm: serverTimestamp(), semEconomiaBateria: true, modelo: 'SM-T820', android: '9', versaoApp: '1.0.0+1', pendentes: 0, ...overrides };
}
const leituraRef = (db, medidoEm, terminal = 'BOMBA-FABRICA-01') => doc(db, 'kioskBateria', terminal, 'leituras', String(medidoEm.toMillis()));

test('[firestore] kioskBateria: the logged-out tablet writes terminal and readings; a resend overwrites the same reading', async () => {
  const db = env.unauthenticatedContext().firestore();
  const agora = Timestamp.fromMillis(Date.now() - 60_000);
  const atrasada = Timestamp.fromMillis(Date.now() - 3 * 86_400_000);
  await assertSucceeds(setDoc(doc(db, 'kioskBateria', 'BOMBA-FABRICA-01'), terminalBateria(agora)));
  await assertSucceeds(setDoc(doc(db, 'kioskBateria', 'BOMBA-FABRICA-01'), terminalBateria(agora, { pendentes: 12, nivel: 56 })));
  await assertSucceeds(setDoc(leituraRef(db, agora), bateria(agora)));
  await assertSucceeds(setDoc(leituraRef(db, agora), bateria(agora)));
  await assertSucceeds(setDoc(leituraRef(db, atrasada), bateria(atrasada, { motivo: 'tomada_ligada', carregando: true, fonte: 'tomada', nivel: 100, temperaturaC: 31 })));
});
test('[firestore] kioskBateria: readings out of format, out of range or with a mismatched ID are refused', async () => {
  const db = env.unauthenticatedContext().firestore();
  const agora = Timestamp.fromMillis(Date.now() - 120_000);
  const recusada = (overrides) => assertFails(setDoc(leituraRef(db, agora), bateria(agora, overrides)));
  await recusada({ nivel: 101 });
  await recusada({ nivel: 50.5 });
  await recusada({ motivo: 'outro' });
  await recusada({ fonte: 'gerador' });
  await recusada({ saude: 'otima' });
  await recusada({ temperaturaC: 200 });
  await recusada({ tensaoMv: -1 });
  await recusada({ carregando: 'sim' });
  await recusada({ extra: true });
  const { saude, ...semSaude } = bateria(agora);
  void saude;
  await assertFails(setDoc(leituraRef(db, agora), semSaude));
  await assertFails(setDoc(doc(db, 'kioskBateria', 'BOMBA-FABRICA-01', 'leituras', String(agora.toMillis() + 1)), bateria(agora)));
  await assertFails(setDoc(doc(db, 'kioskBateria', 'BOMBA-FABRICA-01', 'leituras', 'abc'), bateria(agora)));
  const velha = Timestamp.fromMillis(Date.now() - 8 * 86_400_000);
  await assertFails(setDoc(leituraRef(db, velha), bateria(velha)));
  const futura = Timestamp.fromMillis(Date.now() + 60 * 60_000);
  await assertFails(setDoc(leituraRef(db, futura), bateria(futura)));
});
test('[firestore] kioskBateria: terminal document needs the server time, bounded extras and a valid terminal ID', async () => {
  const db = env.unauthenticatedContext().firestore();
  const agora = Timestamp.fromMillis(Date.now() - 60_000);
  await assertFails(setDoc(doc(db, 'kioskBateria', 'BOMBA-FABRICA-01'), terminalBateria(agora, { recebidoEm: agora })));
  await assertFails(setDoc(doc(db, 'kioskBateria', 'BOMBA-FABRICA-01'), terminalBateria(agora, { pendentes: 97 })));
  await assertFails(setDoc(doc(db, 'kioskBateria', 'BOMBA-FABRICA-01'), terminalBateria(agora, { modelo: 'x'.repeat(81) })));
  await assertFails(setDoc(doc(db, 'kioskBateria', 'BOMBA-FABRICA-01'), terminalBateria(agora, { outro: 1 })));
  await assertFails(setDoc(doc(db, 'kioskBateria', 'bomba-fabrica'), terminalBateria(agora)));
});
test('[firestore] kioskBateria: only adm2 reads; nobody deletes', async () => {
  const agora = Timestamp.fromMillis(Date.now() - 60_000);
  await setDoc(doc(env.unauthenticatedContext().firestore(), 'kioskBateria', 'BOMBA-FABRICA-01'), terminalBateria(agora));
  await setDoc(leituraRef(env.unauthenticatedContext().firestore(), agora), bateria(agora));
  await assertSucceeds(getDoc(doc(dbAs('canonicalAdm2'), 'kioskBateria', 'BOMBA-FABRICA-01')));
  await assertSucceeds(getDocs(collection(dbAs('canonicalAdm2'), 'kioskBateria', 'BOMBA-FABRICA-01', 'leituras')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'kioskBateria', 'BOMBA-FABRICA-01')));
  await assertFails(getDocs(collection(dbAs('canonicalFrentista'), 'kioskBateria', 'BOMBA-FABRICA-01', 'leituras')));
  await assertFails(deleteDoc(doc(dbAs('canonicalAdm2'), 'kioskBateria', 'BOMBA-FABRICA-01')));
  await assertFails(deleteDoc(leituraRef(env.unauthenticatedContext().firestore(), agora)));
});

test('[firestore] logistica: só adm2 lê, cria semana no formato e programação no esquema', async () => {
  const adm2 = dbAs('canonicalAdm2');
  const semana = (abertura = 'manual', extra = {}) => ({ schemaVersion: 1, inicio: '2026-11-09', fim: '2026-11-15', abertura, criadoPorUid: 'uid-canonical-adm2', criadoEm: serverTimestamp(), ...extra });
  const programacao = (extra = {}) => ({
    schemaVersion: 1, semanaId: '2026-W45', item: 'Buscar contra-peso', status: 'Programado', inicio: '2026-11-03', fim: '2026-11-04',
    motorista: { uid: 'uid-user', nome: 'User' }, auxiliar: null, veiculo: { id: 'vv1', nome: 'ABC-1D23 - Caminhão' }, obra: { id: 'ob1', nome: 'OBV - Obra V2' },
    posicao: 2, criadoPorUid: 'uid-canonical-adm2', criadoEm: serverTimestamp(), atualizadoPorUid: 'uid-canonical-adm2', atualizadoEm: serverTimestamp(), ...extra,
  });

  await assertSucceeds(getDoc(doc(adm2, 'logistica-semanas', '2026-W45')));
  await assertSucceeds(getDoc(doc(adm2, 'logistica-programacoes', 'lp1')));
  for (const outro of ['canonicalFrentista', 'engenharia', 'escritorio']) {
    await assertFails(getDoc(doc(dbAs(outro), 'logistica-semanas', '2026-W45')));
    await assertFails(getDoc(doc(dbAs(outro), 'logistica-programacoes', 'lp1')));
    await assertFails(setDoc(doc(dbAs(outro), 'logistica-semanas', '2026-W50'), semana()));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'logistica-programacoes', 'lp1')));

  // Semana: ID ISO, esquema fechado, autor e horário do servidor; não muda nem é apagada.
  await assertFails(setDoc(doc(adm2, 'logistica-semanas', '2026-46'), semana()));
  await assertFails(setDoc(doc(adm2, 'logistica-semanas', '2026-W46'), semana('outra')));
  await assertFails(setDoc(doc(adm2, 'logistica-semanas', '2026-W46'), semana('manual', { criadoPorUid: 'uid-user' })));
  await assertFails(setDoc(doc(adm2, 'logistica-semanas', '2026-W46'), semana('manual', { extra: 1 })));
  await assertSucceeds(setDoc(doc(adm2, 'logistica-semanas', '2026-W46'), semana()));
  await assertFails(updateDoc(doc(adm2, 'logistica-semanas', '2026-W46'), { abertura: 'automatica' }));
  await assertFails(deleteDoc(doc(adm2, 'logistica-semanas', '2026-W46')));

  // Programação: semana existente, datas em ordem, referências {id, nome}, autor = quem grava.
  await assertSucceeds(setDoc(doc(adm2, 'logistica-programacoes', 'lp2'), programacao()));
  await assertFails(setDoc(doc(adm2, 'logistica-programacoes', 'lp3'), programacao({ semanaId: '2030-W01' })));
  await assertFails(setDoc(doc(adm2, 'logistica-programacoes', 'lp3'), programacao({ item: '' })));
  await assertFails(setDoc(doc(adm2, 'logistica-programacoes', 'lp3'), programacao({ inicio: '2026-11-05', fim: '2026-11-04' })));
  await assertFails(setDoc(doc(adm2, 'logistica-programacoes', 'lp3'), programacao({ inicio: '03/11/2026' })));
  await assertFails(setDoc(doc(adm2, 'logistica-programacoes', 'lp3'), programacao({ motorista: { id: 'uid-user', nome: 'User' } })));
  await assertFails(setDoc(doc(adm2, 'logistica-programacoes', 'lp3'), programacao({ criadoPorUid: 'uid-user' })));
  await assertFails(setDoc(doc(adm2, 'logistica-programacoes', 'lp3'), programacao({ outro: true })));
  await assertSucceeds(setDoc(doc(adm2, 'logistica-programacoes', 'lp3'), programacao({ inicio: '2026-11-05', fim: null, veiculo: null })));

  // Alteração: não troca semana nem autoria; registra quem alterou.
  await assertSucceeds(updateDoc(doc(adm2, 'logistica-programacoes', 'lp1'), { status: 'Concluído', atualizadoPorUid: 'uid-canonical-adm2', atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(doc(adm2, 'logistica-programacoes', 'lp1'), { status: 'x', atualizadoPorUid: 'uid-other', atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(doc(adm2, 'logistica-programacoes', 'lp1'), { semanaId: '2026-W46', atualizadoPorUid: 'uid-canonical-adm2', atualizadoEm: serverTimestamp() }));
  await assertFails(updateDoc(doc(dbAs('canonicalFrentista'), 'logistica-programacoes', 'lp1'), { status: 'x' }));
  await assertFails(deleteDoc(doc(dbAs('engenharia'), 'logistica-programacoes', 'lp1')));
  await assertSucceeds(deleteDoc(doc(adm2, 'logistica-programacoes', 'lp1')));
});

test('[firestore] logistica: vários veículos (até 4) e o campo antigo veiculo continua aceito', async () => {
  const adm2 = dbAs('canonicalAdm2');
  const v = (id) => ({ id, nome: `Veículo ${id}` });
  const { veiculo: _antigo, ...semVeiculo } = {
    schemaVersion: 1, semanaId: '2026-W45', item: 'Transporte de pilares', status: 'Em viagem', inicio: '2026-11-03', fim: '2026-11-04',
    motorista: null, auxiliar: null, veiculo: null, obra: null, posicao: 1.5,
    criadoPorUid: 'uid-canonical-adm2', criadoEm: serverTimestamp(), atualizadoPorUid: 'uid-canonical-adm2', atualizadoEm: serverTimestamp(),
  };
  const nova = (veiculos) => ({ ...semVeiculo, veiculos });
  const alterou = { atualizadoPorUid: 'uid-canonical-adm2', atualizadoEm: serverTimestamp() };

  await assertSucceeds(setDoc(doc(adm2, 'logistica-programacoes', 'lv1'), nova([v('a'), v('b')])));
  await assertSucceeds(setDoc(doc(adm2, 'logistica-programacoes', 'lv2'), nova([])));
  await assertSucceeds(setDoc(doc(dbAs('logistica'), 'logistica-programacoes', 'lv3'), { ...nova([v('a'), v('b'), v('c'), v('d')]), criadoPorUid: 'uid-logistica', atualizadoPorUid: 'uid-logistica' }));
  await assertFails(setDoc(doc(adm2, 'logistica-programacoes', 'lv4'), nova([v('a'), v('b'), v('c'), v('d'), v('e')])));
  await assertFails(setDoc(doc(adm2, 'logistica-programacoes', 'lv4'), nova([null])));
  await assertFails(setDoc(doc(adm2, 'logistica-programacoes', 'lv4'), nova([{ id: 'a' }])));
  await assertFails(setDoc(doc(adm2, 'logistica-programacoes', 'lv4'), nova([{ uid: 'a', nome: 'A' }])));
  await assertFails(setDoc(doc(adm2, 'logistica-programacoes', 'lv4'), nova(v('a'))));

  // Documento de antes (um só veículo em `veiculo`): continua editável e passa para a lista apagando o campo antigo.
  await assertSucceeds(updateDoc(doc(adm2, 'logistica-programacoes', 'lp2'), { status: 'Finalizado', ...alterou }));
  await assertSucceeds(updateDoc(doc(adm2, 'logistica-programacoes', 'lp2'), { veiculos: [v('a'), v('b')], veiculo: deleteField(), ...alterou }));
  await assertSucceeds(updateDoc(doc(adm2, 'logistica-programacoes', 'lv1'), { posicao: -998.25, ...alterou }));
  await assertFails(updateDoc(doc(adm2, 'logistica-programacoes', 'lv1'), { veiculos: [v('a'), 'b'], ...alterou }));
});

test('[firestore] logistica: observações com texto ou arquivos, do próprio autor, sem edição', async () => {
  const adm2 = dbAs('canonicalAdm2');
  await setDoc(doc(adm2, 'logistica-programacoes', 'lo-prog'), {
    schemaVersion: 1, semanaId: '2026-W45', item: 'Buscar carreta', status: '', inicio: null, fim: null,
    motorista: null, auxiliar: null, veiculos: [], obra: null, posicao: 1,
    criadoPorUid: 'uid-canonical-adm2', criadoEm: serverTimestamp(), atualizadoPorUid: 'uid-canonical-adm2', atualizadoEm: serverTimestamp(),
  });
  const anexo = (n) => ({ caminho: `logistica/observacoes/o2/${n}-foto.jpg`, url: 'https://exemplo/foto.jpg', nome: 'foto.jpg', tipo: 'image/jpeg', tamanho: 10 });
  const obs = (extra = {}) => ({
    schemaVersion: 1, programacaoId: 'lo-prog', texto: 'Carga amarrada, sai às 7h', anexos: [],
    autor: { uid: 'uid-canonical-adm2', nome: 'Adm' }, criadoEm: serverTimestamp(), ...extra,
  });

  await assertSucceeds(setDoc(doc(adm2, 'logistica-observacoes', 'o1'), obs()));
  await assertSucceeds(setDoc(doc(adm2, 'logistica-observacoes', 'o2'), obs({ texto: '', anexos: [anexo(1), anexo(2)] })));
  await assertSucceeds(setDoc(doc(dbAs('logistica'), 'logistica-observacoes', 'o3'), obs({ autor: { uid: 'uid-logistica', nome: 'Logística' } })));
  await assertFails(setDoc(doc(adm2, 'logistica-observacoes', 'o4'), obs({ texto: '' })));
  await assertFails(setDoc(doc(adm2, 'logistica-observacoes', 'o4'), obs({ autor: { uid: 'uid-logistica', nome: 'Outro' } })));
  await assertFails(setDoc(doc(adm2, 'logistica-observacoes', 'o4'), obs({ programacaoId: 'nao-existe' })));
  await assertFails(setDoc(doc(adm2, 'logistica-observacoes', 'o4'), obs({ anexos: Array.from({ length: 11 }, (_, i) => anexo(i)) })));
  await assertFails(setDoc(doc(adm2, 'logistica-observacoes', 'o4'), obs({ texto: 'x'.repeat(2001) })));
  await assertFails(setDoc(doc(adm2, 'logistica-observacoes', 'o4'), obs({ extra: true })));
  await assertFails(setDoc(doc(adm2, 'logistica-observacoes', 'o4'), obs({ criadoEm: Timestamp.fromMillis(1) })));
  for (const outro of ['canonicalFrentista', 'engenharia', 'escritorio']) {
    await assertFails(getDoc(doc(dbAs(outro), 'logistica-observacoes', 'o1')));
    await assertFails(setDoc(doc(dbAs(outro), 'logistica-observacoes', 'o5'), obs()));
  }
  await assertSucceeds(getDoc(doc(dbAs('logistica'), 'logistica-observacoes', 'o1')));
  await assertSucceeds(getDocs(query(collection(dbAs('mecanico'), 'logistica-observacoes'), where('programacaoId', '==', 'lo-prog'))));
  await assertFails(updateDoc(doc(adm2, 'logistica-observacoes', 'o1'), { texto: 'mudou' }));
  await assertFails(deleteDoc(doc(dbAs('engenharia'), 'logistica-observacoes', 'o1')));
  // Quem exclui a programação apaga também as observações dos outros.
  await assertSucceeds(deleteDoc(doc(dbAs('logistica'), 'logistica-observacoes', 'o1')));
});

test('[firestore] dev-salas: só retr0; entra com vaga, só quem criou começa, só quem está na vez joga, qualquer jogador desiste', async () => {
  const [a, b, c] = [dbAs('retr0'), dbAs('retr0b'), dbAs('retr0c')];
  const sala = (extra = {}) => ({
    jogo: 'xadrez', criadaPor: 'uid-retr0', jogadores: ['uid-retr0'], nomes: ['RETR0'], max: 2, estado: 'aberta',
    partida: null, vez: null, versao: 0, criadaEm: serverTimestamp(), atualizadaEm: serverTimestamp(), ...extra,
  });
  const mudar = (db, id, campos, versao) => updateDoc(doc(db, 'dev-salas', id), { ...campos, versao, atualizadaEm: serverTimestamp() });

  // nem o adm2 (sem retr0) cria ou lê
  await assertFails(setDoc(doc(dbAs('adm2'), 'dev-salas', 'x0'), sala({ criadaPor: 'uid-adm2', jogadores: ['uid-adm2'] })));
  await assertSucceeds(setDoc(doc(a, 'dev-salas', 'x1'), sala()));
  await assertFails(getDoc(doc(dbAs('adm2'), 'dev-salas', 'x1')));
  await assertSucceeds(getDocs(query(collection(b, 'dev-salas'), where('jogo', '==', 'xadrez'))));
  // nasce aberta, sozinho, no tamanho do jogo
  await assertFails(setDoc(doc(a, 'dev-salas', 'x2'), sala({ max: 4 })));
  await assertFails(setDoc(doc(a, 'dev-salas', 'x2'), sala({ jogadores: ['uid-retr0', 'uid-retr0b'], nomes: ['A', 'B'] })));
  await assertFails(setDoc(doc(a, 'dev-salas', 'x2'), sala({ criadaPor: 'uid-retr0b' })));
  await assertFails(setDoc(doc(a, 'dev-salas', 'x2'), sala({ estado: 'jogando', partida: '{}', vez: 'uid-retr0' })));
  await assertFails(setDoc(doc(a, 'dev-salas', 'x2'), sala({ outro: 1 })));
  await assertSucceeds(setDoc(doc(a, 'dev-salas', 'n1'), sala({ jogo: 'neo', max: 4 })));

  // ninguém começa sozinho; entrar põe o próprio uid no fim; a sala cheia não aceita mais
  await assertFails(mudar(a, 'x1', { estado: 'jogando', partida: '{}', vez: 'uid-retr0' }, 1));
  await assertFails(mudar(b, 'x1', { jogadores: ['uid-retr0', 'uid-retr0c'], nomes: ['RETR0', 'C'] }, 1));
  await assertSucceeds(mudar(b, 'x1', { jogadores: ['uid-retr0', 'uid-retr0b'], nomes: ['RETR0', 'B'] }, 1));
  await assertFails(mudar(c, 'x1', { jogadores: ['uid-retr0', 'uid-retr0b', 'uid-retr0c'], nomes: ['RETR0', 'B', 'C'] }, 2));
  // só quem criou começa, e a versão sobe de um em um
  await assertFails(mudar(b, 'x1', { estado: 'jogando', partida: '{}', vez: 'uid-retr0b' }, 2));
  await assertFails(mudar(a, 'x1', { estado: 'jogando', partida: '{}', vez: 'uid-retr0b' }, 5));
  await assertSucceeds(mudar(a, 'x1', { estado: 'jogando', partida: '{}', vez: 'uid-retr0b' }, 2));
  // só quem está na vez joga, e a vez fica com um jogador; quem está fora não grava
  await assertFails(mudar(a, 'x1', { partida: '{"x":1}', vez: 'uid-retr0b' }, 3));
  await assertFails(mudar(b, 'x1', { partida: '{"x":1}', vez: 'uid-retr0c' }, 3));
  await assertFails(mudar(b, 'x1', { partida: '{"x":1}', jogadores: ['uid-retr0b', 'uid-retr0'] }, 3));
  await assertSucceeds(mudar(b, 'x1', { partida: '{"x":1}', vez: 'uid-retr0' }, 3));
  await assertFails(mudar(c, 'x1', { estado: 'fim', partida: '{}', vez: null }, 4));
  // desistir: qualquer jogador, fora da vez também
  await assertSucceeds(mudar(b, 'x1', { estado: 'fim', partida: '{"desistiu":1}', vez: null }, 4));
  await assertFails(mudar(a, 'x1', { partida: '{}' }, 5));
  // terminada, qualquer jogador apaga; aberta, só quem criou (quem entrou sai)
  await assertFails(deleteDoc(doc(c, 'dev-salas', 'x1')));
  await assertSucceeds(deleteDoc(doc(b, 'dev-salas', 'x1')));
  await assertSucceeds(mudar(b, 'n1', { jogadores: ['uid-retr0', 'uid-retr0b'], nomes: ['RETR0', 'B'] }, 1));
  await assertSucceeds(mudar(c, 'n1', { jogadores: ['uid-retr0', 'uid-retr0b', 'uid-retr0c'], nomes: ['RETR0', 'B', 'C'] }, 2));
  await assertFails(deleteDoc(doc(b, 'dev-salas', 'n1')));
  await assertSucceeds(mudar(b, 'n1', { jogadores: ['uid-retr0', 'uid-retr0c'], nomes: ['RETR0', 'C'] }, 3));
  await assertFails(mudar(a, 'n1', { jogadores: ['uid-retr0'], nomes: ['RETR0'] }, 4));
  await assertSucceeds(deleteDoc(doc(a, 'dev-salas', 'n1')));
});
