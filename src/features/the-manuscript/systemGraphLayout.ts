// Posicionamento do mapa do sistema por forças (Fruchterman-Reingold), determinístico: o mesmo grafo sempre dá o mesmo desenho.
import type { ManuscriptSystemEdge, ManuscriptSystemNode } from '../../../functions/manuscriptMetadata';

export interface Point { x: number; y: number }
export const GRAPH_SIZE = 1000;

export function layoutSystemGraph(nodes: ManuscriptSystemNode[], edges: ManuscriptSystemEdge[], iterations = 320): Map<string, Point> {
  const n = nodes.length;
  const positions = new Map<string, Point>();
  if (!n) return positions;
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const center = GRAPH_SIZE / 2;
  // Começa num círculo ordenado por domínio, para nós do mesmo domínio partirem perto.
  const order = nodes.map((node, i) => ({ i, key: `${node.dominios[0] ?? 'zz'}|${node.kind}|${node.id}` })).sort((a, b) => a.key.localeCompare(b.key));
  const xs = new Float64Array(n); const ys = new Float64Array(n);
  order.forEach(({ i }, position) => { const angle = (2 * Math.PI * position) / n; xs[i] = center + Math.cos(angle) * GRAPH_SIZE * 0.4; ys[i] = center + Math.sin(angle) * GRAPH_SIZE * 0.4; });
  const springs = edges.flatMap((edge) => { const a = index.get(edge.source); const b = index.get(edge.target); return a === undefined || b === undefined || a === b ? [] : [{ a, b, weight: edge.relacao === 'link' ? 0.25 : 1 }]; });
  const k = Math.sqrt((GRAPH_SIZE * GRAPH_SIZE) / n) * 0.75;
  const dx = new Float64Array(n); const dy = new Float64Array(n);
  const gravity = (n * k * k) / (GRAPH_SIZE * 0.45) ** 2;
  let temperature = GRAPH_SIZE / 10;
  for (let step = 0; step < iterations; step += 1) {
    dx.fill(0); dy.fill(0);
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let ddx = xs[i] - xs[j]; let ddy = ys[i] - ys[j];
        let dist = Math.hypot(ddx, ddy);
        if (dist < 0.01) { ddx = 0.01 * ((i % 7) - 3); ddy = 0.01 * ((j % 5) - 2); dist = Math.hypot(ddx, ddy) || 0.01; }
        const force = (k * k) / dist;
        dx[i] += (ddx / dist) * force; dy[i] += (ddy / dist) * force;
        dx[j] -= (ddx / dist) * force; dy[j] -= (ddy / dist) * force;
      }
    }
    for (const { a, b, weight } of springs) {
      const ddx = xs[a] - xs[b]; const ddy = ys[a] - ys[b];
      const dist = Math.hypot(ddx, ddy) || 0.01;
      const force = ((dist * dist) / k) * weight;
      dx[a] -= (ddx / dist) * force; dy[a] -= (ddy / dist) * force;
      dx[b] += (ddx / dist) * force; dy[b] += (ddy / dist) * force;
    }
    for (let i = 0; i < n; i += 1) {
      // Gravidade: equilibra a repulsão num disco de raio ~45% do quadro, sem deixar nós soltos fugirem.
      dx[i] += (center - xs[i]) * gravity; dy[i] += (center - ys[i]) * gravity;
      const length = Math.hypot(dx[i], dy[i]) || 0.01;
      const move = Math.min(length, temperature);
      xs[i] += (dx[i] / length) * move; ys[i] += (dy[i] / length) * move;
    }
    temperature = Math.max(1, temperature * 0.985);
  }
  // Ajusta ao quadro com margem.
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < n; i += 1) { minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]); minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]); }
  const scale = (GRAPH_SIZE * 0.92) / Math.max(maxX - minX, maxY - minY, 1);
  nodes.forEach((node, i) => positions.set(node.id, { x: GRAPH_SIZE * 0.04 + (xs[i] - minX) * scale, y: GRAPH_SIZE * 0.04 + (ys[i] - minY) * scale }));
  return positions;
}
