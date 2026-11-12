import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  AlertTitle,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AdminUserEditModal, { type AdminUserEditValues, type ModoEdicaoUsuario } from '../components/AdminUserEditModal';
import AdminUsersEditTable from '../components/AdminUsersEditTable';
import KioskCredenciaisDialog from '../components/kiosk/KioskCredenciaisDialog';
import ImportarFuncionariosFridayDialog from '../components/ImportarFuncionariosFridayDialog';
import useAdminUsers from '../hooks/useAdminUsers';
import { loginDoUsuario, nomeDoUsuario, type AdminUser } from '../services/adminUsersApi';
import { CREDENCIAIS } from '../services/credenciais';
import { useTituloPagina } from '../components/cabecalhoPagina';
import { getKioskCredentialStatus, type KioskCredentialStatus } from '../services/kioskCredentials';
import { kioskFunctionErrorMessage, uniqueUidBatches } from '../services/kioskCredentialsUtils';
import { kioskCredentialEligibleUsers } from '../services/kioskCredentialEligibility';

type Aviso = { message: string; severity: 'success' | 'error' } | null;
const erroDe = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);

// Tela central de usuários (Cadastros: escritorio ou adm2; só o adm2 mexe em adm2 e retr0): todas as contas do login (menos as dos clientes do portal), credenciais, situação, senha nova e exclusão das
// contas sem funcionário, e o QR e o PIN do Kiosk de cada frentista (antes, a tela /cadastros/usuarios/kiosk). Contrato: The Manuscript, funcionarios.md ("Usuários na WEB").
export default function CadastroUsuariosEditarPage() {
  useTituloPagina('Usuários');
  // A save changes only that row (the server answers with the updated person): reloading the whole list meant the
  // adminApi listing every account again, with "carregando" in the table.
  const { users, loading, error, reload, updateUser, deleteUser, definirSenha } = useAdminUsers({ refreshOnChange: false });
  const [search, setSearch] = useState('');
  // Starts showing only active people; the switch shows the inactive ones too.
  const [apenasAtivos, setApenasAtivos] = useState(true);
  const [editing, setEditing] = useState<{ user: AdminUser; modo: ModoEdicaoUsuario } | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  // Novo usuário volta para cá depois de salvar.
  const usuarioCriado = (location.state as { userCreated?: boolean } | null)?.userCreated === true;
  const [snackbar, setSnackbar] = useState<Aviso>(() => (usuarioCriado ? { message: 'Usuário cadastrado.', severity: 'success' } : null));
  useEffect(() => {
    if (usuarioCriado) navigate(location.pathname, { replace: true });
  }, [usuarioCriado, location.pathname, navigate]);
  const [senhaDe, setSenhaDe] = useState<AdminUser | null>(null);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [excluir, setExcluir] = useState<AdminUser | null>(null);
  const [kioskDe, setKioskDe] = useState<AdminUser | null>(null);
  const [importando, setImportando] = useState(false);
  // Stable callbacks: new functions on every render made the table rebuild all its columns on each keystroke of the filter.
  const abrirEdicao = useCallback((user: AdminUser, modo: ModoEdicaoUsuario) => { setSubmitError(null); setEditing({ user, modo }); }, []);
  const abrirSenha = useCallback((user: AdminUser) => { setSenha(''); setConfirmacao(''); setSenhaDe(user); }, []);
  // Kiosk QR/PIN status of every eligible person, fetched as soon as the list arrives (as the old Kiosk screen did): the
  // Function's cold start (~4 s when idle) happens while the table is on screen, and the popup opens with the data ready.
  const [kioskStatus, setKioskStatus] = useState<Record<string, KioskCredentialStatus>>({});
  const [kioskErro, setKioskErro] = useState<string | null>(null);
  const carregarKiosk = useCallback(async (uids: string[]) => {
    const lotes = uniqueUidBatches(uids);
    if (!lotes.length) return;
    setKioskErro(null);
    try {
      const resultados = await Promise.all(lotes.map(getKioskCredentialStatus));
      setKioskStatus((atual) => ({ ...atual, ...Object.fromEntries(resultados.flat().map((s) => [s.uid, s])) }));
    } catch (e) {
      setKioskErro(kioskFunctionErrorMessage(e));
    }
  }, []);
  // Refetches only when the set of eligible people changes, not on every edit of the list.
  const elegiveisKiosk = useMemo(() => kioskCredentialEligibleUsers(users).map((u) => u.uid).join(','), [users]);
  useEffect(() => {
    if (elegiveisKiosk) void carregarKiosk(elegiveisKiosk.split(','));
  }, [elegiveisKiosk, carregarKiosk]);

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }), []);
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      if (apenasAtivos && user.funcionario?.ativo !== true) return false;
      if (!term) return true;
      const credenciais = CREDENCIAIS.filter((c) => user.funcionario?.credenciais[c.chave]).map((c) => c.rotulo).join(' ');
      return [nomeDoUsuario(user), loginDoUsuario(user), user.email ?? '', credenciais].some((t) => t.toLowerCase().includes(term));
    });
  }, [search, apenasAtivos, users]);

  const handleSave = async (values: AdminUserEditValues) => {
    if (!editing) return;
    try {
      setSaving(true);
      setSubmitError(null);
      await updateUser({ uid: editing.user.uid, ativo: values.ativo, credenciais: values.credenciais });
      const nome = nomeDoUsuario(editing.user);
      setSnackbar({ message: editing.modo === 'situacao' ? `${nome} ${values.ativo ? 'ativado' : 'desativado'}.` : editing.modo === 'credenciais' ? `Credenciais de ${nome} atualizadas.` : 'Usuário atualizado.', severity: 'success' });
      setEditing(null);
    } catch (saveError) {
      setSubmitError(erroDe(saveError, 'Erro ao atualizar o usuário.'));
    } finally {
      setSaving(false);
    }
  };

  const salvarSenha = async () => {
    if (!senhaDe) return;
    if (senha.length < 6) { setSnackbar({ message: 'A senha precisa ter ao menos 6 caracteres.', severity: 'error' }); return; }
    if (senha !== confirmacao) { setSnackbar({ message: 'As senhas não coincidem.', severity: 'error' }); return; }
    try {
      setSaving(true);
      await definirSenha(senhaDe.uid, senha);
      setSnackbar({ message: `Senha de ${nomeDoUsuario(senhaDe)} definida; as sessões abertas foram encerradas.`, severity: 'success' });
      setSenhaDe(null);
    } catch (e) {
      setSnackbar({ message: erroDe(e, 'Erro ao definir a senha.'), severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluir) return;
    try {
      setSaving(true);
      await deleteUser(excluir.uid);
      setSnackbar({ message: 'Conta excluída.', severity: 'success' });
      setExcluir(null);
    } catch (e) {
      setSnackbar({ message: erroDe(e, 'Erro ao excluir a conta.'), severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
              <TextField label="Filtrar por nome, login ou credencial" value={search} onChange={(e) => setSearch(e.target.value)} fullWidth />
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ flexShrink: 0 }}>
                <FormControlLabel sx={{ mr: 0 }} control={<Switch checked={apenasAtivos} onChange={(e) => setApenasAtivos(e.target.checked)} />} label="Apenas ativos" />
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" onClick={() => setImportando(true)} sx={{ whiteSpace: 'nowrap' }}>Importar</Button>
                  <Button variant="contained" component={RouterLink} to="/cadastros/usuarios/novo" sx={{ whiteSpace: 'nowrap' }}>Novo usuário</Button>
                </Stack>
              </Stack>
            </Stack>

            {error && (
              <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void reload()}>Tentar novamente</Button>}>
                <AlertTitle>Falha ao carregar os usuários</AlertTitle>
                {error.message || 'Não foi possível carregar os usuários.'}
              </Alert>
            )}

            {!loading && !error && filteredUsers.length === 0 && <Alert severity="info">Nenhum usuário encontrado para o filtro.</Alert>}

            <AdminUsersEditTable
              rows={filteredUsers}
              loading={loading}
              onEdit={abrirEdicao}
              onSenha={abrirSenha}
              onExcluir={setExcluir}
              onKiosk={setKioskDe}
              dateFormatter={dateFormatter}
            />
          </Stack>
        </Paper>
      </Stack>

      <AdminUserEditModal
        open={Boolean(editing)}
        user={editing?.user ?? null}
        modo={editing?.modo ?? 'completo'}
        dateFormatter={dateFormatter}
        onClose={() => { setEditing(null); setSubmitError(null); }}
        onSave={handleSave}
        saving={saving}
        submitError={submitError}
      />

      <Dialog open={Boolean(senhaDe)} onClose={saving ? undefined : () => setSenhaDe(null)} fullWidth maxWidth="xs">
        <DialogTitle>Definir senha nova</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">{senhaDe ? `${nomeDoUsuario(senhaDe)} — ${loginDoUsuario(senhaDe)}` : ''}</Typography>
            <TextField label="Senha nova" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} fullWidth />
            <TextField label="Confirmar senha" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} fullWidth />
            <Alert severity="info">As sessões abertas dessa conta são encerradas. Avise a pessoa da senha nova.</Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSenhaDe(null)} disabled={saving}>Cancelar</Button>
          <Button variant="contained" onClick={() => void salvarSenha()} disabled={saving}>Definir senha</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(excluir)} onClose={saving ? undefined : () => setExcluir(null)} fullWidth maxWidth="xs">
        <DialogTitle>Excluir conta</DialogTitle>
        <DialogContent>
          <Typography>
            Excluir a conta <strong>{excluir ? loginDoUsuario(excluir) : ''}</strong>? Ela não tem funcionário e some do login do sistema. Não tem volta.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExcluir(null)} disabled={saving}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={() => void confirmarExclusao()} disabled={saving}>Excluir</Button>
        </DialogActions>
      </Dialog>

      <KioskCredenciaisDialog user={kioskDe} status={kioskDe ? kioskStatus[kioskDe.uid] : undefined} erro={kioskErro}
        onRecarregar={() => (kioskDe ? carregarKiosk([kioskDe.uid]) : Promise.resolve())}
        onClose={() => setKioskDe(null)} onAviso={(message, erro) => setSnackbar({ message, severity: erro ? 'error' : 'success' })} />

      <ImportarFuncionariosFridayDialog open={importando} onClose={() => setImportando(false)} onImportou={() => void reload()} />

      {snackbar && (
        <Snackbar open autoHideDuration={5000} onClose={() => setSnackbar(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert onClose={() => setSnackbar(null)} severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
        </Snackbar>
      )}
    </Container>
  );
}
