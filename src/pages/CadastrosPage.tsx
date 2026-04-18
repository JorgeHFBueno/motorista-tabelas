import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import useAdminUsers from '../hooks/useAdminUsers';
import { useAuth } from '../contexts/AuthContext';
import ObrasSection from '../components/ObrasSection';
import CadastroBasicoForm from '../components/CadastroBasicoForm';

export default function CadastrosPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { createUser } = useAdminUsers({ loadOnMount: false, refreshOnChange: false });
  const { isAdmin } = useAuth();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (location.state && (location.state as { vehicleCreated?: boolean }).vehicleCreated) {
      setSnackbar({ message: 'VeÃ­culo cadastrado com sucesso.', severity: 'success' });
      navigate(location.pathname, { replace: true });
    }
  }, [location.pathname, location.state, navigate]);

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

  const cardActionStackSx = {
    width: { xs: '100%', sm: 'auto' },
    flexWrap: 'wrap' as const,
    justifyContent: { xs: 'stretch', sm: 'flex-end' },
    alignItems: 'stretch',
    '& > *': {
      flex: { xs: '1 1 100%', sm: '0 0 auto' },
      minWidth: { sm: 168 },
      minHeight: 40,
    },
  };

  const cardPaperSx = {
    p: 3,
    height: '100%',
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Cadastros
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Administre usuários e veículos do sistema.
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(3, minmax(0, 1fr))',
            },
            gap: 3,
            alignItems: 'stretch',
          }}
        >
          <Paper elevation={1} sx={cardPaperSx}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              spacing={2}
              mb={2}
              alignItems={{ sm: 'center' }}
            >
              <Box>
                <Typography variant="h6">Usuários</Typography>
                <Typography variant="body2" color="text.secondary">
                  Cadastro de funcionários.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={cardActionStackSx}>
                <Button variant="contained" disabled>
                  Cadastrar
                </Button>
                <Button variant="outlined" disabled>
                  Editar
                </Button>
              </Stack>
            </Stack>
          </Paper>

          <ObrasSection />

          <Paper elevation={1} sx={cardPaperSx}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              spacing={2}
              mb={2}
              alignItems={{ sm: 'center' }}
            >
              <Box>
                <Typography variant="h6">Categorias</Typography>
                <Typography variant="body2" color="text.secondary">
                  Cadastro de categorias para manutenções.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={cardActionStackSx}>
                <CadastroBasicoForm
                  buttonLabel="Cadastrar"
                  dialogTitle="Adicionar categoria"
                  collectionName="notas-categorias"
                  successMessage="Categoria cadastrada com sucesso."
                />
                <Button variant="outlined" component={RouterLink} to="/cadastros/editar/categorias">
                  Editar
                </Button>
              </Stack>
            </Stack>
          </Paper>

          <Paper elevation={1} sx={cardPaperSx}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              spacing={2}
              mb={2}
              alignItems={{ sm: 'center' }}
            >
              <Box>
                <Typography variant="h6">Fornecedores</Typography>
                <Typography variant="body2" color="text.secondary">
                  Cadastro de fornecedores para manutenções.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={cardActionStackSx}>
                <CadastroBasicoForm
                  buttonLabel="Cadastrar"
                  dialogTitle="Adicionar fornecedor"
                  collectionName="notas-fornecedores"
                  successMessage="Fornecedor cadastrado com sucesso."
                  autoGenerateFornecedorNumero
                />
                <Button variant="outlined" component={RouterLink} to="/cadastros/editar/fornecedores">
                  Editar
                </Button>
              </Stack>
            </Stack>
          </Paper>

          <Paper elevation={1} sx={cardPaperSx}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              spacing={2}
              mb={2}
              alignItems={{ sm: 'center' }}
            >
              <Box>
                <Typography variant="h6">Veículos</Typography>
                <Typography variant="body2" color="text.secondary">
                  Cadastro de Veículos.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={cardActionStackSx}>
                <Button variant="contained" component={RouterLink} to="/cadastros/veiculos/novo">
                  Cadastrar
                </Button>
                <Button variant="outlined" component={RouterLink} to="/frota">
                  Editar
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Box>
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
              Esta aÃ§Ã£o utiliza o endpoint admin (/api/admin/users). Caso nÃ£o esteja implementado, serÃ¡ exibido um erro.
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
