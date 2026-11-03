import {
  addDoc, collection, deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import type { Programacao, ProgramacaoEditavel, RefCadastro, RefPessoa, Semana } from '../domain/models';
import { semanaDoId, semanaIdValido } from '../domain/semanas';

// Cronograma Logístico (The Manuscript, 01_FIRESTORE/COLECOES/logistica.md). Só adm2 lê e grava.
export const SEMANAS = 'logistica-semanas';
export const PROGRAMACOES = 'logistica-programacoes';

const data = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
const texto = (value: unknown) => (typeof value === 'string' ? value : '');

function refPessoa(value: unknown): RefPessoa | null {
  const ref = value as { uid?: unknown; nome?: unknown } | null;
  return ref && typeof ref.uid === 'string' && ref.uid ? { uid: ref.uid, nome: texto(ref.nome) } : null;
}

function refCadastro(value: unknown): RefCadastro | null {
  const ref = value as { id?: unknown; nome?: unknown } | null;
  return ref && typeof ref.id === 'string' && ref.id ? { id: ref.id, nome: texto(ref.nome) } : null;
}

export function programacaoDoDocumento(id: string, value: Record<string, unknown>): Programacao | null {
  if (typeof value.semanaId !== 'string') return null;
  return {
    id,
    semanaId: value.semanaId,
    item: texto(value.item),
    status: texto(value.status),
    inicio: data(value.inicio),
    fim: data(value.fim),
    motorista: refPessoa(value.motorista),
    auxiliar: refPessoa(value.auxiliar),
    veiculo: refCadastro(value.veiculo),
    obra: refCadastro(value.obra),
    posicao: typeof value.posicao === 'number' ? value.posicao : 0,
  };
}

export function observarSemanas(onData: (semanas: Semana[]) => void, onError: (error: Error) => void) {
  return onSnapshot(collection(db, SEMANAS), (snapshot) => {
    onData(snapshot.docs
      .filter((item) => semanaIdValido(item.id))
      .map((item) => {
        const value = item.data();
        const semana = semanaDoId(item.id);
        return { id: item.id, inicio: data(value.inicio) ?? semana.inicio, fim: data(value.fim) ?? semana.fim, abertura: value.abertura === 'manual' ? 'manual' : 'automatica' };
      }));
  }, onError);
}

export function observarProgramacoes(onData: (programacoes: Programacao[]) => void, onError: (error: Error) => void) {
  return onSnapshot(collection(db, PROGRAMACOES), (snapshot) => {
    onData(snapshot.docs
      .map((item) => programacaoDoDocumento(item.id, item.data()))
      .filter((item): item is Programacao => item !== null));
  }, onError);
}

/** Cria a semana se ainda não existir; quem chegar depois (outra aba, outro usuário) não faz nada. */
export async function abrirSemana(semanaId: string, abertura: Semana['abertura'], uid: string): Promise<void> {
  const semana = semanaDoId(semanaId);
  const ref = doc(db, SEMANAS, semanaId);
  await runTransaction(db, async (transaction) => {
    if ((await transaction.get(ref)).exists()) return;
    transaction.set(ref, { schemaVersion: 1, inicio: semana.inicio, fim: semana.fim, abertura, criadoPorUid: uid, criadoEm: serverTimestamp() });
  });
}

export async function criarProgramacao(semanaId: string, item: string, posicao: number, uid: string): Promise<string> {
  const ref = await addDoc(collection(db, PROGRAMACOES), {
    schemaVersion: 1, semanaId, item, status: '', inicio: null, fim: null,
    motorista: null, auxiliar: null, veiculo: null, obra: null, posicao,
    criadoPorUid: uid, criadoEm: serverTimestamp(), atualizadoPorUid: uid, atualizadoEm: serverTimestamp(),
  });
  return ref.id;
}

export async function atualizarProgramacao(id: string, alteracao: Partial<ProgramacaoEditavel>, uid: string): Promise<void> {
  await updateDoc(doc(db, PROGRAMACOES, id), { ...alteracao, atualizadoPorUid: uid, atualizadoEm: serverTimestamp() });
}

export async function excluirProgramacao(id: string): Promise<void> {
  await deleteDoc(doc(db, PROGRAMACOES, id));
}
