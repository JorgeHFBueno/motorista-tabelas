import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../../firebase';
import { reconcileAlocacoes, type AlocacaoChange } from './alocacaoReconciliation';
export { reconcileAlocacoes, type AlocacaoChange } from './alocacaoReconciliation';

export const CRONOGRAMA_COLLECTION = 'monday-cronograma';

export type AlocacaoFirestore = {
  id: string;
  obraId?: string;
  contratoId: string;
  mestreId: string;
  inicio: string;
  tempoPlanejado: number;
  criadoPorFuncionarioId: string;
};

export type CreateAlocacao = Omit<AlocacaoFirestore, 'id'>;
export type UpdateAlocacao = Partial<Pick<AlocacaoFirestore, 'obraId' | 'contratoId' | 'mestreId' | 'inicio' | 'tempoPlanejado'>>;

function valid(data: unknown, id: string): AlocacaoFirestore | null {
  const value = data as Partial<AlocacaoFirestore>;
  if (!value || (value.obraId !== undefined && typeof value.obraId !== 'string') || typeof value.contratoId !== 'string' || typeof value.mestreId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.inicio ?? '') || !Number.isInteger(value.tempoPlanejado) || value.tempoPlanejado < 1 || typeof value.criadoPorFuncionarioId !== 'string' || !value.criadoPorFuncionarioId) return null;
  return { id, ...(typeof value.obraId === 'string' ? { obraId: value.obraId } : {}), contratoId: value.contratoId, mestreId: value.mestreId, inicio: value.inicio, tempoPlanejado: value.tempoPlanejado, criadoPorFuncionarioId: value.criadoPorFuncionarioId };
}

export class CronogramaFirestoreRepository {
  constructor(private readonly firestore: Firestore = db) {}

  subscribeAlocacoes(onData: (alocacoes: AlocacaoFirestore[]) => void, onError: (cause: Error) => void): Unsubscribe {
    let current: AlocacaoFirestore[] = [];
    return onSnapshot(collection(this.firestore, CRONOGRAMA_COLLECTION), (snapshot) => {
      current = reconcileAlocacoes(current, snapshot.docChanges().map((change) => ({ type: change.type, id: change.doc.id, data: change.doc.data() })));
      onData(current);
    }, (cause) => onError(cause));
  }

  createAlocacaoReference() {
    return doc(collection(this.firestore, CRONOGRAMA_COLLECTION));
  }

  async createAlocacao(input: CreateAlocacao, reference = this.createAlocacaoReference()): Promise<string> {
    await setDoc(reference, { ...input, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
    return reference.id;
  }

  async updateAlocacao(id: string, patch: UpdateAlocacao): Promise<void> {
    await updateDoc(doc(this.firestore, CRONOGRAMA_COLLECTION, id), { ...patch, atualizadoEm: serverTimestamp() });
  }

  async deleteAlocacao(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, CRONOGRAMA_COLLECTION, id));
  }
}
