import { NAIPES, embaralhar, type Naipe } from '../cartas/baralho';

// Descarte: jogo de cartas de esvaziar a mão, você contra 3 bots. Os quatro naipes do baralho comum fazem o papel
// de cores (a tela do DEV é âmbar). Joga quem combinar naipe ou símbolo com a carta da mesa; curinga vale sempre e
// escolhe o naipe. Ações: +2 (o próximo compra 2 e perde a vez), inverte (o sentido), pula (o próximo) e curinga +4.
// Quem fica com uma carta grita ULTIMA; quem esquece compra 2. Quem zera a mão primeiro ganha. Sem DOM; o sorteio
// vem de fora, para as regras serem testáveis.

export const ACOES = ['mais2', 'inverte', 'pula'] as const;
export type Acao = (typeof ACOES)[number];
export type Simbolo = number | Acao | 'curinga' | 'mais4';
/** `naipe` null: curinga (vale qualquer naipe). */
export type CartaD = { id: number; naipe: Naipe | null; simbolo: Simbolo };

export type JogadorD = { nome: string; mao: CartaD[] };

export type Partida = {
  /** 0 = você */
  jogadores: JogadorD[];
  /** compra: o topo é o fim da lista */
  monte: CartaD[];
  /** a carta da mesa é a última */
  descarte: CartaD[];
  /** o naipe que vale agora (o da carta da mesa, ou o escolhido no curinga) */
  naipe: Naipe;
  vez: number;
  sentido: 1 | -1;
  /** quem está na vez comprou esta carta e ela serve: pode jogá-la ou passar */
  comprou: number | null;
  vencedor: number | null;
  /** o que acabou de acontecer */
  aviso: string;
};

export type Jogada = { tipo: 'jogar'; id: number; naipe?: Naipe; ultima?: boolean } | { tipo: 'comprar' } | { tipo: 'passar' };

export const MAO_INICIAL = 7;
/** quem esquece de gritar ULTIMA compra estas */
export const MULTA = 2;
/** quem zera a mão leva o pote: as quatro apostas */
export const PREMIO = 4;
/** chance de um bot esquecer de gritar */
export const BOT_ESQUECE = 0.1;

/** 108 cartas: por naipe, um 0, dois de cada 1 a 9 e duas de cada ação; mais 4 curingas e 4 curingas +4. */
export function baralhoDescarte(): CartaD[] {
  const b: CartaD[] = [];
  let id = 0;
  for (const naipe of NAIPES) {
    b.push({ id: id++, naipe, simbolo: 0 });
    for (let k = 0; k < 2; k++) {
      for (let v = 1; v <= 9; v++) b.push({ id: id++, naipe, simbolo: v });
      for (const a of ACOES) b.push({ id: id++, naipe, simbolo: a });
    }
  }
  for (let k = 0; k < 4; k++) {
    b.push({ id: id++, naipe: null, simbolo: 'curinga' });
    b.push({ id: id++, naipe: null, simbolo: 'mais4' });
  }
  return b;
}

const SIMBOLO: Record<string, string> = { mais2: '+2', inverte: 'INVERTE', pula: 'PULA', curinga: 'CURINGA', mais4: 'CURINGA +4' };
/** Nome da carta, sem acento (avisos e leitores de tela). */
export const nomeDaCartaD = (c: CartaD) => (c.naipe ? `${SIMBOLO[c.simbolo] ?? c.simbolo} DE ${c.naipe.toUpperCase()}` : SIMBOLO[c.simbolo]);

export const topo = (p: Partida) => p.descarte[p.descarte.length - 1];
/** Quem joga `passos` lugares adiante, no sentido de agora. */
export const proximo = (p: Partida, passos = 1) => {
  const n = p.jogadores.length;
  return (((p.vez + p.sentido * passos) % n) + n) % n;
};
/** A carta serve na mesa: curinga, o naipe que vale ou o mesmo símbolo da carta da mesa. */
export const serve = (c: CartaD, p: Partida) => c.naipe === null || c.naipe === p.naipe || c.simbolo === topo(p).simbolo;

/** As cartas que quem está na vez pode jogar (depois de comprar, só a comprada). */
export function jogaveis(p: Partida): CartaD[] {
  if (p.vencedor !== null) return [];
  return p.jogadores[p.vez].mao.filter((c) => (p.comprou === null || c.id === p.comprou) && serve(c, p));
}

/** Tira `n` cartas do monte para `quem`; sem monte, embaralha o descarte (menos a carta da mesa) e segue. */
function tirar(p: Partida, quem: number, n: number, rng: () => number): { p: Partida; novas: CartaD[] } {
  let monte = p.monte.slice();
  let descarte = p.descarte;
  const novas: CartaD[] = [];
  for (let k = 0; k < n; k++) {
    if (!monte.length) {
      if (descarte.length <= 1) break;
      monte = embaralhar(descarte.slice(0, -1), rng);
      descarte = descarte.slice(-1);
    }
    novas.push(monte.pop()!);
  }
  const jogadores = p.jogadores.map((j, i) => (i === quem ? { ...j, mao: [...j.mao, ...novas] } : j));
  return { p: { ...p, monte, descarte, jogadores }, novas };
}

/** Partida nova: 7 cartas para cada um e a primeira carta da mesa, sempre um número. Você começa. */
export function novaPartida(nomes: string[], rng: () => number): Partida {
  const monte = embaralhar(baralhoDescarte(), rng);
  const jogadores = nomes.map((nome) => ({ nome, mao: monte.splice(-MAO_INICIAL) }));
  let i = monte.length - 1;
  while (typeof monte[i].simbolo !== 'number') i--;
  const [primeira] = monte.splice(i, 1);
  return { jogadores, monte, descarte: [primeira], naipe: primeira.naipe!, vez: 0, sentido: 1, comprou: null, vencedor: null, aviso: '' };
}

/** Aplica a jogada de quem está na vez; jogada que não vale devolve a mesma partida. */
export function agir(p: Partida, a: Jogada, rng: () => number): Partida {
  if (p.vencedor !== null) return p;
  const quem = p.vez;
  const nome = p.jogadores[quem].nome;

  if (a.tipo === 'comprar') {
    if (p.comprou !== null) return p;
    const { p: q, novas } = tirar(p, quem, 1, rng);
    if (novas[0] && serve(novas[0], q)) return { ...q, comprou: novas[0].id, aviso: `${nome} COMPROU 1` };
    return { ...q, vez: proximo(q), comprou: null, aviso: `${nome} COMPROU 1 E PASSOU` };
  }
  if (a.tipo === 'passar') {
    if (p.comprou === null) return p;
    return { ...p, vez: proximo(p), comprou: null, aviso: `${nome} PASSOU` };
  }

  const c = p.jogadores[quem].mao.find((x) => x.id === a.id);
  const naipe = c?.naipe ?? a.naipe;
  if (!c || !naipe || !jogaveis(p).includes(c)) return p;
  const mao = p.jogadores[quem].mao.filter((x) => x !== c);
  let q: Partida = {
    ...p,
    jogadores: p.jogadores.map((j, i) => (i === quem ? { ...j, mao } : j)),
    descarte: [...p.descarte, c],
    naipe,
    comprou: null,
  };
  const partes = [`${nome} JOGOU ${nomeDaCartaD(c)}${c.naipe ? '' : `, VALE ${naipe.toUpperCase()}`}`];
  if (!mao.length) return { ...q, vencedor: quem, aviso: `${partes[0]}. ${nome} ZEROU A MAO!` };
  if (mao.length === 1) {
    if (a.ultima) partes.push(`${nome}: ULTIMA!`);
    else {
      q = tirar(q, quem, MULTA, rng).p;
      partes.push(`NAO GRITOU ULTIMA: COMPRA ${MULTA}`);
    }
  }

  let passos = 1;
  if (c.simbolo === 'inverte') {
    q = { ...q, sentido: q.sentido === 1 ? -1 : 1 };
    partes.push('O SENTIDO INVERTEU');
    // com dois na mesa, inverter é pular
    if (q.jogadores.length === 2) passos = 2;
  }
  const alvo = proximo(q);
  const nomeAlvo = q.jogadores[alvo].nome;
  if (c.simbolo === 'pula') {
    partes.push(`${nomeAlvo} PERDE A VEZ`);
    passos = 2;
  }
  if (c.simbolo === 'mais2' || c.simbolo === 'mais4') {
    const n = c.simbolo === 'mais2' ? 2 : 4;
    q = tirar(q, alvo, n, rng).p;
    partes.push(`${nomeAlvo} COMPRA ${n} E PERDE A VEZ`);
    passos = 2;
  }
  // depois do grito, sem ponto: "ULTIMA! PROXY COMPRA 2"
  return { ...q, vez: proximo(q, passos), aviso: partes.join('. ').replace(/!\./g, '!') };
}

/** O naipe que mais aparece nas cartas (empate, o primeiro); sem nenhum, sorteia. */
export function naipeMaisForte(cartas: CartaD[], rng: () => number): Naipe {
  const conta = NAIPES.map((n) => cartas.filter((c) => c.naipe === n).length);
  const maior = Math.max(...conta);
  return maior > 0 ? NAIPES[conta.indexOf(maior)] : NAIPES[Math.floor(rng() * NAIPES.length)];
}

/**
 * Jogada do bot: guarda os curingas para quando não tem outra; prefere o naipe que mais tem (fica com opções) e as
 * ações; se o próximo está com 2 cartas ou menos, ataca (+2, +4, pula). No curinga, escolhe o naipe que mais tem.
 * De vez em quando esquece de gritar ULTIMA.
 */
export function decidirBot(p: Partida, rng: () => number): Jogada {
  const mao = p.jogadores[p.vez].mao;
  const opcoes = jogaveis(p);
  if (!opcoes.length) return p.comprou !== null ? { tipo: 'passar' } : { tipo: 'comprar' };
  const pertoDeGanhar = p.jogadores[proximo(p)].mao.length <= 2;
  const nota = (c: CartaD) => {
    const ataque = c.simbolo === 'mais2' || c.simbolo === 'mais4' || c.simbolo === 'pula';
    let s = c.naipe === null ? (c.simbolo === 'mais4' ? -12 : -10) : mao.filter((x) => x.naipe === c.naipe).length + (typeof c.simbolo === 'number' ? 0 : 1);
    if (pertoDeGanhar && ataque) s += 30;
    return s + rng() * 0.5;
  };
  const notas = opcoes.map(nota);
  const melhor = opcoes[notas.indexOf(Math.max(...notas))];
  const naipe = melhor.naipe ?? naipeMaisForte(mao.filter((c) => c !== melhor), rng);
  return { tipo: 'jogar', id: melhor.id, naipe, ultima: rng() >= BOT_ESQUECE };
}

/** O que volta das fichas apostadas: quem zera a mão leva as quatro apostas. */
export const retornoDescarte = (vencedor: number | null, aposta: number) => (vencedor === 0 ? PREMIO * aposta : 0);
