export const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const;
export type CronogramaStatus = 'EM ANDAMENTO' | 'AGUARDANDO RECURSO' | 'FINALIZADA' | 'FINALIZADO';
export type ZoomCronograma = 'day' | 'week' | 'month' | 'year';
/** Datas do domínio são sempre civis, no formato YYYY-MM-DD. */
export type CivilDate = string;
/** Formato de importação da planilha legado; não é exposto à UI. */
export interface RawCronogramaObra { sourceRow: number; local: string; status: CronogramaStatus; contrato: string | null; empresa: string; mestre: string | null; prev: string | null; dias: string | null; progresso: string | null; descricao: string | null; allocations: ReadonlyArray<readonly [weekIndex: number, days: number]>; }
/** mestreKey is local today; a future source may provide the preferred uid. */
export interface MestrePlanejado { localId: string; mestreKey?: string; nome: string; inicio: CivilDate; tempoPlanejado: number; }
export interface ObraCatalogo { id: string; sourceRow: number; codObra: string; siglaObra: string; nomeObra: string; local: string; status: CronogramaStatus; empresa: string; mestreInicial: string | null; descricao: string | null; }
export interface ObraCronograma extends ObraCatalogo { inicioPlanejado: CivilDate; tempoPlanejado: number; mestresPlanejados: MestrePlanejado[]; }
export interface MestreWorkload { mestre: string; obras: ObraCronograma[]; diasProgramados: number; freeDays: number; conflictDays: number; daily: Array<{ date: CivilDate; obras: ObraCronograma[]; conflict: boolean }>; weekly: Array<{ start: CivilDate; days: number; obras: ObraCronograma[]; conflict: boolean }>; }
export interface CronogramaFilters { search: string; status: string; empresa: string; mestre: string; period: string; }
export interface CronogramaIndicators { running: number; waiting: number; allocated: number; unassigned: number; conflicts: number; }
