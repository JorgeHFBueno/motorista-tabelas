import type { ObraCronograma } from '../../domain/models';
export interface CronogramaDataSource { listarItensCronograma(): ObraCronograma[]; }
