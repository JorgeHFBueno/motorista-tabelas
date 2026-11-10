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
import { MesaNeo } from './MesaNeo';
import NeoOnline from './NeoOnline';
import { PREMIO, agir, decidirBot, jogaveis, naipeVermelho, novaPartida, ordemNaMao, retornoNeo, type CartaNeo, type Jogada, type Partida } from './regras';

// NEO contra 3 bots, na mesa do poker: você embaixo, os bots à esquerda, em cima e à direita (a ordem da vez, no
// sentido horário), o monte e a carta da mesa no meio; à direita, as fichas, o aviso, os últimos lances e as opções.
// A aposta sai da carteira ao distribuir; quem zera a mão primeiro leva as quatro apostas (você recebe PREMIO vezes
// a sua). Desistir, ou fechar a janela no meio, perde a aposta. Jogadas, vitórias e maior prêmio aparecem no Placar
// de Lideres; cada partida, no histórico da Carteira. [Online] troca os bots por outras pessoas (NeoOnline).
const CHAVE = 'ledur:dev-descarte';
/** Devagar o bastante para ver o que cada bot fez: ele "pensa" e a jogada aparece num selo que salta. */
const BOT_MS = 1600;
const VOCE = 0;
const LANCES = 6;
const sorteio = () => rngDe((Math.random() * 2 ** 32) >>> 0);

function nomesDosBots(rng: () => number) {
  const livres: string[] = [...NOMES_BOT];
  return [0, 1, 2].map(() => livres.splice(Math.floor(rng() * livres.length), 1)[0]);
}

export default function NeoToy() {
  const [online, setOnline] = useState(false);
  return online ? <NeoOnline onVoltar={() => setOnline(false)} /> : <NeoContraBot onOnline={() => setOnline(true)} />;
}

function NeoContraBot({ onOnline }: { onOnline: () => void }) {
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
  const minhas = partida ? partida.jogadores[VOCE].mao.slice().sort((x, y) => ordemNaMao(x) - ordemNaMao(y)) : [];
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

  return (
    <div className="dt-pk dt-neo dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      {/* a mesa: você embaixo, os bots à esquerda, em cima e à direita (a ordem da vez), o monte e a mesa no meio */}
      <div className="dt-pk-mesa">
        {partida ? (
          <MesaNeo
            partida={partida}
            eu={VOCE}
            pensando={vezDoBot}
            minhas={minhas}
            podem={podem}
            escolhido={escolhido}
            principal={principal}
            onJogar={(c) => jogar(c)}
          />
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
                    <button key={n} type="button" className={naipeVermelho(n) ? 'dt-neo-vermelho' : undefined} data-principal={n === NAIPES[0] || undefined} onClick={() => jogar(escolhido, n)}>
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
            <>
              <SemFichas carteira={carteira} />
              <button type="button" onClick={onOnline}>[Online]</button>
            </>
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
              <button type="button" onClick={onOnline}>[Online]</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
