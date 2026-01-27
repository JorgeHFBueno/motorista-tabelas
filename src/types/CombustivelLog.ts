import type { FieldValue } from 'firebase/firestore';

export interface CombustivelLog {
  data: FieldValue;
  diesel?: number;
  lf?: number;
  qa?: number;
  motivo: string;
  motorista: string;
  local: string;
  bombaId: string;
}