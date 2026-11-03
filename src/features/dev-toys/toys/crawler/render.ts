import { SEM_APARENCIA } from './aparencia';
import { raiosDe, type Forma, type Visual } from './genoma';
import { curvaDesenhada, fabrik, frente, ik, noAr, ossosDe, quadril, type Crawler, type Vec } from './sim';

const TINTA = '#ffb000';
const PAPEL = '#080603';
const APAGADO = '#7a5400';

const PADRAO_VISUAL: Visual = {
  plano: 'centopeia', forma: 'circulo', espessura: 1, preenchimento: 'vazio', detalhe: 'liso', junta: 'linha', pe: 'ponto',
  cabeca: 'mandibulas', cauda: null, enfeite: null, alcance: 20, varredura: 10, aparencia: SEM_APARENCIA,
};

type Ctx = CanvasRenderingContext2D;
const normalDe = (f: Vec): Vec => ({ x: -f.y, y: f.x });
const compacto = (v: Visual) => v.plano !== 'centopeia';

// Desenho do Crawler em canvas 2D (visto de cima), pelo plano corporal e pelo genoma: pernas (2 ossos, várias juntas
// ou tentáculos), espinha, segmentos (forma, enchimento e detalhe), cauda, enfeites e cabeça; e o que as skills dão
// (aparencia.ts). Com todas as skills no máximo, o eco de xerox: duas cópias apagadas, para trás e um pouco de lado.
export function desenharCrawler(ctx: Ctx, c: Crawler, v: Visual = PADRAO_VISUAL) {
  if (v.aparencia.eco) {
    const f = { x: Math.cos(c.ang), y: Math.sin(c.ang) };
    for (const k of [2, 1]) {
      ctx.save();
      ctx.globalAlpha = k === 2 ? 0.16 : 0.3;
      ctx.translate(-f.x * 9 * k - f.y * 4 * k, -f.y * 9 * k + f.x * 4 * k);
      desenharCorpo(ctx, c, v);
      ctx.restore();
    }
  }
  desenharCorpo(ctx, c, v);
}

function desenharCorpo(ctx: Ctx, c: Crawler, v: Visual) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = TINTA;
  ctx.fillStyle = TINTA;
  const raios = raiosDe(v.plano, v.espessura, c.seg.length, v.aparencia.barriga);

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
  if (v.aparencia.marca) desenharMarca(ctx, c, v, raios);

  desenharCabeca(ctx, c, v, raios[0]);
  desenharSentidos(ctx, c, v, raios[0]);
  if (v.aparencia.cabecas) desenharCabecasExtras(ctx, c, v, raios);
}

// ---- pernas -------------------------------------------------------------------------------------------------------

function desenharPernas(ctx: Ctx, c: Crawler, v: Visual) {
  const ossos = ossosDe(c.params);
  for (const p of c.pernas) {
    const q = quadril(c, p);
    // dobra para fora do corpo, com folga (`dobra` em sim.ts); tentáculos ondulam (`curvaDesenhada`)
    const fora = curvaDesenhada(c, p, v.plano === 'polvo');
    let juntas: Vec[];
    if (ossos.length === 2) {
      const { joelho, pe } = ik(q, p.pe, ossos[0], ossos[1], fora);
      juntas = [q, joelho, pe];
    } else {
      juntas = fabrik(q, p.pe, ossos, fora);
    }

    ctx.strokeStyle = TINTA;
    ctx.lineWidth = v.plano === 'polvo' ? 2 : 1.5;
    ctx.beginPath();
    juntas.forEach((j, i) => (i ? ctx.lineTo(j.x, j.y) : ctx.moveTo(j.x, j.y)));
    ctx.stroke();
    // Premonição: cerdas nas pernas da frente da aranha, ventosas nos tentáculos do polvo
    if (v.aparencia.nos && v.plano === 'aranha' && p.ordem < 2) cerdas(ctx, juntas, v.aparencia.nos, fora);
    if (v.aparencia.nos && v.plano === 'polvo') ventosas(ctx, juntas, v.aparencia.nos, fora);

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
    if (v.cabeca === 'antenas' && temAntenasDeSkill(v)) {
      // as antenas ficam com desenharSentidos (pares a mais, mais longas, com nós)
    } else if (v.cabeca === 'antenas') {
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

// ---- o que as skills dão (aparencia.ts) ----------------------------------------------------------------------------

const girarVec = (d: Vec, a: number): Vec => ({ x: d.x * Math.cos(a) - d.y * Math.sin(a), y: d.x * Math.sin(a) + d.y * Math.cos(a) });
const mais = (p: Vec, d: Vec, k: number): Vec => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const vezes = (d: Vec, k: number): Vec => ({ x: d.x * k, y: d.y * k });

/** Centopeia e caranguejo ganham antenas das skills (Multipresença, Expansão, Premonição). */
const temAntenasDeSkill = (v: Visual) =>
  (v.plano === 'centopeia' || v.plano === 'caranguejo') && (v.aparencia.sensores > 0 || v.aparencia.expansao > 0 || v.aparencia.nos > 0);

function linha(ctx: Ctx, pts: Vec[], largura: number) {
  ctx.strokeStyle = TINTA;
  ctx.lineWidth = largura;
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.stroke();
}

/** Arco de `n` + 1 pontos da base na direção `d`, curvado para o lado `lado`. */
function arco(base: Vec, d: Vec, lado: Vec, comprimento: number, curva: number, n = 6): Vec[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return mais(mais(base, d, comprimento * t), lado, Math.sin(Math.PI * t * 0.8) * comprimento * curva);
  });
}

/** Antena curvada para fora; Premonição põe nós ao longo dela e um na ponta. */
function antena(ctx: Ctx, base: Vec, d: Vec, lado: Vec, comprimento: number, nos: number) {
  const pts = arco(base, d, lado, comprimento, 0.18, 8);
  linha(ctx, pts, 1.2);
  for (let i = 1; i <= nos; i++) circulo(ctx, pts[Math.round((8 * i) / (nos + 1))], 1.3, true);
  if (nos) circulo(ctx, pts[8], 1.7, true);
}

/** Olho que aparece sobre corpo cheio ou vazado: disco de tinta com miolo escuro. */
function olho(ctx: Ctx, p: Vec, r: number) {
  circulo(ctx, p, r, true);
  circulo(ctx, p, r * 0.45, true, PAPEL);
}

function cerdas(ctx: Ctx, juntas: Vec[], nos: number, fora: Vec) {
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < juntas.length - 1; i++) {
    const osso = { x: juntas[i + 1].x - juntas[i].x, y: juntas[i + 1].y - juntas[i].y };
    for (let k = 1; k <= nos + 1; k++) {
      const p = mais(juntas[i], osso, k / (nos + 2));
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + fora.x * 2.5, p.y + fora.y * 2.5);
    }
  }
  ctx.stroke();
}

function ventosas(ctx: Ctx, juntas: Vec[], nos: number, fora: Vec) {
  const passo = 4 - nos; // nível 1: a cada 3 juntas; nível 3: em todas
  for (let i = 1; i < juntas.length; i += passo) circulo(ctx, mais(juntas[i], fora, -2.6), 0.9, true);
}

/** Adaptação: ampulheta no abdômen da aranha, anéis no manto do polvo, placas e espinhos na carapaça do caranguejo. */
function desenharMarca(ctx: Ctx, c: Crawler, v: Visual, raios: number[]) {
  const m = v.aparencia.marca;
  const tinta = v.preenchimento === 'cheio' ? PAPEL : TINTA;
  if (v.plano === 'aranha' && c.seg.length > 1) {
    const s = c.seg[1];
    const f = frente(c, 1);
    const n = normalDe(f);
    const k = raios[1] * (0.25 + 0.07 * m);
    ctx.fillStyle = tinta;
    for (const lado of [-1, 1]) {
      const b = mais(s, f, k * lado);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(b.x + n.x * k * 0.7, b.y + n.y * k * 0.7);
      ctx.lineTo(b.x - n.x * k * 0.7, b.y - n.y * k * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = TINTA;
  } else if (v.plano === 'polvo') {
    ctx.save();
    ctx.strokeStyle = tinta;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 2]);
    for (let j = 0; j < Math.ceil(m / 2); j++) {
      ctx.beginPath();
      ctx.arc(c.seg[0].x, c.seg[0].y, raios[0] * (0.85 - 0.17 * j), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  } else if (v.plano === 'caranguejo') {
    const s = c.seg[0];
    const f = frente(c, 0);
    const n = normalDe(f);
    const r = raios[0];
    ctx.strokeStyle = tinta;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const a of m >= 3 ? [-0.3, 0.3] : [0]) {
      const p = mais(s, f, r * a);
      ctx.moveTo(p.x - n.x * r * 1.1, p.y - n.y * r * 1.1);
      ctx.lineTo(p.x + n.x * r * 1.1, p.y + n.y * r * 1.1);
    }
    ctx.stroke();
    // espinhos na borda, de cada lado
    ctx.strokeStyle = TINTA;
    ctx.beginPath();
    const espinhos = Math.min(m, 4);
    for (let i = 0; i < espinhos; i++) {
      const a = espinhos === 1 ? 0 : 0.6 - (1.2 * i) / (espinhos - 1);
      for (const lado of [-1, 1]) {
        const b = mais(mais(s, f, r * a), n, r * 1.3 * lado);
        ctx.moveTo(b.x + f.x * 2, b.y + f.y * 2);
        ctx.lineTo(b.x + n.x * 4 * lado, b.y + n.y * 4 * lado);
        ctx.lineTo(b.x - f.x * 2, b.y - f.y * 2);
      }
    }
    ctx.stroke();
  }
}

/**
 * Olhos (Clarividência), antenas, palpos ou braços curtos (Multipresença), chicotes ou tentáculos de caça (Expansão)
 * e nós nas antenas (Premonição). Os apêndices balançam um pouco conforme o bicho anda.
 */
function desenharSentidos(ctx: Ctx, c: Crawler, v: Visual, r0: number) {
  const a = v.aparencia;
  const f = { x: Math.cos(c.ang), y: Math.sin(c.ang) };
  const n = normalDe(f);
  const s0 = c.seg[0];
  const rc = compacto(v) ? r0 * 0.45 : 6 * Math.max(0.8, v.espessura); // raio da cabeça da centopeia
  const balanco = Math.sin((s0.x + s0.y) * 0.05) * 0.12;

  if (temAntenasDeSkill(v)) {
    const pares = a.sensores + (v.cabeca === 'antenas' || a.expansao > 0 || a.nos > 0 ? 1 : 0);
    const comprimento = (v.plano === 'caranguejo' ? 12 : 16) * (1 + 0.9 * a.expansao);
    const base = v.plano === 'caranguejo' ? mais(s0, f, r0 * 0.9) : mais(s0, f, rc * 0.8);
    for (let j = 0; j < pares; j++) {
      for (const lado of [-1, 1]) {
        const ladoV = vezes(n, lado);
        antena(ctx, mais(base, ladoV, 1.5), girarVec(f, lado * (0.3 + 0.3 * j) + balanco), ladoV, comprimento * (1 - 0.12 * j), a.nos);
      }
    }
  }

  for (let k = 0; k < a.olhos; k++) {
    for (const lado of [-1, 1]) {
      if (v.plano === 'centopeia') {
        circulo(ctx, mais(mais(s0, f, rc * (0.45 - 0.42 * k)), n, rc * 0.5 * lado), Math.max(1, rc * 0.2), true, PAPEL);
      } else if (v.plano === 'aranha') {
        // duas fileiras de até 4, no meio do corpo: a frente fica para as cabeças do Perfeccionismo
        olho(ctx, mais(mais(s0, f, r0 * (0.55 - 0.32 * (k % 2))), n, r0 * (0.16 + 0.32 * Math.floor(k / 2)) * lado), 1.05);
      } else if (v.plano === 'polvo') {
        olho(ctx, mais(mais(s0, f, r0 * (0.55 - 0.45 * k)), n, r0 * 0.42 * lado), 1.3 + 1.5 * a.visao);
      } else {
        // caranguejo: pedúnculos que sobem com a Clarividência
        const base = mais(mais(s0, f, r0 * 0.8), n, r0 * 0.7 * lado);
        const ponta = mais(base, girarVec(f, 0.35 * lado), 3 + 9 * a.visao);
        linha(ctx, [base, ponta], 1.2);
        circulo(ctx, ponta, 1.4 + 0.8 * a.visao, true);
      }
    }
  }

  if (v.plano === 'aranha' || v.plano === 'polvo') {
    for (let j = 0; j < a.sensores; j++) {
      for (const lado of [-1, 1]) {
        const ladoV = vezes(n, lado);
        if (v.plano === 'aranha') {
          // palpos: perninhas curtas na frente, joelho para fora
          const base = mais(mais(s0, f, r0), ladoV, r0 * 0.3);
          const d = girarVec(f, lado * (0.35 + 0.3 * j));
          const comprimento = r0 * 1.5;
          const ponta = mais(base, d, comprimento);
          linha(ctx, [base, mais(mais(base, d, comprimento * 0.5), ladoV, comprimento * 0.25), ponta], 1.2);
          circulo(ctx, ponta, 1.2, true);
        } else {
          // braços curtos na frente do manto
          const base = mais(mais(s0, f, r0 * 1.1), ladoV, r0 * (0.25 + 0.15 * j));
          const d = girarVec(f, lado * (0.2 + 0.25 * j) + balanco);
          const ponta = mais(base, d, r0 * 1.4);
          linha(ctx, [base, ponta], 1.5);
          quadradoGirado(ctx, ponta, d, 1.5, false);
        }
      }
    }
    if (a.expansao) {
      const comprimento = 18 + (v.plano === 'aranha' ? 34 : 38) * a.expansao;
      for (const lado of [-1, 1]) {
        const ladoV = vezes(n, lado);
        if (v.plano === 'aranha') {
          // chicotes: o par sensorial longo das aranhas-chicote, fino e de muitas juntas
          const pts = arco(mais(mais(s0, f, r0 * 1.1), ladoV, r0 * 0.4), girarVec(f, lado * 0.55 + balanco), ladoV, comprimento, 0.12);
          linha(ctx, pts, 1);
          for (const q of pts.slice(1)) circulo(ctx, q, 0.9, true);
        } else {
          // tentáculos de caça: longos, com a ponta em clava
          const pts = arco(mais(mais(s0, f, r0), ladoV, r0 * 0.3), girarVec(f, lado * 0.2 + balanco), ladoV, comprimento, 0.08);
          linha(ctx, pts, 1.5);
          circulo(ctx, pts[pts.length - 1], 2.2, true);
        }
      }
    }
  }
}

/** Cabeça pequena: círculo com dois olhos, olhando para `d`. */
function cabecinha(ctx: Ctx, p: Vec, d: Vec, r: number, cheia: boolean) {
  const n = normalDe(d);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = cheia ? TINTA : PAPEL;
  ctx.fill();
  ctx.strokeStyle = TINTA;
  ctx.stroke();
  ctx.fillStyle = TINTA;
  for (const lado of [-1, 1]) circulo(ctx, mais(mais(p, d, r * 0.3), n, r * 0.45 * lado), Math.max(0.8, r * 0.2), true, cheia ? PAPEL : TINTA);
}

/**
 * Perfeccionismo: cabeças a mais. Centopeia: a primeira nasce na cauda e a segunda vira um par dos lados da cabeça.
 * Nos outros planos, a frente do corpo ganha cabeças lado a lado (2, depois 3).
 */
function desenharCabecasExtras(ctx: Ctx, c: Crawler, v: Visual, raios: number[]) {
  const f = { x: Math.cos(c.ang), y: Math.sin(c.ang) };
  const n = normalDe(f);
  const cabecas = v.aparencia.cabecas;
  if (v.plano === 'centopeia') {
    const rc = 6 * Math.max(0.8, v.espessura);
    const ultimo = c.seg.length - 1;
    const tras = vezes(frente(c, ultimo), -1);
    cabecinha(ctx, mais(c.seg[ultimo], tras, raios[ultimo] * 0.8), tras, rc * 0.85, true);
    if (cabecas >= 2) for (const lado of [-1, 1]) cabecinha(ctx, mais(mais(c.seg[0], f, -rc * 0.3), n, rc * 1.1 * lado), f, rc * 0.7, true);
    return;
  }
  const r0 = raios[0];
  const ponta = r0 * (v.plano === 'caranguejo' ? 0.9 : 1.25) * 0.95;
  const r = r0 * (v.plano === 'polvo' ? 0.5 : 0.35);
  const lados = cabecas >= 2 ? [-0.6, 0, 0.6] : [-0.45, 0.45];
  for (const l of lados) cabecinha(ctx, mais(mais(c.seg[0], f, ponta), n, r0 * l), f, r, false);
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
  const r0 = raiosDe(v.plano, v.espessura, c.seg.length, v.aparencia.barriga)[0];
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
