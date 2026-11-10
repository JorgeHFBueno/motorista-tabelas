import { useEffect, useRef, useState } from 'react';
import { anotar } from '../fichas/historico';
import { useOpcoesTeclado } from '../fichas/hooks';
import { PainelSala } from '../online/PainelSala';
import { anotarUmaVez } from '../online/sala';
import { useSalas } from '../online/useSalas';
import {
  aceitarEmpate, assentoDaVez, corDoAssento, desistirXadrez, lanceOnline, lerJogoXadrez, novoJogoXadrez, resultadoXadrez, type JogoXadrez,
} from './online';
import { PecaView } from './PecaView';
import { FRASE_FIM, INICIAL, deFen, emXeque, legais, perdidas, type Fim } from './regras';
import { TabuleiroXadrez } from './TabuleiroXadrez';

// Xadrez online contra outra pessoa com retr0 (sala do DEV): cores sorteadas ao começar, sem relógio e sem fichas
// (o resultado vai para o histórico da Carteira). De pretas, o tabuleiro gira. Empate: ofereça junto com o lance; o
// outro aceita na vez dele. Fechar a janela não desiste: ao abrir de novo, a partida volta.
const INICIO = deFen(INICIAL);

export default function XadrezOnline({ onVoltar }: { onVoltar: () => void }) {
  const s = useSalas('xadrez');
  const { sala, eu } = s;
  const jogo = sala && sala.estado !== 'aberta' ? lerJogoXadrez(sala.partida) : null;
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [oferecer, setOferecer] = useState(false);
  const tabuleiro = useRef<HTMLDivElement>(null);

  const outro = sala && sala.jogadores.length > 1 && eu >= 0 ? sala.nomes[1 - eu] : '';
  const minha = jogo && eu >= 0 ? corDoAssento(jogo, eu) : 'b';
  const emJogo = !!jogo && !jogo.fim && sala?.estado === 'jogando';
  const minhaVez = emJogo && assentoDaVez(jogo) === eu && !s.ocupado;
  const meus = minhaVez ? legais(jogo.pos) : [];
  const destinos = selecionada === null ? [] : meus.filter((m) => m.de === selecionada);
  const ofereceram = minhaVez && !!jogo.oferta && jogo.oferta !== minha;

  // no fim, o resultado vai uma vez para o histórico deste navegador
  const fimDaSala = sala?.estado === 'fim' ? sala.partida : null;
  useEffect(() => {
    const j = lerJogoXadrez(fimDaSala);
    const r = j && eu >= 0 ? resultadoXadrez(j, eu) : null;
    if (sala && r) anotarUmaVez(sala.id, () => anotar('XADREZ', 0, `ONLINE . VS ${outro} . ${r.toUpperCase()}`));
  }, [fimDaSala, eu, outro, sala]);

  const gravar = (novo: JogoXadrez | null) => {
    if (!sala || !novo) return;
    setSelecionada(null);
    setOferecer(false);
    void s.jogar(sala, { partida: JSON.stringify(novo), vez: sala.jogadores[assentoDaVez(novo)], fim: !!novo.fim });
  };
  const comecar = () => {
    if (!sala) return;
    const j = novoJogoXadrez(Math.random);
    void s.comecar(sala, JSON.stringify(j), sala.jogadores[j.brancas]);
  };
  const clicar = (i: number) => {
    if (!jogo || !minhaVez) return;
    // o peão que chega ao fim vira dama
    const lance = destinos.find((m) => m.para === i && (!m.promocao || m.promocao.toLowerCase() === 'q'));
    if (lance) { gravar(lanceOnline(jogo, lance, oferecer)); return; }
    setSelecionada(meus.some((m) => m.de === i) ? i : null);
  };

  const pos = jogo?.pos ?? INICIO;
  const xeque = emJogo && emXeque(pos) ? pos.tab.indexOf(pos.vez === 'b' ? 'K' : 'k') : -1;
  const [perdeuBranca, perdeuPreta] = perdidas(pos.tab);
  // perto de cada um, as peças que ele já tomou
  const [tomouOutro, tomouEu] = minha === 'b' ? [perdeuBranca, perdeuPreta] : [perdeuPreta, perdeuBranca];
  const { raiz, teclas } = useOpcoesTeclado(`${sala?.id}-${sala?.estado}-${minhaVez}`);

  const nomeCor = (c: 'b' | 'p') => (c === 'b' ? 'BRANCAS' : 'PRETAS');
  const fim = jogo?.fim;
  const aviso = s.erro
    ?? (!jogo
      ? null
      : fim
        ? fim === 'desistiu'
          ? jogo.vencedor === eu ? `${outro} DESISTIU: VOCE GANHOU` : 'VOCE DESISTIU'
          : fim === 'acordo'
            ? 'EMPATE COMBINADO'
            : fim === 'mate'
              ? `XEQUE-MATE: ${jogo.vencedor === eu ? 'VOCE GANHOU' : `${outro} GANHOU`}`
              : FRASE_FIM[fim as Fim]
        : !minhaVez
          ? `VEZ DE ${outro}...`
          : ofereceram
            ? `${outro} OFERECE EMPATE: ACEITE OU JOGUE`
            : xeque >= 0 ? 'XEQUE! SUA VEZ' : 'SUA VEZ');

  return (
    <div className="dt-xadrez dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      <p className="dt-jogo-legenda">XADREZ ONLINE . SEM FICHAS</p>
      <div className="dt-xz-mesa">
        <TabuleiroXadrez
          pos={pos}
          ultimo={jogo?.ultimo ?? null}
          selecionada={selecionada}
          destinos={destinos}
          ativo={minhaVez}
          xeque={xeque}
          invertido={minha === 'p'}
          tabuleiro={tabuleiro}
          onCasa={clicar}
        />
        <div className="dt-xz-lado">
          {!jogo || !sala ? (
            <PainelSala s={s} minimo={2} onComecar={comecar} onVoltar={onVoltar} />
          ) : (
            <>
              <p className="dt-jogo-legenda">{outro} . {nomeCor(minha === 'b' ? 'p' : 'b')}</p>
              <div className="dt-xz-perdidas">{tomouOutro.map((x, i) => <PecaView key={i} p={x} className="dt-xz-mini" />)}</div>
              <p className="dt-xz-aviso" aria-live="polite">{aviso}</p>
              <div className="dt-xz-perdidas">{tomouEu.map((x, i) => <PecaView key={i} p={x} className="dt-xz-mini" />)}</div>
              <p className="dt-jogo-legenda">VOCE . {nomeCor(minha)}</p>
              <div className="dt-jogo-botoes dt-xz-botoes" data-opcoes>
                {emJogo ? (
                  <>
                    {ofereceram && <button type="button" data-principal onClick={() => gravar(aceitarEmpate(jogo))}>[Aceitar empate]</button>}
                    {minhaVez && !ofereceram && (
                      <button type="button" className={oferecer ? 'dt-jogo-escolhida' : undefined} aria-pressed={oferecer} onClick={() => setOferecer((o) => !o)}>
                        [Oferecer empate]
                      </button>
                    )}
                    <button type="button" onClick={() => gravar(desistirXadrez(jogo, eu))} disabled={s.ocupado}>[Desistir]</button>
                  </>
                ) : (
                  <button type="button" data-principal onClick={() => s.deixar(sala)}>[Sair]</button>
                )}
              </div>
              {minhaVez && oferecer && <p className="dt-jogo-legenda">A OFERTA VAI JUNTO COM O LANCE</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
