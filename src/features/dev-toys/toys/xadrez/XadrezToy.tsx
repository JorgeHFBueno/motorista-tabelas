import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { rngDe } from '../crawler/sim';
import { alterarCarteira, lerCarteira, mover, semFichas } from '../fichas/carteira';
import { BarraDeFichas, SemFichas } from '../fichas/FichasView';
import { anotar } from '../fichas/historico';
import { useCarteira, useOpcoesTeclado } from '../fichas/hooks';
import { gravarPlacar, lerPlacar, registrarJogada, type PlacarJogo } from '../fichas/jogos';
import { ALEATORIA, NIVEIS, escolherLance, retornoDe, sortearNivel } from './bot';
import { PecaView } from './PecaView';
import { INICIAL, aplicar, chave, corDe, deFen, emXeque, fimDe, legais, nomeCasa, type Fim, type Lance, type Posicao } from './regras';

// Xadrez contra o bot, com as fichas da carteira: você joga de brancas. Cada nível tem a sua aposta (FACIL 10,
// MEDIO 50, DIFICIL 100); vitória paga o dobro, empate devolve, derrota (ou desistir, ou fechar a janela no meio)
// perde. ALEATORIA sorteia um dos três às cegas (só aparece no fim): entra de graça e a vitória paga 30. O peão que chega ao fim vira dama. Teclado: setas andam pelo tabuleiro e Enter escolhe a peça e a casa.
const CHAVE = 'ledur:dev-xadrez';
const PENSAR_MS = 250;

const NOME_PECA: Record<string, string> = { p: 'peao', r: 'torre', n: 'cavalo', b: 'bispo', q: 'dama', k: 'rei' };

const FRASE_FIM: Record<Fim, string> = {
  mate: 'XEQUE-MATE',
  afogamento: 'AFOGAMENTO: EMPATE',
  cinquenta: '50 LANCES SEM CAPTURA: EMPATE',
  repeticao: 'TRIPLA REPETICAO: EMPATE',
  material: 'SEM MATERIAL PARA MATE: EMPATE',
};

type Resultado = 'ganhou' | 'perdeu' | 'empate';
/** `nivel`: o do bot (na ALEATORIA, o sorteado); `aleatoria`: entrou pela ALEATORIA. */
type Partida = { pos: Posicao; historico: string[]; ultimo: Lance | null; aposta: number; nivel: number; aleatoria: boolean; fim: Fim | 'desistiu' | null; resultado: Resultado | null };
/** As opções: os três níveis e, por último, a ALEATORIA. */
const OPCOES = [...NIVEIS, ALEATORIA];
const I_ALEATORIA = NIVEIS.length;
const nomeDaPartida = (pt: Partida) => `${NIVEIS[pt.nivel].nome}${pt.aleatoria ? ' (ALEATORIA)' : ''}`;

/** Peças que cada lado já perdeu, comparando com o começo. */
function perdidas(tab: string[]) {
  const inicio = deFen(INICIAL).tab;
  const conta = (t: string[], x: string) => t.filter((y) => y === x).length;
  return (['b', 'p'] as const).map((cor) => 'qrbnp'.split('').flatMap((t) => {
    const x = cor === 'b' ? t.toUpperCase() : t;
    return Array.from({ length: Math.max(0, conta(inicio, x) - conta(tab, x)) }, () => x);
  }));
}

export default function XadrezToy() {
  const carteira = useCarteira();
  const [escolha, setNivel] = useState(0);
  // nível que não cabe na carteira cai na ALEATORIA (de graça)
  const nivel = OPCOES[escolha].aposta > carteira.fichas ? I_ALEATORIA : escolha;
  const [partida, setPartida] = useState<Partida | null>(null);
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const tabuleiro = useRef<HTMLDivElement>(null);

  const guardar = (p: PlacarJogo) => gravarPlacar(CHAVE, p);

  /** Joga o lance; se a partida acabou, paga e conta no placar. */
  const jogar = (pt: Partida, m: Lance): Partida => {
    const pos = aplicar(pt.pos, m);
    const historico = [...pt.historico, chave(pos)];
    const fim = fimDe(pos, historico);
    // mate: perde quem está na vez (sem saída); os outros fins são empate
    const resultado: Resultado | null = !fim ? null : fim === 'mate' ? (pos.vez === 'p' ? 'ganhou' : 'perdeu') : 'empate';
    if (resultado) {
      const volta = retornoDe(resultado, pt.aposta, pt.aleatoria);
      alterarCarteira((c) => mover(c, volta));
      guardar(registrarJogada(lerPlacar(CHAVE), pt.aposta, volta));
      anotar('XADREZ', volta - pt.aposta, `${nomeDaPartida(pt)} . ${resultado.toUpperCase()}`);
    }
    return { ...pt, pos, historico, ultimo: m, fim, resultado };
  };

  const comecar = () => {
    const aleatoria = nivel === I_ALEATORIA;
    const aposta = OPCOES[nivel].aposta;
    if (lerCarteira().fichas < aposta) return;
    if (aposta) alterarCarteira((c) => mover(c, -aposta));
    const pos = deFen(INICIAL);
    const doBot = aleatoria ? sortearNivel(Math.random) : nivel;
    setPartida({ pos, historico: [chave(pos)], ultimo: null, aposta, nivel: doBot, aleatoria, fim: null, resultado: null });
    setSelecionada(null);
    window.setTimeout(() => tabuleiro.current?.querySelector<HTMLButtonElement>('[data-casa="52"]')?.focus(), 0);
  };
  const desistir = () => {
    if (!partida || partida.resultado) return;
    guardar(registrarJogada(lerPlacar(CHAVE), partida.aposta, 0));
    anotar('XADREZ', -partida.aposta, `${nomeDaPartida(partida)} . DESISTIU`);
    setPartida({ ...partida, fim: 'desistiu', resultado: 'perdeu' });
  };

  // vez do bot: pensa depois de desenhar o seu lance
  const vezDoBot = !!partida && !partida.resultado && partida.pos.vez === 'p';
  useEffect(() => {
    if (!vezDoBot || !partida) return;
    const t = window.setTimeout(() => {
      const m = escolherLance(partida.pos, NIVEIS[partida.nivel], rngDe((Math.random() * 2 ** 32) >>> 0));
      if (m) setPartida(jogar(partida, m));
    }, PENSAR_MS);
    return () => window.clearTimeout(t);
    // jogar lê o placar e a carteira gravados; a partida é a dependência que importa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vezDoBot, partida]);

  const minhaVez = !!partida && !partida.resultado && partida.pos.vez === 'b';
  const meus = minhaVez && partida ? legais(partida.pos) : [];
  const destinos = selecionada === null ? [] : meus.filter((m) => m.de === selecionada);
  const clicar = (i: number) => {
    if (!partida || !minhaVez) return;
    const lance = destinos.find((m) => m.para === i && (!m.promocao || m.promocao === 'Q'));
    if (lance) { setSelecionada(null); setPartida(jogar(partida, lance)); return; }
    setSelecionada(meus.some((m) => m.de === i) ? i : null);
  };
  // setas andam pelo tabuleiro (Enter/espaço clicam na casa, como botão)
  const setas = (e: KeyboardEvent) => {
    // Enter e espaço ficam com a casa (o clique dela); o teclado dos jogos, acima, os pegaria
    if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); return; }
    const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[e.key];
    const atual = Number((document.activeElement as HTMLElement | null)?.dataset.casa);
    if (!d || Number.isNaN(atual)) return;
    e.preventDefault();
    e.stopPropagation();
    const prox = atual + d;
    if (prox < 0 || prox > 63 || (Math.abs(d) === 1 && (prox >> 3) !== (atual >> 3))) return;
    tabuleiro.current?.querySelector<HTMLButtonElement>(`[data-casa="${prox}"]`)?.focus();
  };

  const pos = partida?.pos ?? deFen(INICIAL);
  const xeque = partida && !partida.resultado && emXeque(pos) ? pos.tab.indexOf(pos.vez === 'b' ? 'K' : 'k') : -1;
  const [perdeuBranca, perdeuPreta] = perdidas(pos.tab);
  // sem fichas, ainda dá para jogar a ALEATORIA (de graça) ou pegar a mesada
  const quebrado = (!partida || !!partida.resultado) && semFichas(carteira);
  const { raiz, teclas } = useOpcoesTeclado(`${partida ? (partida.resultado ? 'fim' : 'jogo') : 'nada'}-${quebrado}`);
  const ganho = partida?.resultado ? retornoDe(partida.resultado, partida.aposta, partida.aleatoria) - partida.aposta : 0;
  // na ALEATORIA, o nível fica escondido até o fim
  const nomeBot = !partida ? '' : partida.aleatoria && !partida.resultado ? '???' : nomeDaPartida(partida);

  const aviso = !partida
    ? 'ESCOLHA O NIVEL'
    : partida.resultado
      ? `${partida.fim === 'desistiu' ? 'VOCE DESISTIU' : partida.fim === 'mate' ? `${FRASE_FIM.mate}: ${partida.resultado === 'ganhou' ? 'VOCE GANHOU' : 'O BOT GANHOU'}` : FRASE_FIM[partida.fim as Fim]} (${ganho >= 0 ? '+' : ''}${ganho})`
      : vezDoBot ? 'O BOT PENSA...' : xeque >= 0 ? 'XEQUE! SUA VEZ' : 'SUA VEZ';

  return (
    <div className="dt-xadrez dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      <BarraDeFichas fichas={carteira.fichas} naMesa={partida && !partida.resultado ? partida.aposta : 0} />
      <div className="dt-xz-mesa">
        <div className="dt-xz-tabuleiro" ref={tabuleiro} role="grid" aria-label="Tabuleiro" onKeyDown={setas}>
          {pos.tab.map((p, i) => {
            const escura = ((i >> 3) + (i & 7)) % 2 === 1;
            const alvo = destinos.some((m) => m.para === i);
            const classes = [
              'dt-xz-casa',
              escura ? 'dt-xz-escura' : '',
              i === selecionada ? 'dt-xz-selecionada' : '',
              partida?.ultimo && (i === partida.ultimo.de || i === partida.ultimo.para) ? 'dt-xz-ultimo' : '',
              i === xeque ? 'dt-xz-xeque' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={i}
                type="button"
                className={classes}
                data-casa={i}
                tabIndex={minhaVez ? 0 : -1}
                aria-label={`${nomeCasa(i)}${p !== '.' ? ` ${NOME_PECA[p.toLowerCase()]} ${corDe(p) === 'b' ? 'branco' : 'preto'}` : ''}${alvo ? ', destino' : ''}`}
                onClick={() => clicar(i)}
              >
                {p !== '.' && <PecaView p={p} />}
                {alvo && <span className={p === '.' ? 'dt-xz-ponto' : 'dt-xz-anel'} />}
              </button>
            );
          })}
        </div>
        <div className="dt-xz-lado">
          <p className="dt-jogo-legenda">BOT {nomeBot}</p>
          <div className="dt-xz-perdidas">{perdeuBranca.map((x, i) => <PecaView key={i} p={x} className="dt-xz-mini" />)}</div>
          <p className="dt-xz-aviso" aria-live="polite">{aviso}</p>
          <div className="dt-xz-perdidas">{perdeuPreta.map((x, i) => <PecaView key={i} p={x} className="dt-xz-mini" />)}</div>
          <p className="dt-jogo-legenda">VOCE . BRANCAS</p>
          <div className="dt-jogo-botoes dt-xz-botoes" data-opcoes>
            {partida && !partida.resultado ? (
              <button type="button" onClick={desistir}>[Desistir]</button>
            ) : (
              <>
                {quebrado && <SemFichas carteira={carteira} />}
                {OPCOES.map((n, i) => (
                  <button
                    key={n.nome}
                    type="button"
                    className={nivel === i ? 'dt-jogo-escolhida' : undefined}
                    aria-pressed={nivel === i}
                    disabled={n.aposta > carteira.fichas}
                    onClick={() => setNivel(i)}
                  >
                    [{n.nome} {'premio' in n ? `GRATIS, PAGA ${n.premio}` : n.aposta}]
                  </button>
                ))}
                <button type="button" data-principal onClick={comecar} disabled={OPCOES[nivel].aposta > carteira.fichas}>[Jogar]</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
