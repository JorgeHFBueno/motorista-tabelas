import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Bomba } from '../types/Bomba';
import {
  DIESEL_PATIO_ID,
  applyDieselEntryToPump,
  buildDieselEntryRecord,
  formatFlutterFuelDocumentId,
  litersToStoredTenths,
  normalizeFuelMovement,
  type FuelMovement,
  type FuelMovementSource,
} from '../utils/bombasDomain';

const BOMBAS_COLLECTION = 'bombas';
const COMBUSTIVEL_COLLECTION = '03-combustivel';

export type { FuelMovement } from '../utils/bombasDomain';

export interface DieselEntryInput {
  bombaId: string;
  totalPrice: number;
  purchasedLiters: number;
  purchaseDate: Date;
  batch: string;
  authUid: string;
  userEmail: string;
}

export async function listBombas(): Promise<Bomba[]> {
  const snapshot = await getDocs(collection(db, BOMBAS_COLLECTION));
  return snapshot.docs.map((snapshotDoc) => ({
    id: snapshotDoc.id,
    ...(snapshotDoc.data() as Omit<Bomba, 'id'>),
  }));
}

export async function listFuelMovements(bombaId: string): Promise<FuelMovement[]> {
  const snapshot = await getDocs(
    query(collection(db, COMBUSTIVEL_COLLECTION), orderBy('data', 'desc'), limit(500)),
  );

  return snapshot.docs
    .map((snapshotDoc) => normalizeFuelMovement({
      id: snapshotDoc.id,
      ...(snapshotDoc.data() as Omit<FuelMovementSource, 'id'>),
    }))
    .filter((movement) =>
      bombaId === DIESEL_PATIO_ID
        ? !movement.bombaId || movement.bombaId === DIESEL_PATIO_ID
        : movement.bombaId === bombaId,
    );
}

export async function registerDieselEntry(input: DieselEntryInput): Promise<void> {
  if (input.bombaId !== DIESEL_PATIO_ID) {
    throw new Error('O Flutter permite entrada de diesel somente em bombas/diesel_patio.');
  }
  if (!input.authUid.trim()) throw new Error('Usuário autenticado não identificado.');
  const motoristaDocumentId = input.userEmail.trim().toLowerCase();
  if (!motoristaDocumentId) throw new Error('Perfil Firestore do responsável não identificado.');
  if (!(input.totalPrice > 0) || !Number.isFinite(input.totalPrice)) {
    throw new Error('Informe um preço total válido.');
  }
  if (!(input.purchasedLiters > 0) || !Number.isFinite(input.purchasedLiters)) {
    throw new Error('Informe a quantidade de litros comprados.');
  }
  if (Number.isNaN(input.purchaseDate.getTime())) throw new Error('Informe uma data válida.');
  if (!input.batch.trim()) throw new Error('Informe o lote da compra.');

  const entryStoredTenths = litersToStoredTenths(input.purchasedLiters);
  const unitPrice = input.totalPrice / input.purchasedLiters;
  const documentId = formatFlutterFuelDocumentId(input.purchaseDate, input.authUid);
  const bombaRef = doc(db, BOMBAS_COLLECTION, DIESEL_PATIO_ID);
  const movementRef = doc(db, COMBUSTIVEL_COLLECTION, documentId);
  const motoristaRef = doc(db, '00-autorizados', motoristaDocumentId);
  const timestamp = Timestamp.fromDate(input.purchaseDate);

  await runTransaction(db, async (transaction) => {
    const bombaSnapshot = await transaction.get(bombaRef);
    const movementSnapshot = await transaction.get(movementRef);
    const motoristaSnapshot = await transaction.get(motoristaRef);
    if (!bombaSnapshot.exists()) throw new Error('Documento bombas/diesel_patio não encontrado.');
    if (movementSnapshot.exists()) throw new Error('Já existe uma entrada registrada neste mesmo segundo.');
    if (!motoristaSnapshot.exists()) throw new Error('Cadastro Firestore do responsável não encontrado.');

    const motoristaName = motoristaSnapshot.data().nome;
    if (typeof motoristaName !== 'string' || !motoristaName.trim()) {
      throw new Error('O cadastro Firestore do responsável não possui nome.');
    }

    const currentPumpAmount = bombaSnapshot.data().montanteAtual;
    const currentStock = bombaSnapshot.data().estoqueAtual;
    if (typeof currentPumpAmount !== 'number' || !Number.isFinite(currentPumpAmount)) {
      throw new Error('O montante atual da bomba é inválido.');
    }
    if (typeof currentStock !== 'number' || !Number.isFinite(currentStock)) {
      throw new Error('O estoque atual da bomba é inválido.');
    }
    const newPumpState = applyDieselEntryToPump(
      { montanteAtual: currentPumpAmount, estoqueAtual: currentStock },
      entryStoredTenths,
    );
    if (!Number.isFinite(newPumpState.estoqueAtual)) {
      throw new Error('Não foi possível calcular o novo estoque.');
    }

    transaction.set(movementRef, {
      ...buildDieselEntryRecord({
        date: input.purchaseDate,
        motoristaDocumentId,
        motoristaName,
        authUid: input.authUid,
        pumpStoredTenths: newPumpState.montanteAtual,
        entryStoredTenths,
        newStock: newPumpState.estoqueAtual,
        totalPrice: input.totalPrice,
        unitPrice,
        batch: input.batch,
      }),
      data: timestamp,
    });
    transaction.update(bombaRef, {
      estoqueAtual: newPumpState.estoqueAtual,
      ultimoFrentista: motoristaDocumentId,
      ultimoAbastecimento: timestamp,
    });
  });
}

export default { listBombas, listFuelMovements, registerDieselEntry };
