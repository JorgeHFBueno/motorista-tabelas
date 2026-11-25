import { useEffect, useState } from 'react';
import { enfeitar, festaDoDia } from './festas';
import { CENAS, caminhos, quadro, type Animacao } from './quadros';

// O corvo, mascote da WEB: carregando (teclando), tabelas vazias (cabeça: procurando), página não encontrada (placa) e
// acesso negado ou erro (grito). Com movimento reduzido pedido pelo sistema, fica parado num quadro da animação.
// Nas datas festivas (festas.ts), usa o enfeite da festa (Natal: gorro).
const CORES: Record<string, string> = {
  '#': '#2f3742', w: '#4f5b6d', W: '#454f5e', A: '#4f5b6d', f: '#7a8596', c: '#aab1bb', o: '#f2a33a', b: '#7d8794', s: '#c9781e', M: '#151a20', p: '#b9b2a3',
  // notebook
  F: '#5b6472', E: '#12293B', X: '#9cc7e8', C: '#f2a33a', K: '#9aa3ae', P: '#f2a33a', D: '#6b7480', G: '#3d4a5c',
  // placa
  m: '#6e4a26', n: '#d9b77e', q: '#2f3742', h: '#6e4a26',
  // enfeites das festas
  r: '#c0392b', R: '#962d22', g: '#f4f1ea',
};

const semMovimento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** `pixel`: tamanho de cada pixel do desenho na tela. */
export default function Corvo({ animacao, pixel = 4 }: { animacao: Animacao; pixel?: number }) {
  const cena = CENAS[animacao];
  const [parado] = useState(semMovimento);
  const [festa] = useState(() => festaDoDia(new Date()));
  const [i, setI] = useState(0);
  useEffect(() => {
    if (parado) return;
    const t = window.setInterval(() => setI((n) => n + 1), cena.ms);
    return () => window.clearInterval(t);
  }, [parado, cena.ms]);

  const d = caminhos(enfeitar(quadro(animacao, parado ? cena.parado : i % cena.quadros), festa));
  return (
    <svg
      width={cena.largura * pixel}
      height={cena.altura * pixel}
      viewBox={`0 0 ${cena.largura} ${cena.altura}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {Object.entries(d).map(([c, caminho]) => <path key={c} d={caminho} fill={CORES[c]} />)}
    </svg>
  );
}
