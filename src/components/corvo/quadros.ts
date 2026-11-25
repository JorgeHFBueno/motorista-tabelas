// Quadros do corvo, o mascote da WEB (aprovado pelo responsável em 2026-11-24), em pixels. Cada animação é uma
// cena de largura × altura; cada quadro, as linhas da cena, um caractere por pixel ('.' vazio; as cores em Corvo.tsx).
// De perfil (bico curvo, rabo baixo e longo): cabeça (tabelas vazias: procura, bica, estica o pescoço com "?", olha
// para trás, cisca e encolhe a asa), grito (acesso negado: enche o peito,
// grita duas vezes com ondas de som, tremendo, e perde uma pena) e teclando
// (carregamento: pula nas teclas de um notebook escrevendo, dá um pulo alto no Enter, a barra de progresso enche, e
// ele olha a tela). De frente (cabeça pontuda, asas de capa): placa (página não
// encontrada, confuso: tira das costas uma placa em branco, vira e aparece o "?", dá de ombros, guarda e coça a cabeça).

export type Animacao = 'cabeca' | 'grito' | 'teclando' | 'placa';
export type Cena = {
  largura: number;
  altura: number;
  quadros: number;
  ms: number;
  /** o quadro mostrado sem movimento (movimento reduzido pedido pelo sistema) */
  parado: number;
};

/** Linhas vazias no topo de toda cena: espaço para o enfeite das datas festivas (festas.ts) acima da cabeça. */
export const MARGEM_ENFEITE = 2;

export const CENAS: Record<Animacao, Cena> = {
  cabeca: { largura: 30, altura: 20 + MARGEM_ENFEITE, quadros: 23, ms: 200, parado: 10 },
  grito: { largura: 34, altura: 19 + MARGEM_ENFEITE, quadros: 20, ms: 170, parado: 5 },
  teclando: { largura: 44, altura: 26 + MARGEM_ENFEITE, quadros: 220, ms: 130, parado: 44 },
  placa: { largura: 34, altura: 36 + MARGEM_ENFEITE, quadros: 44, ms: 190, parado: 20 },
};

type Grade = string[][];
/** A cena sem a margem do enfeite (quadro() a acrescenta no fim). */
const novaCena = (c: Cena): Grade => Array.from({ length: c.altura - MARGEM_ENFEITE }, () => Array<string>(c.largura).fill('.'));
const pix = (g: Grade, x: number, y: number, c: string) => {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
};
const colar = (g: Grade, spr: Grade, x0: number, y0: number) =>
  spr.forEach((l, y) => l.forEach((c, x) => { if (c !== '.') pix(g, x + x0, y + y0, c); }));
const sprite = (linhas: string[], largura = 26): Grade => linhas.map((l) => l.padEnd(largura, '.').split(''));
const pintar = (g: Grade, y: number, xs: number[], c: string) => xs.forEach((x) => { g[y][x] = c; });

// ---- De perfil ('#' corpo, 'w' asa, 'o' olho, 'b' bico e pés, 'M' boca aberta, 's' som e "?", 'p' poeira) ----

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

/** Bicando: agachado, com a cabeça 3 pixels abaixo e 2 à frente (o pescoço preenche o espaço até o alto da cabeça). */
function bicando(olho: 'o' | '#'): Grade {
  const r = agachado(olho).map((l) => l.slice());
  const cabeca = r.slice(1, 6).map((l) => l.slice());
  for (let y = 1; y <= 5; y++) for (let x = 12; x < 26; x++) if (y < 5 || x >= 17) r[y][x] = '.';
  cabeca.forEach((l, k) => l.forEach((c, x) => { if (x >= 12 && c !== '.' && x + 2 < 26) r[k + 4][x + 2] = c; }));
  for (let y = 4; y <= 6; y++) for (let x = 13; x <= 16; x++) if (r[y][x] === '.') r[y][x] = '#';
  return r;
}

/** Pescoço esticado 1 pixel (15 linhas: a cabeça sobe, os pés ficam). */
function pescocoEsticado(olho: 'o' | '#'): Grade {
  const p = perfil(olho);
  const pescoco = p[4].slice();
  pescoco[19] = '.';
  return [p[0], p[1], p[2], p[3], p[4], pescoco, ...p.slice(5)];
}

/** Virado para trás (espelhado). */
const virado = (olho: 'o' | '#'): Grade => perfil(olho).map((l) => l.slice().reverse());

/** Ciscando: a pata de trás vai para trás. */
function ciscando(olho: 'o' | '#'): Grade {
  const g = perfil(olho);
  for (let y = 11; y <= 13; y++) for (let x = 8; x <= 14; x++) if (g[y][x] === 'b') g[y][x] = '.';
  ([[11, [13]], [12, [13]], [13, [12, 13]], [11, [10]], [12, [9]], [13, [7, 8]]] as [number, number[]][]).forEach(([y, xs]) => pintar(g, y, xs, 'b'));
  return g;
}

/** Encolhendo a asa ("não tem nada aqui"): a asa sobe 1 pixel. */
function encolhendo(olho: 'o' | '#'): Grade {
  const g = perfil(olho);
  for (let y = 6; y <= 8; y++) for (let x = 0; x < 26; x++) if (g[y][x] === 'w') g[y][x] = '#';
  ([[5, [11, 12, 13]], [6, [10, 11, 12, 13]], [7, [10, 11, 12]]] as [number, number[]][]).forEach(([y, xs]) => pintar(g, y, xs, 'w'));
  return g;
}

const DUVIDA = ['sss', '..s', '.s.', '...', '.s.'];
type PassoCabeca = {
  pose: 'parado' | 'olhando' | 'bicando' | 'pescoco' | 'virado' | 'ciscando' | 'encolhendo';
  olho?: 'o' | '#';
  /** "?" acima da cabeça (deslocamento vertical) */
  duvida?: number;
  /** poeira: na frente (bicada) ou atrás (ciscada) */
  poeira?: 'frente' | 'tras';
};
/** Tabela vazia: o corvo procura. Olha, bica, estica o pescoço com "?", olha para trás, cisca e encolhe a asa. */
const CABECA: PassoCabeca[] = [
  { pose: 'parado' }, { pose: 'parado', olho: '#' }, { pose: 'parado' },
  { pose: 'olhando' }, { pose: 'olhando' }, { pose: 'parado' },
  { pose: 'bicando' }, { pose: 'olhando' }, { pose: 'bicando', poeira: 'frente' }, { pose: 'parado' },
  { pose: 'pescoco', duvida: 0 }, { pose: 'pescoco', duvida: -1 }, { pose: 'pescoco', duvida: 0 },
  { pose: 'virado', duvida: 0 }, { pose: 'virado', olho: '#', duvida: 0 }, { pose: 'parado' },
  { pose: 'ciscando', poeira: 'tras' }, { pose: 'parado' }, { pose: 'ciscando', poeira: 'tras' },
  { pose: 'encolhendo' }, { pose: 'encolhendo', olho: '#' }, { pose: 'parado' }, { pose: 'parado' },
];

function cabeca(i: number): Grade {
  const p = CABECA[i];
  const olho = p.olho ?? 'o';
  const g = novaCena(CENAS.cabeca);
  const x = 4;
  const y = 5;
  const corvo = {
    parado: () => perfil(olho),
    olhando: () => cabecaAdiantada(perfil(olho)),
    bicando: () => bicando(olho),
    pescoco: () => pescocoEsticado(olho),
    virado: () => virado(olho),
    ciscando: () => ciscando(olho),
    encolhendo: () => encolhendo(olho),
  }[p.pose]();
  // espelhado, os pés ficam no mesmo lugar 3 pixels à esquerda; com o pescoço esticado, a cena sobe 1 para os pés ficarem
  colar(g, corvo, x + (p.pose === 'virado' ? -3 : 0), y + (p.pose === 'pescoco' ? -1 : 0));
  if (p.poeira === 'frente') { pix(g, x + 22, y + 13, 'p'); pix(g, x + 23, y + 12, 'p'); pix(g, x + 21, y + 12, 'p'); }
  if (p.poeira === 'tras') { pix(g, x + 5, y + 13, 'p'); pix(g, x + 4, y + 12, 'p'); pix(g, x + 6, y + 11, 'p'); }
  if (p.duvida !== undefined) {
    const dx = p.pose === 'virado' ? 4 : 19;
    DUVIDA.forEach((l, yy) => [...l].forEach((c, xx) => { if (c === 's') pix(g, x + dx + xx, y - 5 + yy + p.duvida!, 's'); }));
  }
  return g;
}

// ---- Teclando: notebook ('F' moldura, 'E' tela, 'X' texto, 'C' cursor e progresso, 'G' fundo da barra, 'K' tecla,
// 'P' tecla apertada, 'D' base, 's' tac) ----

/** Tudo do teclando desce 2 linhas: no pulo do Enter a cabeça sobe 6 e o gorro ainda precisa caber. */
const Y = 2;
const TECLAS: number[] = [];
for (let x = 3; x <= 37; x += 3) TECLAS.push(x);
/** O Enter em "L": x 39 a 41 na linha do teclado e o 41 uma linha acima. */
const ENTER = 40;
/** Os pontos do teclado onde ele pousa, em volta; depois do último, o pulo alto do Enter. */
const ALVOS = [0, 4, 8, 4, 0, 4];
const NO_ENTER = 9;
const LETRAS_POR_POUSO = 3;
const LETRAS_POR_LINHA = 12;
const PROGRESSO_MAX = 12;

type PassoTeclando = {
  x: number;
  /** altura no pulo (negativo sobe) */
  dy?: number;
  pose: 'agachado' | 'ar' | 'pe' | 'olha';
  /** no ar, a asa sobe nas costas */
  asa?: boolean;
  /** a tecla apertada (x da tecla, ou ENTER) */
  tecla?: number;
  /** os "tac" ao lado dos pés: 1 no pouso, 2 no segundo quadro do Enter */
  tac?: 1 | 2;
  forte?: boolean;
  piscando?: boolean;
  /** letras em cada linha da tela (as 4 últimas) e a barra de progresso */
  linhas: number[];
  progresso: number;
};

/**
 * Quatro rodadas: cinco pulos pelas teclas (cada pouso escreve 3 letras), um pulo alto no Enter (linha nova e a barra
 * enche 3), olha a tela piscando e volta pulando. No fim a tela e a barra recomeçam vazias.
 */
function montarTeclando(): PassoTeclando[] {
  const passos: PassoTeclando[] = [];
  const linhas = [0];
  let progresso = 0;
  const anota = (p: Omit<PassoTeclando, 'linhas' | 'progresso'>) => passos.push({ ...p, linhas: linhas.slice(-4), progresso });
  const pulo = (de: number, para: number, enter: boolean) => {
    anota({ x: de, pose: 'agachado' });
    const alturas = enter ? [-3, -5, -6, -4] : [-2, -3, -2];
    alturas.forEach((dy, k) => anota({ x: Math.round(de + ((para - de) * (k + 1)) / (alturas.length + 1)), dy, pose: 'ar', asa: k % 2 === 0 }));
    const pes = para + 11;
    const tecla = enter ? ENTER : TECLAS.reduce((a, b) => (Math.abs(b - pes) < Math.abs(a - pes) ? b : a));
    if (enter) {
      linhas.push(0);
      progresso = Math.min(PROGRESSO_MAX, progresso + 3);
    } else {
      linhas[linhas.length - 1] = Math.min(LETRAS_POR_LINHA, linhas[linhas.length - 1] + LETRAS_POR_POUSO);
    }
    anota({ x: para, pose: 'agachado', tecla, tac: 1, forte: enter });
    if (enter) anota({ x: para, pose: 'agachado', tecla, tac: 2, forte: true });
    anota({ x: para, pose: 'pe', tecla });
    anota({ x: para, pose: 'pe' });
  };
  for (let rodada = 0; rodada < 4; rodada++) {
    for (let k = 1; k < ALVOS.length; k++) pulo(ALVOS[k - 1], ALVOS[k], false);
    pulo(ALVOS[ALVOS.length - 1], NO_ENTER, true);
    [false, false, true, false].forEach((piscando) => anota({ x: NO_ENTER, pose: 'olha', piscando }));
    pulo(NO_ENTER, ALVOS[0], false);
  }
  return passos;
}
const TECLANDO = montarTeclando();

/** No ar: a asa sai do flanco e sobe nas costas. */
function asaAlta(g: Grade): Grade {
  for (let y = 6; y <= 8; y++) for (let x = 0; x < 26; x++) if (g[y][x] === 'w') g[y][x] = '#';
  ([[3, [9, 10]], [4, [8, 9, 10, 11]], [5, [7, 8, 9, 10, 11, 12]], [6, [8, 9, 10, 11, 12]]] as [number, number[]][])
    .forEach(([y, xs]) => pintar(g, y, xs, 'w'));
  return g;
}

function notebook(g: Grade, p: PassoTeclando, cursor: boolean) {
  for (let x = 26; x <= 41; x++) { pix(g, x, Y + 2, 'F'); pix(g, x, Y + 15, 'F'); }
  for (let y = Y + 2; y <= Y + 15; y++) { pix(g, 26, y, 'F'); pix(g, 41, y, 'F'); }
  for (let y = Y + 3; y <= Y + 14; y++) for (let x = 27; x <= 40; x++) pix(g, x, y, 'E');
  for (let x = 31; x <= 36; x++) { pix(g, x, Y + 16, 'F'); pix(g, x, Y + 17, 'F'); }
  for (let x = 1; x <= 42; x++) { pix(g, x, Y + 19, 'D'); pix(g, x, Y + 20, 'D'); }
  // a tecla apertada desce 1 pixel e acende
  const tecla = (xs: number[], dy: number, apertada: boolean) =>
    xs.forEach((x) => pix(g, x, Y + 18 + dy + (apertada ? 1 : 0), apertada ? 'P' : 'K'));
  TECLAS.forEach((x) => tecla([x, x + 1], 0, p.tecla === x));
  tecla([ENTER - 1, ENTER, ENTER + 1], 0, p.tecla === ENTER);
  tecla([ENTER + 1], -1, p.tecla === ENTER);
  // o texto: as 4 últimas linhas, em palavras de 4 letras; o cursor no fim da última
  p.linhas.forEach((n, l) => { for (let x = 0; x < n; x++) if (x % 5 !== 4) pix(g, 28 + x, Y + 5 + l * 2, 'X'); });
  const ultima = p.linhas.length - 1;
  if (cursor && p.linhas[ultima] < LETRAS_POR_LINHA) pix(g, 28 + p.linhas[ultima], Y + 5 + ultima * 2, 'C');
  // a barra de progresso
  for (let x = 0; x < LETRAS_POR_LINHA; x++) pix(g, 28 + x, Y + 13, x < p.progresso ? 'C' : 'G');
}

function teclando(i: number): Grade {
  const p = TECLANDO[i];
  const g = novaCena(CENAS.teclando);
  notebook(g, p, Math.floor(i / 3) % 2 === 0);
  const olho = p.piscando || i % 29 === 13 ? '#' : 'o';
  let s = p.pose === 'agachado' ? agachado(olho) : perfil(olho);
  if (p.pose === 'ar' && p.asa) s = asaAlta(s);
  if (p.pose === 'olha') s = cabecaAdiantada(s);
  colar(g, s, p.x, Y + 4 + (p.dy ?? 0));
  if (p.tac) {
    const fx = p.x + 11;
    const fy = Y + 17;
    const d = p.forte ? (p.tac === 1 ? 2 : 3) : 1;
    pix(g, fx - 2 - d, fy - 1, 's');
    pix(g, fx + 4 + d, fy - 1, 's');
    if (p.forte) { pix(g, fx - 3 - d, fy - 2, 's'); pix(g, fx + 5 + d, fy - 2, 's'); }
  }
  return g;
}

// ---- Placa, de frente ('#' corpo, 'W' asa de capa, 'A' asa-braço, 'f' pena, 'c' peito, 'o' olho, 'b' bico e pés,
// 'm' moldura e 'n' fundo da placa, 'q' interrogação, 'h' cabo, 's' coçada e "?") ----

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
type Olhar = 'centro' | 'esq' | 'dir' | 'cima' | 'placa' | 'confuso' | 'fechado';
/** Os pixels [linha, coluna] dos olhos; "placa" olha para cima e para a direita, "confuso" tem um olho arregalado. */
const OLHOS: Record<Exclude<Olhar, 'fechado'>, [number, number][]> = {
  centro: [[5, 6], [5, 11]],
  esq: [[5, 5], [5, 10]],
  dir: [[5, 7], [5, 12]],
  cima: [[4, 6], [4, 11]],
  placa: [[4, 7], [4, 12]],
  confuso: [[4, 6], [5, 6], [5, 11]],
};

/** De frente; sem uma das asas de capa quando ela vira braço; `inclina` desliza a cabeça inteira 1 pixel para o lado. */
function frente(olhar: Olhar, semEsquerda: boolean, semDireita: boolean, inclina = 0): Grade {
  const r = sprite(FRENTE, 18);
  if (olhar !== 'fechado') OLHOS[olhar].forEach(([y, x]) => { r[y][x] = 'o'; });
  r.forEach((l) => l.forEach((c, x) => { if (c === 'W' && ((semDireita && x >= 13) || (semEsquerda && x <= 4))) l[x] = '.'; }));
  if (inclina) for (let y = 0; y <= 10; y++) r[y] = inclina > 0 ? ['.', ...r[y].slice(0, -1)] : [...r[y].slice(1), '.'];
  return r;
}

const INTERROGACAO = ['.qqq.', 'q...q', '...q.', '..q..', '.....', '..q..'];
/** A placa; virando, fica mais estreita (5, depois 1 de largura: de lado) e só mostra o "?" de frente. */
function placa(semInterrogacao: boolean, largura = 11): Grade {
  const g: Grade = [];
  for (let y = 0; y < 9; y++) {
    g.push(Array.from({ length: largura }, (_, x) => (largura === 1 || y === 0 || y === 8 || x === 0 || x === largura - 1 ? 'm' : 'n')));
  }
  if (!semInterrogacao && largura === 11) INTERROGACAO.forEach((l, y) => [...l].forEach((c, x) => { if (c === 'q') g[y + 1][x + 3] = 'q'; }));
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

function placaNaMao(g: Grade, hx: number, hy: number, semInterrogacao = false, largura = 11) {
  colar(g, placa(semInterrogacao, largura), hx - Math.floor(largura / 2), hy - 15);
  for (let y = hy - 6; y <= hy + 2; y++) pix(g, hx, y, 'h');
}
const caboAcimaDaMao = (g: Grade, hx: number, hy: number) => { for (let y = hy - 6; y <= hy - 2; y++) pix(g, hx, y, 'h'); };
/** Risquinhos da coçada, ao lado da mão. */
const cocada = (g: Grade, hx: number, hy: number, k: number) => { pix(g, hx - 3, hy - 2 + k, 's'); pix(g, hx - 4, hy + k, 's'); };
const duvidaEm = (g: Grade, x: number, y: number) =>
  DUVIDA.forEach((l, yy) => [...l].forEach((c, xx) => { if (c === 's') pix(g, x + xx, y + yy, 's'); }));

const X0 = 8;
const Y0 = 13;
const OMBRO_D: [number, number] = [X0 + 14, Y0 + 14];
const OMBRO_E: [number, number] = [X0 + 3, Y0 + 14];
const MAO: [number, number] = [28, 20];
const DE_OMBROS: [number, number] = [OMBRO_E[0] - 5, OMBRO_E[1] - 6];
/** Onde sobem os "?" enquanto ele coça a cabeça: à esquerda e à direita da cabeça. */
const DUVIDA_E: [number, number] = [3, Y0 - 3];
const DUVIDA_D: [number, number] = [24, Y0 - 3];

type Passo = {
  o: Olhar;
  /** mão da asa direita */
  d?: [number, number];
  /** a asa direita vai atrás das costas (sem placa, ou com ela) */
  tras?: boolean;
  placaTras?: boolean;
  placa?: boolean;
  semInterrogacao?: boolean;
  /** a placa virando: 5 ou 1 de largura */
  largura?: number;
  /** mão da asa esquerda (dar de ombros) */
  e?: [number, number];
  inclina?: number;
  /** coçando a cabeça com a asa esquerda: 0 ou 1 (a mão desce 1 pixel) */
  coca?: 0 | 1;
  /** "?" no ar: posição de cada um */
  duvidas?: [number, number][];
};
const [MX, MY] = MAO;
const comPlacaNaMao = (o: Olhar, extra: Partial<Passo> = {}): Passo => ({ o, d: [MX, MY], placa: true, ...extra });
const sobe = ([x, y]: [number, number], k: number): [number, number] => [x, y - k];
/**
 * Confuso: olha em volta, procura nas costas e tira a placa em branco; olha para ela, para quem vê e para ela de novo;
 * vira a placa e aparece o "?"; mostra sem jeito, dá de ombros devagar, guarda a placa e coça a cabeça com "?" subindo.
 * Ajustado quadro a quadro pelo responsável em 2026-11-25.
 */
const PLACA: Passo[] = [
  { o: 'centro' }, { o: 'centro' }, { o: 'fechado' }, { o: 'centro' },
  { o: 'esq' }, { o: 'esq' }, { o: 'dir' }, { o: 'dir' }, { o: 'centro' },
  { o: 'cima', d: [OMBRO_D[0] - 2, OMBRO_D[1] - 1], tras: true },
  { o: 'cima', d: [OMBRO_D[0] - 4, OMBRO_D[1] - 3], tras: true },
  comPlacaNaMao('placa', { semInterrogacao: true }), comPlacaNaMao('placa', { semInterrogacao: true }),
  comPlacaNaMao('centro', { semInterrogacao: true }), comPlacaNaMao('centro', { semInterrogacao: true }),
  comPlacaNaMao('fechado', { semInterrogacao: true }), comPlacaNaMao('placa', { semInterrogacao: true }),
  comPlacaNaMao('placa', { semInterrogacao: true, largura: 5 }), comPlacaNaMao('placa', { semInterrogacao: true, largura: 1 }),
  comPlacaNaMao('placa', { largura: 5 }), comPlacaNaMao('placa'), comPlacaNaMao('placa'),
  comPlacaNaMao('centro', { d: [MX, MY - 1], inclina: -1 }), comPlacaNaMao('centro', { inclina: -1 }),
  comPlacaNaMao('centro', { d: [MX, MY - 1], inclina: -1 }), comPlacaNaMao('centro', { inclina: -1 }),
  comPlacaNaMao('centro', { e: DE_OMBROS }), comPlacaNaMao('centro', { e: sobe(DE_OMBROS, 1) }),
  comPlacaNaMao('fechado', { e: sobe(DE_OMBROS, 1) }), comPlacaNaMao('centro', { e: DE_OMBROS }),
  comPlacaNaMao('esq'),
  { o: 'esq', d: [OMBRO_D[0] + 2, OMBRO_D[1] - 5], placaTras: true },
  { o: 'esq', d: [OMBRO_D[0] - 1, OMBRO_D[1] - 2], placaTras: true },
  { o: 'confuso', coca: 0, inclina: 1 },
  { o: 'confuso', coca: 1, inclina: 1, duvidas: [DUVIDA_E] },
  { o: 'confuso', coca: 0, inclina: 1, duvidas: [sobe(DUVIDA_E, 1)] },
  { o: 'cima', coca: 1, inclina: 1, duvidas: [sobe(DUVIDA_E, 2)] },
  { o: 'cima', coca: 0, inclina: 1, duvidas: [sobe(DUVIDA_E, 3), sobe(DUVIDA_D, -1)] },
  { o: 'confuso', coca: 1, inclina: 1, duvidas: [DUVIDA_D] },
  { o: 'confuso', inclina: 1, duvidas: [sobe(DUVIDA_D, 1)] },
  { o: 'centro' }, { o: 'fechado' }, { o: 'centro' }, { o: 'centro' },
];

function comPlaca(i: number): Grade {
  const p = PLACA[i];
  const g = novaCena(CENAS.placa);
  const inclina = p.inclina ?? 0;
  const cocando = p.coca !== undefined;
  if (p.placaTras && p.d) placaNaMao(g, p.d[0], p.d[1]);
  if ((p.tras || p.placaTras) && p.d) asa(g, OMBRO_D[0], OMBRO_D[1], p.d[0], p.d[1]);
  // a asa que vira braço (dar de ombros, coçar) deixa de ser asa de capa daquele lado
  colar(g, frente(p.o, !!p.e || cocando, !!p.d, inclina), X0, Y0);
  if (p.placa && p.d) {
    placaNaMao(g, p.d[0], p.d[1], p.semInterrogacao, p.largura);
    asa(g, OMBRO_D[0], OMBRO_D[1], p.d[0], p.d[1]);
    caboAcimaDaMao(g, p.d[0], p.d[1]);
  }
  if (cocando) {
    // a mão acompanha a cabeça inclinada
    const hx = X0 + 3 + inclina;
    const hy = Y0 + 5 + p.coca!;
    asa(g, OMBRO_E[0], OMBRO_E[1], hx, hy);
    cocada(g, hx, hy, p.coca!);
  } else if (p.e) {
    asa(g, OMBRO_E[0], OMBRO_E[1], p.e[0], p.e[1]);
  }
  p.duvidas?.forEach(([x, y]) => duvidaEm(g, x, y));
  return g;
}

/** O quadro `i` (0 a quadros - 1) da animação, como linhas da cena. */
export function quadro(animacao: Animacao, i: number): string[] {
  const g = animacao === 'teclando' ? teclando(i) : animacao === 'placa' ? comPlaca(i) : animacao === 'grito' ? grito(i) : cabeca(i);
  const vazia = '.'.repeat(CENAS[animacao].largura);
  return [...Array<string>(MARGEM_ENFEITE).fill(vazia), ...g.map((l) => l.join(''))];
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

export { PLACA as PASSOS_DA_PLACA, GRITO as PASSOS_DO_GRITO, CABECA as PASSOS_DA_CABECA, TECLANDO as PASSOS_DO_TECLANDO, ENTER as TECLA_ENTER };
