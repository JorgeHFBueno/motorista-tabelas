import { useState } from 'react';
import { Alert, Box, Button, Container, Dialog,
  DialogActions, DialogContent, DialogTitle,
  Paper, Stack, TextField, Typography } from '@mui/material';
import useAdminUsers from '../hooks/useAdminUsers';
import { useAuth } from '../contexts/AuthContext';
import CadastroVeiculoForm from '../components/CadastroVeiculoForm';
import ObrasSection from '../components/ObrasSection';
import CadastroBasicoForm from '../components/CadastroBasicoForm';
import EditarEmBreveButton from '../components/EditarEmBreveButton';

export default function CadastrosPage() {
  const { createUser } = useAdminUsers({ loadOnMount: false, refreshOnChange: false });
  const { isAdmin } = useAuth();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
              <Typography variant="body2" color="text.secondary">Cadastro de funcionários.</Typography>              
            </Box>
             <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={handleAbrirDialog} disabled={!isAdmin}>
                Cadastrar funcionário
              </Button>
              <EditarEmBreveButton />
            </Stack>
          </Stack>          
        </Paper>

        <Paper elevation={1} sx={{ p: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} mb={2} alignItems={{ sm: 'center' }}>
            <Box>
              <Typography variant="h6">Veículos</Typography>
              <Typography variant="body2" color="text.secondary">Cadastro de veículos/máquinas.</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <CadastroVeiculoForm buttonLabel="Cadastrar veículo" />
              <EditarEmBreveButton />
            </Stack>
          </Stack>          
        </Paper>
        <ObrasSection />
        <Paper elevation={1} sx={{ p: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} mb={2} alignItems={{ sm: 'center' }}>
            <Box>
              <Typography variant="h6">Categorias</Typography>
              <Typography variant="body2" color="text.secondary">Cadastro de categorias para manutenções.</Typography>
              
            </Box>
            <Stack direction="row" spacing={1}>
              <CadastroBasicoForm
                buttonLabel="Cadastrar categoria"
                dialogTitle="Adicionar categoria"
                collectionName="notas-categorias"
                successMessage="Categoria cadastrada com sucesso."
              />
              <EditarEmBreveButton />
            </Stack>
          </Stack>
        </Paper>

        <Paper elevation={1} sx={{ p: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} mb={2} alignItems={{ sm: 'center' }}>
            <Box>
              <Typography variant="h6">Fornecedores</Typography>
              <Typography variant="body2" color="text.secondary">Cadastro de fornecedores para manutenções.</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <CadastroBasicoForm
                buttonLabel="Cadastrar fornecedor"
                dialogTitle="Adicionar fornecedor"
                collectionName="notas-fornecedores"
                successMessage="Fornecedor cadastrado com sucesso."
              />
              <EditarEmBreveButton />
            </Stack>
          </Stack>
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