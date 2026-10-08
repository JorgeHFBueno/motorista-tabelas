import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useAdm2Authorization } from '../hooks/useAdm2Authorization';
import { createAndLinkMondayObra, linkMondayObra, listMondayObras, type MondayObraRow, type ObraV2Row } from '../services/mondayObrasReconciliation';
import { engenhariaObrasRenderState, normalizeEngenhariaObrasCollections } from './engenhariaObrasPageState';

type Filter = 'Todos' | 'Pendentes' | 'Vinculados';
type Action = 'LINK_EXISTING' | 'CREATE_AND_LINK';
const text = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const label = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value);
const date = (value: unknown) => value === null || value === undefined || value === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00` : String(value);
const nameFor = (row: MondayObraRow) => {
  const name = String(row.raw?.nome ?? row.nome ?? '').trim(); const contract = String(row.raw?.numeroContrato ?? row.numeroContrato ?? '').trim();
  return !contract || new RegExp(`(^|\\D)0*${contract.replace(/^0+/, '') || '0'}(\\D|$)`).test(name) ? name : `${name} ${contract}`;
};

export default function EngenhariaObrasPage() {
  const { loading: authLoading, authorized } = useAdm2Authorization();
  const [monday, setMonday] = useState<MondayObraRow[]>([]); const [obras, setObras] = useState<ObraV2Row[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null);
  const [mondayQuery, setMondayQuery] = useState(''); const [obraQuery, setObraQuery] = useState(''); const [filter, setFilter] = useState<Filter>('Todos');
  const [selectedMonday, setSelectedMonday] = useState<MondayObraRow | null>(null); const [selectedObra, setSelectedObra] = useState<ObraV2Row | null>(null);
  const [action, setAction] = useState<Action>('LINK_EXISTING'); const [confirmOpen, setConfirmOpen] = useState(false); const [saving, setSaving] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { const data = normalizeEngenhariaObrasCollections(await listMondayObras()); setMonday(data.monday); setObras(data.obrasV2); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar dados.'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (authorized) void refresh(); else if (!authLoading) setLoading(false); }, [authorized, authLoading, refresh]);
  const used = useMemo(() => new Set(monday.map((row) => row.obraV2Id).filter(Boolean)), [monday]);
  const shownMonday = monday.filter((row) => (filter === 'Todos' || (filter === 'Vinculados' ? Boolean(row.obraV2Id) : !row.obraV2Id)) && [row.nome, row.numeroContrato, row.documentId].map(text).join(' ').includes(text(mondayQuery)));
  const shownObras = obras.filter((row) => [row.nomeObra, row.siglaObra, row.codObra, row.documentId].map(text).join(' ').includes(text(obraQuery)));
  const canLink = Boolean(selectedMonday && selectedObra && !selectedMonday.obraV2Id && !used.has(selectedObra.documentId));
  const canCreate = Boolean(selectedMonday && !selectedMonday.obraV2Id);
  async function save() {
    if (!selectedMonday || (action === 'LINK_EXISTING' && !selectedObra)) return;
    setSaving(true); setError(null);
    try {
      if (action === 'CREATE_AND_LINK') {
        const result = await createAndLinkMondayObra(selectedMonday.documentId);
        setMonday((current) => current.map((row) => row.documentId === selectedMonday.documentId ? { ...row, obraV2Id: result.obraV2Id } : row));
        setMessage('Obra-v2 criada e vinculada com sucesso.');
      } else {
        const result = await linkMondayObra(selectedMonday.documentId, selectedObra!.documentId);
        setMonday((current) => current.map((row) => row.documentId === selectedMonday.documentId ? { ...row, obraV2Id: selectedObra!.documentId } : row));
        setMessage(result.result === 'NO_CHANGE' ? 'O vínculo já estava aplicado.' : 'Vínculo criado com sucesso.');
      }
      setConfirmOpen(false); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar vínculo.'); } finally { setSaving(false); }
  }
  const state = engenhariaObrasRenderState({ authLoading, loading, authorized, error });
  if (state === 'loading') return <Stack alignItems="center" p={5}><CircularProgress /><Typography mt={2}>Carregando conciliação...</Typography></Stack>;
  if (state === 'unauthorized') return <Box p={3}><Alert severity="error">Esta ferramenta exige funcionário ativo com perfil adm2.</Alert></Box>;
  if (state === 'error') return <Box p={3}><Alert severity="error" action={<Button onClick={() => void refresh()}>Tentar novamente</Button>}>{error}</Alert></Box>;
  return <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
    <Stack direction="row" justifyContent="space-between" mb={2}><Box><Typography variant="h4">Conciliação de Obras</Typography><Typography color="text.secondary">monday-obras ↔ obras-v2 · vínculo manual 1:1</Typography></Box><Button onClick={() => void refresh()}>Atualizar</Button></Stack>
    {message && <Alert severity="success" onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message}</Alert>}
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
      <Paper sx={{ p: 2, flex: 1 }}><Typography variant="h6">Monday-obras ({shownMonday.length}/{monday.length})</Typography><TextField fullWidth size="small" label="Buscar nome, contrato ou itemId" value={mondayQuery} onChange={(event) => setMondayQuery(event.target.value)} sx={{ my: 1 }} /><Tabs value={filter} onChange={(_, value) => setFilter(value)}><Tab value="Todos" label="Todos" /><Tab value="Pendentes" label="Pendentes" /><Tab value="Vinculados" label="Vinculados" /></Tabs><Box sx={{ maxHeight: 480, overflow: 'auto' }}>{shownMonday.map((row) => <Button key={row.documentId} fullWidth onClick={() => setSelectedMonday(row)} sx={{ justifyContent: 'flex-start', display: 'block', textAlign: 'left', border: 1, borderColor: selectedMonday?.documentId === row.documentId ? 'primary.main' : 'divider', my: 0.5 }}><b>{label(row.nome)}</b><br /><small>Contrato {label(row.numeroContrato)} · {label(row.empresa)} · ID {row.documentId} · {row.obraV2Id ? `Vinculado: ${row.obraV2Id}` : 'Pendente'}</small></Button>)}</Box></Paper>
      <Paper sx={{ p: 2, flex: 1 }}><Typography variant="h6">Obras-v2 ({shownObras.length}/{obras.length})</Typography><TextField fullWidth size="small" label="Buscar nome, sigla, código ou documentId" value={obraQuery} onChange={(event) => setObraQuery(event.target.value)} sx={{ my: 1 }} /><Box sx={{ maxHeight: 480, overflow: 'auto' }}>{shownObras.map((row) => <Button key={row.documentId} fullWidth onClick={() => setSelectedObra(row)} sx={{ justifyContent: 'flex-start', display: 'block', textAlign: 'left', border: 1, borderColor: selectedObra?.documentId === row.documentId ? 'primary.main' : 'divider', my: 0.5 }}><b>{label(row.nomeObra)}</b><br /><small>{label(row.siglaObra)} · código {label(row.codObra)} · ID {row.documentId}</small></Button>)}</Box></Paper>
    </Stack>
    <Stack direction="row" justifyContent="flex-end" spacing={1} mt={2}>{canCreate && <Button variant="outlined" disabled={saving} onClick={() => { setAction('CREATE_AND_LINK'); setConfirmOpen(true); }}>Criar obra-v2 e vincular</Button>}<Button variant="contained" disabled={!canLink || saving} onClick={() => { setAction('LINK_EXISTING'); setConfirmOpen(true); }}>Vincular seleção</Button></Stack>
    <Dialog open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)}><DialogTitle>{action === 'CREATE_AND_LINK' ? 'Criar obra-v2 e vincular' : 'Confirmar vínculo'}</DialogTitle><DialogContent><Typography>Contrato Monday:</Typography><Typography fontWeight={700}>{label(selectedMonday?.nome)} / {selectedMonday?.documentId}</Typography>{action === 'CREATE_AND_LINK' ? <><Typography variant="body2">Contrato {label(selectedMonday?.numeroContrato)} · {label(selectedMonday?.empresa)} · {label(selectedMonday?.tipoObra)} · início {label(selectedMonday?.raw?.inicio)}</Typography><Typography mt={2}>Nova obra-v2 que será criada:</Typography><Typography>codObra: 0 · nomeObra: {selectedMonday ? nameFor(selectedMonday) : '—'}</Typography><Typography>siglaObra: {label(selectedMonday?.raw?.nome ?? selectedMonday?.nome)} · local: CORRIGIR · status: CONTRATADA</Typography><Typography>dataInicial: {label(date(selectedMonday?.raw?.inicio))} · dataFinal: {label(date(selectedMonday?.raw?.inicio))}</Typography></> : <><Typography mt={2}>Obra selecionada:</Typography><Typography>{label(selectedObra?.nomeObra)} / {selectedObra?.documentId}</Typography></>}</DialogContent><DialogActions><Button disabled={saving} onClick={() => setConfirmOpen(false)}>Cancelar</Button><Button disabled={saving} onClick={() => void save()} variant="contained">{saving ? 'Salvando...' : action === 'CREATE_AND_LINK' ? 'Criar e vincular' : 'Confirmar'}</Button></DialogActions></Dialog>
  </Box>;
}
