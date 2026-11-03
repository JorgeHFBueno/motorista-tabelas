import { useEffect, useState } from 'react';
import { CartaView } from '../cartas/CartaView';
import { FichasView } from './FichasView';
import { gravar, ler } from '../crawler/memoria';
import { rngDe } from '../crawler/sim';
import {
  APOSTAS, CHAVE_21, FICHAS_INICIAIS, distribuir, dobrar, mesaNova, normalizarPlacar, parar, pedir, podeDobrar, pontos, precisaEmprestimo,
  registrar, retorno, type Mesa, type Placar, type Resultado,
} from './regras';

// 21 contra a banca, com fichas de brincadeira guardadas neste navegador (`CHAVE_21`). Sair no meio da mão perde
// a aposta: ela sai das fichas ao distribuir. A banca revela as cartas uma a uma no fim. Recorde, mãos e vitórias
// aparecem no Placar de Lideres.
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

const semMovimento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export default function VinteUmToy() {
  const [placar, setPlacar] = useState<Placar>(() => normalizarPlacar(ler(CHAVE_21)));
  const [mesa, setMesa] = useState<Mesa>(() => mesaNova(placar.fichas));
  // cartas da banca já à mostra: no fim, as que ela comprou aparecem uma a uma
  const [mostradas, setMostradas] = useState(0);

  const revelando = mesa.fase === 'fim' && mostradas < mesa.banca.length;
  useEffect(() => {
    if (!revelando) return;
    const t = window.setTimeout(() => setMostradas((n) => n + 1), REVELAR_MS);
    return () => window.clearTimeout(t);
  }, [revelando, mostradas]);

  const guardar = (p: Placar) => {
    setPlacar(p);
    gravar(CHAVE_21, p);
    window.dispatchEvent(new CustomEvent(CHAVE_21));
  };
  const jogar = (nova: Mesa) => {
    if (nova === mesa) return;
    setMesa(nova);
    guardar(registrar(placar, nova));
  };
  const novaMao = () => {
    const m = distribuir(mesa, placar.aposta, rngDe((Math.random() * 2 ** 32) >>> 0));
    setMostradas(semMovimento() ? Infinity : 2);
    jogar(m);
  };
  const emprestar = () => {
    guardar({ ...placar, fichas: FICHAS_INICIAIS, emprestimos: placar.emprestimos + 1 });
    setMesa(mesaNova(FICHAS_INICIAIS));
  };

  const jogando = mesa.fase === 'jogando';
  const resultado = mesa.fase === 'fim' && !revelando ? mesa.resultado : null;
  // durante a revelação, as fichas ainda não receberam o pagamento
  const fichas = revelando && mesa.resultado ? mesa.fichas - retorno(mesa.resultado, mesa.aposta) : mesa.fichas;
  const banca = jogando ? mesa.banca : mesa.banca.slice(0, Math.max(2, mostradas));
  const pontosBanca = jogando ? pontos(mesa.banca.slice(0, 1)).total : pontos(banca).total;
  const saldo = resultado ? retorno(resultado, mesa.aposta) - mesa.aposta : 0;
  const semFichas = !jogando && !revelando && precisaEmprestimo(mesa.fichas);

  const meus = pontos(mesa.jogador);
  const naMesa = jogando || revelando ? mesa.aposta : 0;

  return (
    <div className="dt-21">
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

      <p className="dt-21-aviso" aria-live="polite">
        {resultado ? `${FRASE[resultado]} (${saldo >= 0 ? '+' : ''}${saldo})` : revelando ? 'A BANCA JOGA...' : jogando ? 'PEDIR OU PARAR?' : 'FACA SUA APOSTA'}
      </p>

      <div className="dt-21-botoes">
        {jogando ? (
          <>
            <button type="button" onClick={() => jogar(pedir(mesa))}>[Pedir]</button>
            <button type="button" onClick={() => jogar(parar(mesa))}>[Parar]</button>
            {podeDobrar(mesa) && <button type="button" onClick={() => jogar(dobrar(mesa))}>[Dobrar]</button>}
          </>
        ) : semFichas ? (
          <>
            <span>SEM FICHAS.</span>
            <button type="button" onClick={emprestar}>[A casa empresta {FICHAS_INICIAIS}]</button>
          </>
        ) : (
          <>
            <span>APOSTA</span>
            {APOSTAS.map((a) => (
              <button
                key={a}
                type="button"
                className={placar.aposta === a ? 'dt-21-escolhida' : undefined}
                aria-pressed={placar.aposta === a}
                disabled={revelando || a > mesa.fichas}
                onClick={() => guardar({ ...placar, aposta: a })}
              >
                [{a}]
              </button>
            ))}
            <button type="button" onClick={novaMao} disabled={revelando || placar.aposta > mesa.fichas}>[Distribuir]</button>
          </>
        )}
      </div>
      <div className="dt-21-fichas">
        <div className="dt-21-monte">
          <FichasView total={fichas} />
          <p><span className="dt-21-legenda">FICHAS</span>{fichas}</p>
        </div>
        {placar.emprestimos > 0 && <p><span className="dt-21-legenda">EMPRESTIMOS</span>{placar.emprestimos}</p>}
        <div className="dt-21-monte">
          <p><span className="dt-21-legenda">NA MESA</span>{naMesa || '-'}</p>
          <FichasView total={naMesa} />
        </div>
      </div>
    </div>
  );
}
