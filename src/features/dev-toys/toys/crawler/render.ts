import type { Visual } from './genoma';
import { frente, ik, noAr, quadril, type Crawler, type Vec } from './sim';

const TINTA = '#ffb000';
const PAPEL = '#080603';

const PADRAO_VISUAL: Visual = { forma: 'circulo', espessura: 1, cabeca: 'mandibulas', cauda: null, enfeite: null, alcance: 80, varredura: 10 };

// Desenho do Crawler em canvas 2D (visto de cima), conforme o genoma e o estágio: pernas, espinha, segmentos
// (círculo, losango, quadrado ou anel), cabeça (mandíbulas, antenas, olhos ou chifres), cauda e enfeites.
export function desenharCrawler(ctx: CanvasRenderingContext2D, c: Crawler, v: Visual = PADRAO_VISUAL) {
  const { coxa, canela } = c.params;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = TINTA;
  ctx.fillStyle = TINTA;

  // pernas
  ctx.lineWidth = 1.5;
  for (const p of c.pernas) {
    const q = quadril(c, p);
    const f = frente(c, p.segmento);
    const fora = { x: -f.y * p.lado + f.x * 0.3, y: f.x * p.lado + f.y * 0.3 };
    const { joelho, pe } = ik(q, p.pe, coxa, canela, fora);
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.lineTo(joelho.x, joelho.y);
    ctx.lineTo(pe.x, pe.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pe.x, pe.y, noAr(p) ? 2.4 : 1.4, 0, Math.PI * 2); // pé no ar fica "maior", mais perto do olho
    ctx.fill();
  }

  // espinha
  ctx.lineWidth = 2;
  ctx.beginPath();
  c.seg.forEach((s, i) => (i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y)));
  ctx.stroke();

  if (v.cauda) desenharCauda(ctx, c, v);

  // segmentos, afinando para a cauda
  for (let i = c.seg.length - 1; i >= 1; i--) {
    const r = Math.max(2, (5 - (i / c.seg.length) * 3) * v.espessura);
    const f = frente(c, i);
    desenharSegmento(ctx, c.seg[i], f, r, v.forma);
    if (v.enfeite) desenharEnfeite(ctx, c.seg[i], f, r, v.enfeite, i);
  }

  desenharCabeca(ctx, c, v);
}

function desenharSegmento(ctx: CanvasRenderingContext2D, s: Vec, f: Vec, r: number, forma: Visual['forma']) {
  const n = { x: -f.y, y: f.x };
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (forma === 'losango') {
    ctx.moveTo(s.x + f.x * r * 1.2, s.y + f.y * r * 1.2);
    ctx.lineTo(s.x + n.x * r, s.y + n.y * r);
    ctx.lineTo(s.x - f.x * r * 1.2, s.y - f.y * r * 1.2);
    ctx.lineTo(s.x - n.x * r, s.y - n.y * r);
    ctx.closePath();
  } else if (forma === 'quadrado') {
    const a = r * 0.9;
    ctx.moveTo(s.x + (f.x + n.x) * a, s.y + (f.y + n.y) * a);
    ctx.lineTo(s.x + (-f.x + n.x) * a, s.y + (-f.y + n.y) * a);
    ctx.lineTo(s.x + (-f.x - n.x) * a, s.y + (-f.y - n.y) * a);
    ctx.lineTo(s.x + (f.x - n.x) * a, s.y + (f.y - n.y) * a);
    ctx.closePath();
  } else {
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = PAPEL;
  ctx.fill();
  ctx.stroke();
  if (forma === 'anel') {
    ctx.fillStyle = TINTA;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(1, r * 0.35), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = TINTA;
}

function desenharEnfeite(ctx: CanvasRenderingContext2D, s: Vec, f: Vec, r: number, enfeite: NonNullable<Visual['enfeite']>, i: number) {
  const n = { x: -f.y, y: f.x };
  ctx.lineWidth = 1;
  if (enfeite === 'listras') {
    ctx.beginPath();
    ctx.moveTo(s.x + n.x * r * 0.8, s.y + n.y * r * 0.8);
    ctx.lineTo(s.x - n.x * r * 0.8, s.y - n.y * r * 0.8);
    ctx.stroke();
  } else if (enfeite === 'pontos') {
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(0.8, r * 0.3), 0, Math.PI * 2);
    ctx.fill();
  } else if (i % 2 === 0) {
    for (const lado of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s.x + n.x * r * lado, s.y + n.y * r * lado);
      ctx.lineTo(s.x + n.x * (r + 4) * lado - f.x * 3, s.y + n.y * (r + 4) * lado - f.y * 3);
      ctx.stroke();
    }
  }
}

function desenharCauda(ctx: CanvasRenderingContext2D, c: Crawler, v: Visual) {
  const n = c.seg.length;
  const fim = c.seg[n - 1];
  const f = frente(c, n - 1);
  const t = { x: -f.x, y: -f.y }; // para trás
  const lado = { x: -f.y, y: f.x };
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (v.cauda === 'ferrao') {
    const ponta = { x: fim.x + t.x * 12, y: fim.y + t.y * 12 };
    ctx.moveTo(fim.x, fim.y);
    ctx.lineTo(ponta.x, ponta.y);
    ctx.lineTo(ponta.x - t.x * 4 + lado.x * 3, ponta.y - t.y * 4 + lado.y * 3);
  } else if (v.cauda === 'leque') {
    for (const a of [-0.6, 0, 0.6]) {
      const d = { x: t.x * Math.cos(a) - t.y * Math.sin(a), y: t.x * Math.sin(a) + t.y * Math.cos(a) };
      ctx.moveTo(fim.x, fim.y);
      ctx.lineTo(fim.x + d.x * 10, fim.y + d.y * 10);
    }
  } else {
    for (let i = Math.max(1, n - 3); i < n; i++) {
      const s = c.seg[i];
      const fi = frente(c, i);
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - fi.x * 7 + fi.y * 3, s.y - fi.y * 7 - fi.x * 3);
    }
  }
  ctx.stroke();
}

function desenharCabeca(ctx: CanvasRenderingContext2D, c: Crawler, v: Visual) {
  const h = c.seg[0];
  const fx = Math.cos(c.ang);
  const fy = Math.sin(c.ang);
  const r = 6 * Math.max(0.8, v.espessura);
  ctx.fillStyle = TINTA;
  ctx.strokeStyle = TINTA;
  ctx.beginPath();
  ctx.arc(h.x, h.y, v.cabeca === 'olhos' ? r * 1.15 : r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    if (v.cabeca === 'antenas') {
      ctx.moveTo(h.x + fx * r * 0.8 - fy * s * 2, h.y + fy * r * 0.8 + fx * s * 2);
      ctx.quadraticCurveTo(h.x + fx * 14 - fy * s * 4, h.y + fy * 14 + fx * s * 4, h.x + fx * 18 - fy * s * 10, h.y + fy * 18 + fx * s * 10);
    } else if (v.cabeca === 'chifres') {
      ctx.moveTo(h.x - fy * s * r * 0.8, h.y + fx * s * r * 0.8);
      ctx.lineTo(h.x - fx * 4 - fy * s * (r + 6), h.y - fy * 4 + fx * s * (r + 6));
    } else if (v.cabeca === 'olhos') {
      ctx.fillStyle = PAPEL;
      ctx.arc(h.x + fx * 2 - fy * s * r * 0.5, h.y + fy * 2 + fx * s * r * 0.5, Math.max(1.2, r * 0.28), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = TINTA;
      continue;
    } else {
      // mandíbulas (também a Larva, que ainda não tem cabeça própria, só as pinças pequenas)
      const k = v.cabeca ? 1 : 0.6;
      ctx.moveTo(h.x + fx * 5 * k - fy * s * 3 * k, h.y + fy * 5 * k + fx * s * 3 * k);
      ctx.lineTo(h.x + fx * 10 * k - fy * s * 1.5 * k, h.y + fy * 10 * k + fx * s * 1.5 * k);
    }
    ctx.stroke();
  }
}

/** Boca: um pouco à frente da cabeça, de onde sai o raio. */
export function boca(c: Crawler): Vec {
  return { x: c.seg[0].x + Math.cos(c.ang) * 7, y: c.seg[0].y + Math.sin(c.ang) * 7 };
}

/**
 * Raio de varredura: um feixe da boca até a palavra, uma linha que atravessa a palavra conforme o progresso
 * (0 a 1) e a parte já lida acesa.
 */
export function desenharRaio(ctx: CanvasRenderingContext2D, origem: Vec, r: { x: number; y: number; w: number; h: number }, progresso: number, tempo: number) {
  const x = r.x + r.w * Math.min(1, progresso);
  const pisca = 0.75 + 0.25 * Math.sin(tempo * 40);
  ctx.save();
  // parte já lida
  ctx.fillStyle = `rgb(255 176 0 / ${0.18 * pisca})`;
  ctx.fillRect(r.x, r.y + 2, x - r.x, r.h - 4);
  // feixe
  ctx.fillStyle = `rgb(255 176 0 / ${0.14 * pisca})`;
  ctx.beginPath();
  ctx.moveTo(origem.x, origem.y);
  ctx.lineTo(x, r.y + 2);
  ctx.lineTo(x, r.y + r.h - 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = `rgb(255 176 0 / ${0.6 * pisca})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(origem.x, origem.y);
  ctx.lineTo(x, r.y + r.h / 2);
  ctx.stroke();
  // linha de varredura
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, r.y + 1);
  ctx.lineTo(x, r.y + r.h - 1);
  ctx.stroke();
  ctx.restore();
}

/** Ovo (no Viveiro): oval rachado, balançando; choca na primeira palavra que o Crawler escanear. */
export function desenharOvo(ctx: CanvasRenderingContext2D, x: number, y: number, tempo: number) {
  const balanco = Math.sin(tempo * 2) * 0.08;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(balanco);
  ctx.strokeStyle = TINTA;
  ctx.fillStyle = PAPEL;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, -2);
  ctx.lineTo(-3, 2);
  ctx.lineTo(1, -3);
  ctx.lineTo(5, 1);
  ctx.lineTo(9, -2);
  ctx.stroke();
  ctx.restore();
}
