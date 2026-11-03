import { useEffect, useState } from 'react';
import { CartaView } from '../cartas/CartaView';
import { rngDe } from '../crawler/sim';
import { APOSTAS, alterarCarteira, lerCarteira, mover, semFichas } from '../fichas/carteira';
import { BarraDeFichas, SemFichas } from '../fichas/FichasView';
import { semMovimento, useCarteira, useOpcoesTeclado } from '../fichas/hooks';
import { gravarPlacar, lerPlacar, registrarJogada, type PlacarJogo } from '../fichas/jogos';
import { apostar, desistir, distribuir, mesaNova, nomeDaMao, passar, podeApostar, retorno, type Mesa, type Resultado } from './regras';

// Poker (Hold'em) contra a casa, com as fichas da carteira e o jeito do 21: a casa mostra uma carta; o flop abre
// carta a carta, você decide uma vez (apostar, passar ou desistir) e o resto da mesa e a carta fechada da casa
// aparecem uma a uma. Sair no meio da mão perde a aposta inicial, que sai das fichas ao distribuir.
const CHAVE = 'ledur:dev-poker';
const REVELAR_MS = 380;
/** Na revelação, as 5 da mesa e, por último, a carta fechada da casa. */
const TUDO = 6;

const FRASE: Record<Resultado, string> = {
  ganhou: 'VOCE GANHOU',
  perdeu: 'A CASA GANHOU',
  empate: 'EMPATE: VOLTA O QUE VOCE POS',
  'casa-desistiu': 'A CASA DESISTIU',
  desistiu: 'VOCE DESISTIU',
};

export default function PokerToy() {
  const carteira = useCarteira();
  const [placar, setPlacar] = useState<PlacarJogo>(() => lerPlacar(CHAVE));
  const [mesa, setMesa] = useState<Mesa>(() => mesaNova(carteira.fichas));
  // o que já virou: as cartas da mesa, uma a uma, e no fim a fechada da casa
  const [mostradas, setMostradas] = useState(0);

  const alvo = mesa.fase === 'decidindo' ? 3 : mesa.fase === 'fim' ? TUDO : 0;
  const revelando = mostradas < alvo;
  useEffect(() => {
    if (!revelando) return;
    const t = window.setTimeout(() => setMostradas((n) => n + 1), REVELAR_MS);
    return () => window.clearTimeout(t);
  }, [revelando, mostradas]);

  const guardar = (p: PlacarJogo) => { setPlacar(p); gravarPlacar(CHAVE, p); };
  // as regras olham as fichas da mesa; elas vêm sempre da carteira de agora (outro jogo pode ter mexido nela)
  const agora = (): Mesa => ({ ...mesa, fichas: lerCarteira().fichas });
  const jogar = (de: Mesa, nova: Mesa) => {
    if (nova === de) return;
    alterarCarteira((c) => mover(c, nova.fichas - de.fichas));
    setMesa(nova);
    if (nova.fase === 'fim' && nova.resultado) guardar(registrarJogada(placar, nova.aposta + nova.extra, retorno(nova.resultado, nova.aposta, nova.extra)));
  };
  const acao = (f: (m: Mesa) => Mesa) => { const m = agora(); jogar(m, f(m)); };
  const novaMao = () => {
    const m = agora();
    setMostradas(semMovimento() ? Infinity : 0);
    jogar(m, distribuir(m, placar.aposta, rngDe((Math.random() * 2 ** 32) >>> 0)));
  };

  const decidindo = mesa.fase === 'decidindo' && !revelando;
  const resultado = mesa.fase === 'fim' && !revelando ? mesa.resultado : null;
  const naMesaVisivel = mesa.mesa.slice(0, Math.min(mostradas, 5));
  const casaAberta = mesa.fase === 'fim' && mostradas >= TUDO;
  const ganho = resultado ? retorno(resultado, mesa.aposta, mesa.extra) - mesa.aposta - mesa.extra : 0;
  // no fim, durante a revelação, o pagamento já está na carteira, mas ainda não aparece
  const fichas = mesa.fase === 'fim' && revelando && mesa.resultado ? carteira.fichas - retorno(mesa.resultado, mesa.aposta, mesa.extra) : carteira.fichas;
  const naMesa = mesa.fase === 'decidindo' || (mesa.fase === 'fim' && revelando) ? mesa.aposta + mesa.extra : 0;
  const quebrado = mesa.fase !== 'decidindo' && !revelando && semFichas(carteira);
  const minha = mesa.jogador.length ? nomeDaMao([...mesa.jogador, ...naMesaVisivel]) : null;
  const daCasa = casaAberta ? nomeDaMao([...mesa.casa, ...mesa.mesa]) : null;
  const { raiz, teclas } = useOpcoesTeclado(`${mesa.fase}-${revelando}-${quebrado}`);

  return (
    <div className="dt-poker dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      <BarraDeFichas fichas={fichas} naMesa={naMesa} />
      <div className="dt-poker-mesa">
        <div className="dt-poker-casa">
          <p className="dt-21-rotulo">CASA{daCasa && <span className="dt-21-pontos">{daCasa}</span>}</p>
          <div className="dt-21-mao">
            {mesa.casa.map((c, i) => <CartaView key={i} carta={c} virada={i === 1 && !casaAberta} />)}
          </div>
        </div>
        <div className="dt-poker-centro">
          <p className="dt-21-rotulo">MESA</p>
          <div className="dt-21-mao">
            {mesa.mesa.length > 0 && mesa.mesa.map((c, i) => <CartaView key={`${i}-${i < naMesaVisivel.length}`} carta={c} virada={i >= naMesaVisivel.length} />)}
          </div>
        </div>
        <div className="dt-poker-voce">
          <p className="dt-21-rotulo">VOCE{minha && <span className="dt-21-pontos">{minha}</span>}</p>
          <div className="dt-21-mao">
            {mesa.jogador.map((c, i) => <CartaView key={i} carta={c} />)}
          </div>
        </div>
      </div>

      <p className="dt-jogo-aviso" aria-live="polite">
        {resultado
          ? `${FRASE[resultado]}${resultado !== 'desistiu' && resultado !== 'casa-desistiu' && daCasa ? `: ${minha} x ${daCasa}` : ''} (${ganho >= 0 ? '+' : ''}${ganho})`
          : revelando ? (mesa.fase === 'decidindo' ? 'O FLOP ABRE...' : 'A MESA ABRE...') : decidindo ? `APOSTAR ${mesa.aposta}, PASSAR OU DESISTIR?` : 'FACA SUA APOSTA'}
      </p>

      <div className="dt-jogo-botoes" data-opcoes>
        {mesa.fase === 'decidindo' ? (
          <>
            <button type="button" data-principal onClick={() => acao(apostar)} disabled={!decidindo || !podeApostar({ ...mesa, fichas: carteira.fichas })}>[Apostar {mesa.aposta}]</button>
            <button type="button" onClick={() => acao(passar)} disabled={!decidindo}>[Passar]</button>
            <button type="button" onClick={() => acao(desistir)} disabled={!decidindo}>[Desistir]</button>
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
                disabled={revelando || a > carteira.fichas}
                onClick={() => guardar({ ...placar, aposta: a })}
              >
                [{a}]
              </button>
            ))}
            <button type="button" data-principal onClick={novaMao} disabled={revelando || placar.aposta > carteira.fichas}>[Distribuir]</button>
          </>
        )}
      </div>
    </div>
  );
}
