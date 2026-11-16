import { updateLoteStatus } from "../../../services/loteStatusService";
import { CronogramaFirestoreRepository } from "./cronogramaFirestore";
import type { FontesCronograma } from "./fontesCronograma";
import { FirestoreMestresDataSource } from "./mestresFirestore";
import { gravarPrioridadeLote } from "./prioridadeLote";
import { ObrasV2CronogramaDataSource } from "./source/obrasV2CronogramaDataSource";

/** O CronoObra de produção: obras-v2, monday-mestres e monday-cronograma no Firestore; Status pela Function do Friday. */
export const FONTES_FIRESTORE: FontesCronograma = {
  contratos: new ObrasV2CronogramaDataSource(),
  mestres: new FirestoreMestresDataSource(),
  alocacoes: new CronogramaFirestoreRepository(),
  gravarPrioridadeLote,
  gravarStatusLote: (contratoId, loteId, status) => updateLoteStatus(contratoId, loteId, status),
};
