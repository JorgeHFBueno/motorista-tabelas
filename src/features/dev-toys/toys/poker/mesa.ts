// Mesa de Texas Hold'em sem limite, sem DOM: você e 3 bots (decisões do responsável, 2026-11-03). Botão do dealer
// que gira, blinds de 5 e 10, quatro rodadas de apostas (antes do flop, flop, turn e river), desistir, passar,
// pagar, aumentar e all-in, e potes paralelos quando alguém vai all-in com menos fichas. A melhor mão de 5 entre as
// 7 cartas leva cada pote; empate divide (a ficha que sobra vai para o primeiro depois do botão).

import { embaralhar, novoBaralho, type Carta } from '../cartas/baralho';
import { comparar, melhorMao, nomeDaMao } from './maos';

export const LUGARES = 4;
export const BLIND_PEQUENO = 5;
export const BLIND_GRANDE = 10;
/** Quanto cada um traz para a mesa ao sentar (você tira da carteira; os bots chegam com isso). */
export const ENTRADA = 200;

export type Estilo = 'cauteloso' | 'normal' | 'agressivo';
export type Jogador = {
  nome: string;
  /** null: você */
  estilo: Estilo | null;
  fichas: number;
  cartas: Carta[];
  /** apostado nesta rodada */
  aposta: number;
  /** apostado na mão inteira */
  investido: number;
  desistiu: boolean;
  allIn: boolean;
  /** a última ação, para mostrar */
  ultima: string | null;
};
export type Rua = 'preflop' | 'flop' | 'turn' | 'river' | 'fim';
export type Pote = { valor: number; ganhadores: number[]; mao: string | null };
export type Mesa = {
  jogadores: Jogador[];
  botao: number;
  baralho: Carta[];
  /** as 5 da mesa */
  comunitarias: Carta[];
  /** quantas da mesa já estão abertas (0, 3, 4 ou 5) */
  abertas: number;
  rua: Rua;
  vez: number;
  /** a maior aposta desta rodada */
  maior: number;
  /** o menor aumento permitido (o último aumento, ou o blind grande) */
  minimo: number;
  /** quem ainda precisa agir nesta rodada, na ordem */
  faltam: number[];
  /** no fim: os potes e quem levou */
  potes: Pote[];
  /** houve comparação de mãos (alguém pagou até o fim) */
  mostrou: boolean;
};

const proximo = (i: number) => (i + 1) % LUGARES;
export const pote = (m: Mesa) => m.jogadores.reduce((t, j) => t + j.investido, 0);
export const vivos = (m: Mesa) => m.jogadores.map((_, i) => i).filter((i) => !m.jogadores[i].desistiu);

export const novoJogador = (nome: string, estilo: Estilo | null, fichas = ENTRADA): Jogador => ({
  nome, estilo, fichas, cartas: [], aposta: 0, investido: 0, desistiu: false, allIn: false, ultima: null,
});

export const mesaNova = (jogadores: Jogador[], botao = LUGARES - 1): Mesa => ({
  jogadores, botao, baralho: [], comunitarias: [], abertas: 0, rua: 'fim', vez: -1, maior: 0, minimo: BLIND_GRANDE, faltam: [], potes: [], mostrou: false,
});

/** Põe fichas na mesa (até o que o jogador tem). */
function por(j: Jogador, valor: number): Jogador {
  const x = Math.max(0, Math.min(valor, j.fichas));
  const fichas = j.fichas - x;
  return { ...j, fichas, aposta: j.aposta + x, investido: j.investido + x, allIn: fichas === 0 };
}

/** Quem age nesta rodada, a partir de `de`, na ordem da mesa: quem não desistiu nem está all-in. */
function ordem(m: Mesa, de: number): number[] {
  const r: number[] = [];
  for (let k = 0, i = de; k < LUGARES; k++, i = proximo(i)) {
    const j = m.jogadores[i];
    if (!j.desistiu && !j.allIn) r.push(i);
  }
  return r;
}

/** Nova mão: o botão anda, saem os blinds e as cartas. Todos precisam ter fichas. */
export function novaMao(m: Mesa, rng: () => number): Mesa {
  const botao = proximo(m.botao);
  const b = embaralhar(novoBaralho(), rng);
  let k = 0;
  let jogadores: Jogador[] = m.jogadores.map((j) => ({ ...j, cartas: [], aposta: 0, investido: 0, desistiu: false, allIn: false, ultima: null }));
  // duas cartas para cada, uma de cada vez, começando à esquerda do botão
  for (let volta = 0; volta < 2; volta++) {
    for (let d = 1; d <= LUGARES; d++) {
      const i = (botao + d) % LUGARES;
      jogadores[i] = { ...jogadores[i], cartas: [...jogadores[i].cartas, b[k++]] };
    }
  }
  const pequeno = proximo(botao);
  const grande = proximo(pequeno);
  jogadores = jogadores.map((j, i) => (i === pequeno ? { ...por(j, BLIND_PEQUENO), ultima: `BLIND ${Math.min(BLIND_PEQUENO, j.fichas)}` } : i === grande ? { ...por(j, BLIND_GRANDE), ultima: `BLIND ${Math.min(BLIND_GRANDE, j.fichas)}` } : j));
  const mesa: Mesa = {
    jogadores, botao, baralho: b.slice(k + 5), comunitarias: b.slice(k, k + 5), abertas: 0, rua: 'preflop',
    vez: -1, maior: BLIND_GRANDE, minimo: BLIND_GRANDE, faltam: [], potes: [], mostrou: false,
  };
  const faltam = ordem(mesa, proximo(grande));
  return seguir({ ...mesa, faltam, vez: faltam[0] ?? -1 });
}

export type Acao = { tipo: 'desistir' | 'passar' | 'pagar' } | { tipo: 'aumentar'; total: number };

/** O que o jogador da vez pode fazer: pagar quanto, aumentar de quanto a quanto (o total na rodada). */
export function opcoes(m: Mesa, i = m.vez) {
  const j = m.jogadores[i];
  const pagar = Math.min(m.maior - j.aposta, j.fichas);
  const maximo = j.aposta + j.fichas;
  const minimo = Math.min(m.maior + m.minimo, maximo);
  return { podePassar: j.aposta === m.maior, pagar, podeAumentar: maximo > m.maior, minimo, maximo };
}

/** O jogador da vez age. Ação fora de hora ou inválida não muda nada. */
export function agir(m: Mesa, a: Acao): Mesa {
  if (m.rua === 'fim' || m.vez < 0) return m;
  const i = m.vez;
  const j = m.jogadores[i];
  const o = opcoes(m, i);
  let novo = j;
  let { maior, minimo } = m;
  let faltam = m.faltam.filter((x) => x !== i);
  if (a.tipo === 'desistir') novo = { ...j, desistiu: true, ultima: 'DESISTIU' };
  else if (a.tipo === 'passar') {
    if (!o.podePassar) return m;
    novo = { ...j, ultima: 'PASSOU' };
  } else if (a.tipo === 'pagar') {
    if (o.pagar <= 0) return m;
    novo = por(j, o.pagar);
    novo = { ...novo, ultima: novo.allIn ? `ALL-IN ${novo.aposta}` : `PAGOU ${o.pagar}` };
  } else if (a.tipo === 'aumentar') {
    if (!o.podeAumentar) return m;
    const total = Math.max(o.minimo, Math.min(a.total, o.maximo));
    novo = por(j, total - j.aposta);
    const aumento = novo.aposta - maior;
    if (aumento >= minimo) minimo = aumento;
    maior = Math.max(maior, novo.aposta);
    novo = { ...novo, ultima: novo.allIn ? `ALL-IN ${novo.aposta}` : `AUMENTOU A ${novo.aposta}` };
    // aumento reabre a rodada para os outros
    const mesaTmp = { ...m, jogadores: m.jogadores.map((x, k) => (k === i ? novo : x)) };
    faltam = ordem(mesaTmp, proximo(i)).filter((x) => x !== i);
  }
  const jogadores = m.jogadores.map((x, k) => (k === i ? novo : x));
  return seguir({ ...m, jogadores, maior, minimo, faltam, vez: faltam[0] ?? -1 });
}

/** Depois de cada ação: acabou por desistência, acabou a rodada (abre a próxima rua) ou segue com o próximo. */
function seguir(m: Mesa): Mesa {
  const vv = vivos(m);
  if (vv.length === 1) return encerrar(m, false);
  if (m.faltam.length) return m;
  // rodada encerrada: as apostas vão para o pote
  let mesa: Mesa = { ...m, jogadores: m.jogadores.map((j) => ({ ...j, aposta: 0 })), maior: 0, minimo: BLIND_GRANDE };
  const proxima = ({ preflop: 'flop', flop: 'turn', turn: 'river', river: null, fim: null } as const)[m.rua];
  if (!proxima) return encerrar(mesa, true);
  // a última jogada de cada um continua à mostra na rua nova, até ele jogar de novo
  mesa = { ...mesa, rua: proxima, abertas: { flop: 3, turn: 4, river: 5 }[proxima] };
  const faltam = ordem(mesa, proximo(mesa.botao));
  // com no máximo um jogador que ainda pode apostar, não há aposta: abre o resto da mesa
  if (faltam.length <= 1) return seguir({ ...mesa, faltam: [], vez: -1 });
  return { ...mesa, faltam, vez: faltam[0] };
}

/** Potes: cada nível de all-in separa um pote, disputado só por quem pôs até ali. */
export function potesDe(m: Mesa): Array<{ valor: number; elegiveis: number[] }> {
  const niveis = [...new Set(m.jogadores.map((j) => j.investido).filter((x) => x > 0))].sort((a, b) => a - b);
  const potes: Array<{ valor: number; elegiveis: number[] }> = [];
  let antes = 0;
  for (const nivel of niveis) {
    const valor = m.jogadores.reduce((t, j) => t + Math.min(j.investido, nivel) - Math.min(j.investido, antes), 0);
    const elegiveis = vivos(m).filter((i) => m.jogadores[i].investido >= nivel);
    const ultimo = potes[potes.length - 1];
    if (!elegiveis.length && ultimo) ultimo.valor += valor; // sobra de quem desistiu: vai para o pote de baixo
    else if (ultimo && ultimo.elegiveis.join() === elegiveis.join()) ultimo.valor += valor;
    else potes.push({ valor, elegiveis });
    antes = nivel;
  }
  return potes;
}

function encerrar(m: Mesa, mostrar: boolean): Mesa {
  const jogadores = m.jogadores.map((j) => ({ ...j, aposta: 0 }));
  const potes: Pote[] = [];
  const vv = vivos(m);
  if (!mostrar && vv.length === 1) {
    const g = vv[0];
    potes.push({ valor: pote(m), ganhadores: [g], mao: null });
    jogadores[g] = { ...jogadores[g], fichas: jogadores[g].fichas + pote(m) };
  } else {
    const forca = (i: number) => melhorMao([...m.jogadores[i].cartas, ...m.comunitarias]);
    for (const p of potesDe(m)) {
      let ganhadores: number[] = [];
      for (const i of p.elegiveis) {
        const d = ganhadores.length ? comparar(forca(i), forca(ganhadores[0])) : 1;
        if (d > 0) ganhadores = [i];
        else if (d === 0) ganhadores.push(i);
      }
      // a sobra da divisão vai para o primeiro ganhador depois do botão
      ganhadores.sort((a, b) => ((a - m.botao + LUGARES - 1) % LUGARES) - ((b - m.botao + LUGARES - 1) % LUGARES));
      const parte = Math.floor(p.valor / ganhadores.length);
      ganhadores.forEach((g, k) => {
        jogadores[g] = { ...jogadores[g], fichas: jogadores[g].fichas + parte + (k === 0 ? p.valor - parte * ganhadores.length : 0) };
      });
      potes.push({ valor: p.valor, ganhadores, mao: nomeDaMao([...m.jogadores[ganhadores[0]].cartas, ...m.comunitarias]) });
    }
  }
  // no fim por desistência, a mesa fica como estava; comparando mãos, abre tudo
  return { ...m, jogadores, rua: 'fim', vez: -1, faltam: [], potes, mostrou: mostrar, abertas: mostrar ? 5 : m.abertas };
}
