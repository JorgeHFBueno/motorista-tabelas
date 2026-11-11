import { doc, FieldPath, updateDoc } from "firebase/firestore";
import { db } from "../../../firebase";

/**
 * Grava só `obras-v2/{contrato}.lotes.{lote}.prioridade` (ordem em "Próxima a iniciar").
 * As Rules deixam `engenharia` mudar só esse campo de um LOTE por gravação.
 */
export function gravarPrioridadeLote(contratoId: string, loteId: string, prioridade: number): Promise<void> {
  return updateDoc(doc(db, "obras-v2", contratoId), new FieldPath("lotes", loteId, "prioridade"), prioridade);
}
