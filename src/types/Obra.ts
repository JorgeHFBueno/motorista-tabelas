import type { Timestamp } from 'firebase/firestore';

export interface Obra {
  id: string;
  nome: string;
  descricao?: string;
  createdAt?: Timestamp | null;
}