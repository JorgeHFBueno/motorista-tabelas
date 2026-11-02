// Física do Crawler, sem DOM: cabeça que vaga ou persegue um alvo, corpo em corrente, pernas com IK de 2 ossos
// e marcha em que pernas vizinhas nunca estão no ar juntas. Técnica de animação procedural (inspirada nos
// "Crawlers" de Slava Rybin); a criatura é própria.

export type Vec = { x: number; y: number };

const v = (x: number, y: number): Vec => ({ x, y });
const soma = (a: Vec, b: Vec) => v(a.x + b.x, a.y + b.y);
const sub = (a: Vec, b: Vec) => v(a.x - b.x, a.y - b.y);
const mul = (a: Vec, k: number) => v(a.x * k, a.y * k);
const comp = (a: Vec) => Math.hypot(a.x, a.y);
export const distancia = (a: Vec, b: Vec) => comp(sub(a, b));
const limitar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
const normal = (a: Vec): Vec => { const c = comp(a); return c > 1e-9 ? mul(a, 1 / c) : v(1, 0); };
const girar = (a: number) => Math.atan2(Math.sin(a), Math.cos(a)); // ângulo em (-π, π]

export type ParamsCrawler = {
  segmentos: number;
  dist: number;
  coxa: number;
  canela: number;
  limitePasso: number;
  duracaoPasso: number;
  velMax: number;
  giroMax: number;
  segmentosMax: number;
  /** um par de pernas a cada N segmentos (1 ou 2) */
  pernasACada: number;
  /** quanto a vontade de virar oscila quando ele vaga sem alvo (1 = normal) */
  vagueia: number;
  /** 0: pernas ao longo do corpo (centopeia); N: N pares em leque no corpo (segmento 0), como aranha ou polvo */
  pares: number;
  /** leque: ângulo (rad) da perna mais da frente; a de trás fica no oposto */
  abertura: number;
  /** ossos por perna: 2 usa a IK analítica; mais que 2, FABRIK (tentáculo) */
  ossos: number;
  /** distância do centro do segmento até onde a perna sai */
  quadril: number;
};

// Valores iniciais do plano: 8 segmentos a 10 px, 1 par de pernas a cada 2 segmentos, coxa/canela 14/18 px,
// passo a partir de 16 px em 120 ms, até 90 px/s e 3 rad/s.
export const PADRAO: ParamsCrawler = {
  segmentos: 8, dist: 10, coxa: 14, canela: 18, limitePasso: 16, duracaoPasso: 0.12, velMax: 90, giroMax: 3, segmentosMax: 40, pernasACada: 2, vagueia: 1,
  pares: 0, abertura: 0, ossos: 2, quadril: 3,
};

/** Gerador pseudoaleatório com semente (mulberry32): a mesma seed dá o mesmo bicho. */
export function rngDe(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Perna presa a um segmento, de um lado (1 ou -1), aberta `abertura` rad para a frente (negativo: para trás).
 * `ordem`: posição dela no seu lado, da frente para trás (vizinhas são as de ordem seguida). `t < 1`: no ar.
 * `dobra`: lado do joelho em relação à perna de agora (`normalDaPerna` vezes `dobra`), normalmente para fora do corpo.
 */
export type Perna = { segmento: number; lado: 1 | -1; ordem: number; abertura: number; pe: Vec; de: Vec; para: Vec; t: number; dobra: 1 | -1 };
export const noAr = (p: Perna) => p.t < 1;

export type Crawler = { params: ParamsCrawler; seg: Vec[]; ang: number; vagar: number; pernas: Perna[]; rng: () => number };

/** Direção "para frente" no segmento i (o da cabeça segue o ângulo). */
export function frente(c: Crawler, i: number): Vec {
  if (i === 0) return v(Math.cos(c.ang), Math.sin(c.ang));
  return normal(sub(c.seg[i - 1], c.seg[i]));
}

const normalDe = (f: Vec) => v(-f.y, f.x);

type Encaixe = Pick<Perna, 'segmento' | 'lado' | 'abertura'>;

/** Direção em que a perna sai: para o lado, girada pela abertura (para a frente ou para trás). */
export function direcaoDaPerna(c: Crawler, p: Encaixe): Vec {
  const f = frente(c, p.segmento);
  const n = mul(normalDe(f), p.lado);
  return soma(mul(n, Math.cos(p.abertura)), mul(f, Math.sin(p.abertura)));
}

export function quadril(c: Crawler, p: Encaixe): Vec {
  return soma(c.seg[p.segmento], mul(direcaoDaPerna(c, p), c.params.quadril));
}

/** Onde o pé gostaria de estar: na direção da perna, a 70% do comprimento dela, um pouco à frente. */
export function peIdeal(c: Crawler, p: Encaixe): Vec {
  const f = frente(c, p.segmento);
  const alcance = (c.params.coxa + c.params.canela) * 0.7;
  return soma(quadril(c, p), soma(mul(direcaoDaPerna(c, p), alcance), mul(f, c.params.coxa * 0.4)));
}

/**
 * Para que lado a perna dobra (joelho, ou a curva do tentáculo): perpendicular à perna em repouso, para fora do corpo.
 * Fica fixo no corpo do bicho; escolher o lado pela perna de agora faz o joelho virar de lado quando ela aponta para a frente.
 */
export function curvaDe(c: Crawler, p: Encaixe): Vec {
  const n = normalDe(normal(sub(peIdeal(c, p), quadril(c, p))));
  const lateral = mul(normalDe(frente(c, p.segmento)), p.lado);
  return n.x * lateral.x + n.y * lateral.y >= 0 ? n : mul(n, -1);
}

/**
 * Centopeia: um par a cada `pernasACada` segmentos, a partir do 1. Leque: `pares` pares no segmento 0, da frente
 * (abertura) para trás (-abertura). Mantém as pernas que já existiam.
 */
export function montarPernas(c: Crawler, antigas: Perna[]): Perna[] {
  const encaixes: Array<Omit<Encaixe, 'lado'> & { ordem: number }> = [];
  const { pares, abertura, pernasACada } = c.params;
  if (pares > 0) {
    for (let k = 0; k < pares; k++) encaixes.push({ segmento: 0, ordem: k, abertura: pares === 1 ? 0 : abertura * (1 - (2 * k) / (pares - 1)) });
  } else {
    for (let i = 1, k = 0; i < c.seg.length; i += pernasACada, k++) encaixes.push({ segmento: i, ordem: k, abertura: 0 });
  }
  const pernas: Perna[] = [];
  for (const e of encaixes) {
    for (const lado of [-1, 1] as const) {
      const velha = antigas.find((p) => p.segmento === e.segmento && p.lado === lado && p.ordem === e.ordem);
      if (velha) { pernas.push(velha); continue; }
      const pe = peIdeal(c, { ...e, lado });
      const nova: Perna = { ...e, lado, pe, de: pe, para: pe, t: 1, dobra: 1 };
      atualizarDobra(c, nova, 0);
      pernas.push(nova);
    }
  }
  return pernas;
}

export function criarCrawler(params: ParamsCrawler, x: number, y: number, seed: number): Crawler {
  const c: Crawler = {
    params,
    seg: Array.from({ length: params.segmentos }, (_, i) => v(x - i * params.dist, y)),
    ang: 0,
    vagar: 0,
    pernas: [],
    rng: rngDe(seed ^ 0x9e3779b9),
  };
  c.pernas = montarPernas(c, []);
  return c;
}

/** Pernas vizinhas: a do outro lado na mesma ordem e as do mesmo lado logo à frente e logo atrás. */
export function vizinhas(c: Crawler, p: Perna): Perna[] {
  return c.pernas.filter((q) => q !== p && (q.lado === p.lado ? Math.abs(q.ordem - p.ordem) === 1 : q.ordem === p.ordem));
}

/** IK analítica de 2 ossos (lei dos cossenos). O joelho dobra para o lado de `fora`; fora do alcance, a perna estica. */
export function ik(quadrilPos: Vec, alvo: Vec, a: number, b: number, fora: Vec): { joelho: Vec; pe: Vec } {
  const d = limitar(distancia(quadrilPos, alvo), Math.abs(a - b) + 1e-6, a + b - 1e-6);
  const base = Math.atan2(alvo.y - quadrilPos.y, alvo.x - quadrilPos.x);
  const alfa = Math.acos(limitar((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const candidato = (s: number) => soma(quadrilPos, v(Math.cos(base + s * alfa) * a, Math.sin(base + s * alfa) * a));
  const j1 = candidato(1);
  const j2 = candidato(-1);
  const pontua = (j: Vec) => (j.x - quadrilPos.x) * fora.x + (j.y - quadrilPos.y) * fora.y;
  return { joelho: pontua(j1) >= pontua(j2) ? j1 : j2, pe: soma(quadrilPos, v(Math.cos(base) * d, Math.sin(base) * d)) };
}

/**
 * IK de vários ossos (FABRIK), para tentáculos e pernas de muitas juntas: começa num arco curvado para `fora` e
 * ajusta algumas vezes. Devolve as juntas, da raiz ao pé (ossos + 1 pontos); fora do alcance, estica na direção do alvo.
 */
export function fabrik(raiz: Vec, alvo: Vec, ossos: number[], fora: Vec, iteracoes = 8): Vec[] {
  const total = ossos.reduce((a, b) => a + b, 0);
  const d = distancia(raiz, alvo);
  const dir = normal(sub(alvo, raiz));
  if (d >= total) {
    const pts = [raiz];
    for (const o of ossos) pts.push(soma(pts[pts.length - 1], mul(dir, o)));
    return pts;
  }
  const curva = Math.sqrt(Math.max(0, total * total - d * d)) / 2; // quanto sobra de perna vira curvatura
  const pts = [raiz];
  let acumulado = 0;
  for (const o of ossos) {
    acumulado += o;
    const t = acumulado / total;
    pts.push(soma(soma(raiz, mul(sub(alvo, raiz), t)), mul(fora, curva * Math.sin(Math.PI * t))));
  }
  for (let it = 0; it < iteracoes; it++) {
    pts[ossos.length] = alvo;
    for (let i = ossos.length - 1; i >= 0; i--) pts[i] = soma(pts[i + 1], mul(normal(sub(pts[i], pts[i + 1])), ossos[i]));
    pts[0] = raiz;
    for (let i = 0; i < ossos.length; i++) pts[i + 1] = soma(pts[i], mul(normal(sub(pts[i + 1], pts[i])), ossos[i]));
  }
  return pts;
}

/** Comprimento de cada osso: a perna inteira (coxa + canela) dividida, afinando para a ponta. */
export function ossosDe(params: ParamsCrawler): number[] {
  const n = Math.max(2, Math.round(params.ossos));
  if (n === 2) return [params.coxa, params.canela];
  const pesos = Array.from({ length: n }, (_, i) => 1 - (0.4 * i) / (n - 1));
  const totalPesos = pesos.reduce((a, b) => a + b, 0);
  return pesos.map((w) => ((params.coxa + params.canela) * w) / totalPesos);
}

export type Limites = { largura: number; altura: number };

/** Perna plantada torta demais (o corpo virou e ela ficou para trás): passa de ~40° do repouso, pede passo. */
const COS_TORTA = 0.75;
/** Passo mais curto possível (s), quando o corpo corre ou vira rápido. */
const PASSO_MAIS_RAPIDO = 0.05;

/** Onde o pé pousa: um pouco além do ideal, para a frente. */
function pouso(c: Crawler, p: Perna, ideal = peIdeal(c, p)): Vec {
  return soma(ideal, mul(frente(c, p.segmento), c.params.limitePasso * 0.4));
}

/** Fração do giro quando parado (girando no lugar). */
const GIRO_PARADO = 0.4;
/** O joelho só troca de lado quando a perna passa bem do través (evita o "estalo" perto dos 90°). */
const FOLGA_DOBRA = 0.35;

/** Quanto a perna plantada precisa de um passo: acima de 1, pede (longe do ideal ou torta demais). */
function urgencia(c: Crawler, p: Perna, ideal: Vec): number {
  const q = quadril(c, p);
  const a = sub(p.pe, q);
  const b = sub(ideal, q);
  const ca = comp(a);
  const cb = comp(b);
  const cos = ca < 1e-6 || cb < 1e-6 ? -1 : (a.x * b.x + a.y * b.y) / (ca * cb);
  return Math.max(distancia(p.pe, ideal) / c.params.limitePasso, (1 - cos) / (1 - COS_TORTA));
}

/** Perpendicular à perna de agora (do quadril ao pé); `dobra` diz para qual dos dois lados dela o joelho vai. */
export function normalDaPerna(c: Crawler, p: Perna): Vec {
  return normalDe(normal(sub(p.pe, quadril(c, p))));
}

/** Lado da dobra: o de fora do corpo (`curvaDe`), com folga, para só trocar quando a perna passa bem do través. */
function atualizarDobra(c: Crawler, p: Perna, folga = FOLGA_DOBRA) {
  if (distancia(p.pe, quadril(c, p)) < 1e-6) return;
  const n = normalDaPerna(c, p);
  const curva = curvaDe(c, p);
  const d = n.x * curva.x + n.y * curva.y;
  if (d * p.dobra < -folga) p.dobra = d > 0 ? 1 : -1;
}

/**
 * Um quadro: a cabeça vira (giro limitado) e anda, o corpo segue, as pernas dão passos.
 * `parado`: não anda, só vira para o alvo (o Crawler escaneando uma palavra).
 */
export function passo(c: Crawler, dt: number, alvo: Vec | null, limites: Limites, parado = false) {
  const { params } = c;
  const cabeca = c.seg[0];
  const margem = 24;
  const fora = cabeca.x < margem || cabeca.y < margem || cabeca.x > limites.largura - margem || cabeca.y > limites.altura - margem;

  let desejado: number;
  let velocidade: number;
  if (alvo) {
    desejado = Math.atan2(alvo.y - cabeca.y, alvo.x - cabeca.x);
    velocidade = params.velMax * Math.min(1, distancia(cabeca, alvo) / 40);
  } else if (fora) {
    desejado = Math.atan2(limites.altura / 2 - cabeca.y, limites.largura / 2 - cabeca.x);
    velocidade = params.velMax * 0.5;
  } else {
    // vagar: a vontade de virar faz um passeio aleatório
    c.vagar = limitar(c.vagar + (c.rng() - 0.5) * 6 * params.vagueia * dt, -1, 1);
    desejado = c.ang + c.vagar;
    velocidade = params.velMax * 0.5;
  }
  // parado (lendo), vira devagar: girar no lugar rápido deixa as pernas para trás, torcidas
  const giro = params.giroMax * dt * (parado ? GIRO_PARADO : 1);
  const virou = limitar(girar(desejado - c.ang), -giro, giro);
  c.ang = girar(c.ang + virou);
  if (parado) velocidade = 0;
  c.seg[0] = v(
    limitar(cabeca.x + Math.cos(c.ang) * velocidade * dt, 0, limites.largura),
    limitar(cabeca.y + Math.sin(c.ang) * velocidade * dt, 0, limites.altura),
  );

  // corrente: cada ponto puxa o seguinte, a distância fixa
  for (let i = 1; i < c.seg.length; i++) {
    c.seg[i] = soma(c.seg[i - 1], mul(normal(sub(c.seg[i], c.seg[i - 1])), params.dist));
  }

  // pernas no ar seguem o arco; depois, as plantadas longe ou tortas demais pedem passo se nenhuma vizinha estiver no ar
  // passo mais rápido quando o corpo corre ou vira (a ponta da perna, ao virar, anda giro × comprimento da perna);
  // no ar, o pé segue o ponto de pouso, que anda com o corpo
  const pePorSegundo = velocidade + (Math.abs(virou) / Math.max(dt, 1e-6)) * (params.quadril + (params.coxa + params.canela) * 0.7);
  const duracao = limitar((0.45 * params.limitePasso) / Math.max(pePorSegundo, 1e-6), PASSO_MAIS_RAPIDO, params.duracaoPasso);
  for (const p of c.pernas) {
    if (!noAr(p)) continue;
    p.t = Math.min(1, p.t + dt / duracao);
    p.para = pouso(c, p);
    p.pe = soma(p.de, mul(sub(p.para, p.de), p.t));
  }
  // a mais atrasada passa na frente: senão as da frente do corpo sempre ganham e as outras ficam presas para trás
  const pedem = c.pernas
    .filter((p) => !noAr(p))
    .map((p) => { const ideal = peIdeal(c, p); return { p, ideal, u: urgencia(c, p, ideal) }; })
    .filter((x) => x.u > 1)
    .sort((a, b) => b.u - a.u);
  for (const { p, ideal } of pedem) {
    if (vizinhas(c, p).some(noAr)) continue;
    p.de = p.pe;
    p.para = pouso(c, p, ideal);
    p.t = 0;
  }
  for (const p of c.pernas) atualizarDobra(c, p);
}
