import type { Timestamp } from 'firebase/firestore';

export interface Bomba {
  id: string;
  nomeBomba?: string;
  ativo?: boolean;
  capacidadeLitros?: number;
  estoqueAtual?: number;
  montanteAtual?: number;
  folgaLitros?: number;
  ultimoAbastecimento?: Timestamp | null;
  ultimoFrentista?: string;
}