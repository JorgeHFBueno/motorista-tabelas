export type ChecklistSaidaStatus = 'ok' | 'avaria' | 'nao_aplicavel' | 'nao_informado' | string;

export interface AtividadeSaida {
  id: string;
  data?: unknown;
  destino?: string;
  km?: number | string;
  motivo?: string;
  motorista?: string;
  placa?: string;
  tipo?: string;
  checklistSaidaConcluido?: boolean;
  checklistSaidaTotalItens?: number;
  checklistSaidaItensComAvaria?: number;
  checklistSaidaCriadoEm?: unknown;
  checklistSaidaVersao?: string | number;
  checklistSaidaGuincho?: boolean;
}

export interface ChecklistSaidaItem {
  id: string;
  itemId?: string;
  titulo?: string;
  etapa?: string;
  status?: ChecklistSaidaStatus;
  observacao?: string;
  fotoObrigatoria?: boolean;
  storagePath?: string;
  downloadUrl?: string;
  criadoEm?: unknown;
  criadoPorUid?: string;
  ordem?: number;
}
