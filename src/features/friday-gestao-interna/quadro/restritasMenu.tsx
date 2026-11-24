import { EyeOff } from 'lucide-react';
import type { ItemMenu } from '../ui/base.tsx';
import type { Coluna } from './tipos.ts';

// Menu e ícone das colunas restritas (restritas.ts), usados no cabeçalho da tabela e dos subitens.

/** Texto do ícone de coluna restrita. */
export const textoRestrita = (c: Coluna) => {
  const n = ((c.restrita as { ver?: string[] } | undefined)?.ver ?? []).length;
  return `Coluna restrita: só ${n} pessoa${n === 1 ? '' : 's'} e os adm2 veem e editam. Para os demais ela não aparece.`;
};
/** "Coluna restrita…" no menu da coluna: só adm2, fora de campo oficial. */
export function itemRestrita(adm2: boolean, c: Coluna, abrir: () => void): ItemMenu[] {
  if (!adm2 || c.oficial) return [];
  return [{ rotulo: c.restrita ? 'Coluna restrita (quem vê)…' : 'Restringir coluna…', icone: <EyeOff size={15} />, onClick: abrir }];
}
