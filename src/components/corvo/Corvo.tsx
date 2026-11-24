import { useEffect, useState } from 'react';
import { ALTURA, LARGURA, MS_POR_QUADRO, QUADROS, caminhos, quadro, type Animacao } from './quadros';

// O corvo, mascote da WEB: carregando (pulinho), listas vazias (cabeça), página não encontrada (rabo) e acesso
// negado ou erro (grito). Com movimento reduzido pedido pelo sistema, fica parado.
const CORES: Record<string, string> = { '#': '#2f3742', w: '#4f5b6d', o: '#f2a33a', b: '#7d8794', s: '#c9781e' };

const semMovimento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** `pixel`: tamanho de cada pixel do desenho na tela. */
export default function Corvo({ animacao, pixel = 4 }: { animacao: Animacao; pixel?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (semMovimento()) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % QUADROS), MS_POR_QUADRO);
    return () => window.clearInterval(t);
  }, []);

  const largura = LARGURA[animacao];
  const d = caminhos(quadro(animacao, i));
  return (
    <svg
      width={largura * pixel}
      height={ALTURA * pixel}
      viewBox={`0 0 ${largura} ${ALTURA}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {Object.entries(d).map(([c, caminho]) => <path key={c} d={caminho} fill={CORES[c]} />)}
    </svg>
  );
}
