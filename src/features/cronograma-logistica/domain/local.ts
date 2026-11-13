// Local de uma programação: o link do Google Maps colado, lido pela Function logisticaLocal (coordenada, cidade e
// estado). Contrato: The Manuscript, 03_APLICACAO_WEB/15_LOGISTICA.md.
import type { LocalProgramacao } from './models';

/** Coordenada simplificada: 4 casas (uns 10 m). */
export const coordenadaCurta = (local: Pick<LocalProgramacao, 'lat' | 'lng'>) => `${local.lat.toFixed(4)}, ${local.lng.toFixed(4)}`;

/** "Cidade - UF - -29.1678, -51.1794"; sem cidade ou estado, o que houver. */
export function textoLocal(local: LocalProgramacao): string {
  return [local.cidade, local.uf, coordenadaCurta(local)].filter(Boolean).join(' - ');
}

/** O Google Maps com o pino na coordenada gravada. */
export function linkDoMapa(local: Pick<LocalProgramacao, 'lat' | 'lng'>): string {
  return `https://www.google.com/maps/search/?api=1&query=${local.lat}%2C${local.lng}`;
}
