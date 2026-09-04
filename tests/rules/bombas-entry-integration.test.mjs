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
  doc,
  getDoc,
  runTransaction,
  setDoc,
} from 'firebase/firestore';

const projectId = 'demo-firebase-rules';
const adm2 = { uid: 'uid-adm2-web', email: '123@example.com' };
const regular = { uid: 'uid-regular-web', email: '456@example.com' };
let env;

function dbAs(identity) {
  return env.authenticatedContext(identity.uid, { email: identity.email }).firestore();
}

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, '00-autorizados', adm2.email), {
      nome: 'Operador ADM2',
      ativo: true,
      adm2: true,
    });
    await setDoc(doc(db, '00-autorizados', regular.email), {
      nome: 'Operador comum',
      ativo: true,
    });
    await setDoc(doc(db, 'bombas', 'diesel_patio'), {
      nomeBomba: 'Diesel patio',
      montanteAtual: 123_500,
      estoqueAtual: 34_000,
      ultimoFrentista: 'anterior',
      ultimoAbastecimento: Timestamp.fromMillis(0),
    });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  });
  await seed();
});

after(async () => env?.cleanup());

function exactWebEntry(timestamp, overrides = {}) {
  return {
    data: timestamp,
    diesel: 84_000,
    lf: 123_500,
    id_motorista: adm2.email,
    id_motorista_snap: 'Operador ADM2',
    litrosComprados: 50_000,
    preco: 20_000,
    precoLitro: 4,
    lote: 'LT-2026-09',
    tipo: 'entrada',
    motorista: adm2.uid,
    qa: 50_000,
    ...overrides,
  };
}

test('[firestore] exact Web diesel-entry transaction is accepted and atomic', async () => {
  const db = dbAs(adm2);
  const timestamp = Timestamp.fromDate(new Date('2026-09-04T12:30:45Z'));
  const movementRef = doc(db, '03-combustivel', '04_09_26 - 0930-45 uid-adm2-web');
  const pumpRef = doc(db, 'bombas', 'diesel_patio');
  const profileRef = doc(db, '00-autorizados', adm2.email);

  await assertSucceeds(runTransaction(db, async (transaction) => {
    const pump = await transaction.get(pumpRef);
    const movement = await transaction.get(movementRef);
    const profile = await transaction.get(profileRef);
    assert.equal(pump.exists(), true);
    assert.equal(movement.exists(), false);
    assert.equal(profile.data()?.nome, 'Operador ADM2');
    transaction.set(movementRef, exactWebEntry(timestamp));
    transaction.update(pumpRef, {
      estoqueAtual: 84_000,
      ultimoFrentista: adm2.email,
      ultimoAbastecimento: timestamp,
    });
  }));

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const movement = (await getDoc(doc(db, '03-combustivel', '04_09_26 - 0930-45 uid-adm2-web'))).data();
    assert.equal(movement.tipo, 'entrada');
    assert.equal(movement.litrosComprados, 50_000);
  });
});

test('[firestore] regular user cannot submit the exact Web entry schema', async () => {
  const db = dbAs(regular);
  const timestamp = Timestamp.fromDate(new Date('2026-09-04T13:00:00Z'));
  await assertFails(setDoc(
    doc(db, '03-combustivel', 'regular-entry'),
    exactWebEntry(timestamp, {
      id_motorista: regular.email,
      id_motorista_snap: 'Operador comum',
      motorista: regular.uid,
    }),
  ));
});

test('[firestore] malformed price and forged responsible name are denied', async () => {
  const db = dbAs(adm2);
  const timestamp = Timestamp.fromDate(new Date('2026-09-04T14:00:00Z'));
  await assertFails(setDoc(
    doc(db, '03-combustivel', 'zero-price'),
    exactWebEntry(timestamp, { preco: 0 }),
  ));
  await assertFails(setDoc(
    doc(db, '03-combustivel', 'forged-name'),
    exactWebEntry(timestamp, { id_motorista_snap: 'Outra pessoa' }),
  ));
});

test('[firestore] audit evidence: regular user can disguise an entry and increase shared stock', async () => {
  const db = dbAs(regular);
  const movementRef = doc(db, '03-combustivel', 'disguised-regular-entry');
  const pumpRef = doc(db, 'bombas', 'diesel_patio');

  await assertSucceeds(runTransaction(db, async (transaction) => {
    const pump = await transaction.get(pumpRef);
    const currentStock = pump.data().estoqueAtual;
    transaction.set(movementRef, {
      data: Timestamp.fromDate(new Date('2026-09-04T15:00:00Z')),
      motivo: 'abastecimento de diesel',
      motorista: regular.uid,
      qa: 50_000,
      diesel: currentStock + 50_000,
      lf: pump.data().montanteAtual,
    });
    transaction.update(pumpRef, {
      estoqueAtual: currentStock + 50_000,
      ultimoFrentista: regular.uid,
      ultimoAbastecimento: Timestamp.fromDate(new Date('2026-09-04T15:00:00Z')),
    });
  }));
});
