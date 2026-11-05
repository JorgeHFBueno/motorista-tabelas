import { useState } from 'react';
import type { Carta } from '../cartas/baralho';
import { CartaView } from '../cartas/CartaView';
import { APOSTAS } from '../fichas/carteira';
import { useOpcoesTeclado } from '../fichas/hooks';
import { BLIND_GRANDE, BLIND_PEQUENO, ENTRADA } from '../poker/mesa';
import { BANCA_PARA } from '../vinteum/regras';
import { NIVEIS } from '../xadrez/bot';
import { PecaView } from '../xadrez/PecaView';
import { deFen } from '../xadrez/regras';
import { DESEMPATE_POKER, EXEMPLOS_21, EXEMPLOS_XADREZ, MAOS_POKER, destinosDe, situacaoDe, valorNo21, type ExemploXadrez } from './exemplos';

// Regras: o 21, as mãos e a mesa do poker, e o xadrez, com exemplos tirados dos próprios jogos. Só leitura.
const ABAS = [
  { id: '21', nome: '21' },
  { id: 'poker', nome: 'POKER' },
  { id: 'xadrez', nome: 'XADREZ' },
] as const;
type Aba = (typeof ABAS)[number]['id'];

function Mao({ cartas }: { cartas: Carta[] }) {
  return <span className="dt-regras-cartas">{cartas.map((c, i) => <CartaView key={i} carta={c} pequena />)}</span>;
}

/** Tabuleiro pequeno: a peça de origem marcada, ponto (ou anel, se captura) onde ela pode ir, rei em xeque. */
function TabuleiroMini({ exemplo }: { exemplo: ExemploXadrez }) {
  const tab = deFen(exemplo.fen).tab;
  const destinos = destinosDe(exemplo);
  const { xeque } = situacaoDe(exemplo);
  const origem = exemplo.origem ? (8 - Number(exemplo.origem[1])) * 8 + 'abcdefgh'.indexOf(exemplo.origem[0]) : -1;
  return (
    <figure className="dt-regras-exemplo">
      <figcaption className="dt-regras-titulo">{exemplo.titulo}</figcaption>
      <div className="dt-regras-tabuleiro" role="img" aria-label={`${exemplo.titulo}: ${exemplo.texto}`}>
        {tab.map((p, i) => {
          const classes = [
            'dt-xz-casa',
            ((i >> 3) + (i & 7)) % 2 === 1 ? 'dt-xz-escura' : '',
            i === origem ? 'dt-xz-selecionada' : '',
            i === xeque ? 'dt-xz-xeque' : '',
          ].filter(Boolean).join(' ');
          return (
            <span key={i} className={classes}>
              {p !== '.' && <PecaView p={p} />}
              {destinos.includes(i) && <span className={p === '.' ? 'dt-xz-ponto' : 'dt-xz-anel'} />}
            </span>
          );
        })}
      </div>
      <p>{exemplo.texto}</p>
    </figure>
  );
}

function Regras21() {
  return (
    <>
      <h3>OBJETIVO</h3>
      <p>Chegar mais perto de 21 que a banca, sem passar.</p>
      <h3>QUANTO VALE A MAO</h3>
      {EXEMPLOS_21.map((e, i) => (
        <div key={i} className="dt-regras-linha">
          <Mao cartas={e.mao} />
          <span className="dt-21-pontos">{valorNo21(e.mao)}</span>
          <span>{e.texto}</span>
        </div>
      ))}
      <h3>A MAO</h3>
      <ul>
        <li>Escolha a aposta: {APOSTAS.join(', ')} fichas.</li>
        <li>Voce e a banca recebem 2 cartas; uma da banca fica virada.</li>
        <li>PEDIR compra mais uma carta. PARAR fica com o que tem.</li>
        <li>DOBRAR, so com as 2 primeiras: dobra a aposta, compra uma carta e para.</li>
        <li>Depois, a banca abre a carta virada e pede ate ter {BANCA_PARA} ou mais.</li>
      </ul>
      <h3>PAGAMENTO</h3>
      <ul>
        <li>Ganhou (ou a banca estourou): volta o dobro da aposta.</li>
        <li>Blackjack: volta a aposta e mais uma vez e meia.</li>
        <li>Empate: a aposta volta.</li>
        <li>Perdeu ou estourou: perde a aposta.</li>
        <li>Nao tem dividir par nem seguro.</li>
      </ul>
    </>
  );
}

function RegrasPoker() {
  return (
    <>
      <h3>AS MAOS, DA MAIOR PARA A MENOR</h3>
      {MAOS_POKER.map((m) => (
        <div key={m.nome} className="dt-regras-linha">
          <span className="dt-regras-nome">{m.nome}</span>
          <Mao cartas={m.mao} />
          <span>{m.texto}<br /><span className="dt-jogo-legenda">EX.: {m.descricao}</span></span>
        </div>
      ))}
      <h3>EMPATE E DESEMPATE</h3>
      <p>Na mesma categoria, ganha o valor maior; seguindo igual, a proxima carta mais alta (o kicker). Maos iguais dividem o pote.</p>
      <div className="dt-regras-linha">
        <span className="dt-regras-nome">GANHA</span>
        <Mao cartas={DESEMPATE_POKER.ganha} />
        <span>{DESEMPATE_POKER.descricao}</span>
      </div>
      <div className="dt-regras-linha">
        <span className="dt-regras-nome">PERDE</span>
        <Mao cartas={DESEMPATE_POKER.perde} />
        <span>O mesmo par, mas a dama perde do rei.</span>
      </div>
      <h3>A MESA</h3>
      <ul>
        <li>Voce e 3 bots. Cada um recebe 2 cartas; as 5 da mesa abrem aos poucos: 3 (flop), mais 1 (turn) e mais 1 (river).</li>
        <li>Vale a melhor mao de 5 entre as suas 2 e as 5 da mesa.</li>
        <li>Blinds de {BLIND_PEQUENO} e {BLIND_GRANDE}: os dois a esquerda do botao (D) apostam antes de ver as cartas. O botao gira a cada mao.</li>
        <li>Na sua vez: DESISTIR, PASSAR (se nao deve nada), PAGAR, AUMENTAR (no minimo o ultimo aumento) ou ALL-IN.</li>
        <li>Quem vai all-in com menos fichas disputa so o que conseguiu cobrir; o resto vira um pote paralelo entre os outros.</li>
        <li>Voce senta com ate {ENTRADA} fichas da carteira e levanta com o que sobrou. Bot que quebra sai da mesa; quebrando os 3, voce vence a mesa.</li>
      </ul>
    </>
  );
}

function RegrasXadrez() {
  const grupos = [
    { titulo: 'AS PECAS', nomes: ['REI', 'DAMA', 'TORRE', 'BISPO', 'CAVALO', 'PEAO'] },
    { titulo: 'LANCES ESPECIAIS', nomes: ['ROQUE', 'EN PASSANT', 'PROMOCAO'] },
    { titulo: 'FIM DA PARTIDA', nomes: ['XEQUE-MATE', 'AFOGAMENTO'] },
  ];
  return (
    <>
      <p>Brancas comecam; cada um joga uma vez. Ninguem pode deixar o proprio rei atacado.</p>
      {grupos.map((g) => (
        <div key={g.titulo}>
          <h3>{g.titulo}</h3>
          <div className="dt-regras-tabuleiros">
            {EXEMPLOS_XADREZ.filter((e) => g.nomes.includes(e.titulo)).map((e) => <TabuleiroMini key={e.titulo} exemplo={e} />)}
          </div>
        </div>
      ))}
      <ul>
        <li>Xeque: o rei esta atacado, e o lance seguinte tem que tira-lo do ataque.</li>
        <li>Tambem empata: 50 lances sem captura nem lance de peao, a mesma posicao 3 vezes, ou pecas que nao dao mate (rei contra rei, por exemplo).</li>
        <li>No jogo, voce e as brancas contra o bot. {NIVEIS.map((n) => `${n.nome} ${n.aposta}`).join(', ')} fichas: vitoria paga o dobro, empate devolve, derrota perde.</li>
      </ul>
    </>
  );
}

export default function RegrasToy() {
  const [aba, setAba] = useState<Aba>('21');
  const { raiz, teclas } = useOpcoesTeclado(aba);
  return (
    <div className="dt-regras dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      <div className="dt-jogo-botoes dt-regras-abas" data-opcoes role="tablist">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            className={aba === a.id ? 'dt-jogo-escolhida' : undefined}
            data-principal={aba === a.id || undefined}
            onClick={() => setAba(a.id)}
          >
            [{a.nome}]
          </button>
        ))}
      </div>
      <div className="dt-regras-corpo" role="tabpanel">
        {aba === '21' ? <Regras21 /> : aba === 'poker' ? <RegrasPoker /> : <RegrasXadrez />}
      </div>
    </div>
  );
}
