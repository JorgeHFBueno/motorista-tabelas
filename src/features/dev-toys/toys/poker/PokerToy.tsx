import { useEffect, useRef, useState } from 'react';
import { CartaView } from '../cartas/CartaView';
import { gravar, ler } from '../crawler/memoria';
import { rngDe } from '../crawler/sim';
import { alterarCarteira, lerCarteira, mover } from '../fichas/carteira';
import { BarraDeFichas, SemFichas } from '../fichas/FichasView';
import { semMovimento, useCarteira, useOpcoesTeclado } from '../fichas/hooks';
import { gravarPlacar, lerPlacar, registrarJogada } from '../fichas/jogos';
import { decidir, novoBot } from './bots';
import { nomeDaMao } from './maos';
import { BLIND_GRANDE, ENTRADA, LUGARES, agir, mesaNova, novaMao, novoJogador, opcoes, pote, type Acao, type Jogador, type Mesa } from './mesa';

// Poker de mesa (Texas Hold'em sem limite): você e 3 bots. Você senta com até 200 fichas da carteira e, ao
// levantar, o que sobrou volta para ela. Bot que quebra sai e outro senta no lugar. O lugar fica guardado neste
// navegador (`ledur:dev-poker-mesa`): fechar a janela no meio da mão perde só o que já estava no pote dela.
const CHAVE = 'ledur:dev-poker';
const CHAVE_MESA = 'ledur:dev-poker-mesa';
const BOT_MS = 750;
const REVELAR_MS = 380;
const VOCE = 0;

const sorteio = () => rngDe((Math.random() * 2 ** 32) >>> 0);
const comBots = (voce: Jogador): Jogador[] => {
  const rng = sorteio();
  const lugares = [voce];
  for (let k = 1; k < LUGARES; k++) lugares.push(novoBot(rng, lugares.map((j) => j.nome)));
  return lugares;
};
const lerLugar = () => {
  const v = ler(CHAVE_MESA) as { fichas?: unknown } | null;
  return v && typeof v.fichas === 'number' && v.fichas > 0 ? Math.floor(v.fichas) : 0;
};

function Assento({ mesa, i, mostrar }: { mesa: Mesa; i: number; mostrar: boolean }) {
  const j = mesa.jogadores[i];
  const marca = i === mesa.botao ? 'D' : i === (mesa.botao + 1) % LUGARES ? 'SB' : i === (mesa.botao + 2) % LUGARES ? 'BB' : '';
  const vez = mesa.rua !== 'fim' && mesa.vez === i;
  const ganhou = mesa.rua === 'fim' && mesa.potes.some((p) => p.ganhadores.includes(i));
  return (
    <div className={`dt-pk-assento${vez ? ' dt-pk-vez' : ''}${j.desistiu ? ' dt-pk-fora' : ''}${ganhou ? ' dt-pk-ganhou' : ''}`}>
      <p className="dt-pk-nome">{j.nome}{marca && <span className="dt-pk-marca">{marca}</span>}</p>
      <p className="dt-jogo-legenda">{j.fichas} FICHAS{j.estilo ? ` . ${j.estilo.toUpperCase()}` : ''}</p>
      <div className="dt-pk-cartas">
        {j.cartas.map((c, k) => <CartaView key={k} carta={c} virada={!mostrar || j.desistiu} pequena />)}
      </div>
      <p className="dt-pk-ultima">{j.aposta ? `NA RODADA ${j.aposta}` : j.ultima ?? ''}{j.aposta && j.ultima ? ` . ${j.ultima}` : ''}</p>
    </div>
  );
}

export default function PokerToy() {
  const carteira = useCarteira();
  const [mesa, setMesa] = useState<Mesa | null>(() => {
    const fichas = lerLugar();
    return fichas ? mesaNova(comBots(novoJogador('VOCE', null, fichas))) : null;
  });
  const [mostradas, setMostradas] = useState(0);
  // fichas no começo da mão, para saber o saldo dela no fim
  const inicioMao = useRef(0);

  // o seu lugar fica guardado com as fichas de agora (sem o que já foi para o pote)
  useEffect(() => { gravar(CHAVE_MESA, mesa ? { fichas: mesa.jogadores[VOCE].fichas } : null); }, [mesa]);

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
      gravarPlacar(CHAVE, registrarJogada(lerPlacar(CHAVE), eu.investido, eu.investido + eu.fichas - inicioMao.current));
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
    proximaMao(mesaNova(comBots(novoJogador('VOCE', null, entrada))));
  };
  const proximaMao = (m: Mesa) => {
    // bot sem fichas sai e outro senta no lugar
    const rng = sorteio();
    const jogadores = m.jogadores.map((j, i) => (i === VOCE || j.fichas > 0 ? j : novoBot(rng, m.jogadores.map((x) => x.nome))));
    inicioMao.current = jogadores[VOCE].fichas;
    setMostradas(semMovimento() ? Infinity : 0);
    setMesa(novaMao({ ...m, jogadores }, rng));
  };
  const levantar = () => {
    if (!mesa || mesa.rua !== 'fim') return;
    const fichas = mesa.jogadores[VOCE].fichas;
    alterarCarteira((c) => mover(c, fichas));
    setMesa(null);
  };
  const jogar = (a: Acao) => { if (mesa && mesa.vez === VOCE && !revelando) aplicar(mesa, agir(mesa, a)); };

  const minhaVez = !!mesa && mesa.rua !== 'fim' && mesa.vez === VOCE && !revelando;
  const fim = !!mesa && mesa.rua === 'fim' && !revelando;
  const eu = mesa?.jogadores[VOCE];
  const quebrou = fim && eu?.fichas === 0;
  const podeSentar = carteira.fichas >= 2 * BLIND_GRANDE;
  const { raiz, teclas } = useOpcoesTeclado(`${mesa ? mesa.rua : 'fora'}-${minhaVez}-${fim}-${podeSentar}`);

  const o = minhaVez && mesa ? opcoes(mesa, VOCE) : null;
  const potAgora = mesa ? pote(mesa) : 0;
  const potTotal = o && mesa ? Math.max(o.minimo, Math.min(o.maximo, mesa.maior + potAgora + o.pagar)) : 0;
  const minha = eu && eu.cartas.length ? nomeDaMao([...eu.cartas, ...mesa!.comunitarias.slice(0, Math.min(mostradas, 5))]) : null;
  const mostrar = !!mesa && mesa.rua === 'fim' && mesa.mostrou && !revelando;

  const aviso = !mesa
    ? `SENTE COM ATE ${ENTRADA} FICHAS . BLINDS 5/10`
    : fim && !mesa.potes.length
      ? `SENTADO COM ${eu?.fichas} FICHAS`
      : fim
      ? mesa.potes.map((p) => {
        const nomes = p.ganhadores.map((g) => mesa.jogadores[g].nome).join(' E ');
        return `${nomes} ${p.ganhadores.length > 1 ? 'DIVIDEM' : 'LEVA'} ${p.valor}${p.mao ? ` COM ${p.mao}` : ''}`;
      }).join(' . ') + (quebrou ? ' . VOCE QUEBROU' : '')
      : revelando ? 'A MESA ABRE...' : minhaVez ? 'SUA VEZ' : `${mesa.jogadores[mesa.vez]?.nome ?? ''} PENSA...`;

  return (
    <div className="dt-pk dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      <BarraDeFichas fichas={carteira.fichas} naMesa={eu?.fichas ?? 0} />
      {mesa && (
        <>
          <div className="dt-pk-bots">
            {[1, 2, 3].map((i) => <Assento key={i} mesa={mesa} i={i} mostrar={mostrar} />)}
          </div>
          <div className="dt-pk-meio">
          <div className="dt-pk-centro">
            <div className="dt-21-mao">
              {mesa.comunitarias.length > 0 && mesa.comunitarias.map((c, i) => (
                <CartaView key={`${i}-${i < Math.min(mostradas, mesa.abertas)}`} carta={c} virada={i >= Math.min(mostradas, mesa.abertas)} />
              ))}
            </div>
            <p className="dt-jogo-legenda">POTE {potAgora}</p>
          </div>
          <div className={`dt-pk-voce${minhaVez ? ' dt-pk-vez' : ''}`}>
            <p className="dt-21-rotulo">
              VOCE{mesa.botao === VOCE ? ' (D)' : ''}
              {minha && !eu?.desistiu && <span className="dt-21-pontos">{minha}</span>}
            </p>
            <div className="dt-21-mao">
              {eu?.cartas.map((c, k) => <CartaView key={k} carta={c} />)}
            </div>
            <p className="dt-pk-ultima">{eu?.aposta ? `NA RODADA ${eu.aposta}` : eu?.ultima ?? ''}</p>
          </div>
          </div>
        </>
      )}

      <p className="dt-jogo-aviso" aria-live="polite">{aviso}</p>

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
            : (
              <>
                <button type="button" data-principal onClick={() => proximaMao(mesa)}>[Proxima mao]</button>
                <button type="button" onClick={levantar}>[Levantar com {eu?.fichas}]</button>
              </>
            )
        ) : (
          <span>{' '}</span>
        )}
      </div>
    </div>
  );
}
