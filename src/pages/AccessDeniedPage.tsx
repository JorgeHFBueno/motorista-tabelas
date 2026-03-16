import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

const reasonMessages: Record<string, string> = {
  'missing-admin': 'Seu usuário não possui autorização administrativa (adm1/adm2) para acessar esta área.',
  'missing-email': 'Seu usuário autenticado não possui e-mail associado e não pode ser validado.',
  'firestore-error':
    'Não foi possível confirmar sua autorização administrativa agora. Tente novamente em instantes.',
};

export default function AccessDeniedPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const reason = typeof location.state?.reason === 'string' ? location.state.reason : 'missing-admin';
  const message = reasonMessages[reason] ?? reasonMessages['missing-admin'];

  return (
    <Box sx={{ minHeight: 'calc(100vh - 72px)', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper sx={{ p: 3, maxWidth: 560, width: '100%' }} elevation={3}>
        <Stack spacing={2}>
          <Typography variant="h5" fontWeight={700}>Acesso negado</Typography>
          <Typography variant="body1">{message}</Typography>
          <Typography variant="body2" color="text.secondary">
            Para acessar a aplicação, peça para um administrador confirmar no Firestore
            o campo <strong>adm1</strong> ou <strong>adm2</strong> definido como <strong>true</strong>.
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button variant="outlined" onClick={() => navigate('/login', { replace: true })}>Ir para login</Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}