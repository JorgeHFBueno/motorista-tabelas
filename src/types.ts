export interface Registro {
  id: string;
  data?: any;
  lf?: number;
  qa?: number;
  li?: number;
  arla?: number;
  diesel?: number;
  motorista?: string;
  para_quem?: string;
  placa?: string;
  local?: string;
  motivo?: string;
  observacao?: string;
  obra?: string;
  km?: number | string | null;
  semKm?: string;
  tipoPlaca?: boolean;
}
