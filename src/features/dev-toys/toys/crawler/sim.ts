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
};

// Valores iniciais do plano: 8 segmentos a 10 px, 1 par de pernas a cada 2 segmentos, coxa/canela 14/18 px,
// passo a partir de 16 px em 120 ms, até 90 px/s e 3 rad/s.
export const PADRAO: ParamsCrawler = {
  segmentos: 8, dist: 10, coxa: 14, canela: 18, limitePasso: 16, duracaoPasso: 0.12, velMax: 90, giroMax: 3, segmentosMax: 40,
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

/** A seed escolhe o número de segmentos, o tamanho das pernas e o temperamento (lento ou rápido). */
export function paramsDaSeed(seed: number): ParamsCrawler {
  const r = rngDe(seed);
  const escala = 0.8 + r() * 0.4;
  const temperamento = 0.75 + r() * 0.5;
  return {
    ...PADRAO,
    segmentos: 6 + Math.floor(r() * 5),
    coxa: Math.round(PADRAO.coxa * escala * 10) / 10,
    canela: Math.round(PADRAO.canela * escala * 10) / 10,
    velMax: Math.round(PADRAO.velMax * temperamento),
    giroMax: PADRAO.giroMax * temperamento,
  };
}

/** Perna presa a um segmento, de um lado (1 ou -1). `t < 1`: no ar, indo de `de` para `para`. */
export type Perna = { segmento: number; lado: 1 | -1; pe: Vec; de: Vec; para: Vec; t: number };
export const noAr = (p: Perna) => p.t < 1;

export type Crawler = { params: ParamsCrawler; seg: Vec[]; ang: number; vagar: number; pernas: Perna[]; rng: () => number };

/** Direção "para frente" no segmento i (o da cabeça segue o ângulo). */
export function frente(c: Crawler, i: number): Vec {
  if (i === 0) return v(Math.cos(c.ang), Math.sin(c.ang));
  return normal(sub(c.seg[i - 1], c.seg[i]));
}

const normalDe = (f: Vec) => v(-f.y, f.x);

export function quadril(c: Crawler, p: Perna): Vec {
  return soma(c.seg[p.segmento], mul(normalDe(frente(c, p.segmento)), p.lado * 3));
}

/** Onde o pé gostaria de estar: ao lado do segmento, um pouco à frente. */
export function peIdeal(c: Crawler, segmento: number, lado: 1 | -1): Vec {
  const f = frente(c, segmento);
  const alcance = (c.params.coxa + c.params.canela) * 0.7;
  return soma(c.seg[segmento], soma(mul(normalDe(f), lado * alcance), mul(f, c.params.coxa * 0.4)));
}

/** Um par de pernas nos segmentos 1, 3, 5…; mantém as pernas que já existiam. */
export function montarPernas(c: Crawler, antigas: Perna[]): Perna[] {
  const pernas: Perna[] = [];
  for (let i = 1; i < c.seg.length; i += 2) {
    for (const lado of [-1, 1] as const) {
      const velha = antigas.find((p) => p.segmento === i && p.lado === lado);
      if (velha) { pernas.push(velha); continue; }
      const pe = peIdeal(c, i, lado);
      pernas.push({ segmento: i, lado, pe, de: pe, para: pe, t: 1 });
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

/** Pernas vizinhas: o par do mesmo segmento e as do mesmo lado nos pares da frente e de trás. */
export function vizinhas(c: Crawler, p: Perna): Perna[] {
  return c.pernas.filter((q) => q !== p && (q.segmento === p.segmento || (q.lado === p.lado && Math.abs(q.segmento - p.segmento) === 2)));
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

export type Limites = { largura: number; altura: number };

/** Um quadro: a cabeça vira (giro limitado) e anda, o corpo segue, as pernas dão passos. */
export function passo(c: Crawler, dt: number, alvo: Vec | null, limites: Limites) {
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
    c.vagar = limitar(c.vagar + (c.rng() - 0.5) * 6 * dt, -1, 1);
    desejado = c.ang + c.vagar;
    velocidade = params.velMax * 0.5;
  }
  const giro = params.giroMax * dt;
  c.ang = girar(c.ang + limitar(girar(desejado - c.ang), -giro, giro));
  c.seg[0] = v(
    limitar(cabeca.x + Math.cos(c.ang) * velocidade * dt, 0, limites.largura),
    limitar(cabeca.y + Math.sin(c.ang) * velocidade * dt, 0, limites.altura),
  );

  // corrente: cada ponto puxa o seguinte, a distância fixa
  for (let i = 1; i < c.seg.length; i++) {
    c.seg[i] = soma(c.seg[i - 1], mul(normal(sub(c.seg[i], c.seg[i - 1])), params.dist));
  }

  // pernas no ar seguem o arco; depois, as plantadas longe demais pedem passo se nenhuma vizinha estiver no ar
  for (const p of c.pernas) {
    if (!noAr(p)) continue;
    p.t = Math.min(1, p.t + dt / params.duracaoPasso);
    p.pe = soma(p.de, mul(sub(p.para, p.de), p.t));
  }
  for (const p of c.pernas) {
    if (noAr(p)) continue;
    const ideal = peIdeal(c, p.segmento, p.lado);
    if (distancia(p.pe, ideal) <= params.limitePasso) continue;
    if (vizinhas(c, p).some(noAr)) continue;
    p.de = p.pe;
    p.para = soma(ideal, mul(frente(c, p.segmento), params.limitePasso * 0.4)); // passa um pouco do ideal
    p.t = 0;
  }
}

/** Comeu: ganha um segmento na cauda (e um par de pernas a cada dois), até o máximo. */
export function crescer(c: Crawler) {
  if (c.seg.length >= c.params.segmentosMax) return;
  const n = c.seg.length;
  const cauda = c.seg[n - 1];
  const direcao = n > 1 ? normal(sub(cauda, c.seg[n - 2])) : mul(frente(c, 0), -1);
  c.seg.push(soma(cauda, mul(direcao, c.params.dist)));
  c.pernas = montarPernas(c, c.pernas);
}
