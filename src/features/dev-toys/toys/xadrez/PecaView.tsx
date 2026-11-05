import { corDe } from './regras';

/** Peças em pixels (9×9): a fonte do DEV não tem os símbolos. Brancas em âmbar, pretas em vermelho. */
const DESENHO: Record<string, string> = {
  p: 'M3 1h3v3H3zM2 4h5v1H2zM3 5h3v2H3zM2 7h5v1H2zM1 8h7v1H1z',
  r: 'M1 1h1v1H1zM3 1h1v1H3zM5 1h1v1H5zM7 1h1v1H7zM1 2h7v1H1zM2 3h5v4H2zM1 7h7v2H1z',
  n: 'M3 1h2v1H3zM2 2h4v1H2zM1 3h6v1H1zM1 4h2v1H1zM4 4h3v1H4zM3 5h4v2H3zM2 7h5v1H2zM1 8h7v1H1z',
  b: 'M4 0h1v1H4zM3 1h3v1H3zM2 2h2v1H2zM5 2h2v1H5zM2 3h5v2H2zM3 5h3v2H3zM2 7h5v1H2zM1 8h7v1H1z',
  q: 'M0 1h1v1H0zM4 1h1v1H4zM8 1h1v1H8zM0 2h2v1H0zM3 2h3v1H3zM7 2h2v1H7zM1 3h7v2H1zM2 5h5v2H2zM1 7h7v2H1z',
  k: 'M4 0h1v3H4zM3 1h3v1H3zM1 3h7v2H1zM2 5h5v2H2zM1 7h7v2H1z',
};

export function PecaView({ p, className = '' }: { p: string; className?: string }) {
  const t = p.toLowerCase();
  return (
    <svg className={`dt-xz-peca ${corDe(p) === 'b' ? 'dt-xz-branca' : 'dt-xz-preta'} ${className}`} viewBox="0 0 9 9" aria-hidden="true" shapeRendering="crispEdges">
      <path d={DESENHO[t]} />
    </svg>
  );
}
