import type { KeyboardEvent, RefObject } from 'react';
import { PecaView } from './PecaView';
import { corDe, nomeCasa, type Lance, type Posicao } from './regras';

const NOME_PECA: Record<string, string> = { p: 'peao', r: 'torre', n: 'cavalo', b: 'bispo', q: 'dama', k: 'rei' };

type Props = {
  pos: Posicao;
  ultimo: Lance | null;
  selecionada: number | null;
  /** os lances da peça escolhida */
  destinos: Lance[];
  /** a sua vez: as casas entram no Tab */
  ativo: boolean;
  /** a casa do rei em xeque, ou -1 */
  xeque: number;
  /** de pretas: o tabuleiro gira (as suas peças embaixo) */
  invertido?: boolean;
  tabuleiro: RefObject<HTMLDivElement | null>;
  onCasa: (i: number) => void;
};

// O tabuleiro do xadrez (contra o bot e online): casas como botões; setas andam pelas casas (na direção da tela, com o
// tabuleiro girado também) e Enter ou espaço escolhem a peça e a casa.
export function TabuleiroXadrez({ pos, ultimo, selecionada, destinos, ativo, xeque, invertido = false, tabuleiro, onCasa }: Props) {
  const setas = (e: KeyboardEvent) => {
    // Enter e espaço ficam com a casa (o clique dela); o teclado dos jogos, acima, os pegaria
    if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); return; }
    const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[e.key];
    const atual = Number((document.activeElement as HTMLElement | null)?.dataset.casa);
    if (!passo || Number.isNaN(atual)) return;
    e.preventDefault();
    e.stopPropagation();
    const d = invertido ? -passo : passo;
    const prox = atual + d;
    if (prox < 0 || prox > 63 || (Math.abs(d) === 1 && (prox >> 3) !== (atual >> 3))) return;
    tabuleiro.current?.querySelector<HTMLButtonElement>(`[data-casa="${prox}"]`)?.focus();
  };

  const casas = pos.tab.map((p, i) => ({ p, i }));
  return (
    <div className="dt-xz-tabuleiro" ref={tabuleiro} role="grid" aria-label="Tabuleiro" onKeyDown={setas}>
      {(invertido ? casas.reverse() : casas).map(({ p, i }) => {
        const escura = ((i >> 3) + (i & 7)) % 2 === 1;
        const alvo = destinos.some((m) => m.para === i);
        const classes = [
          'dt-xz-casa',
          escura ? 'dt-xz-escura' : '',
          i === selecionada ? 'dt-xz-selecionada' : '',
          ultimo && (i === ultimo.de || i === ultimo.para) ? 'dt-xz-ultimo' : '',
          i === xeque ? 'dt-xz-xeque' : '',
        ].filter(Boolean).join(' ');
        return (
          <button
            key={i}
            type="button"
            className={classes}
            data-casa={i}
            tabIndex={ativo ? 0 : -1}
            aria-label={`${nomeCasa(i)}${p !== '.' ? ` ${NOME_PECA[p.toLowerCase()]} ${corDe(p) === 'b' ? 'branco' : 'preto'}` : ''}${alvo ? ', destino' : ''}`}
            onClick={() => onCasa(i)}
          >
            {p !== '.' && <PecaView p={p} />}
            {alvo && <span className={p === '.' ? 'dt-xz-ponto' : 'dt-xz-anel'} />}
          </button>
        );
      })}
    </div>
  );
}
