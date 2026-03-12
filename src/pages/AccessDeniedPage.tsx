import { Alert, Button, Stack, Typography } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';

const reasonMessages: Record<string, string> = {
  'missing-email': 'Não foi possível validar seu acesso porque sua conta não possui e-mail válido.',
  'missing-adm2': 'Seu usuário não possui autorização administrativa (adm2) para acessar esta área.',
  'firestore-error':
    'Não foi possível confirmar sua autorização administrativa agora. Tente novamente em instantes.',
};

export default function AccessDeniedPage() {
  const location = useLocation();
  const reason = typeof location.state?.reason === 'string' ? location.state.reason : 'missing-adm2';
  const message = reasonMessages[reason] ?? reasonMessages['missing-adm2'];

  return (
    <Stack spacing={2} maxWidth={640} mx="auto" mt={6} px={2}>
      <Typography variant="h5">Acesso negado</Typography>
      <Alert severity="warning">{message}</Alert>
      <Typography variant="body2" color="text.secondary">
        Para continuar, solicite a liberação do seu e-mail na coleção <strong>00-autorizados</strong> com
        o campo <strong>adm2</strong> definido como <strong>true</strong>.
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button component={Link} to="/login" variant="contained">
          Ir para login
        </Button>
      </Stack>
    </Stack>
  );
}