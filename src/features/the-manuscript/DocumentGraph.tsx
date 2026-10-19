import { Button, CircularProgress, Dialog, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useMemo } from 'react';
import type { ManuscriptDocumentGraphResponse, ManuscriptGraphNode } from '../../services/manuscript';

type Props = { graph: ManuscriptDocumentGraphResponse | null; loading: boolean; error: boolean; open: (path: string) => void; expanded: boolean; onExpand: () => void; onClose: () => void };
const point = (node: ManuscriptGraphNode, index: number, total: number, expanded: boolean) => {
  if (node.kind === 'CURRENT') return { x: 50, y: 50 };
  const side = node.direction === 'INCOMING' ? -1 : node.direction === 'OUTGOING' ? 1 : index % 2 ? -1 : 1;
  const count = Math.max(total, 1); const step = 70 / count;
  return { x: 50 + side * (expanded ? 33 : 29), y: 15 + (index + .5) * step };
};
function Canvas({ graph, expanded, open }: { graph: ManuscriptDocumentGraphResponse; expanded: boolean; open: (path: string) => void }) {
  const positioned = useMemo(() => new Map(graph.nodes.map((node, index) => [node.path, point(node, Math.max(0, index - 1), Math.max(1, graph.nodes.length - 1), expanded)])), [graph, expanded]);
  return <div className={`manuscript-graph-canvas ${expanded ? 'expanded' : ''}`}><svg viewBox="0 0 100 100" aria-hidden="true">{graph.edges.map((edge, index) => { const a = positioned.get(edge.source); const b = positioned.get(edge.target); return a && b ? <line key={`${edge.source}-${edge.target}-${edge.anchor ?? ''}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null; })}</svg>{graph.nodes.map((node) => { const p = positioned.get(node.path)!; return <button key={node.path} type="button" title={`${node.title}\n${node.path}`} aria-label={`Abrir ${node.title}: ${node.path}`} className={`manuscript-graph-node ${node.kind.toLowerCase()} ${node.direction?.toLowerCase() ?? ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} onClick={() => open(node.path)}><span>{node.title}</span></button>; })}</div>;
}
export default function DocumentGraph({ graph, loading, error, open, expanded, onExpand, onClose }: Props) {
  if (loading) return <section className="manuscript-graph"><Typography variant="overline">Grafo local</Typography><CircularProgress size={16} /></section>;
  if (error) return <section className="manuscript-graph"><Typography variant="overline">Grafo local</Typography><Typography variant="caption">Não foi possível carregar o grafo.</Typography></section>;
  if (!graph) return null;
  if (graph.nodes.length <= 1) return <section className="manuscript-graph"><Typography variant="overline">Grafo local</Typography><Typography variant="caption">Nenhuma relação documental.</Typography></section>;
  return <section className="manuscript-graph"><Typography variant="overline">Grafo local</Typography><Canvas graph={graph} expanded={false} open={open} />{graph.truncated && <Typography variant="caption">+ {graph.totalNodes - graph.visibleNodes} relações</Typography>}<Button type="button" size="small" title="Ver grafo de relações" aria-label="Ver grafo de relações" onClick={onExpand}>Expandir grafo</Button><Dialog open={expanded} onClose={onClose} fullWidth maxWidth="lg"><DialogTitle>Grafo local</DialogTitle><DialogContent><Canvas graph={graph} expanded open={(path) => { onClose(); open(path); }} />{graph.truncated && <Typography variant="body2">+ {graph.totalNodes - graph.visibleNodes} relações fora do limite visual.</Typography>}</DialogContent></Dialog></section>;
}
