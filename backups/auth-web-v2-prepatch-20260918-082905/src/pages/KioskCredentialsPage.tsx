import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, Navigate } from 'react-router-dom';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Alert, Box, Button, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Snackbar, Stack, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import useAdminUsers from '../hooks/useAdminUsers';
import KioskQrDialog from '../components/kiosk/KioskQrDialog';
import { KioskPinStatusChip, KioskQrStatusChip } from '../components/kiosk/KioskCredentialStatusChip';
import { getKioskCredentialStatus, provisionKioskCredential, revokeKioskQr, type KioskCredentialStatus, type ProvisionKioskCredentialResponse } from '../services/kioskCredentials';
import { formatKioskUpdatedAt, kioskFunctionErrorMessage, uniqueUidBatches } from '../services/kioskCredentialsUtils';
import type { AdminUser } from '../services/adminUsersApi';

type PendingAction = { type: 'provision' | 'revoke'; user: AdminUser } | null;
const userName = (user: AdminUser) => user.funcionario?.nome?.trim() || user.uid;

export default function KioskCredentialsPage() {
  const { currentUser, loading: authLoading } = useAuth();
  const { loading: profileLoading, profile, error: profileError } = useAuthorizationProfile(currentUser, authLoading, { allowLegacyFallback: false });
  const { users, loading: usersLoading, error: usersError, reload } = useAdminUsers();
  const [statusByUid, setStatusByUid] = useState<Record<string, KioskCredentialStatus>>({});
  const [statusLoading, setStatusLoading] = useState(false); const [statusError, setStatusError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null); const [submitting, setSubmitting] = useState(false);
  const [qrCredential, setQrCredential] = useState<ProvisionKioskCredentialResponse | null>(null); const [snackbar, setSnackbar] = useState<string | null>(null);
  const authorized = profile?.source === 'funcionarios' && profile.ativo === true && profile.adm2 === true;
  const employees = useMemo(() => users.filter((user) => Boolean(user.funcionario)), [users]);
  const loadStatuses = useCallback(async () => {
    const batches = uniqueUidBatches(employees.map((user) => user.uid));
    if (!batches.length) { setStatusByUid({}); return; }
    setStatusLoading(true); setStatusError(null);
    try { const results = await Promise.all(batches.map(getKioskCredentialStatus)); setStatusByUid(Object.fromEntries(results.flat().map((status) => [status.uid, status]))); }
    catch (error) { setStatusError(kioskFunctionErrorMessage(error)); }
    finally { setStatusLoading(false); }
  }, [employees]);
  useEffect(() => { if (authorized && !usersLoading) void loadStatuses(); }, [authorized, usersLoading, loadStatuses]);
  useEffect(() => () => setQrCredential(null), []);
  const submit = async () => {
    if (!pending || submitting) return; setSubmitting(true);
    try {
      if (pending.type === 'provision') { const result = await provisionKioskCredential(pending.user.uid); setQrCredential(result); setSnackbar(result.replaced ? 'Novo QR emitido.' : 'QR emitido.'); }
      else { await revokeKioskQr(pending.user.uid); setSnackbar('QR revogado com sucesso.'); }
      setPending(null); await loadStatuses();
    } catch (error) { setSnackbar(kioskFunctionErrorMessage(error)); }
    finally { setSubmitting(false); }
  };
  const columns = useMemo<GridColDef<AdminUser>[]>(() => [
    { field: 'nome', headerName: 'Funcionário', minWidth: 210, flex: 1, valueGetter: (_value, row) => userName(row) },
    { field: 'uid', headerName: 'UID', minWidth: 180, flex: 1 }, { field: 'ativo', headerName: 'Ativo', minWidth: 100, renderCell: (params) => params.row.funcionario?.ativo ? 'Sim' : 'Não' },
    { field: 'qr', headerName: 'QR', minWidth: 130, sortable: false, renderCell: (params) => <KioskQrStatusChip status={statusByUid[params.row.uid]} /> },
    { field: 'pin', headerName: 'PIN', minWidth: 145, sortable: false, renderCell: (params) => <KioskPinStatusChip status={statusByUid[params.row.uid]} /> },
    { field: 'updatedAt', headerName: 'Atualizado em', minWidth: 165, valueGetter: (_value, row) => formatKioskUpdatedAt(statusByUid[row.uid]?.updatedAt) },
    { field: 'updatedBy', headerName: 'Atualizado por', minWidth: 170, valueGetter: (_value, row) => statusByUid[row.uid]?.updatedBy ?? '—' },
    { field: 'actions', headerName: 'Ações', minWidth: 250, sortable: false, filterable: false, renderCell: (params) => {
      const status = statusByUid[params.row.uid]; const active = params.row.funcionario?.ativo === true; const configured = status?.qrConfigured === true; const revoked = status?.qrRevoked === true;
      return <Stack direction="row" spacing={1} alignItems="center">
        {active && (!configured || revoked) && <Button size="small" onClick={() => setPending({ type: 'provision', user: params.row })}>{configured ? 'Emitir novo QR' : 'Emitir QR'}</Button>}
        {active && configured && !revoked && <Button size="small" onClick={() => setPending({ type: 'provision', user: params.row })}>Substituir QR</Button>}
        {configured && !revoked && <Button size="small" color="error" onClick={() => setPending({ type: 'revoke', user: params.row })}>Revogar QR</Button>}
      </Stack>;
    } },
  ], [statusByUid]);
  if (authLoading || profileLoading) return <Stack alignItems="center" p={4}><CircularProgress /></Stack>;
  if (profileError || !authorized) return <Navigate to="/acesso-negado" replace state={{ reason: 'missing-admin' }} />;
  const isRotation = pending?.type === 'provision' && statusByUid[pending.user.uid]?.qrConfigured && !statusByUid[pending.user.uid]?.qrRevoked;
  return <Container maxWidth="xl" sx={{ py: 3 }}><Stack spacing={3}>
    <Box><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}><Box><Typography variant="h4">Credenciais Kiosk</Typography><Typography color="text.secondary">Emita, substitua ou revogue QR Codes usados para identificação no terminal de abastecimento.</Typography></Box><Button variant="outlined" component={RouterLink} to="/cadastros">Voltar para Cadastros</Button></Stack></Box>
    <Paper elevation={1} sx={{ p: 2 }}><Stack spacing={2}>{usersError && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void reload()}>Tentar novamente</Button>}>Não foi possível carregar funcionários.</Alert>}{statusError && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void loadStatuses()}>Tentar novamente</Button>}>{statusError}</Alert>}<DataGrid autoHeight rows={employees} columns={columns} loading={usersLoading || statusLoading} getRowId={(row) => row.uid} pageSizeOptions={[10, 25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }} disableRowSelectionOnClick /></Stack></Paper>
  </Stack>
  <Dialog open={Boolean(pending)} onClose={() => !submitting && setPending(null)}><DialogTitle>{pending?.type === 'revoke' ? `Revogar QR de ${pending && userName(pending.user)}?` : `${isRotation ? 'Substituir' : 'Emitir'} QR para ${pending && userName(pending.user)}?`}</DialogTitle><DialogContent><Typography>{pending?.type === 'revoke' ? 'O QR atual deixará de autenticar no Kiosk.' : isRotation ? 'O QR atualmente utilizado deixará de funcionar imediatamente após a substituição.' : 'O QR será exibido apenas uma vez. Salve ou imprima antes de fechar.'}</Typography></DialogContent><DialogActions><Button disabled={submitting} onClick={() => setPending(null)}>Cancelar</Button><Button variant="contained" color={pending?.type === 'revoke' ? 'error' : 'primary'} disabled={submitting} onClick={() => void submit()}>{submitting ? 'Aguarde...' : 'Confirmar'}</Button></DialogActions></Dialog>
  <KioskQrDialog credential={qrCredential} onClose={() => setQrCredential(null)} /><Snackbar open={Boolean(snackbar)} autoHideDuration={4000} onClose={() => setSnackbar(null)} message={snackbar} />
  </Container>;
}
