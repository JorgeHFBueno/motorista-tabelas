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
  buildDieselLatestEntrySnapshot,
  buildDieselEntryRecord,
  litrosParaUnidadeBomba,
  isStoredVolume,
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

export async function getLatestLegacyDieselEntry(bombaId: string): Promise<FuelMovement | null> {
  const movements = await listFuelMovements(bombaId);
  return movements.find((movement) => movement.tipo === 'entrada') ?? null;
}

export async function registerDieselEntry(input: DieselEntryInput): Promise<void> {
  if (input.bombaId !== DIESEL_PATIO_ID) {
    throw new Error('O Flutter permite entrada de diesel somente em bombas/diesel_patio.');
  }
  if (!input.authUid) throw new Error('Usuário autenticado não identificado.');
  const funcionarioDocumentId = input.authUid;
  if (!(input.totalPrice > 0) || !Number.isFinite(input.totalPrice)) {
    throw new Error('Informe um preço total válido.');
  }
  if (!(input.purchasedLiters > 0) || !Number.isFinite(input.purchasedLiters)) {
    throw new Error('Informe a quantidade de litros comprados.');
  }
  if (Number.isNaN(input.purchaseDate.getTime())) throw new Error('Informe uma data válida.');
  if (!input.batch.trim()) throw new Error('Informe o lote da compra.');

  const entryStoredUnits = litrosParaUnidadeBomba(input.purchasedLiters);
  if (!Number.isInteger(entryStoredUnits)) throw new Error('A quantidade de litros não pôde ser convertida para a unidade da bomba.');
  const unitPrice = input.totalPrice / input.purchasedLiters;
  const bombaRef = doc(db, BOMBAS_COLLECTION, DIESEL_PATIO_ID);
  const movementRef = doc(collection(db, COMBUSTIVEL_COLLECTION));
  const funcionarioRef = doc(db, 'funcionarios', funcionarioDocumentId);
  const timestamp = Timestamp.fromDate(input.purchaseDate);

  await runTransaction(db, async (transaction) => {
    const bombaSnapshot = await transaction.get(bombaRef);
    const movementSnapshot = await transaction.get(movementRef);
    const funcionarioSnapshot = await transaction.get(funcionarioRef);
    if (!bombaSnapshot.exists()) throw new Error('Documento bombas/diesel_patio não encontrado.');
    if (movementSnapshot.exists()) throw new Error('Já existe uma entrada registrada neste mesmo segundo.');
    if (!funcionarioSnapshot.exists()) throw new Error('Cadastro em Funcionários do responsável não encontrado.');

    const funcionarioName = funcionarioSnapshot.data().nome;
    if (typeof funcionarioName !== 'string' || !funcionarioName.trim()) {
      throw new Error('O cadastro em Funcionários do responsável não possui nome.');
    }

    const currentPumpAmount = bombaSnapshot.data().montanteAtual;
    const currentStock = bombaSnapshot.data().estoqueAtual;
    if (!isStoredVolume(currentPumpAmount)) {
      throw new Error('O montante atual da bomba é inválido.');
    }
    if (!isStoredVolume(currentStock)) {
      throw new Error('O estoque atual da bomba é inválido.');
    }
    const newPumpState = applyDieselEntryToPump(
      { montanteAtual: currentPumpAmount, estoqueAtual: currentStock },
      entryStoredUnits,
    );
    if (!Number.isFinite(newPumpState.estoqueAtual)) {
      throw new Error('Não foi possível calcular o novo estoque.');
    }

    transaction.set(movementRef, {
      ...buildDieselEntryRecord({
        date: input.purchaseDate,
        bombaId: DIESEL_PATIO_ID,
        responsavelId: funcionarioDocumentId,
        responsavelNome: funcionarioName,
        estoqueAntes: currentStock,
        estoqueAposMovimento: newPumpState.estoqueAtual,
        montanteSnapshot: currentPumpAmount,
        litrosComprados: entryStoredUnits,
        totalPrice: input.totalPrice,
        unitPrice,
        batch: input.batch,
      }),
      data: timestamp,
    });
    transaction.update(bombaRef, {
      estoqueAtual: newPumpState.estoqueAtual,
      ultimaEntrada: buildDieselLatestEntrySnapshot({
        movimentoId: movementRef.id,
        data: timestamp,
        litrosComprados: entryStoredUnits,
        totalPrice: input.totalPrice,
        unitPrice,
        batch: input.batch,
        responsavelId: funcionarioDocumentId,
        responsavelNome: funcionarioName,
      }),
      ultimaMovimentacao: { movimentoId: movementRef.id, tipo: 'entrada', data: timestamp },
      atualizadoEm: Timestamp.now(),
    });
  });
}

export default { listBombas, listFuelMovements, getLatestLegacyDieselEntry, registerDieselEntry };
