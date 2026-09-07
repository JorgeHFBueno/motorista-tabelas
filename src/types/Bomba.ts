import type { Timestamp } from 'firebase/firestore';
import type { StoredMoneyCents, StoredVolumeX10 } from '../utils/bombasDomain';

export interface BombaResponsavel {
  id: string;
  nome: string;
}

export interface BombaUltimaEntrada {
  /** Present only for the new monetary contract; absent means legacy data. */
  schemaVersion?: number;
  movimentoId: string;
  data: Timestamp | Date;
  /** Persisted volume in liters ×10. */
  litrosComprados: StoredVolumeX10;
  /** Persisted money in cents (reais ×100). */
  preco: StoredMoneyCents;
  /** Informational persisted snapshot in cents per liter. */
  precoLitro: StoredMoneyCents;
  lote: string;
  responsavel: BombaResponsavel;
}

export interface BombaUltimaMovimentacao {
  movimentoId: string;
  tipo: string;
  data: Timestamp | Date;
}

export interface Bomba {
  id: string;
  nomeBomba?: string;
  nome?: string;
  descricao?: string;
  ativo?: boolean;
  capacidadeLitros?: number;
  estoqueAtual?: number;
  montanteAtual?: number;
  folgaLitros?: number;
  ultimoAbastecimento?: Timestamp | Date | null;
  ultimoFrentista?: string;
  ultimaEntrada?: BombaUltimaEntrada;
  ultimaMovimentacao?: BombaUltimaMovimentacao;
  atualizadoEm?: Timestamp | Date | null;
}
