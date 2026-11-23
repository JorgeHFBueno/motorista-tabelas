import type { ApoioAlocacao, ObraCronograma } from "./models";
import { addDays } from "./temporal";

/**
 * Apoio ("ajuda por fora", 2026-11-23): uma alocação de `monday-cronograma` com o campo `apoio`, no LOTE que recebeu
 * a ajuda. O mestre continua designado à obra de origem (sem NT); o apoio é só visual, para controle.
 */

/** Lê o campo `apoio` do Firestore; fora do formato, `undefined` (a alocação vale como normal). */
export function lerApoio(value: unknown): ApoioAlocacao | undefined {
  const v = value as Partial<ApoioAlocacao> | null | undefined;
  if (!v || typeof v !== "object" || typeof v.alocacaoId !== "string" || !v.alocacaoId || typeof v.contratoId !== "string" || !v.contratoId) return undefined;
  if (v.obraId !== undefined && (typeof v.obraId !== "string" || !v.obraId)) return undefined;
  return { alocacaoId: v.alocacaoId, contratoId: v.contratoId, ...(v.obraId ? { obraId: v.obraId } : {}) };
}

/** Um apoio prestado, visto do período de origem: dias e para qual obra. */
export type ApoioPrestado = { localId: string; inicio: string; dias: number; destino: string };

/** Apoios prestados por período de origem (`alocacaoId`), com o nome do LOTE/obra que recebeu a ajuda. */
export function apoiosPorOrigem(obras: readonly ObraCronograma[]): Map<string, ApoioPrestado[]> {
  const mapa = new Map<string, ApoioPrestado[]>();
  obras.forEach((obra) => obra.mestresPlanejados.forEach((item) => {
    if (!item.apoio) return;
    const destino = obra.contratoNome && obra.contratoNome !== obra.nomeObra ? `${obra.nomeObra} (${obra.contratoNome})` : obra.nomeObra;
    mapa.set(item.apoio.alocacaoId, [...(mapa.get(item.apoio.alocacaoId) ?? []), { localId: item.localId, inicio: item.inicio, dias: item.tempoPlanejado, destino }]);
  }));
  return mapa;
}

/** "24/11" ou "24/11 a 26/11". */
export function periodoCurto(inicio: string, dias: number): string {
  const curta = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
  return dias <= 1 ? curta(inicio) : `${curta(inicio)} a ${curta(addDays(inicio, dias - 1))}`;
}
