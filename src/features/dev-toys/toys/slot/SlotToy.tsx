import { useEffect, useState } from 'react';
import { rngDe } from '../crawler/sim';
import { APOSTAS, alterarCarteira, lerCarteira, mover, semFichas } from '../fichas/carteira';
import { BarraDeFichas, SemFichas } from '../fichas/FichasView';
import { anotar } from '../fichas/historico';
import { semMovimento, useCarteira, useOpcoesTeclado } from '../fichas/hooks';
import { gravarPlacar, lerPlacar, registrarJogada, type PlacarJogo } from '../fichas/jogos';
import { FITA, PREMIOS, premioDe, linhaDe, retornoDe, simboloEm, sortearParadas, type Simbolo } from './regras';

// Slot Machine com as fichas da carteira. O resultado sai ao puxar (fecha a janela girando e o prêmio já está na
// carteira); os rolos giram e param um a um, devagar no fim, e as fichas só mostram o prêmio quando o último para.
const CHAVE = 'ledur:dev-slot';
const QUADRO_MS = 55;
/** Quando cada rolo para, desde o puxão. */
const PARA_MS = [700, 1050, 1400];

/** Símbolos em pixels (9×9): a fonte do DEV não tem esses desenhos. Sete e cereja em vermelho. */
const DESENHO: Record<Simbolo, string> = {
  cereja: 'M4 0h3v1H4zM3 1h1v2H3zM6 1h1v3H6zM1 3h3v1H1zM0 4h5v2H0zM1 6h3v1H1zM5 4h3v1H5zM4 5h5v2H4zM5 7h3v1H5z',
  sino: 'M4 0h1v1H4zM3 1h3v1H3zM2 2h5v3H2zM1 5h7v1H1zM0 6h9v1H0zM4 7h1v2H4z',
  barra: 'M0 1h9v3H0zM0 5h9v3H0z',
  estrela: 'M4 0h1v2H4zM3 2h3v1H3zM0 3h9v1H0zM1 4h7v1H1zM2 5h5v1H2zM2 6h2v1H2zM5 6h2v1H5zM1 7h2v1H1zM6 7h2v1H6z',
  sete: 'M1 1h7v2H1zM6 3h2v1H6zM5 4h2v1H5zM4 5h2v1H4zM3 6h2v2H3z',
  olho: 'M2 2h5v1H2zM1 3h1v1H1zM7 3h1v1H7zM0 4h1v1H0zM8 4h1v1H8zM1 5h1v1H1zM7 5h1v1H7zM2 6h5v1H2zM3 4h3v1H3zM4 3h1v3H4z',
};
const VERMELHOS: Simbolo[] = ['cereja', 'sete'];

function SimboloView({ s, className }: { s: Simbolo; className?: string }) {
  return (
    <svg className={`dt-slot-simbolo${VERMELHOS.includes(s) ? ' dt-slot-vermelho' : ''}${className ? ` ${className}` : ''}`} viewBox="0 0 9 9" role="img" aria-label={s} shapeRendering="crispEdges">
      <path d={DESENHO[s]} />
    </svg>
  );
}

type Giro = { paradas: number[]; aposta: number; retorno: number; inicio: number };

export default function SlotToy() {
  const carteira = useCarteira();
  const [placar, setPlacar] = useState<PlacarJogo>(() => lerPlacar(CHAVE));
  const [giro, setGiro] = useState<Giro | null>(null);
  const [agora, setAgora] = useState(0);

  const decorrido = giro ? agora - giro.inicio : Infinity;
  const girando = decorrido < PARA_MS[2];
  useEffect(() => {
    if (!girando) return;
    const t = window.setInterval(() => setAgora(performance.now()), QUADRO_MS);
    return () => window.clearInterval(t);
  }, [girando]);

  const puxar = () => {
    const fichas = lerCarteira().fichas;
    if (girando || placar.aposta > fichas) return;
    const paradas = sortearParadas(rngDe((Math.random() * 2 ** 32) >>> 0));
    const retorno = retornoDe(paradas, placar.aposta);
    alterarCarteira((c) => mover(c, retorno - placar.aposta));
    const p = registrarJogada(placar, placar.aposta, retorno);
    setPlacar(p);
    gravarPlacar(CHAVE, p);
    anotar('SLOT', retorno - placar.aposta, `APOSTA ${placar.aposta}${retorno ? ` . PREMIO ${retorno}` : ''}`);
    const inicio = performance.now() - (semMovimento() ? PARA_MS[2] : 0);
    setGiro({ paradas, aposta: placar.aposta, retorno, inicio });
    setAgora(performance.now());
  };

  // rolo que ainda gira: anda uma posição por quadro e cai na parada sorteada quando chega a hora dele
  const posicao = (r: number) => {
    if (!giro) return r * 7;
    const faltam = Math.max(0, Math.ceil((PARA_MS[r] - decorrido) / QUADRO_MS));
    return (((giro.paradas[r] - faltam) % FITA.length) + FITA.length) % FITA.length;
  };
  const premio = giro && !girando ? premioDe(linhaDe(giro.paradas)) : null;
  const fichas = girando && giro ? carteira.fichas - giro.retorno : carteira.fichas;
  const quebrado = !girando && semFichas(carteira);
  const { raiz, teclas } = useOpcoesTeclado(`${girando}-${quebrado}`);

  return (
    <div className="dt-slot dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      <BarraDeFichas fichas={fichas} naMesa={girando && giro ? giro.aposta : 0} />
      <div className="dt-slot-maquina">
        <div className="dt-slot-rolos" aria-live="polite" aria-label={girando ? 'Girando' : giro ? `Linha: ${linhaDe(giro.paradas).join(', ')}` : 'Rolos parados'}>
          {[0, 1, 2].map((r) => {
            const p = posicao(r);
            const parado = !giro || decorrido >= PARA_MS[r];
            return (
              <div key={r} className={parado ? 'dt-slot-rolo' : 'dt-slot-rolo dt-slot-girando'}>
                <SimboloView s={simboloEm(p, -1)} className="dt-slot-fora" />
                <SimboloView s={simboloEm(p)} className={premio ? 'dt-slot-ganhou' : undefined} />
                <SimboloView s={simboloEm(p, 1)} className="dt-slot-fora" />
              </div>
            );
          })}
        </div>
        <table className="dt-slot-tabela">
          <tbody>
            {PREMIOS.map((p) => (
              <tr key={p.nome} className={premio === p ? 'dt-jogo-acesa' : undefined}>
                <td>{p.nome}</td>
                <td>x{p.paga}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="dt-jogo-aviso">
        {girando ? 'GIRANDO...' : premio && giro ? `${premio.nome} (+${giro.retorno - giro.aposta})` : giro ? `NADA (-${giro.aposta})` : 'FACA SUA APOSTA'}
      </p>

      <div className="dt-jogo-botoes" data-opcoes>
        {quebrado ? (
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
                disabled={girando || a > carteira.fichas}
                onClick={() => { const p = { ...placar, aposta: a }; setPlacar(p); gravarPlacar(CHAVE, p); }}
              >
                [{a}]
              </button>
            ))}
            <button type="button" data-principal onClick={puxar} disabled={girando || placar.aposta > carteira.fichas}>[Girar]</button>
          </>
        )}
      </div>
    </div>
  );
}
