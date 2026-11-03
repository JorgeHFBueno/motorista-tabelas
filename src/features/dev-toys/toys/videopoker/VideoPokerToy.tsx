import { useState, type KeyboardEvent } from 'react';
import { CartaView } from '../cartas/CartaView';
import { rngDe } from '../crawler/sim';
import { APOSTAS, alterarCarteira, lerCarteira, mover, semFichas } from '../fichas/carteira';
import { BarraDeFichas, SemFichas } from '../fichas/FichasView';
import { useCarteira, useOpcoesTeclado } from '../fichas/hooks';
import { gravarPlacar, lerPlacar, registrarJogada, type PlacarJogo } from '../fichas/jogos';
import { TABELA, avaliar, distribuir, mesaNova, pagaDe, segurar, trocar, type Mesa } from './regras';

// Video Poker (Jacks or Better) com as fichas da carteira: aposta, segura cartas (clique, Enter ou as teclas 1 a 5)
// e troca as outras uma vez. A tabela de prêmios fica à mostra, com a linha do jogo atual acesa.
const CHAVE = 'ledur:dev-videopoker';

export default function VideoPokerToy() {
  const carteira = useCarteira();
  const [placar, setPlacar] = useState<PlacarJogo>(() => lerPlacar(CHAVE));
  const [mesa, setMesa] = useState<Mesa>(() => mesaNova(carteira.fichas));

  const guardar = (p: PlacarJogo) => { setPlacar(p); gravarPlacar(CHAVE, p); };
  const jogar = (de: Mesa, nova: Mesa) => {
    if (nova === de) return;
    alterarCarteira((c) => mover(c, nova.fichas - de.fichas));
    setMesa(nova);
    if (nova.fase === 'fim') guardar(registrarJogada(placar, nova.aposta, nova.aposta * pagaDe(nova.jogo)));
  };
  const agora = (): Mesa => ({ ...mesa, fichas: lerCarteira().fichas });
  const novaMao = () => { const m = agora(); jogar(m, distribuir(m, placar.aposta, rngDe((Math.random() * 2 ** 32) >>> 0))); };
  const trocarCartas = () => { const m = agora(); jogar(m, trocar(m)); };

  const segurando = mesa.fase === 'segurando';
  const quebrado = !segurando && semFichas(carteira);
  // o jogo que a mão de agora já forma (durante a escolha) ou o que pagou (no fim)
  const jogoDaVez = mesa.fase === 'fim' ? mesa.jogo : segurando ? avaliar(mesa.mao) : null;
  const ganho = mesa.fase === 'fim' ? mesa.aposta * pagaDe(mesa.jogo) - mesa.aposta : 0;
  const nomeDaVez = TABELA.find((t) => t.jogo === jogoDaVez)?.nome;
  const { raiz, teclas } = useOpcoesTeclado(`${mesa.fase}-${quebrado}`);
  const tecla = (e: KeyboardEvent) => {
    const i = Number(e.key) - 1;
    if (segurando && i >= 0 && i <= 4) { e.preventDefault(); setMesa(segurar(mesa, i)); return; }
    teclas(e);
  };

  return (
    <div className="dt-vp dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={tecla}>
      <BarraDeFichas fichas={carteira.fichas} naMesa={segurando ? mesa.aposta : 0} />
      {/* prêmios em fichas para a aposta da vez, em 3 colunas */}
      <ul className="dt-vp-tabela" aria-label="Premios">
        {TABELA.map((t) => (
          <li key={t.jogo} className={t.jogo === jogoDaVez ? 'dt-vp-acesa' : undefined}>
            <span>{t.nome}</span>
            <span>{t.paga * (segurando || mesa.fase === 'fim' ? mesa.aposta : placar.aposta)}</span>
          </li>
        ))}
      </ul>

      <div className="dt-vp-mao" data-opcoes>
        {mesa.mao.length
          ? mesa.mao.map((c, i) => (
            <button
              key={i}
              type="button"
              className={mesa.segura[i] ? 'dt-vp-carta dt-vp-segura' : 'dt-vp-carta'}
              disabled={!segurando}
              aria-pressed={segurando ? mesa.segura[i] : undefined}
              onClick={() => setMesa(segurar(mesa, i))}
            >
              <CartaView carta={c} />
              <span className="dt-vp-legenda">{mesa.segura[i] ? 'SEGURA' : segurando ? String(i + 1) : ''}</span>
            </button>
          ))
          : Array.from({ length: 5 }, (_, i) => <span key={i} className="dt-carta dt-carta-verso" aria-hidden="true" />)}
      </div>

      <p className="dt-jogo-aviso" aria-live="polite">
        {mesa.fase === 'fim'
          ? (nomeDaVez ? `${nomeDaVez} (+${ganho})` : `NADA (${ganho})`)
          : segurando ? `SEGURE E TROQUE${nomeDaVez ? `: ${nomeDaVez}` : ''}` : 'FACA SUA APOSTA'}
      </p>

      <div className="dt-jogo-botoes" data-opcoes>
        {segurando ? (
          <button type="button" data-principal onClick={trocarCartas}>[Trocar]</button>
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
            <button type="button" data-principal onClick={novaMao} disabled={placar.aposta > carteira.fichas}>[Distribuir]</button>
          </>
        )}
      </div>
    </div>
  );
}
