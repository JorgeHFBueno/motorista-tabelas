import type { ObraCatalogo, ObraCronograma } from '../../domain/models';
export interface CronogramaDataSource { listarObrasDisponiveis(): ObraCatalogo[]; listarItensCronograma(): ObraCronograma[]; }
