import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Container,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AdminUserEditModal, { type AdminUserEditValues } from '../components/AdminUserEditModal';
import AdminUsersEditTable from '../components/AdminUsersEditTable';
import useAdminUsers from '../hooks/useAdminUsers';
import type { AdminUser } from '../services/adminUsersApi';

function getDisplayName(user: AdminUser) {
  const displayName = user.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  const authorizationName = user.authorization.nome?.trim();
  if (authorizationName) {
    return authorizationName;
  }

  const email = user.email?.trim().toLowerCase();
  if (email) {
    return email.split('@')[0];
  }

  return user.uid;
}

function getFilterProfile(user: AdminUser) {
  if (!user.authorization.exists) {
    return 'sem autorizacao';
  }

  return user.authorization.profile.toLowerCase();
}

export default function CadastroUsuariosEditarPage() {
  const { users, loading, error, updateUser, reload } = useAdminUsers();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }), []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return users;
    }

    return users.filter((user) => {
      const normalizedEmail = user.email?.toLowerCase() ?? '';
      return (
        getDisplayName(user).toLowerCase().includes(term)
        || normalizedEmail.includes(term)
        || getFilterProfile(user).includes(term)
      );
    });
  }, [search, users]);

  const handleSave = async (values: AdminUserEditValues) => {
    if (!editing) {
      return;
    }

    try {
      setSaving(true);
      setSubmitError(null);
      await updateUser({
        uid: editing.uid,
        disabled: values.disabled,
        perfil: values.perfil,
      });
      setEditing(null);
      setSnackbar({ message: 'Usuario atualizado com sucesso.', severity: 'success' });
    } catch (saveError) {
      setSubmitError(saveError instanceof Error ? saveError.message : 'Erro ao atualizar usuario.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between">
            <Box>
              <Typography variant="h4" gutterBottom>
                Editar usuarios
              </Typography>
              <Typography variant="body1" color="text.secondary">
                A listagem principal vem do Firebase Authentication. Esta tela exige usuario autenticado com permissao <strong>adm2</strong>. Sem autorizacao cadastrada = Motorista
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="outlined" component={RouterLink} to="/cadastros">
                Voltar
              </Button>
            </Stack>
          </Stack>
        </Box>

        <Paper elevation={1} sx={{ p: 3 }}>
          <Stack spacing={2}>
            <TextField
              label="Filtrar por nome, email ou perfil"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              fullWidth
            />

            {error && (
              <Alert
                severity="error"
                action={(
                  <Button color="inherit" size="small" onClick={() => void reload()}>
                    Tentar novamente
                  </Button>
                )}
              >
                <AlertTitle>Falha ao carregar usuarios</AlertTitle>
                {error.message || 'Nao foi possivel carregar usuarios.'}
              </Alert>
            )}

            {!loading && !error && filteredUsers.length === 0 && (
              <Alert severity="info">
                Nenhum usuario encontrado para o filtro informado.
              </Alert>
            )}

            <AdminUsersEditTable
              rows={filteredUsers}
              loading={loading}
              onEdit={(user) => {
                setSubmitError(null);
                setEditing(user);
              }}
              dateFormatter={dateFormatter}
            />
          </Stack>
        </Paper>
      </Stack>

      <AdminUserEditModal
        open={Boolean(editing)}
        user={editing}
        onClose={() => {
          setEditing(null);
          setSubmitError(null);
        }}
        onSave={handleSave}
        saving={saving}
        submitError={submitError}
      />

      {snackbar && (
        <Snackbar
          open={Boolean(snackbar)}
          autoHideDuration={4000}
          onClose={() => setSnackbar(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setSnackbar(null)} severity={snackbar.severity} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      )}
    </Container>
  );
}
