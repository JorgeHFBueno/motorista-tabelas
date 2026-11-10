import { NaipeSvg } from '../cartas/CartaView';
import { lugarNaMesa } from '../online/sala';
import { CartaNeoView } from './CartaNeoView';
import { naipeVermelho, nomeDaCartaNeo, topo, type CartaNeo, type Partida } from './regras';

// A mesa do NEO (contra os bots e online), na mesa do poker: você embaixo, os outros à esquerda, em cima e à direita
// (a ordem da vez, no sentido horário), o monte e a carta da mesa no meio. As cartas dos outros ficam viradas até o fim.
const MAX_VERSOS = 10;

/** A última jogada num selo (aceso: atacou; contorno: jogou, comprou, passou; apagado: perdeu a vez ou esqueceu). */
function Selo({ texto, pensando }: { texto: string | null; pensando: boolean }) {
  if (pensando) return <p className="dt-pk-selo dt-pk-pensa">PENSA<span className="dt-pk-pontos">...</span></p>;
  if (!texto) return <p className="dt-pk-selo">{' '}</p>;
  const tipo = /PERDEU|ESQUECEU/.test(texto) ? 'fora' : /JOGOU (\+2|PULA|INVERTE|CURINGA)/.test(texto) ? 'forte' : 'leve';
  return <p className={`dt-pk-selo dt-pk-selo-${tipo}`}>{texto}</p>;
}

/** Quantas cartas, e ULTIMA! quando sobra uma. */
function Contagem({ n, emJogo }: { n: number; emJogo: boolean }) {
  return (
    <p className="dt-pk-na-mesa">
      {n}
      <span className="dt-pk-estilo">{n === 1 ? 'CARTA' : 'CARTAS'}</span>
      {n === 1 && emJogo && <span className="dt-pk-marca dt-neo-ultima">ULTIMA!</span>}
    </p>
  );
}

function Assento({ p, i, pensando }: { p: Partida; i: number; pensando: boolean }) {
  const j = p.jogadores[i];
  const fim = p.vencedor !== null;
  const vez = !fim && p.vez === i;
  return (
    <div className={`dt-pk-assento${vez ? ' dt-pk-vez' : ''}${p.vencedor === i ? ' dt-pk-ganhou' : ''}`}>
      <p className="dt-pk-nome">{j.nome}</p>
      <Contagem n={j.mao.length} emJogo={!fim} />
      {/* no fim, as cartas que sobraram ficam à mostra */}
      <div className="dt-pk-cartas dt-neo-cartas" role="img" aria-label={fim ? j.mao.map(nomeDaCartaNeo).join(', ') || 'Sem cartas' : `${j.mao.length} cartas viradas`}>
        {fim
          ? j.mao.map((c) => <CartaNeoView key={c.id} carta={c} pequena />)
          : Array.from({ length: Math.min(j.mao.length, MAX_VERSOS) }, (_, n) => <span key={n} className="dt-neo-verso" />)}
      </div>
      {/* a chave faz o selo saltar de novo a cada jogada nova */}
      <Selo key={`${j.ultima}-${pensando}`} texto={j.ultima} pensando={pensando} />
    </div>
  );
}

type Props = {
  partida: Partida;
  /** o seu assento */
  eu: number;
  /** quem está na vez (sem ser você) aparece pensando */
  pensando: boolean;
  /** a sua mão, na ordem da tela */
  minhas: CartaNeo[];
  /** as cartas que você pode jogar agora */
  podem: Set<number>;
  /** o curinga esperando o naipe */
  escolhido: CartaNeo | null;
  /** a carta que Enter joga */
  principal?: CartaNeo;
  /** acabou sem vencedor (alguém desistiu, online): as cartas continuam viradas */
  encerrada?: boolean;
  onJogar: (c: CartaNeo) => void;
};

export function MesaNeo({ partida, eu, pensando, minhas, podem, escolhido, principal, encerrada = false, onJogar }: Props) {
  const emJogo = partida.vencedor === null && !encerrada;
  const minhaVez = emJogo && partida.vez === eu;
  const n = partida.jogadores.length;
  const outros = partida.jogadores.map((_, i) => i).filter((i) => i !== eu);
  const meu = partida.jogadores[eu];
  return (
    <>
      {outros.map((i) => (
        <div key={i} className={`dt-pk-lugar${lugarNaMesa(i, eu, n)}`}>
          <Assento p={partida} i={i} pensando={pensando && emJogo && partida.vez === i} />
        </div>
      ))}
      <div className="dt-pk-centro">
        <div className="dt-neo-pilhas">
          <div className="dt-neo-pilha">
            <div className="dt-carta dt-carta-verso" />
            <span className="dt-jogo-legenda">MONTE {partida.monte.length}</span>
          </div>
          <div className="dt-neo-pilha">
            <CartaNeoView key={topo(partida).id} carta={topo(partida)} />
            <span className="dt-jogo-legenda">MESA</span>
          </div>
        </div>
        <p className={naipeVermelho(partida.naipe) ? 'dt-neo-vale dt-neo-vermelho' : 'dt-neo-vale'}>
          <span className="dt-jogo-legenda">VALE</span>
          <NaipeSvg naipe={partida.naipe} className="dt-naipe" />
          {partida.naipe.toUpperCase()}
        </p>
        <p className="dt-jogo-legenda">SENTIDO {partida.sentido === 1 ? 'HORARIO' : 'ANTI-HORARIO'}</p>
      </div>
      <div className={`dt-pk-voce dt-neo-voce${minhaVez ? ' dt-pk-vez' : ''}${partida.vencedor === eu ? ' dt-pk-ganhou' : ''}`}>
        <p className="dt-pk-nome">VOCE</p>
        <Contagem n={minhas.length} emJogo={emJogo} />
        <div className="dt-neo-mao" data-opcoes>
          {minhas.map((c) => (
            <button
              key={c.id}
              type="button"
              className={minhaVez && !podem.has(c.id) ? 'dt-neo-apagada' : c.id === partida.comprou || c.id === escolhido?.id ? 'dt-neo-erguida' : undefined}
              disabled={!podem.has(c.id) || !!escolhido}
              data-principal={c === principal || undefined}
              aria-label={`Jogar ${nomeDaCartaNeo(c)}`}
              onClick={() => onJogar(c)}
            >
              <CartaNeoView carta={c} />
            </button>
          ))}
        </div>
        <Selo key={`${meu.ultima}-${minhas.length}`} texto={meu.ultima} pensando={false} />
      </div>
    </>
  );
}
