import { frente, ik, noAr, quadril, type Crawler } from './sim';

const TINTA = '#ffb000';
const PAPEL = '#080603';

// Desenho do Crawler em canvas 2D (visto de cima): pernas, espinha, segmentos e cabeça com mandíbulas.
export function desenharCrawler(ctx: CanvasRenderingContext2D, c: Crawler) {
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

  // segmentos, afinando para a cauda
  for (let i = c.seg.length - 1; i >= 1; i--) {
    const r = Math.max(2, 5 - (i / c.seg.length) * 3);
    ctx.beginPath();
    ctx.arc(c.seg[i].x, c.seg[i].y, r, 0, Math.PI * 2);
    ctx.fillStyle = PAPEL;
    ctx.fill();
    ctx.stroke();
  }

  // cabeça e mandíbulas
  const h = c.seg[0];
  const fx = Math.cos(c.ang);
  const fy = Math.sin(c.ang);
  ctx.fillStyle = TINTA;
  ctx.beginPath();
  ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(h.x + fx * 5 - fy * s * 3, h.y + fy * 5 + fx * s * 3);
    ctx.lineTo(h.x + fx * 10 - fy * s * 1.5, h.y + fy * 10 + fx * s * 1.5);
    ctx.stroke();
  }
}
