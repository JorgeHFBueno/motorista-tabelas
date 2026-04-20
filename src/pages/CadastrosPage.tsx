import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import ObrasSection from '../components/ObrasSection';
import CadastroBasicoForm from '../components/CadastroBasicoForm';

export default function CadastrosPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const navigationState = location.state as { vehicleCreated?: boolean; userCreated?: boolean } | null;

    if (navigationState?.vehicleCreated) {
      setSnackbar({ message: 'Veiculo cadastrado com sucesso.', severity: 'success' });
      navigate(location.pathname, { replace: true });
      return;
    }

    if (navigationState?.userCreated) {
      setSnackbar({ message: 'Usuario cadastrado com sucesso.', severity: 'success' });
      navigate(location.pathname, { replace: true });
    }
  }, [location.pathname, location.state, navigate]);

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
            Administre usuarios e veiculos do sistema.
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
                <Typography variant="h6">Usuarios</Typography>
                <Typography variant="body2" color="text.secondary">
                  Cadastro de funcionarios.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={cardActionStackSx}>
                <Button variant="contained" component={RouterLink} to="/cadastros/usuarios/novo">
                  Cadastrar
                </Button>
                <Button variant="outlined" component={RouterLink} to="/cadastros/editar/usuarios">
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
                  Cadastro de categorias para manutencoes.
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
                  Cadastro de fornecedores para manutencoes.
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
                <Typography variant="h6">Veiculos</Typography>
                <Typography variant="body2" color="text.secondary">
                  Cadastro de veiculos.
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
