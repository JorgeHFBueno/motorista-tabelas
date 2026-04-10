import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';

const FORNECEDORES_COLLECTION = 'notas-fornecedores';
const FORNECEDORES_NUMEROS_COLLECTION = 'notas-fornecedores-numeros';
const FORNECEDORES_COUNTER_DOC = 'app-metadata/notas-fornecedores-numero';

export class FornecedorNumeroDuplicadoError extends Error {
  constructor(numero: number) {
    super(`O numero ${numero} ja esta em uso por outro fornecedor.`);
    this.name = 'FornecedorNumeroDuplicadoError';
  }
}

export class FornecedorNumeroInvalidoError extends Error {
  constructor() {
    super('Informe um numero inteiro positivo para o fornecedor.');
    this.name = 'FornecedorNumeroInvalidoError';
  }
}

export const normalizeFornecedorNumero = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
};

const collectUsedNumeros = async () => {
  const snapshot = await getDocs(collection(db, FORNECEDORES_COLLECTION));
  const usedNumeros = new Map<number, string[]>();
  let maxNumero = 0;

  snapshot.docs.forEach((docSnap) => {
    const numero = normalizeFornecedorNumero(docSnap.data().numero);
    if (!numero) return;
    maxNumero = Math.max(maxNumero, numero);
    usedNumeros.set(numero, [...(usedNumeros.get(numero) ?? []), docSnap.id]);
  });

  return { usedNumeros, maxNumero };
};

const getCadastroPayload = (nome: string, descricao: string) => ({
  nome: nome.trim(),
  descricao: descricao.trim(),
});

export const createFornecedorComNumero = async (values: { nome: string; descricao: string }) => {
  const { usedNumeros, maxNumero } = await collectUsedNumeros();

  return runTransaction(db, async (transaction) => {
    const counterRef = doc(db, FORNECEDORES_COUNTER_DOC);
    const fornecedorRef = doc(collection(db, FORNECEDORES_COLLECTION));
    const counterSnap = await transaction.get(counterRef);
    const counterNumero = normalizeFornecedorNumero(counterSnap.data()?.ultimoNumero) ?? 0;

    let nextNumero = Math.max(maxNumero, counterNumero) + 1;
    while (usedNumeros.has(nextNumero)) {
      nextNumero += 1;
    }

    const numeroRef = doc(db, FORNECEDORES_NUMEROS_COLLECTION, String(nextNumero));
    const numeroSnap = await transaction.get(numeroRef);
    if (numeroSnap.exists()) {
      throw new FornecedorNumeroDuplicadoError(nextNumero);
    }

    transaction.set(fornecedorRef, {
      ...getCadastroPayload(values.nome, values.descricao),
      numero: nextNumero,
      createdAt: serverTimestamp(),
    });
    transaction.set(numeroRef, {
      fornecedorId: fornecedorRef.id,
      numero: nextNumero,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(counterRef, {
      ultimoNumero: nextNumero,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return { id: fornecedorRef.id, numero: nextNumero };
  });
};

export const updateFornecedorCadastro = async (values: {
  id: string;
  nome: string;
  descricao: string;
  numero: unknown;
  numeroAtual?: unknown;
}) => {
  const numero = normalizeFornecedorNumero(values.numero);
  if (!numero) {
    throw new FornecedorNumeroInvalidoError();
  }

  const { usedNumeros } = await collectUsedNumeros();
  const outrosIdsComMesmoNumero = (usedNumeros.get(numero) ?? []).filter((id) => id !== values.id);
  if (outrosIdsComMesmoNumero.length > 0) {
    throw new FornecedorNumeroDuplicadoError(numero);
  }

  return runTransaction(db, async (transaction) => {
    const fornecedorRef = doc(db, FORNECEDORES_COLLECTION, values.id);
    const numeroRef = doc(db, FORNECEDORES_NUMEROS_COLLECTION, String(numero));
    const fornecedorSnap = await transaction.get(fornecedorRef);
    const numeroSnap = await transaction.get(numeroRef);

    if (!fornecedorSnap.exists()) {
      throw new Error('Fornecedor nao encontrado.');
    }

    const currentData = fornecedorSnap.data() as DocumentData;
    const numeroAtual = normalizeFornecedorNumero(values.numeroAtual) ?? normalizeFornecedorNumero(currentData.numero);
    const numeroAtualRef = numeroAtual && numeroAtual !== numero
      ? doc(db, FORNECEDORES_NUMEROS_COLLECTION, String(numeroAtual))
      : null;
    const numeroAtualSnap = numeroAtualRef ? await transaction.get(numeroAtualRef) : null;

    if (numeroSnap.exists()) {
      const indexedFornecedorId = numeroSnap.data().fornecedorId;
      if (indexedFornecedorId && indexedFornecedorId !== values.id) {
        throw new FornecedorNumeroDuplicadoError(numero);
      }
    }

    if (numeroAtualSnap?.exists() && numeroAtualSnap.data().fornecedorId === values.id) {
      transaction.delete(numeroAtualRef!);
    }

    transaction.update(fornecedorRef, {
      ...getCadastroPayload(values.nome, values.descricao),
      numero,
      updatedAt: serverTimestamp(),
    });
    transaction.set(numeroRef, {
      fornecedorId: values.id,
      numero,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
};

export const getFornecedorNumeroErrorMessage = (error: unknown) => {
  if (error instanceof FornecedorNumeroDuplicadoError || error instanceof FornecedorNumeroInvalidoError) {
    return error.message;
  }
  return null;
};
