import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CHAVE_FICHAS, lerCarteira, type Carteira } from './carteira';

/** Movimento reduzido pedido pelo sistema: os jogos mostram o resultado sem animar. */
export const semMovimento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** A carteira, atualizada quando qualquer janela (ou outra aba) mexe nela. */
export function useCarteira(): Carteira {
  const [carteira, setCarteira] = useState(lerCarteira);
  useEffect(() => {
    const atualizar = () => setCarteira(lerCarteira());
    window.addEventListener(CHAVE_FICHAS, atualizar);
    window.addEventListener('storage', atualizar);
    return () => {
      window.removeEventListener(CHAVE_FICHAS, atualizar);
      window.removeEventListener('storage', atualizar);
    };
  }, []);
  return carteira;
}

/**
 * Teclado dos jogos: as setas andam entre as opções (botões habilitados dentro de `[data-opcoes]`, na ordem da tela)
 * e Enter escolhe. Ao abrir a janela, e quando `momento` muda (a rodada começou ou acabou), o foco vai para a opção
 * principal (`data-principal`), se ele estava no jogo ou em lugar nenhum.
 */
export function useOpcoesTeclado(momento: string) {
  const raiz = useRef<HTMLDivElement>(null);
  const abriu = useRef(false);
  const opcoes = () => [...(raiz.current?.querySelectorAll<HTMLButtonElement>('[data-opcoes] button:not(:disabled)') ?? [])];
  const principal = () => raiz.current?.querySelector<HTMLButtonElement>('[data-opcoes] [data-principal]:not(:disabled)');

  const teclas = (e: KeyboardEvent) => {
    const passo = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    const lista = opcoes();
    const atual = lista.indexOf(document.activeElement as HTMLButtonElement);
    if (passo && lista.length) {
      e.preventDefault();
      const de = atual < 0 ? Math.max(0, lista.indexOf(principal() as HTMLButtonElement)) - passo : atual;
      lista[(de + passo + lista.length) % lista.length].focus();
    } else if (e.key === 'Enter' && atual < 0) {
      e.preventDefault();
      principal()?.click();
    }
  };

  useEffect(() => {
    const ativo = document.activeElement;
    const fora = ativo && ativo !== document.body && !raiz.current?.contains(ativo);
    if (fora && abriu.current) return;
    abriu.current = true;
    raiz.current?.querySelector<HTMLButtonElement>('[data-opcoes] [data-principal]:not(:disabled)')?.focus({ preventScroll: true });
  }, [momento]);

  return { raiz, teclas };
}
