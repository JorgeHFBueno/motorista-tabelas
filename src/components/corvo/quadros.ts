// Quadros do corvo, o mascote da WEB (aprovado pelo responsável em 2026-11-24), em pixels. Cada animação é uma
// cena de largura × altura; cada quadro, as linhas da cena, um caractere por pixel ('.' vazio; as cores em Corvo.tsx).
// De perfil (bico curvo, rabo baixo e longo): cabeça inclinada (tabelas vazias), grito (acesso negado: enche o peito,
// grita duas vezes com ondas de som, tremendo, e perde uma pena) e teclando
// (carregamento: pula nas teclas de um notebook). De frente (cabeça pontuda, asas de capa): placa (página não
// encontrada: tira uma placa com "?" das costas, mostra, dá de ombros, esconde e assobia).

export type Animacao = 'cabeca' | 'grito' | 'teclando' | 'placa';
export type Cena = {
  largura: number;
  altura: number;
  quadros: number;
  ms: number;
  /** o quadro mostrado sem movimento (movimento reduzido pedido pelo sistema) */
  parado: number;
};

export const CENAS: Record<Animacao, Cena> = {
  cabeca: { largura: 21, altura: 16, quadros: 12, ms: 260, parado: 0 },
  grito: { largura: 34, altura: 19, quadros: 20, ms: 170, parado: 5 },
  teclando: { largura: 44, altura: 24, quadros: 96, ms: 150, parado: 0 },
  placa: { largura: 34, altura: 36, quadros: 30, ms: 180, parado: 12 },
};

type Grade = string[][];
const novaCena = (c: Cena): Grade => Array.from({ length: c.altura }, () => Array<string>(c.largura).fill('.'));
const pix = (g: Grade, x: number, y: number, c: string) => {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
};
const colar = (g: Grade, spr: Grade, x0: number, y0: number) =>
  spr.forEach((l, y) => l.forEach((c, x) => { if (c !== '.') pix(g, x + x0, y + y0, c); }));
const sprite = (linhas: string[], largura = 26): Grade => linhas.map((l) => l.padEnd(largura, '.').split(''));
const pintar = (g: Grade, y: number, xs: number[], c: string) => xs.forEach((x) => { g[y][x] = c; });

// ---- De perfil ('#' corpo, 'w' asa, 'o' olho, 'b' bico e pés, 'M' boca aberta, 's' som) ----

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

/** O corvo de perfil parado (14 linhas). */
function perfil(olho: 'o' | '#'): Grade {
  const g = sprite(['..............###', '.............#####', `............##${olho}##`, '............#####', ...CORPO]);
  pintar(g, 2, [17, 18], 'b');
  pintar(g, 3, [17, 18, 19], 'b');
  pintar(g, 4, [19], 'b');
  RABO.forEach(([y, xs]) => pintar(g, y, xs, '#'));
  return g;
}

/** Agachado (impulso e pouso): o corpo desce 1 pixel e as pernas encolhem. */
function agachado(olho: 'o' | '#'): Grade {
  const r = perfil(olho);
  return [Array<string>(26).fill('.'), ...r.slice(0, 11), r[12], r[13]];
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

/** Enchendo o peito: agachado, com a cabeça puxada 1 pixel para trás. */
function puxado(olho: 'o' | '#'): Grade {
  const r = agachado(olho).map((l) => l.slice());
  for (let y = 1; y <= 4; y++) for (let x = 12; x < 25; x++) r[y][x] = r[y][x + 1];
  return r;
}

/** Gritando (16 linhas): cabeça erguida e inclinada para trás, bico aberto em "<" (o de baixo reto); com `asaErguida`,
 * a asa sobe nas costas. */
function gritando(asaErguida: boolean): Grade {
  const g = sprite(['.............###', '............#####', '...........##o##', '...........#####', '...........######', '...........######', ...CORPO]);
  pintar(g, 2, [16, 17], 'b');
  pintar(g, 1, [17, 18], 'b');
  pintar(g, 0, [18, 19], 'b');
  pintar(g, 4, [17, 18, 19, 20], 'b');
  pintar(g, 3, [16, 17], 'M');
  RABO.forEach(([y, xs]) => pintar(g, y + 2, xs, '#'));
  if (asaErguida) {
    ([[8, [10, 11, 12, 13]], [9, [9, 10, 11, 12]], [10, [9, 10, 11]]] as [number, number[]][])
      .forEach(([y, xs]) => xs.forEach((x) => { if (g[y][x] === 'w') g[y][x] = '#'; }));
    ([[4, [7, 8]], [5, [6, 7, 8, 9]], [6, [5, 6, 7, 8, 9, 10]], [7, [6, 7, 8, 9, 10]]] as [number, number[]][])
      .forEach(([y, xs]) => pintar(g, y, xs, 'w'));
  }
  return g;
}

/** Ondas de som em ")" (ou "(" com lado -1), a 2, 4 e 6 pixels do bico, cada uma mais alta. */
function aneis(g: Grade, cx: number, cy: number, quais: number[], lado: 1 | -1) {
  quais.forEach((k) => {
    const d = 2 + k * 2;
    const h = 1 + k;
    pix(g, cx + lado * d, cy - h - 1, 's');
    for (let y = cy - h; y <= cy + h; y++) pix(g, cx + lado * (d + 1), y, 's');
    pix(g, cx + lado * d, cy + h + 1, 's');
  });
}

const pena = (g: Grade, x: number, y: number, c: string) => { pix(g, x, y, c); pix(g, x + 1, y, c); pix(g, x + 2, y + 1, c); };

type PassoGrito = { pose: 'parado' | 'puxado' | 'agachado' | 'gritando'; olho?: 'o' | '#'; aneis?: number[]; asa?: boolean; dx?: number; dy?: number; pena?: [number, number] };
/** Pisca, enche o peito, grita (pulo, ondas, tremendo, asa batendo), toma fôlego, grita de novo e perde uma pena. */
const GRITO: PassoGrito[] = [
  { pose: 'parado' }, { pose: 'parado', olho: '#' }, { pose: 'parado' },
  { pose: 'puxado' }, { pose: 'puxado' },
  { pose: 'gritando', aneis: [0], dy: -1, asa: true }, { pose: 'gritando', aneis: [0, 1], dx: 1 },
  { pose: 'gritando', aneis: [1, 2], dx: -1, asa: true }, { pose: 'gritando', aneis: [2], dx: 1 },
  { pose: 'agachado' },
  { pose: 'gritando', aneis: [0], dy: -1, asa: true }, { pose: 'gritando', aneis: [0, 1], dx: 1 },
  { pose: 'gritando', aneis: [1, 2], dx: -1, asa: true }, { pose: 'gritando', aneis: [2], pena: [12, 1] },
  { pose: 'parado', pena: [11, 3] }, { pose: 'agachado', olho: '#', pena: [12, 5] }, { pose: 'parado', pena: [11, 7] },
  { pose: 'parado', olho: '#' }, { pose: 'parado' }, { pose: 'parado' },
];

function grito(i: number): Grade {
  const p = GRITO[i];
  const g = novaCena(CENAS.grito);
  const x = 2 + (p.dx ?? 0);
  const y = 3 + (p.dy ?? 0);
  const olho = p.olho ?? 'o';
  if (p.pose === 'gritando') {
    colar(g, gritando(!!p.asa), x, y - 2);
    aneis(g, x + 22, y + 1, p.aneis ?? [], 1);
  } else {
    colar(g, p.pose === 'puxado' ? puxado(olho) : p.pose === 'agachado' ? agachado(olho) : perfil(olho), x, y);
  }
  if (p.pena) pena(g, p.pena[0], p.pena[1], 'w');
  return g;
}

/** Cabeça inclinada: pisca no quadro 3 e adianta a cabeça do 6º ao 8º. */
function cabeca(i: number): Grade {
  const g = novaCena(CENAS.cabeca);
  let corvo = perfil(i === 3 ? '#' : 'o');
  if (i >= 6 && i <= 8) corvo = cabecaAdiantada(corvo);
  colar(g, corvo, 0, 2);
  return g;
}

// ---- Teclando: notebook ('F' moldura, 'E' tela, 'X' texto, 'C' cursor, 'K' tecla, 'P' tecla apertada, 'D' base) ----

const TECLAS: number[] = [];
for (let x = 3; x <= 40; x += 3) TECLAS.push(x);
/** Os pontos do teclado onde ele pousa, em volta. */
const ALVOS = [0, 4, 8, 4];
/** Cada pulo: agacha, sobe, desce, pousa (agachado, a tecla aperta), fica de pé, espera. */
const QUADROS_POR_PULO = 6;
const LETRAS_POR_POUSO = 3;
const LETRAS_NA_TELA = 48;

function notebook(g: Grade, apertada: number, letras: number, cursor: boolean) {
  for (let x = 26; x <= 41; x++) { pix(g, x, 2, 'F'); pix(g, x, 15, 'F'); }
  for (let y = 2; y <= 15; y++) { pix(g, 26, y, 'F'); pix(g, 41, y, 'F'); }
  for (let y = 3; y <= 14; y++) for (let x = 27; x <= 40; x++) pix(g, x, y, 'E');
  for (let x = 31; x <= 36; x++) { pix(g, x, 16, 'F'); pix(g, x, 17, 'F'); }
  for (let x = 1; x <= 42; x++) { pix(g, x, 19, 'D'); pix(g, x, 20, 'D'); }
  TECLAS.forEach((x) => { const c = x === apertada ? 'P' : 'K'; pix(g, x, 18, c); pix(g, x + 1, 18, c); });
  // o texto: 4 linhas de 12, em palavras de 4 letras
  let n = letras;
  for (let l = 0; l < 4 && n > 0; l++) {
    for (let x = 28; x <= 39 && n > 0; x++, n--) if ((x - 28) % 5 !== 4) pix(g, x, 5 + l * 2, 'X');
  }
  if (cursor && letras < LETRAS_NA_TELA) pix(g, 28 + (letras % 12), 5 + Math.floor(letras / 12) * 2, 'C');
}

function teclando(i: number): Grade {
  const g = novaCena(CENAS.teclando);
  const pulo = Math.floor(i / QUADROS_POR_PULO);
  const fase = i % QUADROS_POR_PULO;
  const para = ALVOS[pulo % ALVOS.length];
  const de = ALVOS[(pulo + ALVOS.length - 1) % ALVOS.length];
  const x = fase === 0 ? de : fase === 1 ? Math.round(de + (para - de) / 3) : fase === 2 ? Math.round(de + (2 * (para - de)) / 3) : para;
  const noAr = fase === 1 || fase === 2;
  const pousos = pulo + (fase >= 3 ? 1 : 0);
  const letras = (pousos * LETRAS_POR_POUSO) % (LETRAS_NA_TELA + 1);
  const pes = x + 11;
  const apertada = fase === 3 || fase === 4 ? TECLAS.reduce((a, b) => (Math.abs(b - pes) < Math.abs(a - pes) ? b : a)) : -1;
  notebook(g, apertada, letras, Math.floor(i / 3) % 2 === 0);
  const olho = i % 23 === 11 ? '#' : 'o';
  colar(g, fase === 0 || fase === 3 ? agachado(olho) : perfil(olho), x, 4 + (noAr ? -3 : 0));
  return g;
}

// ---- Placa, de frente ('#' corpo, 'W' asa de capa, 'A' asa-braço, 'f' pena, 'c' peito, 'o' olho, 'b' bico e pés,
// 'm' moldura e 'n' fundo da placa, 'q' interrogação, 'h' cabo, 's' estalo e notas) ----

const FRENTE = [
  '........##........',
  '.......####.......',
  '......######......',
  '.....########.....',
  '....##########....',
  '....##########....',
  '....##########....',
  '....##bbbbbb##....',
  '....###bbbb###....',
  '....####bb####....',
  '.....########.....',
  '....####cc####....',
  '...W###cccc###W...',
  '..WW###cccc###WW..',
  '..WW###cccc###WW..',
  '..WW####cc####WW..',
  '..WW##########WW..',
  '..W.W########W.W..',
  '..W...######...W..',
  '......b....b......',
  '......b....b......',
  '.....bbb..bbb.....',
];
type Olhar = 'centro' | 'esq' | 'dir' | 'cima' | 'fechado';
const DESVIO: Record<Exclude<Olhar, 'fechado'>, [number, number]> = { centro: [0, 0], esq: [0, -1], dir: [0, 1], cima: [-1, 0] };

/** De frente; sem uma das asas de capa quando ela vira braço. */
function frente(olhar: Olhar, semEsquerda: boolean, semDireita: boolean): Grade {
  const r = sprite(FRENTE, 18);
  if (olhar !== 'fechado') {
    const [dy, dx] = DESVIO[olhar];
    r[5 + dy][6 + dx] = 'o';
    r[5 + dy][11 + dx] = 'o';
  }
  r.forEach((l) => l.forEach((c, x) => { if (c === 'W' && ((semDireita && x >= 13) || (semEsquerda && x <= 4))) l[x] = '.'; }));
  return r;
}

const INTERROGACAO = ['.qqq.', 'q...q', '...q.', '..q..', '.....', '..q..'];
function placa(semInterrogacao: boolean): Grade {
  const g: Grade = [];
  for (let y = 0; y < 9; y++) g.push(Array.from({ length: 11 }, (_, x) => (y === 0 || y === 8 || x === 0 || x === 10 ? 'm' : 'n')));
  if (!semInterrogacao) INTERROGACAO.forEach((l, y) => [...l].forEach((c, x) => { if (c === 'q') g[y + 1][x + 3] = 'q'; }));
  return g;
}

/** Asa-braço: faixa larga em diagonal do ombro à mão, com listras de pena, pontas penduradas e a mão fechada. */
function asa(g: Grade, sx: number, sy: number, hx: number, hy: number) {
  const dx = hx - sx;
  const dy = hy - sy;
  const n = Math.max(Math.abs(dx), Math.abs(dy)) * 3;
  const lado = dx < 0 ? -1 : 1;
  const ponto = (t: number): [number, number] => [Math.round(sx + dx * t), Math.round(sy + dy * t)];
  for (let i = 0; i <= n; i++) {
    const [x, y] = ponto(i / n);
    const w = i / n < 0.6 ? 4 : 3;
    for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) pix(g, x + lado * a - lado, y + b - 1, 'A');
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (t < 0.12 || t > 0.82) continue;
    const [x, y] = ponto(t);
    if (i % 4 < 2) pix(g, x, y, 'f');
    if ((i + 2) % 4 < 2) pix(g, x + lado, y + 1, 'f');
  }
  for (const t of [0.15, 0.38, 0.6]) {
    const [x, y] = ponto(t);
    pix(g, x + lado, y + 3, 'A');
    pix(g, x + lado * 2, y + 3, 'A');
    pix(g, x + lado, y + 4, 'A');
  }
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) pix(g, hx + a, hy + b, 'A');
  pix(g, hx - lado, hy - 1, '#');
  pix(g, hx - lado * 2, hy, '#');
  pix(g, hx + lado * 2, hy, '#');
  pix(g, hx + lado * 2, hy + 1, '#');
}

function placaNaMao(g: Grade, hx: number, hy: number, semInterrogacao = false) {
  colar(g, placa(semInterrogacao), hx - 5, hy - 15);
  for (let y = hy - 6; y <= hy + 2; y++) pix(g, hx, y, 'h');
}
const caboAcimaDaMao = (g: Grade, hx: number, hy: number) => { for (let y = hy - 6; y <= hy - 2; y++) pix(g, hx, y, 'h'); };
function estalo(g: Grade, hx: number, hy: number) {
  const x0 = hx - 5;
  const y0 = hy - 15;
  [[x0 - 2, y0 - 1], [x0 - 3, y0 + 4], [x0 - 2, y0 + 9], [x0 + 12, y0 - 1], [x0 + 13, y0 + 4], [x0 + 12, y0 + 9]].forEach(([x, y]) => pix(g, x, y, 's'));
}
const nota = (g: Grade, x: number, y: number) =>
  [[1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3]].forEach(([a, b]) => pix(g, x + a, y + b, 's'));

const X0 = 8;
const Y0 = 13;
const OMBRO_D: [number, number] = [X0 + 14, Y0 + 14];
const OMBRO_E: [number, number] = [X0 + 3, Y0 + 14];
const MAO: [number, number] = [28, 20];
const DE_OMBROS: [number, number] = [OMBRO_E[0] - 5, OMBRO_E[1] - 6];

type Passo = {
  o: Olhar;
  /** mão da asa direita */
  d?: [number, number];
  /** a asa direita vai atrás das costas (sem placa, ou com ela) */
  tras?: boolean;
  placaTras?: boolean;
  placa?: boolean;
  semInterrogacao?: boolean;
  estalo?: boolean;
  /** mão da asa esquerda (dar de ombros) */
  e?: [number, number];
  dy?: number;
  nota?: [number, number];
};
const [MX, MY] = MAO;
const PLACA: Passo[] = [
  { o: 'centro' }, { o: 'centro' }, { o: 'fechado' }, { o: 'centro' },
  { o: 'esq' }, { o: 'esq' }, { o: 'dir' }, { o: 'dir' }, { o: 'centro' },
  { o: 'centro', d: [OMBRO_D[0] - 2, OMBRO_D[1] - 1], tras: true },
  { o: 'centro', d: [OMBRO_D[0] - 3, OMBRO_D[1] - 2], tras: true },
  { o: 'cima', d: [MX, MY], placa: true, estalo: true, dy: -1 },
  { o: 'cima', d: [MX, MY], placa: true },
  { o: 'centro', d: [MX, MY - 1], placa: true },
  { o: 'centro', d: [MX, MY + 1], placa: true },
  { o: 'centro', d: [MX, MY - 1], placa: true, semInterrogacao: true },
  { o: 'centro', d: [MX, MY + 1], placa: true },
  { o: 'centro', d: [MX, MY], placa: true, e: DE_OMBROS, dy: 1 },
  { o: 'centro', d: [MX, MY], placa: true, e: [DE_OMBROS[0], DE_OMBROS[1] - 1], dy: 1 },
  { o: 'fechado', d: [MX, MY], placa: true, e: DE_OMBROS, dy: 1 },
  { o: 'centro', d: [MX, MY], placa: true },
  { o: 'esq', d: [OMBRO_D[0] + 2, OMBRO_D[1] - 5], placaTras: true },
  { o: 'esq', d: [OMBRO_D[0] - 1, OMBRO_D[1] - 2], placaTras: true },
  { o: 'cima', nota: [MX - 4, Y0 - 4] },
  { o: 'cima', nota: [MX - 3, Y0 - 6] },
  { o: 'cima', nota: [MX - 2, Y0 - 8] },
  { o: 'fechado' }, { o: 'centro' }, { o: 'centro' }, { o: 'centro' },
];

function comPlaca(i: number): Grade {
  const p = PLACA[i];
  const g = novaCena(CENAS.placa);
  const dy = p.dy ?? 0;
  if (p.placaTras && p.d) placaNaMao(g, p.d[0], p.d[1]);
  if ((p.tras || p.placaTras) && p.d) asa(g, OMBRO_D[0], OMBRO_D[1] + dy, p.d[0], p.d[1]);
  colar(g, frente(p.o, !!p.e, !!p.d), X0, Y0 + dy);
  if (p.placa && p.d) {
    const y = p.d[1] + Math.min(dy, 0);
    placaNaMao(g, p.d[0], y, p.semInterrogacao);
    asa(g, OMBRO_D[0], OMBRO_D[1] + dy, p.d[0], y);
    caboAcimaDaMao(g, p.d[0], y);
    if (p.estalo) estalo(g, p.d[0], y);
  }
  if (p.e) asa(g, OMBRO_E[0], OMBRO_E[1] + dy, p.e[0], p.e[1]);
  if (p.nota) nota(g, p.nota[0], p.nota[1]);
  return g;
}

/** O quadro `i` (0 a quadros - 1) da animação, como linhas da cena. */
export function quadro(animacao: Animacao, i: number): string[] {
  const g = animacao === 'teclando' ? teclando(i) : animacao === 'placa' ? comPlaca(i) : animacao === 'grito' ? grito(i) : cabeca(i);
  return g.map((l) => l.join(''));
}

/** Um path SVG por cor: cada pixel vira um quadrado 1×1 da cena. */
export function caminhos(linhas: string[]): Record<string, string> {
  const d: Record<string, string> = {};
  linhas.forEach((linha, y) => {
    [...linha].forEach((c, x) => {
      if (c !== '.') d[c] = `${d[c] ?? ''}M${x} ${y}h1v1h-1z`;
    });
  });
  return d;
}

export { PLACA as PASSOS_DA_PLACA, GRITO as PASSOS_DO_GRITO };
