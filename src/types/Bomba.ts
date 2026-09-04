import type { Timestamp } from 'firebase/firestore';

export interface BombaResponsavel {
  id: string;
  nome: string;
}

export interface BombaUltimaEntrada {
  movimentoId: string;
  data: Timestamp | Date;
  litrosComprados: number;
  preco: number;
  precoLitro: number;
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
