export const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const;
/** O Monday fornece o status como texto livre; a UI o apresenta sem reinterpretá-lo. */
export type CronogramaStatus = string;
export type ZoomCronograma = 'day' | 'week' | 'month' | 'year';
/** Datas do domínio são sempre civis, no formato YYYY-MM-DD. */
export type CivilDate = string;
/** Formato de importação da planilha legado; não é exposto à UI. */
export interface RawCronogramaObra { sourceRow: number; local: string; status: CronogramaStatus; contrato: string | null; empresa: string; mestre: string | null; prev: string | null; dias: string | null; progresso: string | null; descricao: string | null; allocations: ReadonlyArray<readonly [weekIndex: number, days: number]>; }
/** mestreKey is local today; a future source may provide the preferred uid. */
export interface MestrePlanejado { localId: string; mestreId?: string; mestreKey?: string; nome: string; inicio: CivilDate; tempoPlanejado: number; }
export interface ObraCatalogo { id: string; targetType?: 'obra' | 'contrato'; allocationAllowed?: boolean; sourceRow: number; contratoId?: string; contratoNome?: string; codObra: string; siglaObra: string; nomeObra: string; local: string; status: CronogramaStatus; empresa: string; mestreInicial: string | null; descricao: string | null; }
/** The work planning period comes from its parent contract and can be absent. */
export interface ObraCronograma extends ObraCatalogo { inicioPlanejado: CivilDate | null; tempoPlanejado: number | null; mestresPlanejados: MestrePlanejado[]; }
export interface ContratoCronograma { id: string; nome: string; empresa: string; status: CronogramaStatus; numeroContrato: string | null; ano: number | null; inicio: CivilDate | null; fim: CivilDate | null; obraV2Id: string | null; rawDocument: unknown; obras: ObraCronograma[]; }
export interface MestreWorkload { mestre: string; obras: ObraCronograma[]; diasProgramados: number; freeDays: number; conflictDays: number; daily: Array<{ date: CivilDate; obras: ObraCronograma[]; conflict: boolean }>; weekly: Array<{ start: CivilDate; days: number; obras: ObraCronograma[]; conflict: boolean }>; }
export interface CronogramaFilters { search: string; status: string; empresa: string; mestre: string; period: string; }
export interface CronogramaIndicators { running: number; waiting: number; allocated: number; unassigned: number; conflicts: number; }
