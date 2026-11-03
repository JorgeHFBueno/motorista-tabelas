import { useEffect, useState } from 'react';
import { CartaView } from '../cartas/CartaView';
import { rngDe } from '../crawler/sim';
import { APOSTAS, alterarCarteira, lerCarteira, mover, semFichas } from '../fichas/carteira';
import { BarraDeFichas, SemFichas } from '../fichas/FichasView';
import { semMovimento, useCarteira, useOpcoesTeclado } from '../fichas/hooks';
import { gravarPlacar, lerPlacar, registrarJogada, type PlacarJogo } from '../fichas/jogos';
import { distribuir, dobrar, mesaNova, parar, pedir, podeDobrar, pontos, retorno, type Mesa, type Resultado } from './regras';

// 21 contra a banca. As fichas são as da carteira (as mesmas dos outros jogos e das skills); sair no meio da mão
// perde a aposta, que sai das fichas ao distribuir. A banca revela as cartas uma a uma no fim. Jogadas, vitórias e
// maior prêmio aparecem no Placar de Lideres.
const CHAVE = 'ledur:dev-21';
const REVELAR_MS = 380;

const FRASE: Record<Resultado, string> = {
  blackjack: 'BLACKJACK! PAGA 3:2',
  ganhou: 'VOCE GANHOU',
  'banca-estourou': 'A BANCA ESTOUROU',
  empate: 'EMPATE: A APOSTA VOLTA',
  perdeu: 'A BANCA GANHOU',
  estourou: 'ESTOUROU',
  'banca-blackjack': 'BLACKJACK DA BANCA',
};

export default function VinteUmToy() {
  const carteira = useCarteira();
  const [placar, setPlacar] = useState<PlacarJogo>(() => lerPlacar(CHAVE));
  const [mesa, setMesa] = useState<Mesa>(() => mesaNova(carteira.fichas));
  // cartas da banca já à mostra: no fim, as que ela comprou aparecem uma a uma
  const [mostradas, setMostradas] = useState(0);

  const revelando = mesa.fase === 'fim' && mostradas < mesa.banca.length;
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
    if (nova.fase === 'fim' && nova.resultado) guardar(registrarJogada(placar, nova.aposta, retorno(nova.resultado, nova.aposta)));
  };
  const acao = (f: (m: Mesa) => Mesa) => { const m = agora(); jogar(m, f(m)); };
  const novaMao = () => {
    const m = agora();
    setMostradas(semMovimento() ? Infinity : 2);
    jogar(m, distribuir(m, placar.aposta, rngDe((Math.random() * 2 ** 32) >>> 0)));
  };

  const jogando = mesa.fase === 'jogando';
  const resultado = mesa.fase === 'fim' && !revelando ? mesa.resultado : null;
  // durante a revelação, o pagamento já está na carteira, mas ainda não aparece
  const fichas = revelando && mesa.resultado ? carteira.fichas - retorno(mesa.resultado, mesa.aposta) : carteira.fichas;
  const banca = jogando ? mesa.banca : mesa.banca.slice(0, Math.max(2, mostradas));
  const pontosBanca = jogando ? pontos(mesa.banca.slice(0, 1)).total : pontos(banca).total;
  const saldo = resultado ? retorno(resultado, mesa.aposta) - mesa.aposta : 0;
  const quebrado = !jogando && !revelando && semFichas(carteira);
  const meus = pontos(mesa.jogador);
  const naMesa = jogando || revelando ? mesa.aposta : 0;
  const { raiz, teclas } = useOpcoesTeclado(`${mesa.fase}-${revelando}-${quebrado}`);

  return (
    <div className="dt-21 dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      <BarraDeFichas fichas={fichas} naMesa={naMesa} />
      <p className="dt-21-rotulo">
        BANCA
        {mesa.banca.length > 0 && <span className="dt-21-pontos">{pontosBanca}{jogando ? ' + ?' : ''}</span>}
      </p>
      <div className="dt-21-mao">
        {banca.map((c, i) => <CartaView key={i} carta={c} virada={jogando && i === 1} />)}
      </div>
      <p className="dt-21-rotulo">
        VOCE
        {mesa.jogador.length > 0 && <span className="dt-21-pontos">{meus.total}{meus.macia ? ' MACIO' : ''}</span>}
      </p>
      <div className="dt-21-mao">
        {mesa.jogador.map((c, i) => <CartaView key={i} carta={c} />)}
      </div>

      <p className="dt-jogo-aviso" aria-live="polite">
        {resultado ? `${FRASE[resultado]} (${saldo >= 0 ? '+' : ''}${saldo})` : revelando ? 'A BANCA JOGA...' : jogando ? 'PEDIR OU PARAR?' : 'FACA SUA APOSTA'}
      </p>

      <div className="dt-jogo-botoes" data-opcoes>
        {jogando ? (
          <>
            <button type="button" data-principal onClick={() => acao(pedir)}>[Pedir]</button>
            <button type="button" onClick={() => acao(parar)}>[Parar]</button>
            {podeDobrar({ ...mesa, fichas: carteira.fichas }) && <button type="button" onClick={() => acao(dobrar)}>[Dobrar]</button>}
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
