import type { ObraCronograma } from './models';

export interface ContractGroup { id: string; name: string; obras: ObraCronograma[]; }

/** Keeps the source order, including a stable group for works without a contract. */
export function groupObrasByContract(obras: readonly ObraCronograma[]): ContractGroup[] {
  const groups = new Map<string, ContractGroup>();
  obras.forEach((obra) => {
    const id = obra.contratoId ?? 'sem-contrato';
    const name = obra.contratoNome?.trim() || 'Sem contrato';
    const current = groups.get(id);
    if (current) current.obras.push(obra);
    else groups.set(id, { id, name, obras: [obra] });
  });
  return [...groups.values()];
}

/**
 * The collapsed contract timeline is derived from every hydrated child obra,
 * never from the rows currently mounted by the UI.
 */
export function contractAllocationSummary(obras: readonly ObraCronograma[]): ObraCronograma | null {
  const first = obras[0];
  if (!first) return null;
  return { ...first, id: `contract-summary-${obras.map((obra) => obra.id).join('-')}`, mestresPlanejados: obras.flatMap((obra) => obra.mestresPlanejados) };
}
