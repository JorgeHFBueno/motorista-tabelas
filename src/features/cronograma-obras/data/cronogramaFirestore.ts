import { collection, deleteDoc, deleteField, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../../firebase';
import { reconcileAlocacoes, type AlocacaoChange } from './alocacaoReconciliation';
export { reconcileAlocacoes, type AlocacaoChange } from './alocacaoReconciliation';

import type { NaoTrabalhado } from '../domain/naoTrabalhados';

export const CRONOGRAMA_COLLECTION = 'monday-cronograma';

export type AlocacaoFirestore = {
  id: string;
  obraId?: string;
  contratoId: string;
  mestreId: string;
  inicio: string;
  tempoPlanejado: number;
  /** Dias NT (não trabalhados) dentro do período; ausente = nenhum. */
  naoTrabalhados?: NaoTrabalhado[];
  criadoPorFuncionarioId: string;
};

export type CreateAlocacao = Omit<AlocacaoFirestore, 'id'>;
/** `naoTrabalhados: undefined` apaga o campo. */
export type UpdateAlocacao = Partial<Pick<AlocacaoFirestore, 'obraId' | 'contratoId' | 'mestreId' | 'inicio' | 'tempoPlanejado' | 'naoTrabalhados'>>;

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

  /** With `id`, the reference of that allocation (Ctrl+Z recreates it with the same ID). */
  createAlocacaoReference(id?: string) {
    const alocacoes = collection(this.firestore, CRONOGRAMA_COLLECTION);
    return id ? doc(alocacoes, id) : doc(alocacoes);
  }

  async createAlocacao(input: CreateAlocacao, reference = this.createAlocacaoReference()): Promise<string> {
    const { naoTrabalhados, ...rest } = input;
    await setDoc(reference, { ...rest, ...(naoTrabalhados?.length ? { naoTrabalhados } : {}), criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
    return reference.id;
  }

  async updateAlocacao(id: string, patch: UpdateAlocacao): Promise<void> {
    const nt = 'naoTrabalhados' in patch ? { naoTrabalhados: patch.naoTrabalhados?.length ? patch.naoTrabalhados : deleteField() } : {};
    await updateDoc(doc(this.firestore, CRONOGRAMA_COLLECTION, id), { ...patch, ...nt, atualizadoEm: serverTimestamp() });
  }

  async deleteAlocacao(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, CRONOGRAMA_COLLECTION, id));
  }
}
