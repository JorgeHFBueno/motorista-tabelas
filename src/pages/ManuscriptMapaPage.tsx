import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, Stack, Switch, TextField, Typography } from '@mui/material';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { temCredencial } from '../services/credenciais';
import { manuscriptGetSystemGraph, type ManuscriptSystemGraphResponse, type ManuscriptSystemNode } from '../services/manuscript';
import SystemGraphCanvas from '../features/the-manuscript/SystemGraphCanvas';
import { ENTITY_COLORS, domainColor, nodeColor } from '../features/the-manuscript/systemGraphColors';
import ManuscriptChat from '../features/the-manuscript/ManuscriptChat';
import { layoutSystemGraph } from '../features/the-manuscript/systemGraphLayout';
import './the-manuscript.css';
import '../features/the-manuscript/v4.css';
import '../features/the-manuscript/mapa.css';

const KINDS: Array<{ key: string; label: string }> = [{ key: 'DOCUMENTO', label: 'Documentos' }, { key: 'colecao', label: 'Coleções' }, { key: 'function', label: 'Functions' }, { key: 'rota', label: 'Rotas' }, { key: 'externo', label: 'Externos' }];
const RELACAO_LABEL: Record<string, [string, string]> = { define: ['define', 'definida em'], le: ['lê', 'lida por'], escreve: ['escreve', 'escrita por'], chama: ['chama', 'chamada por'], integra: ['integra', 'integrada por'], link: ['cita', 'citado por'] };
const kindOf = (node: ManuscriptSystemNode) => (node.kind === 'DOCUMENTO' ? 'DOCUMENTO' : node.tipo);

function Details({ graph, node, onSelect, onClose }: { graph: ManuscriptSystemGraphResponse; node: ManuscriptSystemNode; onSelect: (id: string) => void; onClose: () => void }) {
  const navigate = useNavigate();
  const byId = useMemo(() => new Map(graph.nodes.map((item) => [item.id, item])), [graph]);
  const rows = useMemo(() => [
    ...graph.edges.filter((edge) => edge.source === node.id).map((edge) => ({ label: RELACAO_LABEL[edge.relacao][0], id: edge.target })),
    ...graph.edges.filter((edge) => edge.target === node.id).map((edge) => ({ label: RELACAO_LABEL[edge.relacao][1], id: edge.source })),
  ], [graph, node.id]);
  const groups = rows.reduce<Record<string, string[]>>((acc, row) => { (acc[row.label] ??= []).push(row.id); return acc; }, {});
  const documentPath = node.kind === 'DOCUMENTO' ? node.id : node.definidoEm;
  return <section className="manuscript-map-details" aria-label="Detalhes do nó">
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
      <Box minWidth={0}>
        <Typography variant="overline" sx={{ color: nodeColor(node) }}>{node.kind === 'DOCUMENTO' ? `documento · ${node.tipo}` : node.tipo}</Typography>
        <Typography variant="subtitle1" className="manuscript-map-details-title">{node.label}</Typography>
        <Typography variant="caption" className="manuscript-map-details-id">{node.id}</Typography>
      </Box>
      <IconButton size="small" aria-label="Fechar detalhes" onClick={onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
    </Stack>
    {(node.status || node.dominios.length > 0) && <Stack direction="row" spacing={.5} useFlexGap flexWrap="wrap">{node.status && <Chip size="small" label={node.status} className={`manuscript-metadata-status ${node.status}`} />}{node.dominios.map((dominio) => <Chip key={dominio} size="small" variant="outlined" label={dominio} />)}</Stack>}
    {node.resumo && <Typography variant="body2">{node.resumo}</Typography>}
    {node.kind === 'ENTIDADE' && !node.definidoEm && <Typography variant="body2" color="warning.main">Nenhum documento define esta entidade.</Typography>}
    {documentPath && <Button size="small" variant="outlined" startIcon={<MenuBookRoundedIcon />} onClick={() => navigate(`/the-manuscript/${encodeURI(documentPath)}`)}>{node.kind === 'DOCUMENTO' ? 'Abrir documento' : 'Abrir documento que define'}</Button>}
    <Box className="manuscript-map-relations">
      {Object.entries(groups).map(([label, ids]) => <div key={label}><Typography variant="caption">{label} ({ids.length})</Typography>{[...new Set(ids)].map((id) => <button type="button" key={id} onClick={() => onSelect(id)} title={id}><span style={{ background: byId.get(id) ? nodeColor(byId.get(id)!) : '#999' }} />{byId.get(id)?.label ?? id}</button>)}</div>)}
    </Box>
  </section>;
}

export default function ManuscriptMapaPage() {
  const navigate = useNavigate();
  const { authorizationProfile } = useAuth();
  const chatEnabled = temCredencial(authorizationProfile, 'retr0');
  const [params, setParams] = useSearchParams();
  const [graph, setGraph] = useState<ManuscriptSystemGraphResponse | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(params.get('foco'));
  const [focusId, setFocusId] = useState<string | null>(params.get('foco'));
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState(() => new Set(KINDS.map((kind) => kind.key)));
  const [domains, setDomains] = useState<Set<string>>(new Set());
  const [showLinks, setShowLinks] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);

  useEffect(() => { void manuscriptGetSystemGraph().then(setGraph).catch(() => setError('Não foi possível carregar o mapa do sistema.')); }, []);
  const positions = useMemo(() => (graph ? layoutSystemGraph(graph.nodes, graph.edges) : new Map()), [graph]);
  const allDomains = useMemo(() => [...new Set(graph?.nodes.flatMap((node) => node.dominios) ?? [])].sort(), [graph]);

  const visible = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const nodes = graph.nodes.filter((node) => kinds.has(kindOf(node))
      && (showAudit || !node.id.startsWith('_AUDITORIA/'))
      && (!domains.size || node.dominios.some((dominio) => domains.has(dominio)) || node.id === selectedId));
    const ids = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter((edge) => (showLinks || edge.relacao !== 'link') && ids.has(edge.source) && ids.has(edge.target));
    return { nodes, edges };
  }, [graph, kinds, domains, showLinks, showAudit, selectedId]);

  const highlighted = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (needle.length < 2) return new Set<string>();
    return new Set(visible.nodes.filter((node) => `${node.id} ${node.label} ${node.resumo ?? ''}`.toLocaleLowerCase().includes(needle)).map((node) => node.id));
  }, [query, visible.nodes]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setParams((old) => { const next = new URLSearchParams(old); if (id) next.set('foco', id); else next.delete('foco'); return next; }, { replace: true });
  }, [setParams]);
  const focus = useCallback((id: string) => { select(id); setFocusId(null); setTimeout(() => setFocusId(id), 0); }, [select]);
  const selected = graph?.nodes.find((node) => node.id === selectedId) ?? null;
  const toggle = <T,>(set: Set<T>, value: T) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; };

  return <Box className="manuscript-page manuscript-map-page">
    <header className="manuscript-topbar">
      <Stack direction="row" alignItems="center" spacing={1}><MenuBookRoundedIcon className="manuscript-brand-icon" /><Typography variant="h6">The Manuscript · Mapa</Typography><Button size="small" startIcon={<MenuBookRoundedIcon />} onClick={() => navigate('/the-manuscript')}>Documentos</Button></Stack>
      <TextField size="small" className="manuscript-search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && highlighted.size) focus([...highlighted][0]); }} placeholder="Buscar no mapa" InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> }} />
    </header>
    <Box className={`manuscript-map-body ${chatEnabled ? 'with-chat' : ''}`}>
      <Box className="manuscript-map-main">
        <Stack className="manuscript-map-filters" direction="row" spacing={.75} useFlexGap flexWrap="wrap" alignItems="center">
          {KINDS.map((kind) => <Chip key={kind.key} size="small" label={kind.label} variant={kinds.has(kind.key) ? 'filled' : 'outlined'} onClick={() => setKinds((old) => toggle(old, kind.key))} icon={<span className="manuscript-map-swatch" style={{ background: kind.key === 'DOCUMENTO' ? '#90a4ae' : ENTITY_COLORS[kind.key], borderRadius: kind.key === 'DOCUMENTO' ? '50%' : 3 }} />} />)}
          <FormControlLabel control={<Switch size="small" checked={showLinks} onChange={(e) => setShowLinks(e.target.checked)} />} label="Links entre documentos" />
          <FormControlLabel control={<Switch size="small" checked={showAudit} onChange={(e) => setShowAudit(e.target.checked)} />} label="Auditoria" />
          {graph && graph.problems.length > 0 && <Chip size="small" color="warning" icon={<WarningAmberRoundedIcon />} label={`${graph.problems.length} problema(s) nos blocos`} onClick={() => setProblemsOpen(true)} />}
        </Stack>
        <Stack className="manuscript-map-domains" direction="row" spacing={.5} useFlexGap flexWrap="wrap">
          {allDomains.map((dominio) => <Chip key={dominio} size="small" label={dominio} variant={domains.has(dominio) ? 'filled' : 'outlined'} onClick={() => setDomains((old) => toggle(old, dominio))} icon={<span className="manuscript-map-swatch" style={{ background: domainColor(dominio), borderRadius: '50%' }} />} />)}
          {domains.size > 0 && <Button size="small" onClick={() => setDomains(new Set())}>Todos os domínios</Button>}
        </Stack>
        <Box className="manuscript-map-stage">
          {error ? <Alert severity="error">{error}</Alert> : !graph ? <Stack alignItems="center" justifyContent="center" height="100%"><CircularProgress size={28} /></Stack>
            : <SystemGraphCanvas nodes={visible.nodes} edges={visible.edges} positions={positions} selectedId={selectedId} highlighted={highlighted} focusId={focusId} onSelect={select} />}
          {graph && selected && <Details graph={graph} node={selected} onSelect={focus} onClose={() => select(null)} />}
        </Box>
      </Box>
      {chatEnabled && <ManuscriptChat onCite={focus} />}
    </Box>
    <Dialog open={problemsOpen} onClose={() => setProblemsOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>Problemas nos blocos de dados</DialogTitle>
      <DialogContent>{graph?.problems.map((item, index) => <Typography key={index} variant="body2" className="manuscript-map-problem"><button type="button" onClick={() => { setProblemsOpen(false); focus(item.path); }}>{item.path}</button>: {item.problem}</Typography>)}</DialogContent>
    </Dialog>
  </Box>;
}
