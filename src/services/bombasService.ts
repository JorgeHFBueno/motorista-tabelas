import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Bomba } from '../types/Bomba';
import type { CombustivelLog } from '../types/CombustivelLog';

const COLLECTION_NAME = 'bombas';
const COMBUSTIVEL_COLLECTION_NAME = '03-combustivel';

export async function listBombas(): Promise<Bomba[]> {
  const snapshot = await getDocs(collection(db, COLLECTION_NAME));
  return snapshot.docs.map((doc) => {
    const data = doc.data() as Omit<Bomba, 'id'>;
    return {
      id: doc.id,
      ...data,
    };
  });
}

export async function updateBombaAndMaybeLog(
  bombaId: string,
  patch: Partial<Omit<Bomba, 'id'>>,
  motorista: string,
): Promise<Bomba> {
  const bombaRef = doc(db, COLLECTION_NAME, bombaId);
  const combustivelRef = collection(db, COMBUSTIVEL_COLLECTION_NAME);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(bombaRef);
    if (!snapshot.exists()) {
      throw new Error('Bomba não encontrada.');
    }

    const current = snapshot.data() as Omit<Bomba, 'id'>;
    const merged: Omit<Bomba, 'id'> = {
      ...current,
      ...patch,
    };

    transaction.update(bombaRef, patch);

    const estoqueChanged =
      typeof patch.estoqueAtual !== 'undefined' && patch.estoqueAtual !== current.estoqueAtual;
    const montanteChanged =
      typeof patch.montanteAtual !== 'undefined' && patch.montanteAtual !== current.montanteAtual;

    if (estoqueChanged || montanteChanged) {
      let motivo = 'Abastecimento de Diesel';
      if (estoqueChanged && montanteChanged) {
        motivo = 'Alinhamento e Abastecimento de Diesel';
      } else if (montanteChanged) {
        motivo = 'Alinhamento de Diesel';
      }

      const log: CombustivelLog = {
        data: serverTimestamp(),
        motivo,
        motorista,
        local: merged.nomeBomba || 'Diesel Pátio',
        bombaId,
      };

      if (estoqueChanged) {
        log.diesel = merged.estoqueAtual ?? 0;
      }

      if (montanteChanged) {
        const oldMontante = current.montanteAtual ?? 0;
        const newMontante = merged.montanteAtual ?? 0;
        log.lf = newMontante;
        log.qa = Math.round(oldMontante - newMontante);
      }

      const logRef = doc(combustivelRef);
      transaction.set(logRef, log);
    }

    return {
      id: bombaId,
      ...merged,
    };
  });
}

export default { listBombas, updateBombaAndMaybeLog };