import { embaralhar } from '../cartas/baralho';
import {
  FILEIRAS, HAB_NOME, NOME_FILEIRA, baralhoPadrao, liderPassivo, liderPorId, montar,
  type Baralho, type Carta, type Faccao, type Fileira, type Lider,
} from './cartas';

// PROTOCOLO: duelo de cartas em fileiras, você contra um bot, em melhor de 3 rodadas (cada lado tem 2 vidas). Cada
// um começa com 10 cartas do próprio baralho (pode trocar 2) e não compra entre as rodadas: guardar cartas é o jogo.
// Do seu lado há 3 fileiras (CPU, REDE e DISCO); a soma das forças é o placar da rodada. Na vez, joga uma carta ou
// passa; quem passa sai da rodada e o outro segue sozinho. As cartas, as facções e os líderes estão em `cartas.ts`.
// Sem DOM; o sorteio vem de fora, para as regras serem testáveis.

export * from './cartas';

export const MAO_INICIAL = 10;
export const TROCAS = 2;
export const VIDAS = 2;

type Campo = Record<Fileira, Carta[]>;
export type Lado = {
  nome: string;
  faccao: Faccao;
  lider: Lider;
  mao: Carta[];
  /** o topo é o fim da lista */
  baralho: Carta[];
  descarte: Carta[];
  campo: Campo;
  /** OVERCLOCK em cada fileira (a carta, ou a do líder) */
  trompa: Record<Fileira, Carta | null>;
  vidas: number;
  passou: boolean;
  /** o líder já foi usado (ou é passivo, ou foi anulado) */
  liderUsado: boolean;
  liderAnulado: boolean;
  /** ids das cartas da mão do outro que este lado viu (ESPIAR) */
  revelado: number[];
  /** a última coisa que ele fez (o selo) */
  ultima: string | null;
};

export type Rodada = { pontos: [number, number]; vencedor: 0 | 1 | null };
export type Escolha = 'reviver' | 'resgatar' | 'pilhar';

export type Partida = {
  /** 0 = você, 1 = o bot */
  lados: [Lado, Lado];
  vez: 0 | 1;
  /** quem começou a rodada */
  primeiro: 0 | 1;
  rodada: number;
  clima: Record<Fileira, { carta: Carta; dono: 0 | 1 } | null>;
  /** troca: você troca até 2 cartas; jogo; placar: a rodada acabou e o campo ainda está à mostra; fim */
  fase: 'troca' | 'jogo' | 'placar' | 'fim';
  trocas: number;
  /** você (CODIGO LIVRE contra outra facção) escolhe quem começa, na troca */
  escolheInicio: boolean;
  /** quem escolhe uma carta agora (BACKUP, RESGATE, PILHAGEM) e o quê */
  pendente: 0 | 1 | null;
  escolha: Escolha | null;
  /** líder ESPIOES EM DOBRO em jogo */
  espioesX2: boolean;
  rodadas: Rodada[];
  /** no fim: quem venceu (null: empate) */
  vencedor: 0 | 1 | null;
  aviso: string;
};

export type Jogada =
  | { tipo: 'trocar'; id: number }
  | { tipo: 'inicio'; quem: 0 | 1 }
  | { tipo: 'pronto' }
  | { tipo: 'jogar'; id: number; fileira?: Fileira; alvo?: number }
  | { tipo: 'lider' }
  | { tipo: 'passar' }
  /** a carta escolhida no BACKUP, no RESGATE ou na PILHAGEM (null: nenhuma) */
  | { tipo: 'reviver'; id: number | null }
  | { tipo: 'seguir' };

/** O OVERCLOCK de um líder (não vai para o descarte). */
const TROMPA_LIDER: Carta = { id: -1, nome: 'LIDER', tipo: 'overclock', fileira: null, forca: 0, hab: null, heroi: false };

/** O baralho padrão da facção, com ids a partir de `base`. */
export const deckDe = (f: Faccao, base = 0) => montar(baralhoPadrao(f), base);

export const ehHeroi = (c: Carta) => c.heroi;
const vazio = (): Campo => ({ cpu: [], rede: [], disco: [] });
const semTrompa = (): Record<Fileira, Carta | null> => ({ cpu: null, rede: null, disco: null });

const clonarLado = (l: Lado): Lado => ({
  ...l, mao: [...l.mao], baralho: [...l.baralho], descarte: [...l.descarte],
  campo: { cpu: [...l.campo.cpu], rede: [...l.campo.rede], disco: [...l.campo.disco] }, trompa: { ...l.trompa }, revelado: [...l.revelado],
});
const clonar = (p: Partida): Partida => ({ ...p, lados: [clonarLado(p.lados[0]), clonarLado(p.lados[1])], clima: { ...p.clima }, rodadas: [...p.rodadas] });

/**
 * Força de uma carta no campo: MALWARE dobra com o líder ESPIOES EM DOBRO; herói para aí. Depois, clima põe em 1,
 * CLUSTER multiplica pelas iguais, CACHE soma 1 por outra, OVERCLOCK (ou um TURBO de outra carta) dobra.
 */
export function forcaNoCampo(p: Partida, l: 0 | 1, f: Fileira, c: Carta): number {
  if (c.tipo !== 'unidade') return 0;
  let v = p.espioesX2 && c.hab === 'malware' ? c.forca * 2 : c.forca;
  if (c.heroi) return v;
  const fila = p.lados[l].campo[f];
  if (p.clima[f]) v = Math.min(v, 1);
  if (c.hab === 'cluster') v *= fila.filter((x) => x.hab === 'cluster' && x.grupo === c.grupo).length;
  v += fila.filter((x) => x.hab === 'cache' && x !== c).length;
  if (p.lados[l].trompa[f] || fila.some((x) => x.hab === 'turbo' && x !== c)) v *= 2;
  return v;
}
export const totalFileira = (p: Partida, l: 0 | 1, f: Fileira) => p.lados[l].campo[f].reduce((s, c) => s + forcaNoCampo(p, l, f, c), 0);
export const total = (p: Partida, l: 0 | 1) => FILEIRAS.reduce((s, f) => s + totalFileira(p, l, f), 0);

/** Unidades do descarte que um BACKUP pode reviver. */
export const revivivel = (l: Lado) => l.descarte.filter((c) => c.tipo === 'unidade' && !c.heroi);
/** Unidades suas no campo que um CTRL+Z pode trazer de volta. */
export const alvosCtrlz = (l: Lado) => FILEIRAS.flatMap((f) => l.campo[f]).filter((c) => c.tipo === 'unidade' && !c.heroi);
/** As fileiras onde a carta pode entrar (unidade e OVERCLOCK); vazio para as outras. */
export function fileirasPara(c: Carta, l: Lado): Fileira[] {
  if (c.tipo === 'overclock') return FILEIRAS.filter((f) => !l.trompa[f]);
  if (c.tipo !== 'unidade') return [];
  return c.fileira === 'agil' ? ['cpu', 'rede'] : [c.fileira as Fileira];
}
/** As cartas que quem está escolhendo pode pegar agora. */
export function opcoesDeEscolha(p: Partida): Carta[] {
  if (p.pendente === null) return [];
  const l = p.lados[p.pendente];
  if (p.escolha === 'reviver') return revivivel(l);
  if (p.escolha === 'resgatar') return l.descarte;
  return p.lados[1 - p.pendente].descarte;
}

/** Clima do baralho que o líder jogaria (o da fileira dele, ou o primeiro que ainda não está na mesa). */
const climaDoLider = (p: Partida, l: Lado, f: Fileira | null) => l.baralho.find((c) => c.tipo === 'clima' && (f === null || c.fileira === f) && !p.clima[c.fileira as Fileira]);
/** Unidades que o KILL de um líder destruiria na fileira do adversário (só se ela soma 10 ou mais). */
function mortasDoKill(p: Partida, quem: 0 | 1, f: Fileira) {
  const outro = (1 - quem) as 0 | 1;
  if (totalFileira(p, outro, f) < 10) return [];
  const alvos = p.lados[outro].campo[f].filter((c) => c.tipo === 'unidade' && !c.heroi);
  const maior = Math.max(0, ...alvos.map((c) => forcaNoCampo(p, outro, f, c)));
  return maior > 0 ? alvos.filter((c) => forcaNoCampo(p, outro, f, c) === maior) : [];
}

/** O líder pode ser usado agora (passivo e anulado não se usam). */
export function liderPode(p: Partida, quem: 0 | 1): boolean {
  const l = p.lados[quem];
  if (l.liderUsado) return false;
  const ef = l.lider.efeito;
  const outro = p.lados[1 - quem];
  switch (ef.tipo) {
    case 'trompa': return !l.trompa[ef.fileira];
    case 'clima': return !!climaDoLider(p, l, ef.fileira);
    case 'reboot': return FILEIRAS.some((f) => p.clima[f]);
    case 'kill': return mortasDoKill(p, quem, ef.fileira).length > 0;
    case 'espiar': return outro.mao.length > 0;
    case 'pilhar': return outro.descarte.length > 0;
    case 'resgatar': return l.descarte.length > 0;
    default: return false;
  }
}

const comprar = (l: Lado, n: number) => {
  for (let k = 0; k < n && l.baralho.length; k++) l.mao.push(l.baralho.pop()!);
};

/**
 * Partida nova: baralhos montados e embaralhados, 10 cartas para cada (11 com MAO EXTRA); ANULAR cancela o líder do
 * outro. Quem começa: a moeda; o CODIGO LIVRE escolhe (o bot escolhe começar em segundo). Você troca primeiro.
 */
export function novaPartida(voce: Baralho, bot: Baralho, nomeBot: string, rng: () => number): Partida {
  const lado = (nome: string, b: Baralho, base: number): Lado => ({
    nome, faccao: b.faccao, lider: liderPorId(b.lider), mao: [], baralho: embaralhar(montar(b, base), rng), descarte: [], campo: vazio(),
    trompa: semTrompa(), vidas: VIDAS, passou: false, liderUsado: false, liderAnulado: false, revelado: [], ultima: null,
  });
  const lados: [Lado, Lado] = [lado('VOCE', voce, 0), lado(nomeBot, bot, 100)];
  // ANULAR primeiro: o líder anulado não vale, nem o passivo
  lados.forEach((l, i) => {
    if (l.lider.efeito.tipo === 'anular') {
      const o = lados[1 - i];
      o.liderUsado = true;
      o.liderAnulado = true;
    }
  });
  let espioesX2 = false;
  lados.forEach((l) => {
    const passivo = liderPassivo(l.lider);
    if (passivo) l.liderUsado = true;
    const vale = passivo && !l.liderAnulado;
    if (vale && l.lider.efeito.tipo === 'espioes') espioesX2 = true;
    comprar(l, MAO_INICIAL + (vale && l.lider.efeito.tipo === 'mao' ? 1 : 0));
  });
  const livre = lados.map((l) => l.faccao === 'CODIGO LIVRE');
  let vez: 0 | 1 = rng() < 0.5 ? 0 : 1;
  if (livre[1] && !livre[0]) vez = 0;
  const escolheInicio = livre[0] && !livre[1];
  return {
    lados, vez, primeiro: vez, rodada: 1, clima: { cpu: null, rede: null, disco: null }, fase: 'troca', trocas: TROCAS, escolheInicio,
    pendente: null, escolha: null, espioesX2, rodadas: [], vencedor: null,
    aviso: `TROQUE ATE ${TROCAS} CARTAS. ${vez === 0 ? 'VOCE' : nomeBot} COMECA${livre[1] && !livre[0] ? ` (${nomeBot}, CODIGO LIVRE, ESCOLHEU)` : ''}`,
  };
}

/** Põe a unidade no campo, com o efeito de entrada (MALWARE, FORK, BACKUP). Devolve o que contar no aviso. */
function colocar(q: Partida, quem: 0 | 1, c: Carta, f: Fileira): string {
  const l = q.lados[quem];
  const extra: string[] = [];
  if (c.hab === 'malware') {
    q.lados[1 - quem].campo[f].push(c);
    const antes = l.mao.length;
    comprar(l, 2);
    extra.push(`COMPROU ${l.mao.length - antes}`);
  } else l.campo[f].push(c);
  if (c.hab === 'fork') {
    const iguais = l.baralho.filter((x) => x.hab === 'fork' && x.grupo === c.grupo);
    l.baralho = l.baralho.filter((x) => !iguais.includes(x));
    for (const x of iguais) l.campo[x.fileira as Fileira].push(x);
    if (iguais.length) extra.push(`PUXOU MAIS ${iguais.length}`);
  }
  if (c.hab === 'backup' && revivivel(l).length) {
    q.pendente = quem;
    q.escolha = 'reviver';
  }
  return extra.length ? ` (${extra.join(', ')})` : '';
}

/** Quem não tem carta nem líder passa sozinho. */
function autoPassar(q: Partida) {
  q.lados.forEach((l, i) => {
    if (!l.passou && !l.mao.length && !liderPode(q, i as 0 | 1)) {
      l.passou = true;
      l.ultima = 'PASSOU (SEM CARTAS)';
    }
  });
}

/** Os dois passaram: conta a rodada (o campo fica à mostra até seguir). Quem perde, perde uma vida; empate, os dois. */
function encerrar(q: Partida): Partida {
  const pontos: [number, number] = [total(q, 0), total(q, 1)];
  let vencedor: 0 | 1 | null = pontos[0] > pontos[1] ? 0 : pontos[1] > pontos[0] ? 1 : null;
  // a NUVEM vence os empates (se só um lado é NUVEM)
  const nuvem = q.lados.map((l) => l.faccao === 'NUVEM');
  const desempate = vencedor === null && nuvem[0] !== nuvem[1];
  if (desempate) vencedor = nuvem[0] ? 0 : 1;
  q.rodadas.push({ pontos, vencedor });
  q.lados.forEach((l, i) => { if (vencedor !== i) l.vidas -= 1; });
  q.fase = 'placar';
  q.aviso = vencedor === null
    ? `RODADA ${q.rodada}: EMPATE, ${pontos[0]} A ${pontos[1]}. OS DOIS PERDEM UMA VIDA`
    : `RODADA ${q.rodada}: ${q.lados[vencedor].nome} VENCE, ${pontos[vencedor]} A ${pontos[1 - vencedor]}${desempate ? ' (A NUVEM VENCE O EMPATE)' : ''}`;
  return q;
}

/** Depois de uma jogada: a vez passa para o outro, a menos que ele já tenha passado. */
function avancar(q: Partida): Partida {
  autoPassar(q);
  if (q.lados[0].passou && q.lados[1].passou) return encerrar(q);
  const outro = (1 - q.vez) as 0 | 1;
  if (!q.lados[outro].passou) q.vez = outro;
  return q;
}

/** Fim da rodada: passivas, campo e clima para o descarte; acabou a vida de alguém, acaba a partida. */
function seguir(q: Partida, rng: () => number): Partida {
  const r = q.rodadas[q.rodadas.length - 1];
  const notas: string[] = [];
  q.lados.forEach((l, i) => {
    if (l.faccao === 'MAINFRAME' && r.vencedor === i && l.baralho.length) {
      comprar(l, 1);
      notas.push(`${l.nome} COMPROU 1 (MAINFRAME)`);
    }
    let fica: Carta | null = null;
    if (l.faccao === 'ENXAME') {
      const unidades = FILEIRAS.flatMap((f) => l.campo[f]).filter((c) => c.tipo === 'unidade' && !c.heroi);
      if (unidades.length) {
        fica = unidades[Math.floor(rng() * unidades.length)];
        notas.push(`${fica.nome} FICA NO CAMPO (ENXAME)`);
      }
    }
    for (const f of FILEIRAS) {
      l.descarte.push(...l.campo[f].filter((c) => c !== fica));
      l.campo[f] = l.campo[f].filter((c) => c === fica);
      const t = l.trompa[f];
      if (t && t.id >= 0) l.descarte.push(t);
      l.trompa[f] = null;
    }
    l.passou = false;
  });
  for (const f of FILEIRAS) {
    const c = q.clima[f];
    if (c) q.lados[c.dono].descarte.push(c.carta);
    q.clima[f] = null;
  }
  if (q.lados.some((l) => l.vidas <= 0)) {
    q.fase = 'fim';
    q.vencedor = q.lados[0].vidas > 0 ? 0 : q.lados[1].vidas > 0 ? 1 : null;
    q.aviso = q.vencedor === null ? 'EMPATE NA PARTIDA' : `${q.lados[q.vencedor].nome} VENCE A PARTIDA`;
    return q;
  }
  q.rodada += 1;
  // quem venceu a rodada começa a próxima; no empate, quem não começou
  q.vez = r.vencedor ?? ((1 - q.primeiro) as 0 | 1);
  q.primeiro = q.vez;
  q.fase = 'jogo';
  q.lados.forEach((l) => { l.ultima = null; });
  q.aviso = [`RODADA ${q.rodada}. ${q.lados[q.vez].nome} COMECA`, ...notas].join('. ');
  autoPassar(q);
  if (q.lados[0].passou && q.lados[1].passou) return encerrar(q);
  if (q.lados[q.vez].passou) q.vez = (1 - q.vez) as 0 | 1;
  return q;
}

/** O efeito do líder (já validado com liderPode). */
function usarLider(q: Partida, quem: 0 | 1, rng: () => number): string {
  const l = q.lados[quem];
  const o = q.lados[1 - quem];
  const ef = l.lider.efeito;
  l.liderUsado = true;
  if (ef.tipo === 'trompa') l.trompa[ef.fileira] = TROMPA_LIDER;
  else if (ef.tipo === 'clima') {
    const c = climaDoLider(q, l, ef.fileira)!;
    l.baralho = l.baralho.filter((x) => x !== c);
    q.clima[c.fileira as Fileira] = { carta: c, dono: quem };
    return `: ${c.nome}`;
  } else if (ef.tipo === 'reboot') {
    for (const f of FILEIRAS) {
      const w = q.clima[f];
      if (w) q.lados[w.dono].descarte.push(w.carta);
      q.clima[f] = null;
    }
  } else if (ef.tipo === 'kill') {
    const mortas = mortasDoKill(q, quem, ef.fileira);
    o.campo[ef.fileira] = o.campo[ef.fileira].filter((x) => !mortas.includes(x));
    o.descarte.push(...mortas);
    return `: DESTRUIU ${mortas.map((m) => m.nome).join(', ')}`;
  } else if (ef.tipo === 'espiar') {
    const vistas = embaralhar(o.mao, rng).slice(0, 3);
    l.revelado = vistas.map((c) => c.id);
    return `: VIU ${vistas.length} CARTAS`;
  } else if (ef.tipo === 'resgatar' || ef.tipo === 'pilhar') {
    q.pendente = quem;
    q.escolha = ef.tipo;
  }
  return '';
}

/** Aplica a jogada (de quem está na vez, ou de quem escolhe uma carta); jogada que não vale devolve a mesma partida. */
export function agir(p: Partida, a: Jogada, rng: () => number): Partida {
  if (p.fase === 'fim') return p;
  if (p.fase === 'troca') {
    if (a.tipo === 'pronto') {
      const q = clonar(p);
      q.fase = 'jogo';
      q.escolheInicio = false;
      q.aviso = `RODADA 1. ${q.lados[q.vez].nome} COMECA`;
      return q;
    }
    if (a.tipo === 'inicio') {
      if (!p.escolheInicio) return p;
      const q = clonar(p);
      q.vez = a.quem;
      q.primeiro = a.quem;
      q.aviso = `${a.quem === 0 ? 'VOCE COMECA' : `${q.lados[1].nome} COMECA`} (CODIGO LIVRE)`;
      return q;
    }
    if (a.tipo !== 'trocar' || p.trocas <= 0) return p;
    const q = clonar(p);
    const l = q.lados[0];
    const c = l.mao.find((x) => x.id === a.id);
    if (!c || !l.baralho.length) return p;
    l.mao = l.mao.filter((x) => x !== c);
    // a trocada volta para o baralho, embaralhado, e sai a de cima
    l.baralho = embaralhar([...l.baralho, c], rng);
    comprar(l, 1);
    q.trocas -= 1;
    q.aviso = q.trocas ? `TROCOU ${c.nome}. PODE TROCAR MAIS ${q.trocas}` : `TROCOU ${c.nome}`;
    return q;
  }
  if (p.fase === 'placar') return a.tipo === 'seguir' ? seguir(clonar(p), rng) : p;

  // fase 'jogo'
  if (p.pendente !== null) {
    if (a.tipo !== 'reviver') return p;
    const quem = p.pendente;
    const escolha = p.escolha;
    const q = clonar(p);
    const l = q.lados[quem];
    q.pendente = null;
    q.escolha = null;
    if (a.id === null) {
      q.aviso = `${l.nome} NAO PEGOU NADA`;
      return avancar(q);
    }
    const c = opcoesDeEscolha(p).find((x) => x.id === a.id);
    if (!c) return p;
    if (escolha === 'reviver') {
      l.descarte = l.descarte.filter((x) => x.id !== c.id);
      // ágil revivido entra na CPU
      const f = c.fileira === 'agil' ? 'cpu' : (c.fileira as Fileira);
      const extra = colocar(q, quem, c, f);
      l.ultima = `REVIVEU ${c.nome}`;
      q.aviso = `${l.nome} REVIVEU ${c.nome}${extra}`;
    } else {
      const de = escolha === 'resgatar' ? l : q.lados[1 - quem];
      de.descarte = de.descarte.filter((x) => x.id !== c.id);
      l.mao.push(c);
      l.ultima = `PEGOU ${c.nome}`;
      q.aviso = `${l.nome} PEGOU ${c.nome} DO DESCARTE${escolha === 'pilhar' ? ` DE ${q.lados[1 - quem].nome}` : ''}`;
    }
    return q.pendente === null ? avancar(q) : q;
  }

  const quem = p.vez;
  if (a.tipo === 'passar') {
    const q = clonar(p);
    q.lados[quem].passou = true;
    q.lados[quem].ultima = 'PASSOU';
    q.aviso = `${q.lados[quem].nome} PASSOU`;
    return avancar(q);
  }
  if (a.tipo === 'lider') {
    if (!liderPode(p, quem)) return p;
    const q = clonar(p);
    const l = q.lados[quem];
    const extra = usarLider(q, quem, rng);
    l.ultima = `LIDER: ${l.lider.nome}`;
    q.aviso = `${l.nome} USOU O LIDER ${l.lider.nome}${extra}`;
    return q.pendente === null ? avancar(q) : q;
  }
  if (a.tipo !== 'jogar') return p;

  const c = p.lados[quem].mao.find((x) => x.id === a.id);
  if (!c) return p;
  const q = clonar(p);
  const l = q.lados[quem];
  const tirar = () => { l.mao = l.mao.filter((x) => x !== c); };
  let texto = `${l.nome} JOGOU ${c.nome}`;
  l.ultima = `JOGOU ${c.nome}`;

  if (c.tipo === 'unidade' || c.tipo === 'overclock') {
    const f = a.fileira ?? (c.tipo === 'unidade' && c.fileira !== 'agil' ? (c.fileira as Fileira) : undefined);
    if (!f || !fileirasPara(c, l).includes(f)) return p;
    tirar();
    if (c.tipo === 'overclock') l.trompa[f] = c;
    else texto += colocar(q, quem, c, f);
    if (c.fileira === 'agil' || c.tipo === 'overclock') {
      texto += ` NA ${NOME_FILEIRA[f]}`;
      l.ultima += ` NA ${NOME_FILEIRA[f]}`;
    }
    if (c.hab === 'malware') texto += ', DO OUTRO LADO';
  } else if (c.tipo === 'clima') {
    tirar();
    const f = c.fileira as Fileira;
    if (q.clima[f]) l.descarte.push(c);
    else q.clima[f] = { carta: c, dono: quem };
  } else if (c.tipo === 'reboot') {
    tirar();
    for (const f of FILEIRAS) {
      const w = q.clima[f];
      if (w) q.lados[w.dono].descarte.push(w.carta);
      q.clima[f] = null;
    }
    l.descarte.push(c);
  } else if (c.tipo === 'kill') {
    tirar();
    const todas = q.lados.flatMap((ld, i) => FILEIRAS.flatMap((f) => ld.campo[f].filter((x) => x.tipo === 'unidade' && !x.heroi).map((x) => ({ x, i: i as 0 | 1, f, v: forcaNoCampo(q, i as 0 | 1, f, x) }))));
    const maior = Math.max(0, ...todas.map((t) => t.v));
    const mortas = maior > 0 ? todas.filter((t) => t.v === maior) : [];
    for (const m of mortas) {
      const ld = q.lados[m.i];
      ld.campo[m.f] = ld.campo[m.f].filter((x) => x !== m.x);
      ld.descarte.push(m.x);
    }
    texto += mortas.length ? `: DESTRUIU ${mortas.map((m) => m.x.nome).join(', ')} (${maior})` : ': NADA PARA DESTRUIR';
    l.descarte.push(c);
  } else {
    // CTRL+Z: fica no lugar da unidade, que volta para a mão
    const alvo = alvosCtrlz(l).find((x) => x.id === a.alvo);
    if (!alvo) return p;
    tirar();
    const f = FILEIRAS.find((ff) => l.campo[ff].includes(alvo))!;
    l.campo[f] = l.campo[f].map((x) => (x === alvo ? c : x));
    l.mao.push(alvo);
    texto += `: ${alvo.nome} VOLTOU PARA A MAO`;
  }
  q.aviso = texto;
  return q.pendente === null ? avancar(q) : q;
}

/** No fim da partida, o que volta da aposta: vitória paga o dobro, empate devolve. */
export const retornoProtocolo = (vencedor: 0 | 1 | null, aposta: number) => (vencedor === 0 ? 2 * aposta : vencedor === null ? aposta : 0);

/** Nome da carta por extenso, sem acento (leitores de tela). */
export const nomeDaCartaPt = (c: Carta) =>
  c.tipo === 'unidade'
    ? `${c.nome}, forca ${c.forca}, ${c.fileira === 'agil' ? 'CPU ou REDE' : NOME_FILEIRA[c.fileira as Fileira]}${c.heroi ? ', ROOT' : ''}${c.hab ? `, ${HAB_NOME[c.hab]}` : ''}`
    : `${c.nome}${c.tipo === 'clima' ? `, clima na ${NOME_FILEIRA[c.fileira as Fileira]}` : ''}`;
