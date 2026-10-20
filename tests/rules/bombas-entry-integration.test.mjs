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

// Entrada de diesel V2 como o app grava (transação T4): movimento no formato do contrato
// (Manuscript 02_PROCESSOS/combustivel-entrada-v2.md) e bomba com os campos V2.
const projectId = 'demo-firebase-rules';
const adm2 = { uid: 'uid-adm2-entrada', email: '123@example.com' };
const regular = { uid: 'uid-regular-entrada', email: '456@example.com' };
let env;

function dbAs(identity) {
  return env.authenticatedContext(identity.uid, { email: identity.email }).firestore();
}

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'funcionarios', adm2.uid), { nome: 'Operador ADM2', email: adm2.email, ativo: true, perfis: { adm1: false, adm2: true, user: false, motorista: false } });
    await setDoc(doc(db, 'funcionarios', regular.uid), { nome: 'Operador comum', email: regular.email, ativo: true, perfis: { adm1: false, adm2: false, user: true, motorista: true } });
    await setDoc(doc(db, 'bombas', 'diesel_patio_entrada'), {
      nomeBomba: 'Diesel patio', montanteAtual: 123_500, estoqueAtual: 34_000, ultimoFrentista: 'anterior', ultimoAbastecimento: Timestamp.fromMillis(0),
    });
  });
}

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: await readFile('firestore.rules', 'utf8') } });
  await seed();
});

after(async () => env?.cleanup());

function entrada(timestamp, identity, overrides = {}) {
  return {
    data: timestamp, schemaVersion: 2, tipo: 'entrada', bombaId: 'diesel_patio', movimentoId: 'mov-1',
    litrosComprados: 50_000, preco: 2_000_000, precoLitro: 400, lote: 'LT-2026-09',
    estoqueAntes: 34_000, estoqueAposMovimento: 84_000, montanteSnapshot: null,
    criadoPor: { uid: identity.uid, nome: identity === adm2 ? 'Operador ADM2' : 'Operador comum' }, motivo: 'Abastecimento de Diesel', ...overrides,
  };
}

test('[firestore] app diesel-entry transaction (movement + pump) is accepted and atomic', async () => {
  const db = dbAs(adm2);
  const timestamp = Timestamp.fromDate(new Date('2026-09-04T12:30:45Z'));
  const movementRef = doc(db, '03-combustivel', 'entrada-app-1');
  const pumpRef = doc(db, 'bombas', 'diesel_patio_entrada');
  await assertSucceeds(runTransaction(db, async (transaction) => {
    const pump = await transaction.get(pumpRef);
    assert.equal(pump.exists(), true);
    transaction.set(movementRef, entrada(timestamp, adm2));
    transaction.update(pumpRef, {
      estoqueAtual: 84_000,
      ultimaEntrada: { schemaVersion: 2, movimentoId: 'mov-1', data: timestamp, litrosComprados: 50_000, preco: 2_000_000, precoLitro: 400, lote: 'LT-2026-09', responsavel: { id: adm2.uid, nome: 'Operador ADM2' } },
      ultimaMovimentacao: { movimentoId: 'mov-1', tipo: 'entrada', data: timestamp },
      atualizadoEm: timestamp,
    });
  }));
  await env.withSecurityRulesDisabled(async (context) => {
    const movement = (await getDoc(doc(context.firestore(), '03-combustivel', 'entrada-app-1'))).data();
    assert.equal(movement.tipo, 'entrada');
    assert.equal(movement.litrosComprados, 50_000);
  });
});

test('[firestore] regular user cannot submit the diesel entry', async () => {
  const timestamp = Timestamp.fromDate(new Date('2026-09-04T13:00:00Z'));
  await assertFails(setDoc(doc(dbAs(regular), '03-combustivel', 'regular-entry'), entrada(timestamp, regular)));
});

test('[firestore] malformed price and forged author name are denied', async () => {
  const db = dbAs(adm2);
  const timestamp = Timestamp.fromDate(new Date('2026-09-04T14:00:00Z'));
  await assertFails(setDoc(doc(db, '03-combustivel', 'zero-price'), entrada(timestamp, adm2, { preco: 0 })));
  await assertFails(setDoc(doc(db, '03-combustivel', 'forged-name'), entrada(timestamp, adm2, { criadoPor: { uid: adm2.uid, nome: 'Outra pessoa' } })));
});

// Lacuna conhecida (registrada no Manuscript): o registro sem tipo, com o motivo escrito de outro jeito, passa pelo
// ramo legado e o estoque da bomba pode subir. Fechar exige migrar os registros legados para o formato V2.
test('[firestore] known gap: regular user can disguise an entry and increase shared stock', async () => {
  const db = dbAs(regular);
  const movementRef = doc(db, '03-combustivel', 'disguised-regular-entry');
  const pumpRef = doc(db, 'bombas', 'diesel_patio_entrada');
  await assertSucceeds(runTransaction(db, async (transaction) => {
    const pump = await transaction.get(pumpRef);
    const currentStock = pump.data().estoqueAtual;
    transaction.set(movementRef, {
      data: Timestamp.fromDate(new Date('2026-09-04T15:00:00Z')), motivo: 'abastecimento de diesel', motorista: regular.uid,
      qa: 50_000, diesel: currentStock + 50_000, lf: pump.data().montanteAtual,
    });
    transaction.update(pumpRef, { estoqueAtual: currentStock + 50_000, ultimoFrentista: regular.uid, ultimoAbastecimento: Timestamp.fromDate(new Date('2026-09-04T15:00:00Z')) });
  }));
});
