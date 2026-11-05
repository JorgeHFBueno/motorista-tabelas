import { MESADA, alterarCarteira, hojeEmBrasilia, pegarMesada, pilhas, podeMesada, type Carteira } from './carteira';

// Fichas desenhadas em pilhas, uma por valor (100, 50, 10, 5), vistas de lado, em pixels. Cada pilha mostra até
// MAX_PILHA fichas; acima disso, um "+" no topo (o número exato fica no texto ao lado). As pilhas encolhem juntas
// quando não cabem na largura de onde estão (a altura segue a largura).
const MAX_PILHA = 8;
/** Ficha de lado: 14×4, com as marcas da borda. */
const BORDA = 'M1 0h12v1H1zM0 1h1v2H0zM13 1h1v2h-1zM1 3h12v1H1z';
const MARCAS = 'M3 1h2v2H3zM9 1h2v2H9z';
const PASSO = 3;

function Pilha({ valor, qtd }: { valor: number; qtd: number }) {
  const n = Math.min(qtd, MAX_PILHA);
  const altura = PASSO * (n - 1) + 4;
  const cheia = valor === 100; // a de 100 é cheia; as outras, vazadas
  return (
    <span className={`dt-jogo-pilha dt-ficha-${valor}`}>
      <span className="dt-jogo-pilha-mais">{qtd > MAX_PILHA ? '+' : ''}</span>
      <svg viewBox={`0 0 14 ${altura}`} aria-hidden="true" shapeRendering="crispEdges">
        {Array.from({ length: n }, (_, i) => (
          // de baixo para cima: a de cima cobre a borda de baixo da anterior
          <g key={i} transform={`translate(0 ${PASSO * (n - 1 - i)})`}>
            <path d="M1 0h12v4H1zM0 1h14v2H0z" className={cheia ? 'dt-ficha-corpo' : 'dt-ficha-fundo'} />
            <path d={cheia ? MARCAS : `${BORDA}${MARCAS}`} className={cheia ? 'dt-ficha-fundo' : undefined} />
          </g>
        ))}
      </svg>
      <span className="dt-jogo-pilha-valor">{valor}</span>
    </span>
  );
}

export function FichasView({ total }: { total: number }) {
  const montes = pilhas(total);
  return (
    <span className="dt-jogo-pilhas" role="img" aria-label={`${total} fichas`}>
      {montes.map((m) => <Pilha key={m.valor} {...m} />)}
    </span>
  );
}

/** Topo dos jogos: as fichas da carteira à esquerda e a aposta na mesa à direita, desenhadas e com o número. */
export function BarraDeFichas({ fichas, naMesa }: { fichas: number; naMesa: number }) {
  return (
    <div className="dt-jogo-fichas">
      <div className="dt-jogo-monte">
        <FichasView total={fichas} />
        <p><span className="dt-jogo-legenda">FICHAS</span>{fichas}</p>
      </div>
      <div className="dt-jogo-monte">
        <p><span className="dt-jogo-legenda">NA MESA</span>{naMesa || '-'}</p>
        <FichasView total={naMesa} />
      </div>
    </div>
  );
}

/** Sem fichas para a menor aposta: a mesada do dia, ou o aviso de que ela já foi. */
export function SemFichas({ carteira }: { carteira: Carteira }) {
  if (!podeMesada(carteira, hojeEmBrasilia())) return <span>SEM FICHAS. MESADA DE NOVO AMANHA</span>;
  return (
    <>
      <span>SEM FICHAS.</span>
      <button type="button" data-principal onClick={() => alterarCarteira((c) => pegarMesada(c, hojeEmBrasilia()))}>
        [Mesada de {MESADA}]
      </button>
    </>
  );
}
