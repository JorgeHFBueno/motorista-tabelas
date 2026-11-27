// Quadro ao vivo (2026-11-27): os itens gravados depois de abrir o quadro (por outra pessoa, pela API, como o Sunday e
// os robôs, ou por automação) chegam pela escuta de api.ts (observarItens) e entram aqui na tela, sem reler o quadro.
// Contrato: The Manuscript, 03_APLICACAO_WEB/13_FRIDAY_GESTAO_INTERNA.md ("Tempo real").
import type { Item } from './tipos.ts';
import type { Dados } from './useQuadro.ts';

const visivel = (i: Item) => i.arquivado_em == null && i.excluido_em == null;

/**
 * Encaixa itens novos ou alterados (já com os valores oficiais e restritos) e tira os removidos. Arquivado, na lixeira,
 * num grupo que não está na tela ou subitem de um item que não está na tela sai. Os contadores (atualizações, anexos)
 * ficam os da tela; o de subitens é recontado.
 */
export function encaixarItens(d: Dados, mudados: Item[], removidos: number[] = []): Dados {
  if (!mudados.length && !removidos.length) return d;
  const fora = new Set(removidos);
  const grupos = new Set(d.grupos.map(g => g.id));
  const aplicar = (lista: Item[], quadroId: number, cabe: (i: Item) => boolean) => {
    let l = lista.filter(i => !fora.has(i.id));
    for (const n of mudados.filter(i => Number(i.quadro_id) === quadroId)) {
      const antes = l.find(i => i.id === n.id);
      if (!visivel(n) || !cabe(n)) { if (antes) l = l.filter(i => i.id !== n.id); continue; }
      const novo: Item = { ...n, n_atualizacoes: antes?.n_atualizacoes ?? 0, atualizacoes_novas: antes?.atualizacoes_novas ?? false, n_anexos: antes?.n_anexos ?? 0, n_subitens: antes?.n_subitens ?? 0 };
      l = antes ? l.map(i => (i.id === n.id ? novo : i)) : [...l, novo];
    }
    return l;
  };
  const itens = aplicar(d.itens, Number(d.quadro.id), i => i.grupo_id == null || grupos.has(i.grupo_id));
  if (!d.sub) return { ...d, itens };
  const pais = new Set(itens.map(i => i.id));
  const subItens = aplicar(d.sub.itens, d.sub.quadro_id, s => pais.has(Number(s.item_pai_id))).filter(s => pais.has(Number(s.item_pai_id)));
  const nSub = new Map<number, number>();
  for (const s of subItens) nSub.set(Number(s.item_pai_id), (nSub.get(Number(s.item_pai_id)) ?? 0) + 1);
  return {
    ...d,
    itens: itens.map(i => ((nSub.get(i.id) ?? 0) === (i.n_subitens ?? 0) ? i : { ...i, n_subitens: nSub.get(i.id) ?? 0 })),
    sub: { ...d.sub, itens: subItens },
  };
}
