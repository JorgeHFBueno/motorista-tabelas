import { useEffect, useState } from 'react';
import { NAIPES, type Naipe } from '../cartas/baralho';
import { NaipeSvg } from '../cartas/CartaView';
import { rngDe } from '../crawler/sim';
import { anotar } from '../fichas/historico';
import { useOpcoesTeclado } from '../fichas/hooks';
import { PainelSala } from '../online/PainelSala';
import { anotarUmaVez } from '../online/sala';
import { useSalas } from '../online/useSalas';
import { MesaNeo } from './MesaNeo';
import { acabou, desistirNeo, jogadaNeo, lerJogoNeo, novoJogoNeo, resultadoNeo, type JogoNeo } from './online';
import { jogaveis, naipeVermelho, ordemNaMao, type CartaNeo, type Jogada } from './regras';

// NEO online, de 2 a 4 pessoas com retr0 (sala do DEV), na mesma mesa do jogo contra os bots, sem fichas (o
// resultado vai para o histórico da Carteira). Quem criou a sala começa. Desistir encerra a partida para todos.
// Fechar a janela não desiste: ao abrir de novo, a partida volta.
const sorteio = () => rngDe((Math.random() * 2 ** 32) >>> 0);

export default function NeoOnline({ onVoltar }: { onVoltar: () => void }) {
  const s = useSalas('neo');
  const { sala, eu } = s;
  const jogo = sala && sala.estado !== 'aberta' ? lerJogoNeo(sala.partida) : null;
  const [gritar, setGritar] = useState(false);
  // curinga esperando você escolher o naipe
  const [curinga, setCuringa] = useState<number | null>(null);

  const partida = jogo && eu >= 0 ? jogo.p : null;
  const emJogo = !!jogo && !acabou(jogo) && sala?.estado === 'jogando';
  const minhaVez = emJogo && !!partida && partida.vez === eu && !s.ocupado;
  const podem = new Set(minhaVez && partida ? jogaveis(partida).map((c) => c.id) : []);
  const minhas = partida ? partida.jogadores[eu].mao.slice().sort((x, y) => ordemNaMao(x) - ordemNaMao(y)) : [];
  const escolhido = curinga === null ? null : minhas.find((c) => c.id === curinga) ?? null;
  const principal = minhas.find((c) => podem.has(c.id));

  // no fim, o resultado vai uma vez para o histórico deste navegador
  const fimDaSala = sala?.estado === 'fim' ? sala.partida : null;
  useEffect(() => {
    const j = lerJogoNeo(fimDaSala);
    const r = j && eu >= 0 ? resultadoNeo(j, eu) : null;
    if (sala && j && r) anotarUmaVez(sala.id, () => anotar('NEO', 0, `ONLINE . ${j.p.jogadores.length} JOGADORES . ${r}`));
  }, [fimDaSala, eu, sala]);

  const gravar = (novo: JogoNeo | null) => {
    if (!sala || !novo) return;
    setCuringa(null);
    setGritar(false);
    void s.jogar(sala, { partida: JSON.stringify(novo), vez: sala.jogadores[novo.p.vez], fim: acabou(novo) });
  };
  const agirOnline = (a: Jogada) => { if (jogo && minhaVez) gravar(jogadaNeo(jogo, a, sorteio())); };
  const jogar = (c: CartaNeo, naipe?: Naipe) => {
    if (!minhaVez) return;
    if (!c.naipe && !naipe) { setCuringa(c.id); return; }
    agirOnline({ tipo: 'jogar', id: c.id, naipe, ultima: gritar });
  };
  const comecar = () => {
    if (!sala) return;
    const j = novoJogoNeo(sala.nomes, sorteio());
    void s.comecar(sala, JSON.stringify(j), sala.jogadores[j.p.vez]);
  };

  const { raiz, teclas } = useOpcoesTeclado(`${sala?.id}-${sala?.estado}-${partida?.vez}-${curinga}-${partida?.comprou}-${minhaVez}`);
  const daVez = partida ? partida.jogadores[partida.vez].nome : '';
  const aviso = s.erro
    ?? (!jogo || !partida
      ? null
      : !emJogo
        ? resultadoNeo(jogo, eu) ?? 'PARTIDA ENCERRADA'
        : !minhaVez
          ? `VEZ DE ${daVez}...`
          : escolhido
            ? 'ESCOLHA O NAIPE DO CURINGA'
            : partida.comprou !== null
              ? 'A COMPRADA SERVE: JOGUE OU PASSE'
              : !podem.size
                ? 'NADA SERVE: COMPRE'
                : minhas.length === 2
                  ? 'SUA VEZ. COM 2 CARTAS, GRITE ULTIMA ANTES DE JOGAR'
                  : 'SUA VEZ: COMBINE NAIPE OU SIMBOLO');

  return (
    <div className="dt-pk dt-neo dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      <div className="dt-pk-mesa">
        {partida && jogo && sala ? (
          <MesaNeo
            partida={partida}
            eu={eu}
            pensando
            minhas={minhas}
            podem={podem}
            escolhido={escolhido}
            principal={principal}
            encerrada={jogo.desistiu !== null}
            onJogar={(c) => jogar(c)}
          />
        ) : (
          <p className="dt-pk-vazia">{sala?.estado === 'aberta' ? `NA SALA: ${sala.nomes.join(', ')}` : 'MESA VAZIA'}</p>
        )}
      </div>

      <div className="dt-pk-painel">
        <p className="dt-jogo-legenda">NEO ONLINE . SEM FICHAS</p>
        {!partida || !jogo || !sala ? (
          <PainelSala s={s} minimo={2} onComecar={comecar} onVoltar={onVoltar} />
        ) : (
          <>
            <p className="dt-jogo-aviso" aria-live="polite">{aviso}</p>
            <div>
              <p className="dt-jogo-legenda">LANCES</p>
              <ul className="dt-neo-lances">
                {jogo.lances.map((r, i) => <li key={`${i}-${r}`}>{r}</li>)}
              </ul>
            </div>
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
                        <button type="button" data-principal={!principal || undefined} onClick={() => agirOnline({ tipo: 'comprar' })}>[Comprar]</button>
                      ) : (
                        <button type="button" onClick={() => agirOnline({ tipo: 'passar' })}>[Passar]</button>
                      )}
                      {minhas.length === 2 && (
                        <button type="button" className={gritar ? 'dt-jogo-escolhida' : undefined} aria-pressed={gritar} onClick={() => setGritar((g) => !g)}>
                          [ULTIMA!]
                        </button>
                      )}
                    </>
                  ) : null}
                  <button type="button" onClick={() => gravar(desistirNeo(jogo, eu))} disabled={s.ocupado}>[Desistir]</button>
                </>
              ) : (
                <button type="button" data-principal onClick={() => s.deixar(sala)}>[Sair]</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
