import { NAIPES } from '../cartas/baralho';
import { NaipeSvg } from '../cartas/CartaView';
import { nomeDaCartaNeo, type CartaNeo } from './regras';

// Carta do NEO, com a moldura das cartas do DEV: o símbolo no canto e no meio, com o naipe (copas e ouros em
// vermelho). Inverte e pula são desenhados em pixels (7×7); curinga mostra os quatro naipes.
const ICONE: Record<string, string> = {
  inverte: 'M0 1h7v1H0zM5 0h1v1H5zM5 2h1v1H5zM0 5h7v1H0zM1 4h1v1H1zM1 6h1v1H1z',
  pula: 'M2 0h3v1H2zM1 1h1v1H1zM5 1h1v1H5zM0 2h1v3H0zM6 2h1v3H6zM1 5h1v1H1zM5 5h1v1H5zM2 6h3v1H2zM4 2h1v1H4zM3 3h1v1H3zM2 4h1v1H2z',
};

function Simbolo({ carta, grande }: { carta: CartaNeo; grande?: boolean }) {
  const icone = ICONE[carta.simbolo as string];
  if (icone) {
    return (
      <svg className={grande ? 'dt-naipe-grande' : 'dt-naipe'} viewBox="0 0 7 7" aria-hidden="true" shapeRendering="crispEdges">
        <path d={icone} />
      </svg>
    );
  }
  return <>{carta.simbolo === 'mais2' ? '+2' : carta.simbolo === 'mais4' ? '+4' : carta.simbolo === 'curinga' ? '*' : carta.simbolo}</>;
}

/** `pequena`: a carta menor (o exemplo nas Regras). */
export function CartaNeoView({ carta, pequena = false }: { carta: CartaNeo; pequena?: boolean }) {
  const classes = ['dt-carta', pequena ? 'dt-carta-mini' : '', carta.naipe === 'copas' || carta.naipe === 'ouros' ? 'dt-carta-vermelha' : '', carta.naipe ? '' : 'dt-neo-curinga'];
  return (
    <div className={classes.filter(Boolean).join(' ')} role="img" aria-label={nomeDaCartaNeo(carta)}>
      <span className="dt-carta-canto">
        <Simbolo carta={carta} />
        {carta.naipe && <NaipeSvg naipe={carta.naipe} className="dt-naipe" />}
      </span>
      <span className="dt-carta-meio">
        {carta.naipe ? (
          <Simbolo carta={carta} grande />
        ) : (
          <span className="dt-neo-naipes">
            {NAIPES.map((n) => <NaipeSvg key={n} naipe={n} className={n === 'copas' || n === 'ouros' ? 'dt-naipe dt-neo-vermelho' : 'dt-naipe'} />)}
            {carta.simbolo === 'mais4' && <b>+4</b>}
          </span>
        )}
      </span>
    </div>
  );
}
