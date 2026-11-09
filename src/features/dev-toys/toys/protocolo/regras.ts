import { embaralhar } from '../cartas/baralho';

// PROTOCOLO: duelo de cartas em fileiras, você contra um bot, em melhor de 3 rodadas (cada lado tem 2 vidas). Cada
// um começa com 10 cartas (pode trocar 2) e não compra entre as rodadas: guardar cartas é o jogo. Do seu lado há 3
// fileiras (CPU, REDE e DISCO); a soma das forças é o placar da rodada. Na vez, joga uma carta ou passa; quem passa
// sai da rodada e o outro segue sozinho. Clima (uma fileira, dos dois lados, vale 1), REBOOT (limpa o clima),
// OVERCLOCK (dobra uma fileira), KILL -9 (destrói as unidades mais fortes) e CTRL+Z (devolve uma unidade sua à mão).
// Habilidades: ROOT (herói: imune a tudo), MALWARE (vai para o lado do outro e você compra 2), BACKUP (revive uma
// unidade do seu descarte), CLUSTER (iguais na fileira multiplicam), CACHE (+1 às outras da fileira), FORK (puxa as
// iguais do baralho) e AGIL (CPU ou REDE). Cada facção tem uma passiva e um líder de uso único. Sem DOM; o sorteio
// vem de fora, para as regras serem testáveis.

export const FILEIRAS = ['cpu', 'rede', 'disco'] as const;
export type Fileira = (typeof FILEIRAS)[number];
export const NOME_FILEIRA: Record<Fileira, string> = { cpu: 'CPU', rede: 'REDE', disco: 'DISCO' };

export type Hab = 'root' | 'malware' | 'backup' | 'cluster' | 'cache' | 'fork';
export type Tipo = 'unidade' | 'clima' | 'reboot' | 'overclock' | 'kill' | 'ctrlz';
/** Unidade: `fileira` é onde entra ('agil': CPU ou REDE). Clima: a fileira que ele atinge. */
export type Carta = { id: number; nome: string; tipo: Tipo; fileira: Fileira | 'agil' | null; forca: number; hab: Hab | null; grupo?: string };

export const FACCOES = ['MAINFRAME', 'ENXAME'] as const;
export type Faccao = (typeof FACCOES)[number];

export const HAB_NOME: Record<Hab, string> = { root: 'ROOT', malware: 'MALWARE', backup: 'BACKUP', cluster: 'CLUSTER', cache: 'CACHE', fork: 'FORK' };
export const HAB_TEXTO: Record<Hab, string> = {
  root: 'Heroi: forca fixa, imune a clima, OVERCLOCK, CACHE, KILL -9, CTRL+Z e BACKUP.',
  malware: 'Entra do lado do adversario (os pontos sao dele) e voce compra 2 cartas.',
  backup: 'Ao entrar, revive uma unidade do seu descarte (menos heroi), que entra na hora.',
  cluster: 'Cartas iguais na mesma fileira multiplicam: 3 iguais valem 3 vezes cada.',
  cache: '+1 para cada outra unidade da fileira (menos heroi).',
  fork: 'Ao entrar, puxa do baralho todas as cartas iguais, direto para o campo.',
};
export const PASSIVA: Record<Faccao, string> = {
  MAINFRAME: 'Venceu a rodada, compra 1 carta.',
  ENXAME: 'No fim de cada rodada, uma unidade sua, sorteada, fica no campo.',
};
export const LIDER: Record<Faccao, { nome: string; texto: string }> = {
  MAINFRAME: { nome: 'OVERCLOCK NO DISCO', texto: 'Dobra a sua fileira DISCO (se ela ainda nao tem OVERCLOCK).' },
  ENXAME: { nome: 'CLIMA DO BARALHO', texto: 'Joga do seu baralho uma carta de clima.' },
};

export const MAO_INICIAL = 10;
export const TROCAS = 2;
export const VIDAS = 2;

type Modelo = [nome: string, fileira: Fileira | 'agil', forca: number, hab?: Hab | null, copias?: number];
const UNIDADES: Record<Faccao, Modelo[]> = {
  MAINFRAME: [
    ['ADMIN', 'cpu', 10, 'root'],
    ['ARQUITETO', 'disco', 10, 'root'],
    ['ESCALONADOR', 'cpu', 6],
    ['SERVIDOR', 'cpu', 4, 'cluster', 3],
    ['FIREWALL', 'cpu', 5, null, 2],
    ['AUDITOR', 'cpu', 5, 'malware'],
    ['MONITOR', 'rede', 6],
    ['SWITCH', 'rede', 5],
    ['ROTEADOR', 'rede', 4, 'cluster', 3],
    ['TECNICO', 'rede', 5, 'backup'],
    ['PROXY', 'agil', 4],
    ['GERADOR', 'disco', 8],
    ['TORRE', 'disco', 6],
    ['RAID', 'disco', 6, null, 2],
    ['NOBREAK', 'disco', 4, 'cache'],
    ['ESTAGIARIO', 'disco', 1, 'malware'],
  ],
  ENXAME: [
    ['MESTRE DA BOTNET', 'cpu', 10, 'root'],
    ['ZERO DAY', 'disco', 10, 'root'],
    ['ZUMBI', 'cpu', 3, 'fork', 3],
    ['BACKDOOR', 'cpu', 6],
    ['SPOOFER', 'cpu', 3],
    ['TROJAN', 'cpu', 4, 'malware'],
    ['CRAWLER', 'agil', 6],
    ['VERME', 'rede', 3, 'fork', 3],
    ['EXPLOIT', 'rede', 6],
    ['KEYLOGGER', 'agil', 5],
    ['SPAM', 'rede', 2, 'cache', 2],
    ['PHISHING', 'rede', 2, 'malware'],
    ['DDOS', 'disco', 8],
    ['MINERADOR', 'disco', 6],
    ['BOTNET', 'disco', 5, 'cluster', 2],
    ['REPLICADOR', 'disco', 4, 'backup'],
  ],
};
/** Especiais, iguais nas duas facções. */
const ESPECIAIS: Array<[nome: string, tipo: Tipo, fileira: Fileira | null, copias?: number]> = [
  ['SUPERAQUECIMENTO', 'clima', 'cpu'],
  ['LAG', 'clima', 'rede'],
  ['DISCO CHEIO', 'clima', 'disco'],
  ['REBOOT', 'reboot', null],
  ['OVERCLOCK', 'overclock', null],
  ['KILL -9', 'kill', null],
  ['CTRL+Z', 'ctrlz', null, 2],
];
export const NOME_CLIMA: Record<Fileira, string> = { cpu: 'SUPERAQUECIMENTO', rede: 'LAG', disco: 'DISCO CHEIO' };

/** O baralho de 30 da facção (22 unidades e 8 especiais), com ids a partir de `base`. */
export function deckDe(faccao: Faccao, base = 0): Carta[] {
  const d: Carta[] = [];
  for (const [nome, fileira, forca, hab = null, copias = 1] of UNIDADES[faccao]) {
    for (let k = 0; k < copias; k++) d.push({ id: base + d.length, nome, tipo: 'unidade', fileira, forca, hab, ...(hab === 'cluster' || hab === 'fork' ? { grupo: nome } : {}) });
  }
  for (const [nome, tipo, fileira, copias = 1] of ESPECIAIS) {
    for (let k = 0; k < copias; k++) d.push({ id: base + d.length, nome, tipo, fileira, forca: 0, hab: null });
  }
  return d;
}

type Campo = Record<Fileira, Carta[]>;
export type Lado = {
  nome: string;
  faccao: Faccao;
  mao: Carta[];
  /** o topo é o fim da lista */
  baralho: Carta[];
  descarte: Carta[];
  campo: Campo;
  /** OVERCLOCK em cada fileira (a carta, ou a do líder) */
  trompa: Record<Fileira, Carta | null>;
  vidas: number;
  passou: boolean;
  liderUsado: boolean;
  /** a última coisa que ele fez (o selo) */
  ultima: string | null;
};

export type Rodada = { pontos: [number, number]; vencedor: 0 | 1 | null };

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
  /** quem jogou um BACKUP e escolhe o que reviver */
  pendente: 0 | 1 | null;
  rodadas: Rodada[];
  /** no fim: quem venceu (null: empate) */
  vencedor: 0 | 1 | null;
  aviso: string;
};

export type Jogada =
  | { tipo: 'trocar'; id: number }
  | { tipo: 'pronto' }
  | { tipo: 'jogar'; id: number; fileira?: Fileira; alvo?: number }
  | { tipo: 'lider' }
  | { tipo: 'passar' }
  | { tipo: 'reviver'; id: number | null }
  | { tipo: 'seguir' };

/** O OVERCLOCK do líder do MAINFRAME (não vai para o descarte). */
const TROMPA_LIDER: Carta = { id: -1, nome: 'LIDER', tipo: 'overclock', fileira: null, forca: 0, hab: null };

export const ehHeroi = (c: Carta) => c.hab === 'root';
const vazio = (): Campo => ({ cpu: [], rede: [], disco: [] });
const semTrompa = (): Record<Fileira, Carta | null> => ({ cpu: null, rede: null, disco: null });

const clonarLado = (l: Lado): Lado => ({
  ...l, mao: [...l.mao], baralho: [...l.baralho], descarte: [...l.descarte],
  campo: { cpu: [...l.campo.cpu], rede: [...l.campo.rede], disco: [...l.campo.disco] }, trompa: { ...l.trompa },
});
const clonar = (p: Partida): Partida => ({ ...p, lados: [clonarLado(p.lados[0]), clonarLado(p.lados[1])], clima: { ...p.clima }, rodadas: [...p.rodadas] });

/** Força de uma carta no campo: clima põe em 1, CLUSTER multiplica, CACHE soma, OVERCLOCK dobra; herói não muda. */
export function forcaNoCampo(p: Partida, l: 0 | 1, f: Fileira, c: Carta): number {
  if (c.tipo !== 'unidade') return 0;
  if (ehHeroi(c)) return c.forca;
  const fila = p.lados[l].campo[f];
  let v = p.clima[f] ? Math.min(c.forca, 1) : c.forca;
  if (c.hab === 'cluster') v *= fila.filter((x) => x.hab === 'cluster' && x.grupo === c.grupo).length;
  v += fila.filter((x) => x.hab === 'cache' && x !== c).length;
  if (p.lados[l].trompa[f]) v *= 2;
  return v;
}
export const totalFileira = (p: Partida, l: 0 | 1, f: Fileira) => p.lados[l].campo[f].reduce((s, c) => s + forcaNoCampo(p, l, f, c), 0);
export const total = (p: Partida, l: 0 | 1) => FILEIRAS.reduce((s, f) => s + totalFileira(p, l, f), 0);

/** Unidades do descarte que um BACKUP pode reviver. */
export const revivivel = (l: Lado) => l.descarte.filter((c) => c.tipo === 'unidade' && !ehHeroi(c));
/** Unidades suas no campo que um CTRL+Z pode trazer de volta. */
export const alvosCtrlz = (l: Lado) => FILEIRAS.flatMap((f) => l.campo[f]).filter((c) => c.tipo === 'unidade' && !ehHeroi(c));
/** As fileiras onde a carta pode entrar (unidade e OVERCLOCK); vazio para as outras. */
export function fileirasPara(c: Carta, l: Lado): Fileira[] {
  if (c.tipo === 'overclock') return FILEIRAS.filter((f) => !l.trompa[f]);
  if (c.tipo !== 'unidade') return [];
  return c.fileira === 'agil' ? ['cpu', 'rede'] : [c.fileira as Fileira];
}
export function liderPode(p: Partida, quem: 0 | 1): boolean {
  const l = p.lados[quem];
  if (l.liderUsado) return false;
  return l.faccao === 'MAINFRAME' ? !l.trompa.disco : l.baralho.some((c) => c.tipo === 'clima' && !p.clima[c.fileira as Fileira]);
}

const comprar = (l: Lado, n: number) => {
  for (let k = 0; k < n && l.baralho.length; k++) l.mao.push(l.baralho.pop()!);
};

/** Partida nova: baralhos embaralhados, 10 cartas para cada; a moeda decide quem começa; você troca primeiro. */
export function novaPartida(voce: Faccao, bot: Faccao, nomeBot: string, rng: () => number): Partida {
  const lado = (nome: string, faccao: Faccao, base: number): Lado => {
    const baralho = embaralhar(deckDe(faccao, base), rng);
    const mao = baralho.splice(-MAO_INICIAL);
    return { nome, faccao, mao, baralho, descarte: [], campo: vazio(), trompa: semTrompa(), vidas: VIDAS, passou: false, liderUsado: false, ultima: null };
  };
  const vez = rng() < 0.5 ? 0 : 1;
  return {
    lados: [lado('VOCE', voce, 0), lado(nomeBot, bot, 100)], vez, primeiro: vez, rodada: 1,
    clima: { cpu: null, rede: null, disco: null }, fase: 'troca', trocas: TROCAS, pendente: null, rodadas: [], vencedor: null,
    aviso: `TROQUE ATE ${TROCAS} CARTAS. ${vez === 0 ? 'VOCE' : nomeBot} COMECA`,
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
  if (c.hab === 'backup' && revivivel(l).length) q.pendente = quem;
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
  const vencedor = pontos[0] > pontos[1] ? 0 : pontos[1] > pontos[0] ? 1 : null;
  q.rodadas.push({ pontos, vencedor });
  q.lados.forEach((l, i) => { if (vencedor !== i) l.vidas -= 1; });
  q.fase = 'placar';
  q.aviso = vencedor === null
    ? `RODADA ${q.rodada}: EMPATE, ${pontos[0]} A ${pontos[1]}. OS DOIS PERDEM UMA VIDA`
    : `RODADA ${q.rodada}: ${q.lados[vencedor].nome} VENCE, ${pontos[vencedor]} A ${pontos[1 - vencedor]}`;
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
      const unidades = FILEIRAS.flatMap((f) => l.campo[f]).filter((c) => c.tipo === 'unidade');
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

/** Aplica a jogada (de quem está na vez, ou de quem escolhe o BACKUP); jogada que não vale devolve a mesma partida. */
export function agir(p: Partida, a: Jogada, rng: () => number): Partida {
  if (p.fase === 'fim') return p;
  if (p.fase === 'troca') {
    if (a.tipo === 'pronto') {
      const q = clonar(p);
      q.fase = 'jogo';
      q.aviso = `RODADA 1. ${q.lados[q.vez].nome} COMECA`;
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
    const q = clonar(p);
    const l = q.lados[quem];
    q.pendente = null;
    if (a.id === null) {
      q.aviso = `${l.nome} NAO REVIVEU NADA`;
      return avancar(q);
    }
    const c = revivivel(l).find((x) => x.id === a.id);
    if (!c) return p;
    l.descarte = l.descarte.filter((x) => x !== c);
    // ágil revivido entra na CPU
    const f = c.fileira === 'agil' ? 'cpu' : (c.fileira as Fileira);
    const extra = colocar(q, quem, c, f);
    l.ultima = `REVIVEU ${c.nome}`;
    q.aviso = `${l.nome} REVIVEU ${c.nome}${extra}`;
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
    l.liderUsado = true;
    if (l.faccao === 'MAINFRAME') l.trompa.disco = TROMPA_LIDER;
    else {
      const c = l.baralho.find((x) => x.tipo === 'clima' && !q.clima[x.fileira as Fileira])!;
      l.baralho = l.baralho.filter((x) => x !== c);
      q.clima[c.fileira as Fileira] = { carta: c, dono: quem };
    }
    l.ultima = `LIDER: ${LIDER[l.faccao].nome}`;
    q.aviso = `${l.nome} USOU O LIDER: ${LIDER[l.faccao].nome}`;
    return avancar(q);
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
    const todas = q.lados.flatMap((ld, i) => FILEIRAS.flatMap((f) => ld.campo[f].filter((x) => x.tipo === 'unidade' && !ehHeroi(x)).map((x) => ({ x, i: i as 0 | 1, f, v: forcaNoCampo(q, i as 0 | 1, f, x) }))));
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
    ? `${c.nome}, forca ${c.forca}, ${c.fileira === 'agil' ? 'CPU ou REDE' : NOME_FILEIRA[c.fileira as Fileira]}${c.hab ? `, ${HAB_NOME[c.hab]}` : ''}`
    : `${c.nome}${c.tipo === 'clima' ? `, clima na ${NOME_FILEIRA[c.fileira as Fileira]}` : ''}`;
