import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Carta } from '../cartas/baralho';
import { CartaView } from '../cartas/CartaView';
import { gravar, ler } from '../crawler/memoria';
import { rngDe } from '../crawler/sim';
import { alterarCarteira, lerCarteira, mover } from '../fichas/carteira';
import { FichasView, SemFichas } from '../fichas/FichasView';
import { anotar } from '../fichas/historico';
import { semMovimento, useCarteira, useOpcoesTeclado } from '../fichas/hooks';
import { gravarPlacar, lerPlacar, registrarJogada } from '../fichas/jogos';
import { decidir, novoBot } from './bots';
import { descreverMao, melhorCombinacao, nomeDaMao } from './maos';
import { BLIND_GRANDE, ENTRADA, LUGARES, agir, mesaNova, novaMao, novoJogador, opcoes, pote, sentados, type Acao, type Estilo, type Jogador, type Mesa } from './mesa';

// Poker de mesa (Texas Hold'em sem limite): você e 3 bots. Você senta com até 200 fichas da carteira e, ao
// levantar, o que sobrou volta para ela. Bot que quebra sai e o lugar fica vazio: quebrando os três, você vence a
// mesa. A mesa fica guardada neste navegador (`ledur:dev-poker-mesa`: as suas fichas e as dos bots, sem o que já foi
// para o pote): fechar a janela no meio da mão perde só o pote dela.
const CHAVE = 'ledur:dev-poker';
const CHAVE_MESA = 'ledur:dev-poker-mesa';
/** Devagar o bastante para ver o que cada bot decidiu: ele "pensa" e a jogada aparece num selo que salta. */
const BOT_MS = 1400;
const REVELAR_MS = 650;
const VOCE = 0;

const sorteio = () => rngDe((Math.random() * 2 ** 32) >>> 0);
const comBots = (voce: Jogador): Jogador[] => {
  const rng = sorteio();
  const lugares = [voce];
  for (let k = 1; k < LUGARES; k++) lugares.push(novoBot(rng, lugares.map((j) => j.nome)));
  return lugares;
};

type Guardado = { fichas: number; bots?: Array<{ nome: string; estilo: Estilo; fichas: number }> };
const ESTILOS: Estilo[] = ['cauteloso', 'normal', 'agressivo'];
const lerMesa = (): Mesa | null => {
  const v = ler(CHAVE_MESA) as Partial<Guardado> | null;
  if (!v || typeof v.fichas !== 'number' || v.fichas <= 0) return null;
  const voce = novoJogador('VOCE', null, Math.floor(v.fichas));
  const bots = Array.isArray(v.bots) && v.bots.length === LUGARES - 1
    && v.bots.every((b) => b && typeof b.nome === 'string' && ESTILOS.includes(b.estilo) && typeof b.fichas === 'number')
    ? v.bots.map((b) => novoJogador(b.nome, b.estilo, Math.max(0, Math.floor(b.fichas))))
    : null;
  // guardado antes de os bots irem junto: bots novos
  return mesaNova(bots ? [voce, ...bots] : comBots(voce));
};
const guardar = (mesa: Mesa | null) => {
  const valor: Guardado | null = mesa
    ? { fichas: mesa.jogadores[VOCE].fichas, bots: mesa.jogadores.slice(1).map((j) => ({ nome: j.nome, estilo: j.estilo ?? 'normal', fichas: j.fichas })) }
    : null;
  gravar(CHAVE_MESA, valor);
};

const marcaDe = (mesa: Mesa, i: number) =>
  i === mesa.botao ? (i === mesa.pequeno ? 'D SB' : 'D') : i === mesa.pequeno ? 'SB' : i === mesa.grande ? 'BB' : '';
/** Fora da mão: sem fichas e sem cartas (o lugar de um bot que quebrou). */
const vazio = (j: Jogador) => j.fichas <= 0 && !j.cartas.length;
const chaveCarta = (c: Carta) => `${c.valor}${c.naipe}`;

/** A última jogada num selo (aceso: aumentou ou all-in; contorno: pagou, passou, blind; apagado: desistiu, quebrou). */
function Selo({ texto, pensando }: { texto: string | null; pensando: boolean }) {
  if (pensando) return <p className="dt-pk-selo dt-pk-pensa">PENSA<span className="dt-pk-pontos">...</span></p>;
  if (!texto) return <p className="dt-pk-selo">{' '}</p>;
  const tipo = /^(DESISTIU|QUEBROU)/.test(texto) ? 'fora' : /AUMENTOU|ALL-IN/.test(texto) ? 'forte' : 'leve';
  return <p className={`dt-pk-selo dt-pk-selo-${tipo}`}>{texto}</p>;
}

/** Nome e fichas totais; embaixo, maior, a posição (D, SB, BB) e as fichas que ele pôs nesta rodada. */
function Cabecalho({ mesa, i, extra }: { mesa: Mesa; i: number; extra?: ReactNode }) {
  const j = mesa.jogadores[i];
  const marca = marcaDe(mesa, i);
  return (
    <>
      <p className="dt-pk-nome">{j.nome}<span className="dt-pk-total">{j.fichas}</span>{extra}</p>
      <p className="dt-pk-na-mesa" aria-label={`${j.aposta} fichas na mesa nesta rodada`}>
        {marca && <span className="dt-pk-marca">{marca}</span>}
        {j.aposta || '-'}
        {j.estilo && <span className="dt-pk-estilo">{j.estilo.toUpperCase()}</span>}
      </p>
    </>
  );
}

/** No fim, com as mãos à mostra: carta que faz a mão vencedora fica acesa; as outras (kickers inclusive), apagadas. */
function Cartas({ cartas, usadas, virada, pequena }: { cartas: Carta[]; usadas: Set<string> | null; virada: (k: number) => boolean; pequena?: boolean }) {
  return (
    <>
      {cartas.map((c, k) => {
        const v = virada(k);
        const classe = !usadas || v ? undefined : usadas.has(chaveCarta(c)) ? 'dt-pk-usada' : 'dt-pk-sobra';
        // a chave muda quando a carta abre, para a animação dela
        return <span key={`${k}-${v}`} className={classe}><CartaView carta={c} virada={v} pequena={pequena} /></span>;
      })}
    </>
  );
}

function Assento({ mesa, i, mostrar, pensando, usadas }: { mesa: Mesa; i: number; mostrar: boolean; pensando: boolean; usadas: Set<string> | null }) {
  const j = mesa.jogadores[i];
  if (vazio(j)) {
    return (
      <div className="dt-pk-assento dt-pk-vazio">
        <p className="dt-pk-nome">LUGAR VAZIO</p>
        <p>{j.nome} QUEBROU</p>
      </div>
    );
  }
  const vez = mesa.rua !== 'fim' && mesa.vez === i;
  const ganhou = mesa.rua === 'fim' && mesa.potes.some((p) => p.ganhadores.includes(i));
  const quebrou = mesa.rua === 'fim' && j.fichas <= 0;
  return (
    <div className={`dt-pk-assento${vez ? ' dt-pk-vez' : ''}${j.desistiu ? ' dt-pk-fora' : ''}${ganhou ? ' dt-pk-ganhou' : ''}`}>
      <Cabecalho mesa={mesa} i={i} />
      <div className="dt-pk-cartas">
        <Cartas cartas={j.cartas} usadas={usadas} virada={() => !mostrar || j.desistiu} pequena />
      </div>
      {/* a chave faz o selo saltar de novo a cada jogada nova */}
      <Selo key={`${j.ultima}-${pensando}-${quebrou}`} texto={quebrou ? 'QUEBROU' : j.ultima} pensando={pensando} />
    </div>
  );
}

/** O fim da mão: quem levou cada pote, com que mão (por extenso e as 5 cartas) e o que os outros mostraram. */
function Resultado({ mesa }: { mesa: Mesa }) {
  const nomes = (g: number[]) => g.map((x) => mesa.jogadores[x].nome).join(' E ');
  if (!mesa.mostrou) {
    const p = mesa.potes[0];
    return (
      <div className="dt-pk-resultado">
        <p className="dt-pk-leva">{nomes(p.ganhadores)} LEVA {p.valor}</p>
        <p>OS OUTROS DESISTIRAM. NINGUEM MOSTRA AS CARTAS</p>
      </div>
    );
  }
  const ganhadores = new Set(mesa.potes.flatMap((p) => p.ganhadores));
  const outros = mesa.jogadores.filter((j, i) => !j.desistiu && !ganhadores.has(i));
  return (
    <div className="dt-pk-resultado">
      {mesa.potes.map((p, k) => (
        <div key={k}>
          <p className="dt-pk-leva">
            {nomes(p.ganhadores)} {p.ganhadores.length > 1 ? 'DIVIDEM' : 'LEVA'} {p.valor}
            {mesa.potes.length > 1 && <span className="dt-pk-estilo">{k ? `PARALELO ${k}` : 'PRINCIPAL'}</span>}
          </p>
          <p>{p.descricao}</p>
          <div className="dt-pk-cartas">
            <Cartas cartas={p.cartas} usadas={new Set(p.destaque.map(chaveCarta))} virada={() => false} pequena />
          </div>
        </div>
      ))}
      {outros.length > 0 && (
        <ul className="dt-pk-mostraram">
          {outros.map((j) => (
            <li key={j.nome}><span>{j.nome}</span> {descreverMao(melhorCombinacao([...j.cartas, ...mesa.comunitarias]))}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PokerToy() {
  const carteira = useCarteira();
  const [mesa, setMesa] = useState<Mesa | null>(lerMesa);
  const [mostradas, setMostradas] = useState(0);
  // fichas no começo da mão, para saber o saldo dela no fim
  const inicioMao = useRef(0);

  // a mesa fica guardada com as fichas de agora (sem o que já foi para o pote)
  useEffect(() => guardar(mesa), [mesa]);

  const alvo = mesa?.abertas ?? 0;
  const revelando = mostradas < alvo;
  useEffect(() => {
    if (!revelando) return;
    const t = window.setTimeout(() => setMostradas((n) => n + 1), REVELAR_MS);
    return () => window.clearTimeout(t);
  }, [revelando, mostradas]);

  /** Aplica a mesa nova; se a mão acabou, conta no placar o que você pôs e o que voltou. */
  const aplicar = (de: Mesa, nova: Mesa) => {
    if (nova === de) return;
    setMesa(nova);
    if (nova.rua === 'fim' && de.rua !== 'fim') {
      const eu = nova.jogadores[VOCE];
      const volta = eu.investido + eu.fichas - inicioMao.current;
      gravarPlacar(CHAVE, registrarJogada(lerPlacar(CHAVE), eu.investido, volta));
      // mão em que você não pôs nada (desistiu sem blind) não entra no histórico
      if (eu.investido || volta) anotar('POKER', volta - eu.investido, `POS ${eu.investido} . ${eu.desistiu ? 'DESISTIU' : `VOLTOU ${volta}`}`);
    }
  };

  // vez de um bot: pensa um pouco (depois de a mesa abrir) e joga
  const vezDoBot = !!mesa && mesa.rua !== 'fim' && mesa.vez > VOCE && !revelando;
  useEffect(() => {
    if (!vezDoBot || !mesa) return;
    const t = window.setTimeout(() => aplicar(mesa, agir(mesa, decidir(mesa, sorteio()))), semMovimento() ? 150 : BOT_MS);
    return () => window.clearTimeout(t);
  }, [vezDoBot, mesa]);

  const sentar = () => {
    const entrada = Math.min(ENTRADA, lerCarteira().fichas);
    if (entrada < 2 * BLIND_GRANDE) return;
    alterarCarteira((c) => mover(c, -entrada));
    anotar('POKER', -entrada, 'SENTOU: FICHAS PARA A MESA', true);
    proximaMao(mesaNova(comBots(novoJogador('VOCE', null, entrada))));
  };
  const proximaMao = (m: Mesa) => {
    // bot sem fichas fica fora: o lugar fica vazio
    if (sentados(m).length < 2 || m.jogadores[VOCE].fichas <= 0) return;
    inicioMao.current = m.jogadores[VOCE].fichas;
    setMostradas(semMovimento() ? Infinity : 0);
    setMesa(novaMao(m, sorteio()));
  };
  const levantar = () => {
    if (!mesa || mesa.rua !== 'fim') return;
    const fichas = mesa.jogadores[VOCE].fichas;
    alterarCarteira((c) => mover(c, fichas));
    anotar('POKER', fichas, 'LEVANTOU: FICHAS DA MESA', true);
    setMesa(null);
  };
  const jogar = (a: Acao) => { if (mesa && mesa.vez === VOCE && !revelando) aplicar(mesa, agir(mesa, a)); };

  const minhaVez = !!mesa && mesa.rua !== 'fim' && mesa.vez === VOCE && !revelando;
  const fim = !!mesa && mesa.rua === 'fim' && !revelando;
  const eu = mesa?.jogadores[VOCE];
  const quebrou = fim && eu?.fichas === 0;
  // os três bots quebraram: a mesa é sua
  const venceu = fim && !quebrou && !!mesa && sentados(mesa).length === 1;
  const podeSentar = carteira.fichas >= 2 * BLIND_GRANDE;
  const { raiz, teclas } = useOpcoesTeclado(`${mesa ? mesa.rua : 'fora'}-${minhaVez}-${fim}-${podeSentar}`);

  const o = minhaVez && mesa ? opcoes(mesa, VOCE) : null;
  const potAgora = mesa ? pote(mesa) : 0;
  const potTotal = o && mesa ? Math.max(o.minimo, Math.min(o.maximo, mesa.maior + potAgora + o.pagar)) : 0;
  const minha = eu && eu.cartas.length ? nomeDaMao([...eu.cartas, ...mesa!.comunitarias.slice(0, Math.min(mostradas, 5))]) : null;
  const mostrar = !!mesa && mesa.rua === 'fim' && mesa.mostrou && !revelando;
  // as cartas que fazem a mão que levou o pote principal (dividindo, as de todos que dividem)
  const usadas = mostrar && mesa?.potes[0] ? new Set(mesa.potes[0].destaque.map(chaveCarta)) : null;

  const aviso = !mesa
    ? `SENTE COM ATE ${ENTRADA} FICHAS . BLINDS 5/10`
    : venceu
      ? `VOCE VENCEU A MESA COM ${eu?.fichas} FICHAS`
      : quebrou
        ? 'VOCE QUEBROU'
        : fim && !mesa.potes.length
          ? `SENTADO COM ${eu?.fichas} FICHAS`
          : fim
            ? null
            : revelando ? 'A MESA ABRE...' : minhaVez ? 'SUA VEZ' : `${mesa.jogadores[mesa.vez]?.nome ?? ''} PENSA...`;

  return (
    <div className="dt-pk dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      {/* a mesa: você embaixo, os bots à esquerda, em cima e à direita (a ordem de fala), as cartas no meio */}
      <div className="dt-pk-mesa">
        {mesa ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className={`dt-pk-lugar${i}`}>
                <Assento mesa={mesa} i={i} mostrar={mostrar} pensando={vezDoBot && mesa.vez === i} usadas={usadas} />
              </div>
            ))}
            <div className="dt-pk-centro">
              <div className="dt-21-mao">
                <Cartas cartas={mesa.comunitarias} usadas={usadas} virada={(i) => i >= Math.min(mostradas, mesa.abertas)} />
              </div>
              <p className="dt-pk-pote">POTE {potAgora}</p>
            </div>
            <div className={`dt-pk-voce${minhaVez ? ' dt-pk-vez' : ''}`}>
              <Cabecalho mesa={mesa} i={VOCE} extra={minha && !eu?.desistiu && <span className="dt-21-pontos">{minha}</span>} />
              <div className="dt-21-mao">
                <Cartas cartas={eu?.cartas ?? []} usadas={usadas} virada={() => false} />
              </div>
              <Selo key={eu?.ultima ?? '-'} texto={eu?.ultima ?? null} pensando={false} />
            </div>
          </>
        ) : (
          <p className="dt-pk-vazia">MESA VAZIA</p>
        )}
      </div>

      {/* à direita: a carteira e o que você tem na mesa, o resultado da mão, o aviso e as opções */}
      <div className="dt-pk-painel">
        <div className="dt-pk-fichas">
          <div>
            <p><span className="dt-jogo-legenda">CARTEIRA</span>{carteira.fichas}</p>
            <FichasView total={carteira.fichas} />
          </div>
          <div>
            <p><span className="dt-jogo-legenda">NA MESA</span>{eu?.fichas ?? 0}</p>
            <FichasView total={eu?.fichas ?? 0} />
          </div>
        </div>
        <div aria-live="polite">
          {fim && mesa?.potes.length ? <Resultado mesa={mesa} /> : null}
          {aviso && <p className="dt-jogo-aviso">{aviso}</p>}
        </div>

        <div className="dt-jogo-botoes" data-opcoes>
          {!mesa ? (
            podeSentar ? <button type="button" data-principal onClick={sentar}>[Sentar com {Math.min(ENTRADA, carteira.fichas)}]</button> : <SemFichas carteira={carteira} />
          ) : o ? (
            <>
              <button type="button" onClick={() => jogar({ tipo: 'desistir' })}>[Desistir]</button>
              {o.podePassar
                ? <button type="button" data-principal onClick={() => jogar({ tipo: 'passar' })}>[Passar]</button>
                : <button type="button" data-principal onClick={() => jogar({ tipo: 'pagar' })}>[Pagar {o.pagar}{o.pagar === eu?.fichas ? ' ALL-IN' : ''}]</button>}
              {o.podeAumentar && o.minimo < o.maximo && <button type="button" onClick={() => jogar({ tipo: 'aumentar', total: o.minimo })}>[Aumentar a {o.minimo}]</button>}
              {o.podeAumentar && potTotal > o.minimo && potTotal < o.maximo && <button type="button" onClick={() => jogar({ tipo: 'aumentar', total: potTotal })}>[Pote: a {potTotal}]</button>}
              {o.podeAumentar && <button type="button" onClick={() => jogar({ tipo: 'aumentar', total: o.maximo })}>[All-in {o.maximo}]</button>}
            </>
          ) : fim ? (
            quebrou
              ? <button type="button" data-principal onClick={levantar}>[Sair da mesa]</button>
              : venceu
                ? <button type="button" data-principal onClick={levantar}>[Levantar com {eu?.fichas}]</button>
                : (
                  <>
                    <button type="button" data-principal onClick={() => proximaMao(mesa)}>[Proxima mao]</button>
                    <button type="button" onClick={levantar}>[Levantar com {eu?.fichas}]</button>
                  </>
                )
          ) : (
            <span>{' '}</span>
          )}
        </div>
      </div>
    </div>
  );
}
