import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Paper, Select, Stack, Switch, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { listConciliacao, reconcileFuncionario, type ConciliacaoRow, type ConciliacaoStatus } from '../services/conciliacaoApi';

const statusLabels: Record<ConciliacaoStatus, string> = { PRONTO: 'Pronto', PENDENTE: 'Pendente', CONFLITO: 'Conflito', SEM_AUTH: 'Sem Auth', JA_CONCILIADO: 'Já conciliado' };

export default function CadastroUsuariosConciliacaoPage() {
  const [rows, setRows] = useState<ConciliacaoRow[]>([]);
  const [filter, setFilter] = useState<'TODOS' | ConciliacaoStatus>('TODOS');
  const [selected, setSelected] = useState<ConciliacaoRow | null>(null);
  const [motoristaId, setMotoristaId] = useState('');
  const [nome, setNome] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [allowExisting, setAllowExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => { setLoading(true); try { setRows(await listConciliacao()); setError(null); } catch (err) { setError(err instanceof Error ? err.message : 'Falha ao carregar conciliação.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const visibleRows = useMemo(() => filter === 'TODOS' ? rows : rows.filter((row) => row.status === filter), [filter, rows]);

  const openRow = (row: ConciliacaoRow) => {
    setSelected(row); setNome(row.auth?.nome ?? row.motorista?.nome ?? ''); setAtivo(row.auth ? !row.auth.disabled : row.motorista?.ativo !== false);
    setMotoristaId(row.motorista?.id ?? (row.sugestoesMotorista.length === 1 ? row.sugestoesMotorista[0].id : '')); setAllowExisting(false); setError(null);
  };
  const save = async () => {
    if (!selected?.auth) return;
    try {
      setSaving(true); await reconcileFuncionario({ uid: selected.auth.uid, motoristaId: motoristaId || null, nome, ativo, perfis: { adm1: selected.autorizado?.adm1 === true, adm2: selected.autorizado?.adm2 === true, user: false, motorista: Boolean(motoristaId) }, allowExisting });
      setSelected(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha ao conciliar funcionário.'); } finally { setSaving(false); }
  };

  return <Container maxWidth="lg" sx={{ py: 3 }}><Stack spacing={3}>
    <Box><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}><Box><Typography variant="h4" gutterBottom>Conciliação de usuários</Typography><Typography color="text.secondary">Revise fontes legadas e confirme um funcionário por UID Auth. Nenhuma fonte legada é alterada.</Typography></Box><Button variant="outlined" component={RouterLink} to="/cadastros">Voltar</Button></Stack></Box>
    <Paper sx={{ p: 2 }}><Stack direction="row" spacing={1} flexWrap="wrap">{(['TODOS', 'PRONTO', 'PENDENTE', 'CONFLITO', 'SEM_AUTH', 'JA_CONCILIADO'] as const).map((value) => <Button key={value} variant={filter === value ? 'contained' : 'outlined'} onClick={() => setFilter(value)}>{value === 'TODOS' ? 'Todos' : statusLabels[value]}</Button>)}</Stack></Paper>
    {error && <Alert severity="error">{error}</Alert>}
    {loading ? <Typography>Carregando candidatos...</Typography> : <Stack spacing={1}>{visibleRows.map((row) => <Paper key={row.auth?.uid ?? `motorista-${row.motorista?.id}`} sx={{ p: 2 }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between"><Box><Typography fontWeight="bold">{row.auth?.nome ?? row.motorista?.nome ?? '-'}</Typography><Typography variant="body2" color="text.secondary">Auth: {row.auth?.email ?? 'não encontrado'} · 00-autorizados: {row.autorizado?.id ?? 'não encontrado'} · motorista: {row.motorista?.id ?? (row.sugestoesMotorista.length ? `${row.sugestoesMotorista.length} sugestões` : 'não associado')}</Typography></Box><Stack direction="row" spacing={1} alignItems="center"><Chip label={statusLabels[row.status]} color={row.status === 'PRONTO' ? 'success' : row.status === 'JA_CONCILIADO' ? 'info' : 'default'} /><Button variant="contained" size="small" disabled={!row.auth} onClick={() => openRow(row)}>Revisar / conciliar</Button></Stack></Stack></Paper>)}</Stack>}
  </Stack>
  <Dialog open={Boolean(selected)} onClose={saving ? undefined : () => setSelected(null)} fullWidth maxWidth="sm"><DialogTitle>Revisar funcionário</DialogTitle><DialogContent dividers><Stack spacing={2} mt={1}>{selected?.status === 'JA_CONCILIADO' && <Alert severity="warning">Já existe um funcionário para este UID. Marque revisão explícita para substituir os dados.</Alert>}<TextField label="UID Auth" value={selected?.auth?.uid ?? ''} InputProps={{ readOnly: true }} fullWidth /><TextField label="E-mail Auth" value={selected?.auth?.email ?? ''} InputProps={{ readOnly: true }} fullWidth /><TextField label="Nome final" value={nome} onChange={(event) => setNome(event.target.value)} fullWidth /><FormControlLabel control={<Switch checked={ativo} onChange={(event) => setAtivo(event.target.checked)} />} label={ativo ? 'Funcionário ativo' : 'Funcionário inativo'} /><Select value={motoristaId} displayEmpty onChange={(event) => setMotoristaId(event.target.value)} fullWidth><MenuItem value="">Sem motorista</MenuItem>{selected?.sugestoesMotorista.map((motorista) => <MenuItem key={motorista.id} value={motorista.id}>{motorista.nome} · ordem {motorista.ordem ?? 0}</MenuItem>)}</Select><FormControlLabel control={<Switch checked={allowExisting} onChange={(event) => setAllowExisting(event.target.checked)} />} label="Permitir revisão de funcionário já conciliado" /></Stack></DialogContent><DialogActions><Button onClick={() => setSelected(null)} disabled={saving}>Cancelar</Button><Button variant="contained" onClick={() => void save()} disabled={saving || !selected?.auth || !nome.trim()}>Confirmar</Button></DialogActions></Dialog>
  </Container>;
}
