import { IconButton, Stack } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import CenterFocusStrongRoundedIcon from '@mui/icons-material/CenterFocusStrongRounded';
import { type PointerEvent, type WheelEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ManuscriptSystemEdge, ManuscriptSystemNode } from '../../../functions/manuscriptMetadata';
import { GRAPH_SIZE, type Point } from './systemGraphLayout';
import { nodeColor } from './systemGraphColors';

interface View { scale: number; tx: number; ty: number }
/** Destaque da pesquisa do chat: o mapa fica cinza e acende o que a IA tocou (busca), leu e citou. */
export interface GraphSearchHighlight { tocados: Set<string>; lidos: Set<string>; citados: Set<string>; ultimo: string | null }
type Props = {
  nodes: ManuscriptSystemNode[]; edges: ManuscriptSystemEdge[]; positions: Map<string, Point>;
  selectedId: string | null; pesquisa: GraphSearchHighlight | null; focusId: string | null; onSelect: (id: string | null) => void;
};
const APAGADO = '#52626c';

export default function SystemGraphCanvas({ nodes, edges, positions, selectedId, pesquisa, focusId, onSelect }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  // Pixels de tela por unidade do quadro: mantém texto e traços legíveis em qualquer tamanho de tela.
  const [pixels, setPixels] = useState(0.6);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const update = () => setPixels(Math.max(0.2, Math.min(element.clientWidth, element.clientHeight) / GRAPH_SIZE));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const unit = 1 / (view.scale * pixels);
  const degree = useMemo(() => { const map = new Map<string, number>(); for (const edge of edges) { map.set(edge.source, (map.get(edge.source) ?? 0) + 1); map.set(edge.target, (map.get(edge.target) ?? 0) + 1); } return map; }, [edges]);
  const neighbors = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set([selectedId]);
    for (const edge of edges) { if (edge.source === selectedId) set.add(edge.target); if (edge.target === selectedId) set.add(edge.source); }
    return set;
  }, [edges, selectedId]);

  // Centraliza no nó pedido (link do chat, entidade do Reader, ?foco=).
  useEffect(() => {
    const point = focusId ? positions.get(focusId) : undefined;
    if (!point) return;
    setView((old) => { const scale = Math.max(old.scale, 1.8); // Um pouco à esquerda do centro: o painel de detalhes ocupa o lado direito.
      return { scale, tx: GRAPH_SIZE * 0.36 - point.x * scale, ty: GRAPH_SIZE / 2 - point.y * scale }; });
  }, [focusId, positions]);

  const toGraph = (clientX: number, clientY: number) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: GRAPH_SIZE / 2, y: GRAPH_SIZE / 2 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };
  const zoomAt = (factor: number, at: { x: number; y: number }) => setView((old) => {
    const scale = Math.min(8, Math.max(0.4, old.scale * factor));
    const real = scale / old.scale;
    return { scale, tx: at.x - (at.x - old.tx) * real, ty: at.y - (at.y - old.ty) * real };
  });
  const onWheel = (event: WheelEvent<SVGSVGElement>) => { zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, toGraph(event.clientX, event.clientY)); };
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => { drag.current = { x: event.clientX, y: event.clientY, view, moved: false }; svg.current?.setPointerCapture(event.pointerId); };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    if (!start) return;
    const a = toGraph(start.x, start.y); const b = toGraph(event.clientX, event.clientY);
    if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 4) start.moved = true;
    // toGraph já considera o viewBox; o deslocamento é aplicado sobre a vista do início do arrasto.
    setView({ ...start.view, tx: start.view.tx + (b.x - a.x), ty: start.view.ty + (b.y - a.y) });
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const start = drag.current; drag.current = null;
    if (!start?.moved) {
      const id = (event.target as Element).closest('[data-node]')?.getAttribute('data-node');
      onSelect(id ?? null);
    }
  };

  // Nível de luz de cada nó na pesquisa: 3 citado, 2 lido, 1 tocado pela busca, 0 apagado.
  const luz = (id: string) => (!pesquisa ? 2 : pesquisa.citados.has(id) ? 3 : pesquisa.lidos.has(id) ? 2 : pesquisa.tocados.has(id) ? 1 : 0);
  const dim = (id: string) => !pesquisa && !!neighbors && !neighbors.has(id);
  const showLabel = (node: ManuscriptSystemNode) => (pesquisa ? luz(node.id) >= 2 || selectedId === node.id : neighbors?.has(node.id) || view.scale >= 2.2 || (node.kind === 'DOCUMENTO' && (degree.get(node.id) ?? 0) >= 18 / view.scale));
  const r = (node: ManuscriptSystemNode) => (node.kind === 'DOCUMENTO' ? 4 + Math.min(7, Math.sqrt(degree.get(node.id) ?? 0)) : 3.5);

  return <div className="manuscript-map-canvas">
    <svg ref={svg} viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`} role="img" aria-label="Mapa do sistema" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
        {edges.map((edge, i) => {
          const a = positions.get(edge.source); const b = positions.get(edge.target);
          if (!a || !b) return null;
          const active = pesquisa ? (luz(edge.source) >= 2 && luz(edge.target) >= 1) || (luz(edge.target) >= 2 && luz(edge.source) >= 1) : selectedId && (edge.source === selectedId || edge.target === selectedId);
          const off = pesquisa ? !active : selectedId && !active;
          return <line key={`${edge.source}|${edge.target}|${edge.relacao}|${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge ${edge.relacao} ${active ? 'active' : ''} ${off ? 'dim' : ''}`} strokeWidth={(active ? 1.6 : 0.8) * unit} />;
        })}
        {nodes.map((node) => {
          const p = positions.get(node.id);
          if (!p) return null;
          const size = r(node) * unit;
          const nivel = luz(node.id);
          const color = nivel ? nodeColor(node) : APAGADO;
          const lit = pesquisa && nivel >= 2;
          return <g key={node.id} data-node={node.id} className={`node ${node.kind.toLowerCase()} ${selectedId === node.id ? 'selected' : ''} ${dim(node.id) ? 'dim' : ''} ${pesquisa ? `luz-${nivel}` : ''} ${pesquisa?.ultimo === node.id ? 'ultimo' : ''}`} transform={`translate(${p.x} ${p.y})`}>
            <title>{node.kind === 'DOCUMENTO' ? `${node.label}\n${node.id}` : node.id}</title>
            {lit && <circle className="halo" r={size * (nivel === 3 ? 2.6 : 2.1)} fill={nodeColor(node)} />}
            {node.kind === 'DOCUMENTO' ? <circle r={size} fill={color} stroke={selectedId === node.id ? '#102a3a' : 'none'} strokeWidth={2.4 * unit} /> : <rect x={-size} y={-size} width={size * 2} height={size * 2} rx={size * 0.35} fill={selectedId === node.id ? color : '#16232b'} stroke={selectedId === node.id ? '#102a3a' : color} strokeWidth={1.4 * unit} />}
            {showLabel(node) && <text y={-size - 3 * unit} fontSize={11 * unit} textAnchor="middle">{node.label}</text>}
          </g>;
        })}
      </g>
    </svg>
    <Stack className="manuscript-map-zoom" spacing={.5}>
      <IconButton size="small" aria-label="Aproximar" onClick={() => zoomAt(1.3, { x: GRAPH_SIZE / 2, y: GRAPH_SIZE / 2 })}><AddRoundedIcon fontSize="small" /></IconButton>
      <IconButton size="small" aria-label="Afastar" onClick={() => zoomAt(1 / 1.3, { x: GRAPH_SIZE / 2, y: GRAPH_SIZE / 2 })}><RemoveRoundedIcon fontSize="small" /></IconButton>
      <IconButton size="small" aria-label="Ver o mapa inteiro" onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}><CenterFocusStrongRoundedIcon fontSize="small" /></IconButton>
    </Stack>
  </div>;
}
