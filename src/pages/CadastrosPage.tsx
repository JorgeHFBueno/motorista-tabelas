import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import useAdminUsers from '../hooks/useAdminUsers';
import { useAuth } from '../contexts/AuthContext';
import CadastroVeiculoForm from '../components/CadastroVeiculoForm';

export default function CadastrosPage() {
  const { users, loading, error, createUser, deleteUser } = useAdminUsers();
  const { isAdmin } = useAuth();

  const [dialogAberto, setDialogAberto] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [],
  );

  const formatDate = (value?: string) => {
    if (!value) return '—';
    const asNumber = Number(value);
    const date = Number.isFinite(asNumber) ? new Date(asNumber) : new Date(value);
    return isNaN(date.getTime()) ? value : dateFormatter.format(date);
  };

  const handleAbrirDialog = () => {
    setDialogAberto(true);
    setActionError(null);
  };

  const handleFecharDialog = () => {
    setDialogAberto(false);
    setEmail('');
    setPassword('');
    setDisplayName('');
    setSaving(false);
  };

  const handleCreateUser = async () => {
    setActionError(null);
    if (!email || !password) {
      setActionError('Informe email e senha para criar o usuário.');
      return;
    }

    try {
      setSaving(true);
      await createUser({ email, password, displayName: displayName || undefined });
      handleFecharDialog();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (uid: string) => {
    if (!isAdmin) return;
    const confirm = window.confirm('Deseja realmente excluir este usuário?');
    if (!confirm) return;
    try {
      await deleteUser(uid);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Cadastros
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Administre usuários e veículos do sistema. Algumas ações podem ser restritas a administradores.
          </Typography>
        </Box>

        <Paper elevation={1} sx={{ p: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} mb={2} alignItems={{ sm: 'center' }}>
            <Box>
              <Typography variant="h6">Usuários</Typography>
              <Typography variant="body2" color="text.secondary">
                Lista semelhante ao Firebase Auth. Criação e remoção dependem do endpoint admin.
              </Typography>
            </Box>
            <Button variant="contained" onClick={handleAbrirDialog} disabled={!isAdmin}>
              Adicionar usuário
            </Button>
          </Stack>

          {!isAdmin && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Apenas administradores podem criar ou excluir usuários. Entre em contato com o responsável caso precise de acesso.
            </Alert>
          )}

          {loading && <LinearProgress sx={{ mb: 2 }} />}
          {error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error.message}
              <br />
              Certifique-se de que o backend de administração (Firebase Admin) esteja exposto em /api/admin/users.
            </Alert>
          )}

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Nome</TableCell>
                <TableCell>Provedor</TableCell>
                <TableCell>Criado em</TableCell>
                <TableCell>Último login</TableCell>
                <TableCell>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.uid} hover>
                  <TableCell>{user.email ?? '—'}</TableCell>
                  <TableCell>{user.displayName ?? '—'}</TableCell>
                  <TableCell>{user.providerId ?? '—'}</TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell>{formatDate(user.lastLoginAt)}</TableCell>
                  <TableCell>
                    <Button
                      color="error"
                      size="small"
                      onClick={() => handleDelete(user.uid)}
                      disabled={!isAdmin}
                    >
                      Excluir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary">
                      Nenhum usuário encontrado.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>

        <Paper elevation={1} sx={{ p: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} mb={2} alignItems={{ sm: 'center' }}>
            <Box>
              <Typography variant="h6">Veículos</Typography>
              <Typography variant="body2" color="text.secondary">
                Cadastro de placas/veículos utilizado anteriormente na Frota.
              </Typography>
            </Box>
            <CadastroVeiculoForm buttonLabel="Cadastrar veículo" />
          </Stack>
          <Alert severity="info">
            O cadastro de veículos foi movido para esta página. Use o botão acima para incluir novos registros.
          </Alert>
        </Paper>
      </Stack>

      <Dialog open={dialogAberto} onClose={handleFecharDialog} fullWidth maxWidth="sm">
        <DialogTitle>Adicionar usuário</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              fullWidth
            />
            <TextField
              label="Senha"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              fullWidth
            />
            <TextField
              label="Nome (opcional)"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              fullWidth
            />
            <Alert severity="info">
              Esta ação utiliza o endpoint admin (/api/admin/users). Caso não esteja implementado, será exibido um erro.
            </Alert>
            {actionError && <Alert severity="error">{actionError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleFecharDialog} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleCreateUser} variant="contained" disabled={saving || !isAdmin}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}