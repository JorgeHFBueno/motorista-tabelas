export const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const;
export const TOTAL_WEEKS = 48;

export type CronogramaStatus = 'EM ANDAMENTO' | 'AGUARDANDO RECURSO' | 'FINALIZADA' | 'FINALIZADO';
export type DataQualityCode =
  | 'MISSING_MASTER'
  | 'MISSING_PREV'
  | 'INVALID_PROGRESS'
  | 'PROGRESS_OVER_100'
  | 'INVALID_CONTRACT'
  | 'POSSIBLE_MASTER_ALIAS';

export interface DataQualityIssue {
  code: DataQualityCode;
  message: string;
  severity: 'info' | 'warning';
}

export interface RawCronogramaObra {
  sourceRow: number;
  local: string;
  status: CronogramaStatus;
  contrato: string | null;
  empresa: string;
  mestre: string | null;
  prev: string | null;
  dias: string | null;
  progresso: string | null;
  descricao: string | null;
  allocations: ReadonlyArray<readonly [weekIndex: number, days: number]>;
}

export interface WeeklyAllocation {
  weekIndex: number;
  monthIndex: number;
  weekOfMonth: number;
  days: number;
}

export interface ObraCronograma {
  id: string;
  sourceRow: number;
  local: string;
  status: CronogramaStatus;
  contrato: string | null;
  empresa: string;
  mestre: string | null;
  previsaoDias: number | null;
  diasRealizados: number | null;
  progressRaw: string | null;
  progressPercent: number | null;
  descricao: string | null;
  allocations: WeeklyAllocation[];
  issues: DataQualityIssue[];
}

export interface MestreWorkload {
  mestre: string;
  obras: ObraCronograma[];
  weekly: Array<{ weekIndex: number; days: number; obras: ObraCronograma[]; conflict: boolean }>;
  occupiedWeeks: number;
  freeWeeks: number;
  conflictWeeks: number;
  loadPercent: number;
}

export interface CronogramaFilters {
  search: string;
  status: string;
  empresa: string;
  mestre: string;
  period: string;
}

