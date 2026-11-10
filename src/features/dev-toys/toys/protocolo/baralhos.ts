import { useEffect, useState } from 'react';
import { gravar, ler } from '../crawler/memoria';
import { FACCOES, normalizarBaralho, type Baralho, type Faccao } from './cartas';

// Os baralhos do PROTOCOLO, um por facção, e a facção escolhida: neste navegador. Quem monta é o setor Baralhos;
// quem joga é o PROTOCOLO. As duas janelas ficam em dia pelo evento com o nome da chave (e por `storage`, entre abas).
export const CHAVE_BARALHOS = 'ledur:dev-protocolo-baralhos';

export type Guardado = { faccao: Faccao; baralhos: Record<Faccao, Baralho> };

export function lerBaralhos(): Guardado {
  const v = ler(CHAVE_BARALHOS);
  const x = v && typeof v === 'object' ? (v as { faccao?: unknown; baralhos?: Record<string, unknown> }) : {};
  const faccao = FACCOES.find((f) => f === x.faccao) ?? FACCOES[0];
  const baralhos = Object.fromEntries(FACCOES.map((f) => [f, normalizarBaralho(f, x.baralhos?.[f])])) as Record<Faccao, Baralho>;
  return { faccao, baralhos };
}

export function gravarBaralhos(g: Guardado) {
  gravar(CHAVE_BARALHOS, g);
  window.dispatchEvent(new Event(CHAVE_BARALHOS));
}

/** Os baralhos e a facção, atualizados quando qualquer janela (ou outra aba) mexe neles. */
export function useBaralhos(): [Guardado, (g: Guardado) => void] {
  const [guardado, setGuardado] = useState(lerBaralhos);
  useEffect(() => {
    const atualizar = () => setGuardado(lerBaralhos());
    window.addEventListener(CHAVE_BARALHOS, atualizar);
    window.addEventListener('storage', atualizar);
    return () => {
      window.removeEventListener(CHAVE_BARALHOS, atualizar);
      window.removeEventListener('storage', atualizar);
    };
  }, []);
  return [guardado, gravarBaralhos];
}
