import { nomeDaCarta, rotuloDe, type Carta, type Naipe } from './baralho';

// Carta do baralho comum: rótulo e naipe no canto, naipe grande (ou a letra da figura) no meio; virada, mostra o
// xadrez do verso. Copas e ouros saem em vermelho; espadas e paus, no âmbar do DEV (o "preto"). Os naipes são desenhados em pixels (7×7): a fonte do DEV não tem esses símbolos.
const NAIPE_PATH: Record<Naipe, string> = {
  espadas: 'M3 0h1v1H3zM2 1h3v1H2zM1 2h5v1H1zM0 3h7v2H0zM3 5h1v1H3zM2 6h3v1H2z',
  copas: 'M1 0h2v1H1zM4 0h2v1H4zM0 1h7v2H0zM1 3h5v1H1zM2 4h3v1H2zM3 5h1v1H3z',
  ouros: 'M3 0h1v1H3zM2 1h3v1H2zM1 2h5v1H1zM0 3h7v1H0zM1 4h5v1H1zM2 5h3v1H2zM3 6h1v1H3z',
  paus: 'M2 0h3v2H2zM0 2h7v2H0zM0 4h2v1H0zM3 4h1v2H3zM5 4h2v1H5zM2 6h3v1H2z',
};

function NaipeSvg({ naipe, className }: { naipe: Naipe; className: string }) {
  return (
    <svg className={className} viewBox="0 0 7 7" aria-hidden="true" shapeRendering="crispEdges">
      <path d={NAIPE_PATH[naipe]} />
    </svg>
  );
}

export function CartaView({ carta, virada = false }: { carta: Carta; virada?: boolean }) {
  if (virada) return <div className="dt-carta dt-carta-verso" role="img" aria-label="Carta virada" />;
  const figura = carta.valor > 10;
  const vermelha = carta.naipe === 'copas' || carta.naipe === 'ouros';
  return (
    <div className={vermelha ? 'dt-carta dt-carta-vermelha' : 'dt-carta'} role="img" aria-label={nomeDaCarta(carta)}>
      <span className="dt-carta-canto">
        {rotuloDe(carta)}
        <NaipeSvg naipe={carta.naipe} className="dt-naipe" />
      </span>
      <span className="dt-carta-meio">
        {figura ? rotuloDe(carta) : <NaipeSvg naipe={carta.naipe} className="dt-naipe-grande" />}
      </span>
    </div>
  );
}
