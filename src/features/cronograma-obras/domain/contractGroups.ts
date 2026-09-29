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
