// Quadros do corvo, o mascote da WEB (aprovado pelo responsável em 2026-11-24), em pixels: '#' corpo, 'w' asa,
// 'o' olho, 'b' bico e pés, 's' som do grito, '.' vazio. Corvo de perfil, bico curvo, rabo baixo e longo.
// Um ciclo tem QUADROS quadros: pisca no 3º e faz o movimento da animação do 6º ao 9º.

export type Animacao = 'pulinho' | 'cabeca' | 'rabo' | 'grito';
export type Quadro = {
  /** linhas de pixels */
  linhas: string[];
  /** deslocamento vertical, em pixels (negativo sobe) */
  dy: number;
};

export const QUADROS = 12;
export const MS_POR_QUADRO = 260;
/** Espaço para o corpo, a cabeça adiantada e o pulinho (grito: + o som à frente). */
export const LARGURA: Record<Animacao, number> = { pulinho: 21, cabeca: 21, rabo: 21, grito: 26 };
/** Linhas da grade: 14 do corvo, mais 2 em cima para o pulinho e o pescoço esticado do grito. */
export const ALTURA = 16;
export const MARGEM_TOPO = 2;

const RABO: [number, number[]][] = [[9, [6, 7]], [10, [5, 6, 7, 8]], [11, [4, 5, 6, 7]], [12, [3, 4, 5]], [13, [2, 3]]];
const CORPO = [
  '...........######',
  '..........#######',
  '........###wwww##',
  '......####wwww###',
  '.......###www####',
  '........########',
  '.........######',
  '..........b..b',
  '..........b..b',
  '.........bb.bb',
];

type Grade = string[][];
const grade = (linhas: string[]): Grade => linhas.map((l) => l.padEnd(26, '.').split(''));
const pintar = (g: Grade, y: number, xs: number[], c: string) => xs.forEach((x) => { g[y][x] = c; });
const texto = (g: Grade): string[] => g.map((l) => l.join(''));

function parado(olho: 'o' | '#'): Grade {
  const g = grade(['..............###', '.............#####', `............##${olho}##`, '............#####', ...CORPO]);
  pintar(g, 2, [17, 18], 'b');
  pintar(g, 3, [17, 18, 19], 'b');
  pintar(g, 4, [19], 'b');
  RABO.forEach(([y, xs]) => pintar(g, y, xs, '#'));
  return g;
}

/** Cabeça adiantada 1 pixel, como quem olha alguma coisa. */
function cabecaAdiantada(g: Grade): Grade {
  const n = g.map((l) => l.slice());
  for (let y = 0; y <= 3; y++) {
    for (let x = 25; x > 12; x--) n[y][x] = g[y][x - 1];
    n[y][12] = '.';
  }
  return n;
}

/** Rabo levantado um pouco. */
function raboLevantado(g: Grade): Grade {
  const n = g.map((l) => l.slice());
  ([[10, [5]], [11, [4]], [12, [3, 4, 5]], [13, [2, 3]]] as [number, number[]][]).forEach(([y, xs]) => pintar(n, y, xs, '.'));
  ([[9, [5]], [10, [3, 4]], [11, [2, 3]], [12, [1, 2]]] as [number, number[]][]).forEach(([y, xs]) => pintar(n, y, xs, '#'));
  return n;
}

/** Grito: cabeça erguida e inclinada para trás, bico aberto em "<" (o de baixo reto) e o som à frente. */
function gritando(som: boolean): Quadro {
  const g = grade(['.............###', '............#####', '...........##o##', '...........#####', '...........######', '...........######', ...CORPO]);
  pintar(g, 2, [16, 17], 'b');
  pintar(g, 1, [17, 18], 'b');
  pintar(g, 0, [18, 19], 'b');
  pintar(g, 4, [17, 18, 19, 20], 'b');
  RABO.forEach(([y, xs]) => pintar(g, y + 2, xs, '#'));
  if (som) {
    pintar(g, 1, [22], 's');
    pintar(g, 0, [23], 's');
    pintar(g, 3, [22, 23, 24], 's');
    pintar(g, 5, [22], 's');
    pintar(g, 6, [23], 's');
  }
  return { linhas: texto(g), dy: -2 };
}

/** O quadro `i` (0 a QUADROS - 1) da animação. */
export function quadro(animacao: Animacao, i: number): Quadro {
  const olho = i === 3 ? '#' : 'o';
  const movendo = i >= 6 && i <= 9;
  if (animacao === 'grito' && movendo) return gritando(i % 2 === 0);
  let g = parado(olho);
  if (animacao === 'cabeca' && i >= 6 && i <= 8) g = cabecaAdiantada(g);
  if (animacao === 'rabo' && (i === 7 || i === 9)) g = raboLevantado(g);
  return { linhas: texto(g), dy: animacao === 'pulinho' && (i === 7 || i === 8) ? -1 : 0 };
}

/** Um path SVG por cor: cada pixel vira um quadrado 1×1 na grade (y já com a margem do topo e o deslocamento). */
export function caminhos(q: Quadro): Record<string, string> {
  const d: Record<string, string> = {};
  q.linhas.forEach((linha, y) => {
    [...linha].forEach((c, x) => {
      if (c === '.') return;
      d[c] = `${d[c] ?? ''}M${x} ${y + MARGEM_TOPO + q.dy}h1v1h-1z`;
    });
  });
  return d;
}
