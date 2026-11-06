import { useEffect, useState } from 'react';
import { NAIPES, type Naipe } from '../cartas/baralho';
import { NaipeSvg } from '../cartas/CartaView';
import { rngDe } from '../crawler/sim';
import { APOSTAS, alterarCarteira, lerCarteira, mover, semFichas } from '../fichas/carteira';
import { BarraDeFichas, SemFichas } from '../fichas/FichasView';
import { anotar } from '../fichas/historico';
import { semMovimento, useCarteira, useOpcoesTeclado } from '../fichas/hooks';
import { gravarPlacar, lerPlacar, registrarJogada, type PlacarJogo } from '../fichas/jogos';
import { NOMES_BOT } from '../poker/bots';
import { CartaDescarteView } from './CartaDescarteView';
import { PREMIO, agir, decidirBot, jogaveis, nomeDaCartaD, novaPartida, retornoDescarte, topo, type CartaD, type Jogada, type Partida } from './regras';

// Descarte contra 3 bots. A aposta sai da carteira ao distribuir; quem zera a mão primeiro leva as quatro apostas
// (você recebe PREMIO vezes a sua). Desistir, ou fechar a janela no meio, perde a aposta. Jogadas, vitórias e
// maior prêmio aparecem no Placar de Lideres; cada partida, no histórico da Carteira.
const CHAVE = 'ledur:dev-descarte';
const BOT_MS = 900;
const VOCE = 0;
const MAX_VERSOS = 8;
const sorteio = () => rngDe((Math.random() * 2 ** 32) >>> 0);

const ORDEM_SIMBOLO: Record<string, number> = { mais2: 10, inverte: 11, pula: 12, curinga: 13, mais4: 14 };
/** A sua mão em ordem: por naipe (curingas no fim), depois por símbolo. */
const ordemDe = (c: CartaD) => (c.naipe ? NAIPES.indexOf(c.naipe) : NAIPES.length) * 100 + (typeof c.simbolo === 'number' ? c.simbolo : ORDEM_SIMBOLO[c.simbolo]);

function nomesDosBots(rng: () => number) {
  const livres: string[] = [...NOMES_BOT];
  return [0, 1, 2].map(() => livres.splice(Math.floor(rng() * livres.length), 1)[0]);
}

const plural = (n: number) => `${n} ${n === 1 ? 'CARTA' : 'CARTAS'}`;

export default function DescarteToy() {
  const carteira = useCarteira();
  const [placar, setPlacar] = useState<PlacarJogo>(() => lerPlacar(CHAVE));
  const [partida, setPartida] = useState<Partida | null>(null);
  // a aposta da partida em jogo (a escolhida fica no placar)
  const [aposta, setAposta] = useState(0);
  // os últimos acontecimentos, o mais novo primeiro
  const [registro, setRegistro] = useState<string[]>([]);
  const [gritar, setGritar] = useState(false);
  // curinga esperando você escolher o naipe
  const [curinga, setCuringa] = useState<number | null>(null);

  const guardar = (p: PlacarJogo) => { setPlacar(p); gravarPlacar(CHAVE, p); };
  const contar = (texto: string) => setRegistro((r) => [texto, ...r].slice(0, 4));

  /** Fim da partida: paga quem ganhou e conta no placar e no histórico. */
  const fechar = (p: Partida, desistiu: boolean) => {
    const volta = desistiu ? 0 : retornoDescarte(p.vencedor, aposta);
    if (volta) alterarCarteira((c) => mover(c, volta));
    guardar(registrarJogada(lerPlacar(CHAVE), aposta, volta));
    const como = desistiu ? 'DESISTIU' : p.vencedor === VOCE ? 'VOCE ZEROU A MAO' : `${p.jogadores[p.vencedor!].nome} ZEROU A MAO`;
    anotar('DESCARTE', volta - aposta, `APOSTA ${aposta} . ${como}`);
  };

  const aplicar = (de: Partida, a: Jogada) => {
    const nova = agir(de, a, sorteio());
    if (nova === de) return;
    setPartida(nova);
    contar(nova.aviso);
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
  const jogar = (c: CartaD, naipe?: Naipe) => {
    if (!partida || !minhaVez) return;
    if (!c.naipe && !naipe) { setCuringa(c.id); return; }
    setCuringa(null);
    setGritar(false);
    aplicar(partida, { tipo: 'jogar', id: c.id, naipe, ultima: gritar });
  };
  const escolhido = curinga === null ? null : minhas.find((c) => c.id === curinga) ?? null;
  const quebrado = !emJogo && semFichas(carteira);
  const { raiz, teclas } = useOpcoesTeclado(`${partida?.vez}-${partida?.vencedor}-${curinga}-${partida?.comprou}-${quebrado}`);

  const saldo = partida && !emJogo ? retornoDescarte(partida.vencedor, aposta) - aposta : 0;
  const aviso = !partida
    ? `VOCE CONTRA 3 BOTS. QUEM ZERAR A MAO PRIMEIRO LEVA ${PREMIO}X A APOSTA`
    : !emJogo
      ? `${partida.vencedor === VOCE ? 'VOCE ZEROU A MAO!' : `${partida.jogadores[partida.vencedor!].nome} ZEROU A MAO`} (${saldo >= 0 ? '+' : ''}${saldo})`
      : !minhaVez
        ? `VEZ DE ${partida.jogadores[partida.vez].nome}...`
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

  return (
    <div className="dt-dc dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      <BarraDeFichas fichas={carteira.fichas} naMesa={emJogo ? aposta : 0} />
      {partida && (
        <>
          <div className="dt-dc-bots">
            {partida.jogadores.slice(1).map((j, k) => {
              const davez = (emJogo && partida.vez === k + 1) || partida.vencedor === k + 1;
              return (
                <div key={j.nome} className={davez ? 'dt-dc-bot dt-dc-davez' : 'dt-dc-bot'}>
                  <p className="dt-dc-nome">{j.nome}</p>
                  <p className="dt-dc-versos" role="img" aria-label={plural(j.mao.length)}>
                    {Array.from({ length: Math.min(j.mao.length, MAX_VERSOS) }, (_, n) => <span key={n} className="dt-dc-verso" />)}
                  </p>
                  <p>
                    {plural(j.mao.length)}
                    {j.mao.length === 1 && <b className="dt-dc-ultima"> ULTIMA!</b>}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="dt-dc-centro">
            <div className="dt-dc-pilha">
              <div className="dt-carta dt-carta-verso" />
              <span className="dt-jogo-legenda">MONTE {partida.monte.length}</span>
            </div>
            <div className="dt-dc-pilha">
              <CartaDescarteView key={topo(partida).id} carta={topo(partida)} />
              <span className="dt-jogo-legenda">MESA</span>
            </div>
            <div className="dt-dc-vale">
              <span className="dt-jogo-legenda">VALE</span>
              <span className={partida.naipe === 'copas' || partida.naipe === 'ouros' ? 'dt-dc-vermelho' : undefined}>
                <NaipeSvg naipe={partida.naipe} className="dt-naipe" /> {partida.naipe.toUpperCase()}
              </span>
              <span className="dt-jogo-legenda">SENTIDO</span>
              <span>{partida.sentido === 1 ? 'VOCE >> BOTS' : 'BOTS << VOCE'}</span>
            </div>
          </div>
        </>
      )}

      <ul className="dt-dc-registro" aria-live="polite">
        {registro.map((r, i) => <li key={`${i}-${r}`}>{r}</li>)}
      </ul>

      {partida && (
        <>
          <p className="dt-21-rotulo">
            VOCE <span className="dt-21-pontos">{plural(minhas.length)}</span>
            {minhas.length === 1 && emJogo && <b className="dt-dc-ultima">ULTIMA!</b>}
          </p>
          <div className="dt-dc-mao" data-opcoes>
            {minhas.map((c) => (
              <button
                key={c.id}
                type="button"
                className={minhaVez && !podem.has(c.id) ? 'dt-dc-apagada' : c.id === partida.comprou ? 'dt-dc-comprada' : undefined}
                disabled={!podem.has(c.id) || !!escolhido}
                data-principal={c === principal || undefined}
                aria-label={`Jogar ${nomeDaCartaD(c)}`}
                onClick={() => jogar(c)}
              >
                <CartaDescarteView carta={c} />
              </button>
            ))}
          </div>
        </>
      )}

      <p className="dt-jogo-aviso">{aviso}</p>

      <div className="dt-jogo-botoes" data-opcoes>
        {emJogo ? (
          <>
            {escolhido ? (
              <>
                {NAIPES.map((n) => (
                  <button key={n} type="button" data-principal={n === NAIPES[0] || undefined} onClick={() => jogar(escolhido, n)}>
                    [{n.toUpperCase()}]
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
            <span>APOSTA</span>
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
            <button type="button" data-principal onClick={distribuir} disabled={placar.aposta > carteira.fichas}>[Distribuir]</button>
          </>
        )}
      </div>
    </div>
  );
}
