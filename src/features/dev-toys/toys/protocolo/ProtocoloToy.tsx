import { useEffect, useState } from 'react';
import { rngDe } from '../crawler/sim';
import { alterarCarteira, lerCarteira, mover } from '../fichas/carteira';
import { FichasView, SemFichas } from '../fichas/FichasView';
import { anotar } from '../fichas/historico';
import { semMovimento, useCarteira, useOpcoesTeclado } from '../fichas/hooks';
import { gravarPlacar, lerPlacar, registrarJogada } from '../fichas/jogos';
import { NOMES_BOT } from '../poker/bots';
import { NIVEIS, decidirBot } from './bot';
import { CartaPtView, IconeFileira } from './CartaPtView';
import {
  FACCOES, LIDER, NOME_CLIMA, NOME_FILEIRA, PASSIVA, VIDAS, agir, alvosCtrlz, fileirasPara, forcaNoCampo, liderPode, nomeDaCartaPt, novaPartida,
  retornoProtocolo, revivivel, total, totalFileira, type Carta, type Faccao, type Fileira, type Jogada, type Partida,
} from './regras';

// PROTOCOLO contra um bot: as fileiras dele em cima (DISCO, REDE, CPU) e as suas embaixo (CPU, REDE, DISCO), o clima
// no meio; à esquerda, os dois lados (total, vidas, mão, baralho, descarte, líder) e o placar das rodadas; à direita,
// a carteira, o aviso, as opções e os últimos lances. A aposta é a do nível do bot e sai ao começar; vitória paga o
// dobro, empate devolve; desistir, ou fechar a janela no meio, perde a aposta.
const CHAVE = 'ledur:dev-protocolo';
/** Devagar o bastante para ver o que o bot fez: ele "pensa" e a jogada aparece no selo dele. */
const BOT_MS = 1400;
const VOCE = 0;
const BOT = 1;
const LANCES = 8;
const sorteio = () => rngDe((Math.random() * 2 ** 32) >>> 0);
const outra = (f: Faccao): Faccao => FACCOES.find((x) => x !== f)!;

/** A última jogada num selo (aceso: líder ou especial; contorno: o resto; apagado: passou). */
function Selo({ texto, pensando }: { texto: string | null; pensando: boolean }) {
  if (pensando) return <p className="dt-pk-selo dt-pk-pensa">PENSA<span className="dt-pk-pontos">...</span></p>;
  if (!texto) return <p className="dt-pk-selo">{' '}</p>;
  const tipo = /^PASSOU/.test(texto) ? 'fora' : /LIDER|KILL|OVERCLOCK|SUPERAQUECIMENTO|LAG|DISCO CHEIO|REBOOT|CTRL/.test(texto) ? 'forte' : 'leve';
  return <p className={`dt-pk-selo dt-pk-selo-${tipo}`}>{texto}</p>;
}

function Vidas({ n }: { n: number }) {
  return (
    <span className="dt-pt-vidas" role="img" aria-label={`${n} de ${VIDAS} vidas`}>
      {Array.from({ length: VIDAS }, (_, k) => <span key={k} className={k < n ? 'dt-pt-vida' : 'dt-pt-vida dt-pt-vida-perdida'} />)}
    </span>
  );
}

/** Um lado, à esquerda: nome, facção, total, vidas, contagens, líder e a última jogada. */
function Info({ p, i, pensando }: { p: Partida; i: 0 | 1; pensando: boolean }) {
  const l = p.lados[i];
  const vez = p.fase === 'jogo' && (p.pendente ?? p.vez) === i;
  const ganhou = p.fase === 'fim' && p.vencedor === i;
  return (
    <div className={`dt-pt-info${vez ? ' dt-pk-vez' : ''}${ganhou ? ' dt-pk-ganhou' : ''}${l.passou ? ' dt-pt-passou' : ''}`}>
      <p className="dt-pk-nome">{l.nome}<span className="dt-pk-estilo">{l.faccao}</span></p>
      <p className="dt-pt-total">{total(p, i)}{l.passou && <span className="dt-pk-marca">PASSOU</span>}</p>
      <Vidas n={l.vidas} />
      <p className="dt-pt-contas">MAO {l.mao.length} . BARALHO {l.baralho.length} . DESCARTE {l.descarte.length}</p>
      <p className="dt-pt-contas">LIDER {LIDER[l.faccao].nome}{l.liderUsado ? ' (USADO)' : ''}</p>
      <Selo key={`${l.ultima}-${pensando}`} texto={l.ultima} pensando={pensando} />
    </div>
  );
}

/** Uma fileira: ícone, nome e total; OVERCLOCK; o clima; as cartas (com a força no campo). */
function Linha({ p, i, f, alvoFileira, alvoCarta, onFileira, onCarta }: {
  p: Partida; i: 0 | 1; f: Fileira; alvoFileira: boolean; alvoCarta: (c: Carta) => boolean; onFileira: () => void; onCarta: (c: Carta) => void;
}) {
  const l = p.lados[i];
  const clima = p.clima[f];
  const conteudo = (
    <>
      <span className="dt-pt-rotulo">
        <IconeFileira f={f} />
        {NOME_FILEIRA[f]}
        <b>{totalFileira(p, i, f)}</b>
      </span>
      <span className="dt-pt-extras">
        {l.trompa[f] && <span className="dt-pt-tag">X2</span>}
        {clima && <span className="dt-pt-tag dt-pt-tag-clima">{NOME_CLIMA[f]}</span>}
      </span>
      <span className="dt-pt-cartas">
        {l.campo[f].map((c) => {
          const carta = <CartaPtView carta={c} forca={c.tipo === 'unidade' ? forcaNoCampo(p, i, f, c) : undefined} />;
          return alvoCarta(c) ? (
            <button key={c.id} type="button" className="dt-pt-alvo" aria-label={`Trazer de volta ${nomeDaCartaPt(c)}`} onClick={() => onCarta(c)}>{carta}</button>
          ) : (
            <span key={c.id}>{carta}</span>
          );
        })}
      </span>
    </>
  );
  const classe = `dt-pt-linha${clima ? ' dt-pt-com-clima' : ''}`;
  return alvoFileira ? (
    <button type="button" className={`${classe} dt-pt-alvo`} aria-label={`Jogar na ${NOME_FILEIRA[f]}`} onClick={onFileira}>{conteudo}</button>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

export default function ProtocoloToy() {
  const carteira = useCarteira();
  const [faccao, setFaccao] = useState<Faccao>('MAINFRAME');
  const [nivel, setNivel] = useState(0);
  const [partida, setPartida] = useState<Partida | null>(null);
  // a aposta e o nível da partida em jogo
  const [jogo, setJogo] = useState({ aposta: 0, nivel: 0 });
  const [registro, setRegistro] = useState<string[]>([]);
  // a carta que espera a fileira (ágil, OVERCLOCK) ou a unidade (CTRL+Z)
  const [sel, setSel] = useState<number | null>(null);

  /** Fim da partida: paga e conta no placar e no histórico. */
  const fechar = (p: Partida, desistiu: boolean) => {
    const volta = desistiu ? 0 : retornoProtocolo(p.vencedor, jogo.aposta);
    if (volta) alterarCarteira((c) => mover(c, volta));
    gravarPlacar(CHAVE, registrarJogada(lerPlacar(CHAVE), jogo.aposta, volta));
    const placar = `${p.rodadas.filter((r) => r.vencedor === VOCE).length} A ${p.rodadas.filter((r) => r.vencedor === BOT).length}`;
    const como = desistiu ? 'DESISTIU' : p.vencedor === VOCE ? `VENCEU ${placar}` : p.vencedor === BOT ? `PERDEU ${placar}` : 'EMPATE';
    anotar('PROTOCOLO', volta - jogo.aposta, `${NIVEIS[jogo.nivel].nome} . ${p.lados[0].faccao} X ${p.lados[1].faccao} . ${como}`);
  };

  const aplicar = (de: Partida, a: Jogada) => {
    const nova = agir(de, a, sorteio());
    if (nova === de) return;
    setPartida(nova);
    setSel(null);
    if (nova.aviso !== de.aviso) setRegistro((r) => [nova.aviso, ...r].slice(0, LANCES));
    if (nova.fase === 'fim' && de.fase !== 'fim') fechar(nova, false);
  };

  // vez do bot (ou o BACKUP dele): pensa um pouco e joga
  const vezDoBot = !!partida && partida.fase === 'jogo' && (partida.pendente ?? partida.vez) === BOT;
  useEffect(() => {
    if (!vezDoBot || !partida) return;
    const t = window.setTimeout(() => aplicar(partida, decidirBot(partida, sorteio(), NIVEIS[jogo.nivel])), semMovimento() ? 150 : BOT_MS);
    return () => window.clearTimeout(t);
    // aplicar só lê a aposta e o nível, que não mudam na partida; a partida é a dependência que importa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vezDoBot, partida]);

  const aposta = NIVEIS[nivel].aposta;
  const comecar = () => {
    if (aposta > lerCarteira().fichas) return;
    alterarCarteira((c) => mover(c, -aposta));
    const rng = sorteio();
    // o bot fica com a outra facção (e não troca cartas)
    const p = novaPartida(faccao, outra(faccao), NOMES_BOT[Math.floor(rng() * NOMES_BOT.length)], rng);
    setJogo({ aposta, nivel });
    setSel(null);
    setPartida(p);
    setRegistro([p.aviso]);
  };
  const desistir = () => {
    if (!partida || partida.fase === 'fim') return;
    fechar(partida, true);
    setPartida(null);
    setRegistro([`VOCE DESISTIU (-${jogo.aposta})`]);
  };

  const fase = partida?.fase;
  const emJogo = !!partida && fase !== 'fim';
  const minhaVez = !!partida && fase === 'jogo' && partida.pendente === null && partida.vez === VOCE;
  const eu = partida?.lados[VOCE];
  const selecionada = sel === null || !eu ? null : eu.mao.find((c) => c.id === sel) ?? null;
  const filas = selecionada && eu ? fileirasPara(selecionada, eu) : [];
  const alvosZ = selecionada?.tipo === 'ctrlz' && eu ? alvosCtrlz(eu) : [];

  /** O que pode ser feito com a carta da mão agora (troca, ou jogar). */
  const podeUsar = (c: Carta) => {
    if (!partida || !eu) return false;
    if (fase === 'troca') return partida.trocas > 0;
    if (!minhaVez) return false;
    if (c.tipo === 'overclock') return fileirasPara(c, eu).length > 0;
    if (c.tipo === 'ctrlz') return alvosCtrlz(eu).length > 0;
    return true;
  };
  const usar = (c: Carta) => {
    if (!partida || !eu || !podeUsar(c)) return;
    if (fase === 'troca') return aplicar(partida, { tipo: 'trocar', id: c.id });
    const precisaFileira = c.tipo === 'overclock' || (c.tipo === 'unidade' && c.fileira === 'agil');
    if (precisaFileira || c.tipo === 'ctrlz') return setSel(sel === c.id ? null : c.id);
    aplicar(partida, { tipo: 'jogar', id: c.id });
  };
  const naFileira = (f: Fileira) => { if (partida && selecionada) aplicar(partida, { tipo: 'jogar', id: selecionada.id, fileira: f }); };
  const naUnidade = (alvo: Carta) => { if (partida && selecionada) aplicar(partida, { tipo: 'jogar', id: selecionada.id, alvo: alvo.id }); };

  const { raiz, teclas } = useOpcoesTeclado(`${fase}-${partida?.vez}-${partida?.pendente}-${sel}-${partida?.rodada}`);

  const saldo = partida && fase === 'fim' ? retornoProtocolo(partida.vencedor, jogo.aposta) - jogo.aposta : 0;
  const aviso = !partida
    ? `ESCOLHA A FACCAO E O BOT. VITORIA PAGA O DOBRO`
    : fase === 'troca'
      ? `TROQUE ATE ${partida.trocas} CARTAS (CLIQUE NELAS) OU SIGA`
      : fase === 'placar' || fase === 'fim'
        ? `${partida.aviso}${fase === 'fim' ? ` (${saldo >= 0 ? '+' : ''}${saldo})` : ''}`
        : partida.pendente === VOCE
          ? 'ESCOLHA O QUE O BACKUP REVIVE'
          : selecionada
            ? selecionada.tipo === 'ctrlz' ? 'ESCOLHA A UNIDADE QUE VOLTA PARA A MAO' : 'ESCOLHA A FILEIRA'
            : minhaVez
              ? 'SUA VEZ: JOGUE UMA CARTA OU PASSE'
              : eu?.passou ? `VOCE PASSOU. ${partida.lados[BOT].nome} SEGUE...` : `${partida.lados[BOT].nome} PENSA...`;

  const minhas = eu ? [...eu.mao].sort((a, b) => (a.tipo === 'unidade' ? 0 : 1) - (b.tipo === 'unidade' ? 0 : 1) || b.forca - a.forca) : [];
  const principalMao = fase === 'troca' ? null : minhas.find(podeUsar);

  return (
    <div className="dt-pt dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      {/* à esquerda: o bot, o placar das rodadas e você */}
      <div className="dt-pt-lados">
        {partida ? (
          <>
            <Info p={partida} i={BOT} pensando={vezDoBot} />
            <div className="dt-pt-rodadas">
              <p className="dt-jogo-legenda">RODADA {Math.min(partida.rodada, 3)} DE 3</p>
              {partida.rodadas.map((r, k) => (
                <p key={k}>
                  R{k + 1} {r.pontos[0]} X {r.pontos[1]}
                  <span className="dt-pk-estilo">{r.vencedor === null ? 'EMPATE' : r.vencedor === VOCE ? 'VOCE' : partida.lados[BOT].nome}</span>
                </p>
              ))}
            </div>
            <Info p={partida} i={VOCE} pensando={false} />
          </>
        ) : (
          FACCOES.map((f) => (
            <div key={f} className="dt-pt-info">
              <p className="dt-pk-nome">{f}</p>
              <p className="dt-pt-contas">{PASSIVA[f]}</p>
              <p className="dt-pt-contas">LIDER {LIDER[f].nome}: {LIDER[f].texto}</p>
            </div>
          ))
        )}
      </div>

      {/* o tabuleiro: as fileiras do bot, o clima e as suas; a sua mão embaixo */}
      <div className="dt-pt-tabuleiro">
        {partida && eu ? (
          <>
            {(['disco', 'rede', 'cpu'] as Fileira[]).map((f) => (
              <Linha key={`b${f}`} p={partida} i={BOT} f={f} alvoFileira={false} alvoCarta={() => false} onFileira={() => undefined} onCarta={() => undefined} />
            ))}
            <p className="dt-pt-meio">
              {(['cpu', 'rede', 'disco'] as Fileira[]).some((f) => partida.clima[f])
                ? (['cpu', 'rede', 'disco'] as Fileira[]).filter((f) => partida.clima[f]).map((f) => `${NOME_CLIMA[f]} (${NOME_FILEIRA[f]})`).join(' . ')
                : 'SEM CLIMA'}
            </p>
            <div className="dt-pt-meus" data-opcoes={selecionada ? true : undefined}>
              {(['cpu', 'rede', 'disco'] as Fileira[]).map((f) => (
                <Linha
                  key={`v${f}`} p={partida} i={VOCE} f={f}
                  alvoFileira={filas.includes(f)}
                  alvoCarta={(c) => alvosZ.includes(c)}
                  onFileira={() => naFileira(f)}
                  onCarta={naUnidade}
                />
              ))}
            </div>
            <div className="dt-pt-mao" data-opcoes>
              {minhas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={c.id === sel ? 'dt-pt-selecionada' : fase === 'jogo' && minhaVez && !podeUsar(c) ? 'dt-pt-apagada' : undefined}
                  disabled={!podeUsar(c)}
                  data-principal={c === principalMao || undefined}
                  aria-label={`${fase === 'troca' ? 'Trocar' : 'Jogar'} ${nomeDaCartaPt(c)}`}
                  onClick={() => usar(c)}
                >
                  <CartaPtView carta={c} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="dt-pk-vazia">MESA VAZIA</p>
        )}
      </div>

      {/* à direita: a carteira e a aposta, o aviso, as opções e os lances */}
      <div className="dt-pk-painel">
        <div className="dt-pk-fichas">
          <div>
            <p><span className="dt-jogo-legenda">CARTEIRA</span>{carteira.fichas}</p>
            <FichasView total={carteira.fichas} />
          </div>
          <div>
            <p><span className="dt-jogo-legenda">NA MESA</span>{emJogo ? jogo.aposta : '-'}</p>
            <FichasView total={emJogo ? jogo.aposta : 0} />
          </div>
        </div>
        <p className="dt-jogo-aviso" aria-live="polite">{aviso}</p>

        <div className="dt-jogo-botoes" data-opcoes>
          {!emJogo ? (
            carteira.fichas < NIVEIS[0].aposta ? (
              <SemFichas carteira={carteira} />
            ) : (
              <>
                <span className="dt-pt-escolha">
                  VOCE
                  {FACCOES.map((f) => (
                    <button key={f} type="button" className={faccao === f ? 'dt-jogo-escolhida' : undefined} aria-pressed={faccao === f} onClick={() => setFaccao(f)}>[{f}]</button>
                  ))}
                </span>
                <span className="dt-pt-escolha">
                  BOT
                  {NIVEIS.map((n, k) => (
                    <button key={n.nome} type="button" className={nivel === k ? 'dt-jogo-escolhida' : undefined} aria-pressed={nivel === k} disabled={n.aposta > carteira.fichas} onClick={() => setNivel(k)}>
                      [{n.nome} {n.aposta}]
                    </button>
                  ))}
                </span>
                <button type="button" data-principal onClick={comecar} disabled={aposta > carteira.fichas}>[Jogar contra {outra(faccao)}]</button>
              </>
            )
          ) : fase === 'troca' ? (
            <button type="button" data-principal onClick={() => aplicar(partida, { tipo: 'pronto' })}>[Pronto, comecar]</button>
          ) : fase === 'placar' ? (
            <button type="button" data-principal onClick={() => aplicar(partida, { tipo: 'seguir' })}>
              {partida.lados.some((l) => l.vidas <= 0) ? '[Ver o resultado]' : '[Proxima rodada]'}
            </button>
          ) : partida.pendente === VOCE && eu ? (
            <>
              {revivivel(eu).map((c, k) => (
                <button key={c.id} type="button" data-principal={k === 0 || undefined} onClick={() => aplicar(partida, { tipo: 'reviver', id: c.id })}>
                  [{c.nome} {c.forca}]
                </button>
              ))}
              <button type="button" onClick={() => aplicar(partida, { tipo: 'reviver', id: null })}>[Nao reviver]</button>
            </>
          ) : selecionada ? (
            <>
              {filas.map((f, k) => (
                <button key={f} type="button" data-principal={k === 0 || undefined} onClick={() => naFileira(f)}>[{NOME_FILEIRA[f]}]</button>
              ))}
              <button type="button" onClick={() => setSel(null)}>[Cancelar]</button>
            </>
          ) : minhaVez ? (
            <>
              <button type="button" data-principal={!principalMao || undefined} onClick={() => aplicar(partida, { tipo: 'passar' })}>[Passar]</button>
              {liderPode(partida, VOCE) && (
                <button type="button" onClick={() => aplicar(partida, { tipo: 'lider' })}>[Lider: {LIDER[partida.lados[VOCE].faccao].nome}]</button>
              )}
            </>
          ) : null}
          {emJogo && fase !== 'placar' && <button type="button" onClick={desistir}>[Desistir]</button>}
        </div>

        {registro.length > 0 && (
          <div>
            <p className="dt-jogo-legenda">LANCES</p>
            <ul className="dt-neo-lances">
              {registro.map((r, k) => <li key={`${k}-${r}`}>{r}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
