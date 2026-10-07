import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useAdm2Authorization } from '../hooks/useAdm2Authorization';
import { linkMondayObra, listMondayObras, type MondayObraRow, type ObraV2Row } from '../services/mondayObrasReconciliation';

type Filter = 'Todos' | 'Pendentes' | 'Vinculados';
const text = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const mondaySearch = (row: MondayObraRow) => [row.nome, row.numeroContrato, row.documentId].map(text).join(' ');
const obraSearch = (row: ObraV2Row) => [row.nomeObra, row.siglaObra, row.codObra, row.documentId].map(text).join(' ');
const label = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value);

export default function EngenhariaObrasPage() {
  const { loading: authLoading, authorized } = useAdm2Authorization();
  const [monday, setMonday] = useState<MondayObraRow[]>([]);
  const [obras, setObras] = useState<ObraV2Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mondayQuery, setMondayQuery] = useState('');
  const [obraQuery, setObraQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('Todos');
  const [selectedMonday, setSelectedMonday] = useState<MondayObraRow | null>(null);
  const [selectedObra, setSelectedObra] = useState<ObraV2Row | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { const data = await listMondayObras(); setMonday(data.monday); setObras(data.obrasV2); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar dados.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (authorized) void refresh(); else if (!authLoading) setLoading(false); }, [authorized, authLoading, refresh]);

  const usedObraIds = useMemo(() => new Set(monday.map((row) => row.obraV2Id).filter(Boolean)), [monday]);
  const filteredMonday = useMemo(() => monday.filter((row) => (filter === 'Todos' || (filter === 'Vinculados' ? Boolean(row.obraV2Id) : !row.obraV2Id)) && mondaySearch(row).includes(text(mondayQuery))), [monday, mondayQuery, filter]);
  const filteredObras = useMemo(() => obras.filter((row) => obraSearch(row).includes(text(obraQuery))), [obras, obraQuery]);

  async function confirmLink() {
    if (!selectedMonday || !selectedObra) return;
    setSaving(true); setError(null);
    try {
      const result = await linkMondayObra(selectedMonday.documentId, selectedObra.documentId);
      setMonday((current) => current.map((row) => row.documentId === selectedMonday.documentId ? { ...row, obraV2Id: selectedObra.documentId } : row));
      setMessage(result.result === 'NO_CHANGE' ? 'O vínculo já estava aplicado.' : 'Vínculo criado com sucesso.');
      setConfirmOpen(false); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao criar vínculo.'); }
    finally { setSaving(false); }
  }

  if (authLoading || loading) return <Stack alignItems="center" p={5}><CircularProgress /><Typography mt={2}>Carregando conciliação...</Typography></Stack>;
  if (!authorized) return <Box p={3}><Alert severity="error">Esta ferramenta exige funcionário ativo com perfil adm2.</Alert></Box>;

  const canLink = Boolean(selectedMonday && selectedObra && !selectedMonday.obraV2Id && !usedObraIds.has(selectedObra.documentId));
  return <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} mb={2}>
      <Box><Typography variant="h4">Conciliação de Obras</Typography><Typography color="text.secondary">monday-obras ↔ obras-v2 · vínculo manual 1:1</Typography></Box>
      <Button onClick={() => void refresh()} variant="outlined">Atualizar</Button>
    </Stack>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}{message && <Alert severity="success" onClose={() => setMessage(null)} sx={{ mb: 2 }}>{message}</Alert>}
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
      <Paper sx={{ p: 2, flex: 1, minWidth: 0 }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">Monday-obras ({filteredMonday.length}/{monday.length})</Typography><Chip label={`${monday.filter((row) => row.obraV2Id).length} vinculados`} color="success" size="small" /></Stack><TextField fullWidth size="small" label="Buscar nome, contrato ou itemId" value={mondayQuery} onChange={(event) => setMondayQuery(event.target.value)} sx={{ my: 1.5 }} /><Tabs value={filter} onChange={(_, value) => setFilter(value)} variant="fullWidth"><Tab value="Todos" label="Todos" /><Tab value="Pendentes" label="Pendentes" /><Tab value="Vinculados" label="Vinculados" /></Tabs><Box sx={{ maxHeight: 480, overflow: 'auto', mt: 1 }}>{filteredMonday.map((row) => <Button key={row.documentId} onClick={() => setSelectedMonday(row)} fullWidth sx={{ justifyContent: 'flex-start', textAlign: 'left', mb: 1, p: 1.2, border: 1, borderColor: selectedMonday?.documentId === row.documentId ? 'primary.main' : 'divider', display: 'block' }}><Typography fontWeight={700}>{label(row.nome)}</Typography><Typography variant="body2">Contrato {label(row.numeroContrato)} · {label(row.empresa)} · {label(row.status)}</Typography><Typography variant="caption">ID {row.documentId} · {row.obraV2Id ? `Vinculado: ${row.obraV2Id}` : 'Pendente'}{row.tipoObra ? ` · ${row.tipoObra}` : ''}</Typography></Button>)}</Box></Paper>
      <Paper sx={{ p: 2, flex: 1, minWidth: 0 }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">Obras-v2 ({filteredObras.length}/{obras.length})</Typography><Chip label={`${obras.length - usedObraIds.size} livres`} color="info" size="small" /></Stack><TextField fullWidth size="small" label="Buscar nome, sigla, código ou documentId" value={obraQuery} onChange={(event) => setObraQuery(event.target.value)} sx={{ my: 1.5 }} /><Box sx={{ height: 48 }} /><Box sx={{ maxHeight: 480, overflow: 'auto', mt: 1 }}>{filteredObras.map((row) => { const used = usedObraIds.has(row.documentId); return <Button key={row.documentId} onClick={() => setSelectedObra(row)} fullWidth sx={{ justifyContent: 'flex-start', textAlign: 'left', mb: 1, p: 1.2, border: 1, borderColor: selectedObra?.documentId === row.documentId ? 'primary.main' : 'divider', display: 'block' }}><Typography fontWeight={700}>{label(row.nomeObra)}</Typography><Typography variant="body2">{label(row.siglaObra)} · código {label(row.codObra)} · {label(row.local)}</Typography><Typography variant="caption">ID {row.documentId} · {used ? 'Já utilizada' : `Livre · ${label(row.status)}`}</Typography></Button>; })}</Box></Paper>
    </Stack>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mt={2}><Paper sx={{ p: 2, flex: 1 }}><Typography variant="overline">Monday selecionado</Typography><Typography variant="h6">{selectedMonday ? label(selectedMonday.nome) : 'Nenhum selecionado'}</Typography>{selectedMonday && <Typography variant="body2">Contrato {label(selectedMonday.numeroContrato)} · {label(selectedMonday.empresa)} · status {label(selectedMonday.status)} · ID {selectedMonday.documentId}</Typography>}</Paper><Paper sx={{ p: 2, flex: 1 }}><Typography variant="overline">Obra-v2 selecionada</Typography><Typography variant="h6">{selectedObra ? label(selectedObra.nomeObra) : 'Nenhuma selecionada'}</Typography>{selectedObra && <Typography variant="body2">{label(selectedObra.siglaObra)} · código {label(selectedObra.codObra)} · {label(selectedObra.local)} · ID {selectedObra.documentId}</Typography>}</Paper></Stack>
    <Stack direction="row" justifyContent="flex-end" mt={2}><Button variant="contained" disabled={!canLink || saving} onClick={() => setConfirmOpen(true)}>Vincular seleção</Button></Stack>
    <Dialog open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)}><DialogTitle>Confirmar vínculo</DialogTitle><DialogContent><Typography>Contrato Monday:</Typography><Typography fontWeight={700}>{label(selectedMonday?.nome)} / {selectedMonday?.documentId}</Typography><Typography mt={2}>Obra selecionada:</Typography><Typography fontWeight={700}>{label(selectedObra?.nomeObra)} / {selectedObra?.documentId}</Typography><Typography mt={2}>Ação: Vincular</Typography></DialogContent><DialogActions><Button disabled={saving} onClick={() => setConfirmOpen(false)}>Cancelar</Button><Button disabled={saving} onClick={() => void confirmLink()} variant="contained">{saving ? 'Vinculando...' : 'Confirmar'}</Button></DialogActions></Dialog>
  </Box>;
}
