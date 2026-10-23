import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AlertTitle,
  Box,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AdminUserEditModal, { type AdminUserEditValues } from '../components/AdminUserEditModal';
import AdminUsersEditTable from '../components/AdminUsersEditTable';
import useAdminUsers from '../hooks/useAdminUsers';
import { loginDoUsuario, migrarCredenciais, nomeDoUsuario, type AdminUser, type MigracaoCredenciais } from '../services/adminUsersApi';
import { CREDENCIAIS } from '../services/credenciais';

type Aviso = { message: string; severity: 'success' | 'error' } | null;
const erroDe = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);

// Tela central de usuários (só adm2): todas as contas do login, credenciais, situação, senha nova e exclusão das
// contas sem funcionário. Contrato: The Manuscript, funcionarios.md ("Usuários na WEB").
export default function CadastroUsuariosEditarPage() {
  const { users, loading, error, updateUser, deleteUser, definirSenha, reload } = useAdminUsers();
  const [search, setSearch] = useState('');
  const [soSemFuncionario, setSoSemFuncionario] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<Aviso>(null);
  const [senhaDe, setSenhaDe] = useState<AdminUser | null>(null);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [excluir, setExcluir] = useState<AdminUser | null>(null);
  const [migracao, setMigracao] = useState<MigracaoCredenciais | null>(null);
  const [migrando, setMigrando] = useState(false);

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }), []);
  const semFuncionario = users.filter((u) => !u.funcionario).length;

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      if (soSemFuncionario && user.funcionario) return false;
      if (!term) return true;
      const credenciais = CREDENCIAIS.filter((c) => user.funcionario?.credenciais[c.chave]).map((c) => c.rotulo).join(' ');
      return [nomeDoUsuario(user), loginDoUsuario(user), user.email ?? '', credenciais].some((t) => t.toLowerCase().includes(term));
    });
  }, [search, soSemFuncionario, users]);

  const handleSave = async (values: AdminUserEditValues) => {
    if (!editing) return;
    try {
      setSaving(true);
      setSubmitError(null);
      await updateUser({ uid: editing.uid, ativo: values.ativo, credenciais: values.credenciais });
      setEditing(null);
      setSnackbar({ message: 'Usuário atualizado.', severity: 'success' });
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

  const migrar = async (executar: boolean) => {
    try {
      setMigrando(true);
      setMigracao(await migrarCredenciais(executar));
      if (executar) await reload();
    } catch (e) {
      setSnackbar({ message: erroDe(e, 'Erro na migração das credenciais.'), severity: 'error' });
    } finally {
      setMigrando(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between">
          <Box>
            <Typography variant="h4" gutterBottom>Usuários</Typography>
            <Typography variant="body1" color="text.secondary">
              Todas as contas do login do sistema, com as credenciais de cada funcionário. Usuário novo nasce em Cadastros → Novo usuário.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" component={RouterLink} to="/cadastros/usuarios/novo">Novo usuário</Button>
            <Button variant="outlined" component={RouterLink} to="/cadastros">Voltar</Button>
          </Stack>
        </Stack>

        <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
              <TextField label="Filtrar por nome, login ou credencial" value={search} onChange={(e) => setSearch(e.target.value)} fullWidth />
              <FormControlLabel sx={{ flexShrink: 0 }} control={<Switch checked={soSemFuncionario} onChange={(e) => setSoSemFuncionario(e.target.checked)} />}
                label={`Só contas sem funcionário (${semFuncionario})`} />
            </Stack>

            {semFuncionario > 0 && !soSemFuncionario && (
              <Alert severity="info">
                {semFuncionario === 1 ? 'Há 1 conta' : `Há ${semFuncionario} contas`} sem funcionário (por exemplo, do antigo cadastro aberto).
                Exclua as que não reconhecer; para tornar alguém funcionário, cadastre-o em Novo usuário com o mesmo login.
              </Alert>
            )}

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
              onEdit={(user) => { setSubmitError(null); setEditing(user); }}
              onSenha={(user) => { setSenha(''); setConfirmacao(''); setSenhaDe(user); }}
              onExcluir={setExcluir}
              dateFormatter={dateFormatter}
            />
          </Stack>
        </Paper>

        <Accordion disableGutters variant="outlined">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>Migração das credenciais (troca de perfis)</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Uma vez, na troca: quem tem <strong>adm1</strong> passa a ter <strong>frentista</strong>, e os campos antigos adm1 e user saem dos
                funcionários. Simule antes para ver quantos mudam.
              </Typography>
              {migracao && (
                <Alert severity={migracao.executado ? 'success' : 'info'}>
                  {migracao.executado ? 'Migração feita' : 'Simulação'}: {migracao.alterados} de {migracao.funcionarios} funcionários
                  {migracao.executado ? ' alterados' : ' mudariam'}, {migracao.frentistas} com frentista.
                </Alert>
              )}
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={() => void migrar(false)} disabled={migrando}>Simular</Button>
                <Button variant="contained" color="warning" onClick={() => void migrar(true)} disabled={migrando || !migracao || migracao.executado || migracao.alterados === 0}>
                  Executar
                </Button>
              </Stack>
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Stack>

      <AdminUserEditModal
        open={Boolean(editing)}
        user={editing}
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

      {snackbar && (
        <Snackbar open autoHideDuration={5000} onClose={() => setSnackbar(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert onClose={() => setSnackbar(null)} severity={snackbar.severity} sx={{ width: '100%' }}>{snackbar.message}</Alert>
        </Snackbar>
      )}
    </Container>
  );
}
