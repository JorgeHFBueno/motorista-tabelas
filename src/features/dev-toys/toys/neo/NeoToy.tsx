import { useEffect, useState } from 'react';
import { NAIPES, type Naipe } from '../cartas/baralho';
import { NaipeSvg } from '../cartas/CartaView';
import { rngDe } from '../crawler/sim';
import { APOSTAS, alterarCarteira, lerCarteira, mover, semFichas } from '../fichas/carteira';
import { FichasView, SemFichas } from '../fichas/FichasView';
import { anotar } from '../fichas/historico';
import { semMovimento, useCarteira, useOpcoesTeclado } from '../fichas/hooks';
import { gravarPlacar, lerPlacar, registrarJogada, type PlacarJogo } from '../fichas/jogos';
import { NOMES_BOT } from '../poker/bots';
import { CartaNeoView } from './CartaNeoView';
import { PREMIO, agir, decidirBot, jogaveis, nomeDaCartaNeo, novaPartida, retornoNeo, topo, type CartaNeo, type Jogada, type Partida } from './regras';

// NEO contra 3 bots, na mesa do poker: você embaixo, os bots à esquerda, em cima e à direita (a ordem da vez, no
// sentido horário), o monte e a carta da mesa no meio; à direita, as fichas, o aviso, os últimos lances e as opções.
// A aposta sai da carteira ao distribuir; quem zera a mão primeiro leva as quatro apostas (você recebe PREMIO vezes
// a sua). Desistir, ou fechar a janela no meio, perde a aposta. Jogadas, vitórias e maior prêmio aparecem no Placar
// de Lideres; cada partida, no histórico da Carteira.
const CHAVE = 'ledur:dev-descarte';
/** Devagar o bastante para ver o que cada bot fez: ele "pensa" e a jogada aparece num selo que salta. */
const BOT_MS = 1600;
const VOCE = 0;
const MAX_VERSOS = 10;
const LANCES = 6;
const sorteio = () => rngDe((Math.random() * 2 ** 32) >>> 0);

const ORDEM_SIMBOLO: Record<string, number> = { mais2: 10, inverte: 11, pula: 12, curinga: 13, mais4: 14 };
/** A sua mão em ordem: por naipe (curingas no fim), depois por símbolo. */
const ordemDe = (c: CartaNeo) => (c.naipe ? NAIPES.indexOf(c.naipe) : NAIPES.length) * 100 + (typeof c.simbolo === 'number' ? c.simbolo : ORDEM_SIMBOLO[c.simbolo]);

function nomesDosBots(rng: () => number) {
  const livres: string[] = [...NOMES_BOT];
  return [0, 1, 2].map(() => livres.splice(Math.floor(rng() * livres.length), 1)[0]);
}

const vermelho = (n: Naipe | null) => n === 'copas' || n === 'ouros';

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

export default function NeoToy() {
  const carteira = useCarteira();
  const [placar, setPlacar] = useState<PlacarJogo>(() => lerPlacar(CHAVE));
  const [partida, setPartida] = useState<Partida | null>(null);
  // a aposta da partida em jogo (a escolhida fica no placar)
  const [aposta, setAposta] = useState(0);
  // os últimos lances, o mais novo primeiro
  const [registro, setRegistro] = useState<string[]>([]);
  const [gritar, setGritar] = useState(false);
  // curinga esperando você escolher o naipe
  const [curinga, setCuringa] = useState<number | null>(null);

  const guardar = (p: PlacarJogo) => { setPlacar(p); gravarPlacar(CHAVE, p); };

  /** Fim da partida: paga quem ganhou e conta no placar e no histórico. */
  const fechar = (p: Partida, desistiu: boolean) => {
    const volta = desistiu ? 0 : retornoNeo(p.vencedor, aposta);
    if (volta) alterarCarteira((c) => mover(c, volta));
    guardar(registrarJogada(lerPlacar(CHAVE), aposta, volta));
    const como = desistiu ? 'DESISTIU' : p.vencedor === VOCE ? 'VOCE ZEROU A MAO' : `${p.jogadores[p.vencedor!].nome} ZEROU A MAO`;
    anotar('NEO', volta - aposta, `APOSTA ${aposta} . ${como}`);
  };

  const aplicar = (de: Partida, a: Jogada) => {
    const nova = agir(de, a, sorteio());
    if (nova === de) return;
    setPartida(nova);
    setRegistro((r) => [nova.aviso, ...r].slice(0, LANCES));
    if (nova.vencedor !== null) fechar(nova, false);
  };

  // vez de um bot: pensa um pouco e joga
  const vezDoBot = !!partida && partida.vencedor === null && partida.vez !== VOCE;
  useEffect(() => {
    if (!vezDoBot || !partida) return;
    const t = window.setTimeout(() => aplicar(partida, decidirBot(partida, sorteio())), semMovimento() ? 150 : BOT_MS);
    return () => window.clearTimeout(t);
    // aplicar só lê a aposta, que não muda na partida; a partida é a dependência que importa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vezDoBot, partida]);

  const distribuir = () => {
    const a = placar.aposta;
    if (a > lerCarteira().fichas) return;
    alterarCarteira((c) => mover(c, -a));
    const rng = sorteio();
    setAposta(a);
    setGritar(false);
    setCuringa(null);
    setPartida(novaPartida(['VOCE', ...nomesDosBots(rng)], rng));
    setRegistro(['DISTRIBUIDAS 7 PARA CADA. VOCE COMECA']);
  };
  const desistir = () => {
    if (!partida || partida.vencedor !== null) return;
    fechar(partida, true);
    setPartida(null);
    setRegistro([`VOCE DESISTIU (-${aposta})`]);
  };

  const emJogo = !!partida && partida.vencedor === null;
  const minhaVez = emJogo && partida.vez === VOCE;
  const podem = new Set(minhaVez ? jogaveis(partida).map((c) => c.id) : []);
  const minhas = partida ? partida.jogadores[VOCE].mao.slice().sort((x, y) => ordemDe(x) - ordemDe(y)) : [];
  const jogar = (c: CartaNeo, naipe?: Naipe) => {
    if (!partida || !minhaVez) return;
    if (!c.naipe && !naipe) { setCuringa(c.id); return; }
    setCuringa(null);
    setGritar(false);
    aplicar(partida, { tipo: 'jogar', id: c.id, naipe, ultima: gritar });
  };
  const escolhido = curinga === null ? null : minhas.find((c) => c.id === curinga) ?? null;
  const quebrado = !emJogo && semFichas(carteira);
  const { raiz, teclas } = useOpcoesTeclado(`${partida?.vez}-${partida?.vencedor}-${curinga}-${partida?.comprou}-${quebrado}`);

  const saldo = partida && !emJogo ? retornoNeo(partida.vencedor, aposta) - aposta : 0;
  const aviso = !partida
    ? `VOCE CONTRA 3 BOTS. QUEM ZERAR A MAO PRIMEIRO LEVA ${PREMIO}X A APOSTA`
    : !emJogo
      ? `${partida.vencedor === VOCE ? 'VOCE ZEROU A MAO!' : `${partida.jogadores[partida.vencedor!].nome} ZEROU A MAO`} (${saldo >= 0 ? '+' : ''}${saldo})`
      : !minhaVez
        ? `${partida.jogadores[partida.vez].nome} PENSA...`
        : escolhido
          ? 'ESCOLHA O NAIPE DO CURINGA'
          : partida.comprou !== null
            ? 'A COMPRADA SERVE: JOGUE OU PASSE'
            : !podem.size
              ? 'NADA SERVE: COMPRE'
              : minhas.length === 2
                ? 'SUA VEZ. COM 2 CARTAS, GRITE ULTIMA ANTES DE JOGAR'
                : 'SUA VEZ: COMBINE NAIPE OU SIMBOLO';
  const principal = minhas.find((c) => podem.has(c.id));
  const eu = partida?.jogadores[VOCE];

  return (
    <div className="dt-pk dt-neo dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      {/* a mesa: você embaixo, os bots à esquerda, em cima e à direita (a ordem da vez), o monte e a mesa no meio */}
      <div className="dt-pk-mesa">
        {partida && eu ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className={`dt-pk-lugar${i}`}>
                <Assento p={partida} i={i} pensando={vezDoBot && partida.vez === i} />
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
              <p className={vermelho(partida.naipe) ? 'dt-neo-vale dt-neo-vermelho' : 'dt-neo-vale'}>
                <span className="dt-jogo-legenda">VALE</span>
                <NaipeSvg naipe={partida.naipe} className="dt-naipe" />
                {partida.naipe.toUpperCase()}
              </p>
              <p className="dt-jogo-legenda">SENTIDO {partida.sentido === 1 ? 'HORARIO' : 'ANTI-HORARIO'}</p>
            </div>
            <div className={`dt-pk-voce dt-neo-voce${minhaVez ? ' dt-pk-vez' : ''}${partida.vencedor === VOCE ? ' dt-pk-ganhou' : ''}`}>
              <p className="dt-pk-nome">VOCE</p>
              <Contagem n={minhas.length} emJogo={emJogo} />
              <div className="dt-neo-mao" data-opcoes>
                {minhas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={minhaVez && !podem.has(c.id) ? 'dt-neo-apagada' : c.id === partida.comprou || c.id === curinga ? 'dt-neo-erguida' : undefined}
                    disabled={!podem.has(c.id) || !!escolhido}
                    data-principal={c === principal || undefined}
                    aria-label={`Jogar ${nomeDaCartaNeo(c)}`}
                    onClick={() => jogar(c)}
                  >
                    <CartaNeoView carta={c} />
                  </button>
                ))}
              </div>
              <Selo key={`${eu.ultima}-${minhas.length}`} texto={eu.ultima} pensando={false} />
            </div>
          </>
        ) : (
          <p className="dt-pk-vazia">MESA VAZIA</p>
        )}
      </div>

      {/* à direita: a carteira e a aposta, o aviso, os últimos lances e as opções */}
      <div className="dt-pk-painel">
        <div className="dt-pk-fichas">
          <div>
            <p><span className="dt-jogo-legenda">CARTEIRA</span>{carteira.fichas}</p>
            <FichasView total={carteira.fichas} />
          </div>
          <div>
            <p><span className="dt-jogo-legenda">NA MESA</span>{emJogo ? aposta : '-'}</p>
            <FichasView total={emJogo ? aposta : 0} />
          </div>
        </div>
        <p className="dt-jogo-aviso" aria-live="polite">{aviso}</p>
        {registro.length > 0 && (
          <div>
            <p className="dt-jogo-legenda">LANCES</p>
            <ul className="dt-neo-lances">
              {registro.map((r, i) => <li key={`${i}-${r}`}>{r}</li>)}
            </ul>
          </div>
        )}

        <div className="dt-jogo-botoes" data-opcoes>
          {emJogo ? (
            <>
              {escolhido ? (
                <>
                  {NAIPES.map((n) => (
                    <button key={n} type="button" className={vermelho(n) ? 'dt-neo-vermelho' : undefined} data-principal={n === NAIPES[0] || undefined} onClick={() => jogar(escolhido, n)}>
                      [<NaipeSvg naipe={n} className="dt-naipe" /> {n.toUpperCase()}]
                    </button>
                  ))}
                  <button type="button" onClick={() => setCuringa(null)}>[Voltar]</button>
                </>
              ) : minhaVez ? (
                <>
                  {partida.comprou === null ? (
                    <button type="button" data-principal={!principal || undefined} onClick={() => aplicar(partida, { tipo: 'comprar' })}>[Comprar]</button>
                  ) : (
                    <button type="button" onClick={() => aplicar(partida, { tipo: 'passar' })}>[Passar]</button>
                  )}
                  {minhas.length === 2 && (
                    <button type="button" className={gritar ? 'dt-jogo-escolhida' : undefined} aria-pressed={gritar} onClick={() => setGritar((g) => !g)}>
                      [ULTIMA!]
                    </button>
                  )}
                </>
              ) : null}
              <button type="button" onClick={desistir}>[Desistir]</button>
            </>
          ) : quebrado ? (
            <SemFichas carteira={carteira} />
          ) : (
            <>
              <span className="dt-neo-apostas">
                APOSTA
                {APOSTAS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={placar.aposta === a ? 'dt-jogo-escolhida' : undefined}
                    aria-pressed={placar.aposta === a}
                    disabled={a > carteira.fichas}
                    onClick={() => guardar({ ...placar, aposta: a })}
                  >
                    [{a}]
                  </button>
                ))}
              </span>
              <button type="button" data-principal onClick={distribuir} disabled={placar.aposta > carteira.fichas}>[Distribuir]</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
