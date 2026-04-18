import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface VeiculoOption {
  id: string;
  identificador: string;
  categoria: string;
  quilometragemUltima: number | null;
}

export type VeiculoCategoria = 'PLACA' | 'EXTRA';

export interface CreateVeiculoInput {
  categoria: VeiculoCategoria;
  placa?: string;
  extra?: string;
  complemento?: string;
  quilometragemInicial: number;
}

export class VeiculoCadastroError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VeiculoCadastroError';
  }
}

function normalizePrincipalValue(value: string | undefined): string {
  return value?.trim() ?? '';
}

export async function listVeiculosAtivos(): Promise<VeiculoOption[]> {
  // Query simplificada para reduzir dependÃªncia de Ã­ndice composto no Firestore.
  const snapshot = await getDocs(collection(db, 'veiculos'));

  return snapshot.docs
    .map((docSnapshot) => {
      const data = docSnapshot.data() as {
        identificador?: unknown;
        ativo?: unknown;
        categoria?: unknown;
        quilometragemUltima?: unknown;
      };
      if (data.ativo !== true) return null;
      const identificador = typeof data.identificador === 'string' ? data.identificador.trim() : '';
      if (!identificador) return null;

      const quilometragemUltima =
        typeof data.quilometragemUltima === 'number' && Number.isFinite(data.quilometragemUltima)
          ? Math.trunc(data.quilometragemUltima)
          : null;

      return {
        id: docSnapshot.id,
        identificador,
        categoria: typeof data.categoria === 'string' ? data.categoria : '',
        quilometragemUltima,
      };
    })
    .filter((item): item is VeiculoOption => item !== null)
    .sort((a, b) => a.identificador.localeCompare(b.identificador));
}

export function buildVeiculoCadastro(input: CreateVeiculoInput) {
  const categoria = input.categoria;
  const placa = normalizePrincipalValue(input.placa);
  const extra = normalizePrincipalValue(input.extra);
  const complemento = normalizePrincipalValue(input.complemento);
  const identificador = categoria === 'PLACA' ? placa : extra;

  if (!categoria) {
    throw new VeiculoCadastroError('Selecione a categoria do veÃ­culo.');
  }

  if (!identificador) {
    throw new VeiculoCadastroError('Informe um identificador vÃ¡lido para o veÃ­culo.');
  }

  if (!Number.isInteger(input.quilometragemInicial) || input.quilometragemInicial < 0) {
    throw new VeiculoCadastroError('A quilometragem inicial deve ser um inteiro maior ou igual a zero.');
  }

  const payloadBase = {
    ativo: true,
    categoria,
    identificador,
    quilometragemInicial: input.quilometragemInicial,
    complemento,
    dataUltimaAtualizacao: serverTimestamp(),
  };

  const payload =
    categoria === 'PLACA'
      ? {
          ...payloadBase,
          placa,
        }
      : {
          ...payloadBase,
          extra,
        };

  return {
    documentId: identificador,
    payload,
  };
}

export async function createVeiculo(input: CreateVeiculoInput) {
  const { documentId, payload } = buildVeiculoCadastro(input);
  const reference = doc(db, 'veiculos', documentId);
  const existingDoc = await getDoc(reference);

  if (existingDoc.exists()) {
    throw new VeiculoCadastroError('JÃ¡ existe um veÃ­culo cadastrado com esse identificador.');
  }

  await setDoc(reference, payload);

  return {
    id: documentId,
  };
}
