// Regras do xadrez, sem DOM: posição, lances legais (roque, en passant, promoção), xeque, mate, afogamento e empates
// (50 lances, tripla repetição, material insuficiente). Casa i = linha * 8 + coluna; a linha 0 é a 8ª fileira (pretas
// no topo) e a 7 é a 1ª. Peças: PNBRQK brancas, pnbrqk pretas, '.' vazia. Validado por perft nos testes.

export type Cor = 'b' | 'p';
export type Lance = {
  de: number;
  para: number;
  peca: string;
  captura?: string;
  /** peça que entra no lugar do peão (maiúscula ou minúscula, pela cor) */
  promocao?: string;
  roque?: 'curto' | 'longo';
  enPassant?: boolean;
};
export type Posicao = {
  tab: string[];
  vez: Cor;
  /** roques ainda possíveis, em FEN: subconjunto de 'KQkq' */
  roques: string;
  /** casa de en passant, ou -1 */
  ep: number;
  /** meios-lances desde a última captura ou lance de peão (regra dos 50) */
  meio: number;
  numero: number;
};

export const INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const linha = (i: number) => i >> 3;
const coluna = (i: number) => i & 7;
const casa = (l: number, c: number) => l * 8 + c;
const dentro = (l: number, c: number) => l >= 0 && l < 8 && c >= 0 && c < 8;
export const corDe = (p: string): Cor | null => (p === '.' ? null : p === p.toUpperCase() ? 'b' : 'p');
const outra = (c: Cor): Cor => (c === 'b' ? 'p' : 'b');

/** Nome da casa (a1 … h8). */
export const nomeCasa = (i: number) => `${'abcdefgh'[coluna(i)]}${8 - linha(i)}`;
const casaDoNome = (n: string) => casa(8 - Number(n[1]), 'abcdefgh'.indexOf(n[0]));

export function deFen(fen: string): Posicao {
  const [pecas, vez, roques, ep, meio, numero] = fen.trim().split(/\s+/);
  const tab: string[] = [];
  for (const ch of pecas.replace(/\//g, '')) {
    if (/\d/.test(ch)) for (let k = 0; k < Number(ch); k++) tab.push('.');
    else tab.push(ch);
  }
  return {
    tab,
    vez: vez === 'b' ? 'p' : 'b',
    roques: roques === '-' ? '' : roques,
    ep: !ep || ep === '-' ? -1 : casaDoNome(ep),
    meio: Number(meio ?? 0),
    numero: Number(numero ?? 1),
  };
}

/** Chave da posição para a tripla repetição: peças, vez, roques e en passant. */
export const chave = (p: Posicao) => `${p.tab.join('')} ${p.vez} ${p.roques} ${p.ep}`;

const CAVALO = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const REI = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAGONAIS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const RETAS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** A casa i é atacada por alguma peça da cor `por`? */
export function atacada(tab: string[], i: number, por: Cor): boolean {
  const l = linha(i);
  const c = coluna(i);
  const minha = (p: string) => (por === 'b' ? p.toUpperCase() === p && p !== '.' : p.toLowerCase() === p && p !== '.');
  const e = (dl: number, dc: number, tipos: string) => {
    const nl = l + dl;
    const nc = c + dc;
    if (!dentro(nl, nc)) return false;
    const p = tab[casa(nl, nc)];
    return minha(p) && tipos.includes(p.toLowerCase());
  };
  // peões atacam na diagonal para a frente deles
  const dp = por === 'b' ? 1 : -1;
  if (e(dp, -1, 'p') || e(dp, 1, 'p')) return true;
  if (CAVALO.some(([dl, dc]) => e(dl, dc, 'n'))) return true;
  if (REI.some(([dl, dc]) => e(dl, dc, 'k'))) return true;
  const desliza = (dirs: number[][], tipos: string) => dirs.some(([dl, dc]) => {
    let nl = l + dl;
    let nc = c + dc;
    while (dentro(nl, nc)) {
      const p = tab[casa(nl, nc)];
      if (p !== '.') return minha(p) && tipos.includes(p.toLowerCase());
      nl += dl;
      nc += dc;
    }
    return false;
  });
  return desliza(DIAGONAIS, 'bq') || desliza(RETAS, 'rq');
}

const reiDe = (tab: string[], cor: Cor) => tab.indexOf(cor === 'b' ? 'K' : 'k');
export const emXeque = (p: Posicao) => atacada(p.tab, reiDe(p.tab, p.vez), outra(p.vez));

/** Lances sem olhar se o próprio rei fica em xeque. */
function pseudo(p: Posicao): Lance[] {
  const lances: Lance[] = [];
  const { tab, vez } = p;
  for (let i = 0; i < 64; i++) {
    const peca = tab[i];
    if (corDe(peca) !== vez) continue;
    const l = linha(i);
    const c = coluna(i);
    const tipo = peca.toLowerCase();
    const add = (para: number, extra: Partial<Lance> = {}) => {
      const alvo = tab[para];
      lances.push({ de: i, para, peca, ...(alvo !== '.' ? { captura: alvo } : {}), ...extra });
    };
    if (tipo === 'p') {
      const dir = vez === 'b' ? -1 : 1;
      const inicio = vez === 'b' ? 6 : 1;
      const ultima = vez === 'b' ? 0 : 7;
      const promover = (para: number, extra: Partial<Lance> = {}) => {
        if (linha(para) === ultima) for (const q of 'qrbn') add(para, { ...extra, promocao: vez === 'b' ? q.toUpperCase() : q });
        else add(para, extra);
      };
      const frente = casa(l + dir, c);
      if (dentro(l + dir, c) && tab[frente] === '.') {
        promover(frente);
        const dois = casa(l + 2 * dir, c);
        if (l === inicio && tab[dois] === '.') add(dois);
      }
      for (const dc of [-1, 1]) {
        if (!dentro(l + dir, c + dc)) continue;
        const para = casa(l + dir, c + dc);
        const alvo = tab[para];
        if (alvo !== '.' && corDe(alvo) !== vez) promover(para);
        else if (para === p.ep) lances.push({ de: i, para, peca, captura: vez === 'b' ? 'p' : 'P', enPassant: true });
      }
    } else if (tipo === 'n' || tipo === 'k') {
      for (const [dl, dc] of tipo === 'n' ? CAVALO : REI) {
        if (!dentro(l + dl, c + dc)) continue;
        const para = casa(l + dl, c + dc);
        if (corDe(tab[para]) !== vez) add(para);
      }
    } else {
      const dirs = tipo === 'b' ? DIAGONAIS : tipo === 'r' ? RETAS : [...DIAGONAIS, ...RETAS];
      for (const [dl, dc] of dirs) {
        let nl = l + dl;
        let nc = c + dc;
        while (dentro(nl, nc)) {
          const para = casa(nl, nc);
          const cor = corDe(tab[para]);
          if (cor === vez) break;
          add(para);
          if (cor) break;
          nl += dl;
          nc += dc;
        }
      }
    }
  }
  // roque: rei e torre no lugar, casas do meio livres, rei não passa por casa atacada
  const ini = vez === 'b' ? 60 : 4;
  const [curto, longo] = vez === 'b' ? ['K', 'Q'] : ['k', 'q'];
  const contra = outra(vez);
  if (tab[ini] === (vez === 'b' ? 'K' : 'k') && !atacada(tab, ini, contra)) {
    if (p.roques.includes(curto) && tab[ini + 1] === '.' && tab[ini + 2] === '.' && !atacada(tab, ini + 1, contra) && !atacada(tab, ini + 2, contra)) {
      lances.push({ de: ini, para: ini + 2, peca: tab[ini], roque: 'curto' });
    }
    if (p.roques.includes(longo) && tab[ini - 1] === '.' && tab[ini - 2] === '.' && tab[ini - 3] === '.' && !atacada(tab, ini - 1, contra) && !atacada(tab, ini - 2, contra)) {
      lances.push({ de: ini, para: ini - 2, peca: tab[ini], roque: 'longo' });
    }
  }
  return lances;
}

/** A posição depois do lance (não confere se ele é legal). */
export function aplicar(p: Posicao, m: Lance): Posicao {
  const tab = p.tab.slice();
  tab[m.para] = m.promocao ?? m.peca;
  tab[m.de] = '.';
  if (m.enPassant) tab[m.para + (p.vez === 'b' ? 8 : -8)] = '.';
  if (m.roque === 'curto') { tab[m.de + 1] = tab[m.de + 3]; tab[m.de + 3] = '.'; }
  if (m.roque === 'longo') { tab[m.de - 1] = tab[m.de - 4]; tab[m.de - 4] = '.'; }
  // roques perdidos: rei ou torre saiu do lugar, ou a torre foi capturada no canto
  let roques = p.roques;
  const tira = (s: string) => { roques = roques.replace(s, ''); };
  for (const i of [m.de, m.para]) {
    if (i === 60) { tira('K'); tira('Q'); }
    if (i === 4) { tira('k'); tira('q'); }
    if (i === 63) tira('K');
    if (i === 56) tira('Q');
    if (i === 7) tira('k');
    if (i === 0) tira('q');
  }
  const peao = m.peca.toLowerCase() === 'p';
  return {
    tab,
    vez: outra(p.vez),
    roques,
    ep: peao && Math.abs(m.para - m.de) === 16 ? (m.de + m.para) / 2 : -1,
    meio: peao || m.captura ? 0 : p.meio + 1,
    numero: p.numero + (p.vez === 'p' ? 1 : 0),
  };
}

/** Lances legais: os que não deixam o próprio rei em xeque. */
export function legais(p: Posicao): Lance[] {
  return pseudo(p).filter((m) => {
    const depois = aplicar(p, m);
    return !atacada(depois.tab, reiDe(depois.tab, p.vez), depois.vez);
  });
}

/** Sem peões, torres ou damas, e no máximo uma peça menor em jogo: ninguém consegue dar mate. */
export function materialInsuficiente(tab: string[]): boolean {
  const pecas = tab.filter((x) => x !== '.' && x.toLowerCase() !== 'k');
  return pecas.every((x) => 'nb'.includes(x.toLowerCase())) && pecas.length <= 1;
}

export type Fim = 'mate' | 'afogamento' | 'cinquenta' | 'repeticao' | 'material';

/** Como a partida acabou nesta posição (a vez é de quem está sem saída), ou null. */
export function fimDe(p: Posicao, historico: string[] = []): Fim | null {
  if (!legais(p).length) return emXeque(p) ? 'mate' : 'afogamento';
  if (p.meio >= 100) return 'cinquenta';
  if (materialInsuficiente(p.tab)) return 'material';
  const k = chave(p);
  if (historico.filter((h) => h === k).length >= 3) return 'repeticao';
  return null;
}

/** Contagem de posições a `n` meios-lances (perft): o teste padrão de geradores de lances. */
export function perft(p: Posicao, n: number): number {
  if (n === 0) return 1;
  const ls = legais(p);
  if (n === 1) return ls.length;
  let total = 0;
  for (const m of ls) total += perft(aplicar(p, m), n - 1);
  return total;
}

/** Como cada fim aparece na tela. */
export const FRASE_FIM: Record<Fim, string> = {
  mate: 'XEQUE-MATE',
  afogamento: 'AFOGAMENTO: EMPATE',
  cinquenta: '50 LANCES SEM CAPTURA: EMPATE',
  repeticao: 'TRIPLA REPETICAO: EMPATE',
  material: 'SEM MATERIAL PARA MATE: EMPATE',
};

/** Peças que cada lado (brancas, pretas) já perdeu, comparando com o começo. */
export function perdidas(tab: string[]) {
  const inicio = deFen(INICIAL).tab;
  const conta = (t: string[], x: string) => t.filter((y) => y === x).length;
  return (['b', 'p'] as const).map((cor) => 'qrbnp'.split('').flatMap((t) => {
    const x = cor === 'b' ? t.toUpperCase() : t;
    return Array.from({ length: Math.max(0, conta(inicio, x) - conta(tab, x)) }, () => x);
  }));
}
