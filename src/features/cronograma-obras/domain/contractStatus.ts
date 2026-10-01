import type { ObraCronograma } from './models';

/** Administrative sections are decided by the exact status of each LOTE. */
export type SituacaoLote = 'iniciada' | 'nao-iniciada' | 'finalizada';

const INICIADAS = new Set(['Em andamento', 'Parada']);
const FINALIZADAS = new Set(['Finalizado']);
const NAO_INICIADAS = new Set(['Não iniciada', 'Revisar escopo']);

export function classificarLotePorStatus(status: string): SituacaoLote {
  if (INICIADAS.has(status)) return 'iniciada';
  if (FINALIZADAS.has(status)) return 'finalizada';
  if (NAO_INICIADAS.has(status)) return 'nao-iniciada';
  // Unknown values stay visible rather than silently disappearing.
  return 'nao-iniciada';
}

export function statusLoteConhecido(status: string): boolean {
  return INICIADAS.has(status) || FINALIZADAS.has(status) || NAO_INICIADAS.has(status);
}

/** A synthetic review row has no operational LOTE and is always not started. */
export function classificarObraPorSituacao(obra: ObraCronograma): SituacaoLote {
  return obra.targetType === 'contrato' ? 'nao-iniciada' : classificarLotePorStatus(obra.status);
}

export function separarObrasPorSituacao(obras: readonly ObraCronograma[]): Record<SituacaoLote, ObraCronograma[]> {
  const result: Record<SituacaoLote, ObraCronograma[]> = { iniciada: [], 'nao-iniciada': [], finalizada: [] };
  obras.forEach((obra) => result[classificarObraPorSituacao(obra)].push(obra));
  return result;
}
