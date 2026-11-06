import { useState } from 'react';
import type { Carta } from '../cartas/baralho';
import { CartaView } from '../cartas/CartaView';
import { APOSTAS } from '../fichas/carteira';
import { useOpcoesTeclado } from '../fichas/hooks';
import { CartaDescarteView } from '../descarte/CartaDescarteView';
import { MAO_INICIAL, MULTA, PREMIO, type CartaD } from '../descarte/regras';
import { BLIND_GRANDE, BLIND_PEQUENO, ENTRADA } from '../poker/mesa';
import { BANCA_PARA } from '../vinteum/regras';
import { ALEATORIA, NIVEIS } from '../xadrez/bot';
import { PecaView } from '../xadrez/PecaView';
import { deFen } from '../xadrez/regras';
import { DESEMPATE_POKER, EXEMPLOS_21, EXEMPLOS_XADREZ, MAOS_POKER, destinosDe, situacaoDe, valorNo21, type ExemploXadrez } from './exemplos';

// Regras: o 21, as mãos e a mesa do poker, e o xadrez, com exemplos tirados dos próprios jogos. Só leitura.
const ABAS = [
  { id: '21', nome: '21' },
  { id: 'poker', nome: 'POKER' },
  { id: 'xadrez', nome: 'XADREZ' },
  { id: 'descarte', nome: 'DESCARTE' },
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
        <li>No jogo, voce e as brancas contra o bot. {NIVEIS.map((n) => `${n.nome} ${n.aposta}`).join(', ')} fichas: vitoria paga o dobro, empate devolve, derrota perde. {ALEATORIA.nome}: um dos tres, sorteado as cegas (so aparece no fim); entra de graca e a vitoria paga {ALEATORIA.premio}.</li>
      </ul>
    </>
  );
}

const dc = (naipe: CartaD['naipe'], simbolo: CartaD['simbolo']): CartaD => ({ id: 0, naipe, simbolo });
const MESA_DC = dc('copas', 7);
const SERVE_DC = [
  { cartas: [dc('copas', 2)], texto: 'Mesmo naipe.' },
  { cartas: [dc('paus', 7)], texto: 'Mesmo numero (ou o mesmo simbolo de acao).' },
  { cartas: [dc(null, 'curinga'), dc(null, 'mais4')], texto: 'Curinga serve sempre.' },
];
const CARTAS_DC = [
  { nome: '+2', carta: dc('ouros', 'mais2'), texto: 'O proximo compra 2 e perde a vez.' },
  { nome: 'INVERTE', carta: dc('espadas', 'inverte'), texto: 'Inverte o sentido da mesa.' },
  { nome: 'PULA', carta: dc('paus', 'pula'), texto: 'O proximo perde a vez.' },
  { nome: 'CURINGA', carta: dc(null, 'curinga'), texto: 'Serve sempre; quem joga escolhe o naipe que passa a valer.' },
  { nome: 'CURINGA +4', carta: dc(null, 'mais4'), texto: 'Curinga, e o proximo compra 4 e perde a vez.' },
];

function MaoDescarte({ cartas }: { cartas: CartaD[] }) {
  return <span className="dt-regras-cartas">{cartas.map((c, i) => <CartaDescarteView key={i} carta={c} pequena />)}</span>;
}

function RegrasDescarte() {
  return (
    <>
      <h3>OBJETIVO</h3>
      <p>Ser o primeiro a zerar a mao. Os quatro naipes fazem o papel das cores.</p>
      <h3>O QUE SERVE</h3>
      <div className="dt-regras-linha">
        <span className="dt-regras-nome">MESA</span>
        <MaoDescarte cartas={[MESA_DC]} />
        <span>A carta de cima do descarte.</span>
      </div>
      {SERVE_DC.map((e) => (
        <div key={e.texto} className="dt-regras-linha">
          <span className="dt-regras-nome">SERVE</span>
          <MaoDescarte cartas={e.cartas} />
          <span>{e.texto}</span>
        </div>
      ))}
      <div className="dt-regras-linha">
        <span className="dt-regras-nome">NAO</span>
        <MaoDescarte cartas={[dc('espadas', 5)]} />
        <span>Outro naipe e outro numero.</span>
      </div>
      <h3>AS CARTAS DE ACAO</h3>
      {CARTAS_DC.map((e) => (
        <div key={e.texto} className="dt-regras-linha">
          <span className="dt-regras-nome">{e.nome}</span>
          <MaoDescarte cartas={[e.carta]} />
          <span>{e.texto}</span>
        </div>
      ))}
      <h3>A PARTIDA</h3>
      <ul>
        <li>Voce e 3 bots, {MAO_INICIAL} cartas para cada. A primeira carta da mesa e sempre um numero, e voce comeca.</li>
        <li>Na sua vez, jogue uma carta que sirva. Sem nenhuma (ou se preferir), COMPRE uma: se ela servir, pode joga-la ou PASSAR; se nao, a vez passa.</li>
        <li>O curinga +4 pode ser jogado a qualquer hora, e +2 e +4 nao se acumulam.</li>
        <li>Ao ficar com 1 carta, grite ULTIMA: com 2 na mao, aperte [ULTIMA!] antes de jogar. Quem esquece compra {MULTA}. Os bots as vezes esquecem.</li>
        <li>Acabou o monte, o descarte (menos a carta de cima) e embaralhado e vira monte.</li>
      </ul>
      <h3>PAGAMENTO</h3>
      <ul>
        <li>A aposta ({APOSTAS.join(', ')} fichas) sai ao distribuir. Quem zera a mao primeiro leva as quatro apostas: ganhando, voce recebe {PREMIO} vezes a sua.</li>
        <li>Desistir, ou fechar a janela no meio, perde a aposta.</li>
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
      <div role="tabpanel">
        {aba === '21' ? <Regras21 /> : aba === 'poker' ? <RegrasPoker /> : aba === 'xadrez' ? <RegrasXadrez /> : <RegrasDescarte />}
      </div>
    </div>
  );
}
