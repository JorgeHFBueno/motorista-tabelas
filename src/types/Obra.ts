import type { Timestamp } from 'firebase/firestore';

export interface Obra {
  id: string;
  nome: string;
  local?: string;
  aka?: string;
  ativa: boolean;
  descricao?: string;
  createdAt?: Timestamp | null;
}

export type ObraFormData = {
  nome: string;
  local: string;
  aka: string;
};
