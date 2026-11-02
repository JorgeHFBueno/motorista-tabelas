import { raiosDe, type Forma, type Visual } from './genoma';
import { direcaoDaPerna, fabrik, frente, ik, noAr, ossosDe, quadril, type Crawler, type Vec } from './sim';

const TINTA = '#ffb000';
const PAPEL = '#080603';
const APAGADO = '#7a5400';

const PADRAO_VISUAL: Visual = {
  plano: 'centopeia', forma: 'circulo', espessura: 1, preenchimento: 'vazio', detalhe: 'liso', junta: 'linha', pe: 'ponto',
  cabeca: 'mandibulas', cauda: null, enfeite: null, alcance: 20, varredura: 10,
};

type Ctx = CanvasRenderingContext2D;
const normalDe = (f: Vec): Vec => ({ x: -f.y, y: f.x });
const compacto = (v: Visual) => v.plano !== 'centopeia';

// Desenho do Crawler em canvas 2D (visto de cima), pelo plano corporal e pelo genoma: pernas (2 ossos, várias juntas
// ou tentáculos), espinha, segmentos (forma, enchimento e detalhe), cauda, enfeites e cabeça.
export function desenharCrawler(ctx: Ctx, c: Crawler, v: Visual = PADRAO_VISUAL) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = TINTA;
  ctx.fillStyle = TINTA;
  const raios = raiosDe(v.plano, v.espessura, c.seg.length);

  desenharPernas(ctx, c, v);

  if (c.seg.length > 1) {
    ctx.lineWidth = compacto(v) ? 3 : 2;
    ctx.beginPath();
    c.seg.forEach((s, i) => (i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y)));
    ctx.stroke();
  }

  if (v.cauda) desenharCauda(ctx, c, v, raios[raios.length - 1]);

  // segmentos de trás para a frente; na centopeia o 0 é a cabeça, desenhada à parte
  const primeiro = compacto(v) ? 0 : 1;
  for (let i = c.seg.length - 1; i >= primeiro; i--) {
    const f = frente(c, i);
    const aspecto = v.plano === 'caranguejo' && i === 0 ? { comprido: 0.9, largo: 1.3 } : { comprido: 1.25, largo: 1 };
    desenharSegmento(ctx, c.seg[i], f, raios[i], v, aspecto);
    if (v.enfeite) desenharEnfeite(ctx, c.seg[i], f, raios[i], v.enfeite, i);
  }

  desenharCabeca(ctx, c, v, raios[0]);
}

// ---- pernas -------------------------------------------------------------------------------------------------------

function desenharPernas(ctx: Ctx, c: Crawler, v: Visual) {
  const ossos = ossosDe(c.params);
  for (const p of c.pernas) {
    const q = quadril(c, p);
    const f = frente(c, p.segmento);
    let juntas: Vec[];
    if (ossos.length === 2) {
      const dir = direcaoDaPerna(c, p);
      const { joelho, pe } = ik(q, p.pe, ossos[0], ossos[1], { x: dir.x + f.x * 0.3, y: dir.y + f.y * 0.3 });
      juntas = [q, joelho, pe];
    } else {
      // muitas juntas: a perna arqueia para fora do corpo (as da frente para a frente, as de trás para trás);
      // tentáculos alternam o lado da curva
      const eixo = { x: p.pe.x - q.x, y: p.pe.y - q.y };
      let fora = normalDe(normalizar(eixo));
      const sinal = v.plano === 'polvo' ? (p.ordem % 2 ? 1 : -1) * p.lado : Math.sign(p.abertura || 1);
      if ((fora.x * f.x + fora.y * f.y) * sinal < 0) fora = { x: -fora.x, y: -fora.y };
      juntas = fabrik(q, p.pe, ossos, fora);
    }

    ctx.strokeStyle = TINTA;
    ctx.lineWidth = v.plano === 'polvo' ? 2 : 1.5;
    ctx.beginPath();
    juntas.forEach((j, i) => (i ? ctx.lineTo(j.x, j.y) : ctx.moveTo(j.x, j.y)));
    ctx.stroke();

    // juntas: caixas que afinam até a ponta, contas, ou só a linha
    if (v.junta !== 'linha') {
      for (let i = 1; i < juntas.length - 1; i++) {
        const t = i / (juntas.length - 1);
        const d = normalizar({ x: juntas[i + 1].x - juntas[i - 1].x, y: juntas[i + 1].y - juntas[i - 1].y });
        if (v.junta === 'caixas') quadradoGirado(ctx, juntas[i], d, Math.max(1.5, 4.5 - 3 * t), false);
        else circulo(ctx, juntas[i], Math.max(1.2, 2.2 - t), true);
      }
    }

    const pe = juntas[juntas.length - 1];
    const noArAgora = noAr(p);
    if (v.pe === 'circulo') circulo(ctx, pe, noArAgora ? 4.5 : 3.5, false);
    else if (v.pe === 'quadrado') quadradoGirado(ctx, pe, normalizar({ x: pe.x - juntas[juntas.length - 2].x, y: pe.y - juntas[juntas.length - 2].y }), noArAgora ? 4 : 3, false);
    else circulo(ctx, pe, noArAgora ? 2.4 : 1.4, true); // pé no ar fica "maior", mais perto do olho
  }
}

// ---- corpo --------------------------------------------------------------------------------------------------------

type Aspecto = { comprido: number; largo: number };

function contorno(ctx: Ctx, s: Vec, f: Vec, r: number, forma: Forma, a: Aspecto) {
  const n = normalDe(f);
  ctx.beginPath();
  if (forma === 'losango') {
    ctx.moveTo(s.x + f.x * r * 1.2 * a.comprido, s.y + f.y * r * 1.2 * a.comprido);
    ctx.lineTo(s.x + n.x * r * a.largo, s.y + n.y * r * a.largo);
    ctx.lineTo(s.x - f.x * r * 1.2 * a.comprido, s.y - f.y * r * 1.2 * a.comprido);
    ctx.lineTo(s.x - n.x * r * a.largo, s.y - n.y * r * a.largo);
    ctx.closePath();
  } else if (forma === 'quadrado' || forma === 'caixa') {
    const c = r * (forma === 'caixa' ? a.comprido : 0.9);
    const l = r * (forma === 'caixa' ? a.largo : 0.9);
    ctx.moveTo(s.x + f.x * c + n.x * l, s.y + f.y * c + n.y * l);
    ctx.lineTo(s.x - f.x * c + n.x * l, s.y - f.y * c + n.y * l);
    ctx.lineTo(s.x - f.x * c - n.x * l, s.y - f.y * c - n.y * l);
    ctx.lineTo(s.x + f.x * c - n.x * l, s.y + f.y * c - n.y * l);
    ctx.closePath();
  } else {
    ctx.ellipse(s.x, s.y, r * a.comprido, r * a.largo, Math.atan2(f.y, f.x), 0, Math.PI * 2);
  }
}

function desenharSegmento(ctx: Ctx, s: Vec, f: Vec, r: number, v: Visual, a: Aspecto) {
  const cheio = v.preenchimento === 'cheio';
  ctx.lineWidth = 1.5;
  contorno(ctx, s, f, r, v.forma, a);
  ctx.fillStyle = cheio ? TINTA : PAPEL;
  ctx.fill();
  ctx.strokeStyle = TINTA;
  ctx.stroke();

  if (v.preenchimento === 'hachura') {
    ctx.save();
    contorno(ctx, s, f, r, v.forma, a);
    ctx.clip();
    ctx.strokeStyle = APAGADO;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let d = -r * 3; d <= r * 3; d += 3) {
      ctx.moveTo(s.x + d - r * 2, s.y - r * 2);
      ctx.lineTo(s.x + d + r * 2, s.y + r * 2);
    }
    ctx.stroke();
    ctx.restore();
  } else if (v.preenchimento === 'duplo' && r > 3) {
    ctx.lineWidth = 1;
    contorno(ctx, s, f, r * 0.6, v.forma, a);
    ctx.stroke();
  }
  if (v.forma === 'anel') circulo(ctx, s, Math.max(1, r * 0.35), true, cheio ? PAPEL : TINTA);

  // detalhe dentro do segmento: janelas (2 x 2) ou painel com dois pontos
  if (r >= 4 && v.detalhe !== 'liso') {
    const n = normalDe(f);
    const tinta = cheio ? PAPEL : TINTA;
    if (v.detalhe === 'janelas') {
      const k = r * 0.32;
      for (const [i, j] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        quadradoGirado(ctx, { x: s.x + f.x * i * k * 1.2 + n.x * j * k * 1.2, y: s.y + f.y * i * k * 1.2 + n.y * j * k * 1.2 }, f, k * 0.8, true, tinta);
      }
    } else {
      ctx.strokeStyle = tinta;
      ctx.lineWidth = 1;
      contorno(ctx, s, f, r * 0.5, 'caixa', { comprido: 1.3 * a.comprido, largo: 0.7 * a.largo });
      ctx.stroke();
      for (const j of [-1, 1]) circulo(ctx, { x: s.x + n.x * j * r * 0.35 + f.x * r * 0.25, y: s.y + n.y * j * r * 0.35 + f.y * r * 0.25 }, Math.max(0.8, r * 0.12), true, tinta);
    }
  }
  ctx.strokeStyle = TINTA;
  ctx.fillStyle = TINTA;
}

function desenharEnfeite(ctx: Ctx, s: Vec, f: Vec, r: number, enfeite: NonNullable<Visual['enfeite']>, i: number) {
  const n = normalDe(f);
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = 1;
  if (enfeite === 'listras') {
    ctx.beginPath();
    ctx.moveTo(s.x + n.x * r * 0.8, s.y + n.y * r * 0.8);
    ctx.lineTo(s.x - n.x * r * 0.8, s.y - n.y * r * 0.8);
    ctx.stroke();
  } else if (enfeite === 'pontos') {
    circulo(ctx, s, Math.max(0.8, r * 0.25), true);
  } else if (i % 2 === 0) {
    for (const lado of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s.x + n.x * r * lado, s.y + n.y * r * lado);
      ctx.lineTo(s.x + n.x * (r + 4) * lado - f.x * 3, s.y + n.y * (r + 4) * lado - f.y * 3);
      ctx.stroke();
    }
  }
}

function desenharCauda(ctx: Ctx, c: Crawler, v: Visual, r: number) {
  const n = c.seg.length;
  const fim = c.seg[n - 1];
  const f = frente(c, n - 1);
  const t = { x: -f.x, y: -f.y }; // para trás
  const base = { x: fim.x + t.x * r, y: fim.y + t.y * r };
  const lado = normalDe(f);
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (v.cauda === 'ferrao') {
    const ponta = { x: base.x + t.x * 12, y: base.y + t.y * 12 };
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(ponta.x, ponta.y);
    ctx.lineTo(ponta.x - t.x * 4 + lado.x * 3, ponta.y - t.y * 4 + lado.y * 3);
  } else if (v.cauda === 'leque') {
    for (const a of [-0.6, 0, 0.6]) {
      const d = { x: t.x * Math.cos(a) - t.y * Math.sin(a), y: t.x * Math.sin(a) + t.y * Math.cos(a) };
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(base.x + d.x * 10, base.y + d.y * 10);
    }
  } else {
    for (let i = Math.max(1, n - 3); i < n; i++) {
      const s = c.seg[i];
      const fi = frente(c, i);
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - fi.x * (r + 7) + fi.y * 3, s.y - fi.y * (r + 7) - fi.x * 3);
    }
  }
  ctx.stroke();
}

function desenharCabeca(ctx: Ctx, c: Crawler, v: Visual, r0: number) {
  const fx = Math.cos(c.ang);
  const fy = Math.sin(c.ang);
  // centopeia: cabeça redonda própria; nos outros planos a "cabeça" é a frente do corpo
  const r = compacto(v) ? r0 * 0.45 : 6 * Math.max(0.8, v.espessura);
  const h = compacto(v) ? { x: c.seg[0].x + fx * r0 * 0.9, y: c.seg[0].y + fy * r0 * 0.9 } : c.seg[0];
  ctx.fillStyle = TINTA;
  ctx.strokeStyle = TINTA;
  if (!compacto(v)) circulo(ctx, h, v.cabeca === 'olhos' ? r * 1.15 : r, true);
  ctx.lineWidth = 1.5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    if (v.cabeca === 'antenas') {
      ctx.moveTo(h.x + fx * r * 0.8 - fy * s * 2, h.y + fy * r * 0.8 + fx * s * 2);
      ctx.quadraticCurveTo(h.x + fx * 14 - fy * s * 4, h.y + fy * 14 + fx * s * 4, h.x + fx * 18 - fy * s * 10, h.y + fy * 18 + fx * s * 10);
      ctx.stroke();
    } else if (v.cabeca === 'chifres') {
      ctx.moveTo(h.x - fy * s * r * 0.8, h.y + fx * s * r * 0.8);
      ctx.lineTo(h.x - fx * 4 - fy * s * (r + 6), h.y - fy * 4 + fx * s * (r + 6));
      ctx.stroke();
    } else if (v.cabeca === 'olhos') {
      const olho = { x: h.x + fx * 2 - fy * s * r * 0.5, y: h.y + fy * 2 + fx * s * r * 0.5 };
      const rOlho = Math.max(1.2, r * 0.3);
      if (compacto(v)) { circulo(ctx, olho, rOlho + 1, true, TINTA); circulo(ctx, olho, rOlho, true, PAPEL); } else circulo(ctx, olho, rOlho, true, PAPEL);
    } else {
      // mandíbulas (também a Larva, que ainda não tem cabeça própria, só as pinças pequenas)
      const k = v.cabeca ? 1 : 0.6;
      ctx.moveTo(h.x + fx * 5 * k - fy * s * 3 * k, h.y + fy * 5 * k + fx * s * 3 * k);
      ctx.lineTo(h.x + fx * 10 * k - fy * s * 1.5 * k, h.y + fy * 10 * k + fx * s * 1.5 * k);
      ctx.stroke();
    }
  }
}

// ---- formas simples -----------------------------------------------------------------------------------------------

function normalizar(a: Vec): Vec {
  const c = Math.hypot(a.x, a.y);
  return c > 1e-9 ? { x: a.x / c, y: a.y / c } : { x: 1, y: 0 };
}

function circulo(ctx: Ctx, p: Vec, r: number, cheio: boolean, cor = TINTA) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  if (cheio) { ctx.fillStyle = cor; ctx.fill(); ctx.fillStyle = TINTA; } else { ctx.strokeStyle = cor; ctx.lineWidth = 1; ctx.stroke(); ctx.strokeStyle = TINTA; }
}

function quadradoGirado(ctx: Ctx, p: Vec, d: Vec, meio: number, cheio: boolean, cor = TINTA) {
  const n = normalDe(d);
  ctx.beginPath();
  ctx.moveTo(p.x + (d.x + n.x) * meio, p.y + (d.y + n.y) * meio);
  ctx.lineTo(p.x + (-d.x + n.x) * meio, p.y + (-d.y + n.y) * meio);
  ctx.lineTo(p.x + (-d.x - n.x) * meio, p.y + (-d.y - n.y) * meio);
  ctx.lineTo(p.x + (d.x - n.x) * meio, p.y + (d.y - n.y) * meio);
  ctx.closePath();
  if (cheio) { ctx.fillStyle = cor; ctx.fill(); ctx.fillStyle = TINTA; } else { ctx.fillStyle = PAPEL; ctx.fill(); ctx.strokeStyle = cor; ctx.lineWidth = 1; ctx.stroke(); ctx.strokeStyle = TINTA; ctx.fillStyle = TINTA; }
}

// ---- raio e ovo ---------------------------------------------------------------------------------------------------

/** Boca: na frente da cabeça (ou do corpo, nos planos compactos), de onde sai o raio. */
export function boca(c: Crawler, v: Visual = PADRAO_VISUAL): Vec {
  const r0 = raiosDe(v.plano, v.espessura, c.seg.length)[0];
  const d = compacto(v) ? r0 * (v.plano === 'caranguejo' ? 0.9 : 1.25) + 2 : 7;
  return { x: c.seg[0].x + Math.cos(c.ang) * d, y: c.seg[0].y + Math.sin(c.ang) * d };
}

/** Distância de um ponto até a borda de um retângulo (0 dentro dele). */
export function distanciaAte(p: Vec, r: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * Raio de varredura: um feixe da boca até a palavra, uma linha que atravessa a palavra conforme o progresso
 * (0 a 1) e a parte já lida acesa.
 */
export function desenharRaio(ctx: Ctx, origem: Vec, r: { x: number; y: number; w: number; h: number }, progresso: number, tempo: number) {
  const x = r.x + r.w * Math.min(1, progresso);
  const pisca = 0.75 + 0.25 * Math.sin(tempo * 40);
  ctx.save();
  ctx.fillStyle = `rgb(255 176 0 / ${0.18 * pisca})`;
  ctx.fillRect(r.x, r.y + 2, x - r.x, r.h - 4);
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
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, r.y + 1);
  ctx.lineTo(x, r.y + r.h - 1);
  ctx.stroke();
  ctx.restore();
}

/** Ovo (no Viveiro): oval rachado, balançando; choca na primeira palavra que o Crawler escanear. */
export function desenharOvo(ctx: Ctx, x: number, y: number, tempo: number) {
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
