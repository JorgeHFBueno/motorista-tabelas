import { Stack, Typography } from '@mui/material';
import Corvo from './corvo/Corvo';

// Carregando do sistema: páginas, validação de acesso e o Friday. O corvo pula nas teclas de um notebook enquanto espera.
export default function LoadingFallback({ label }: { label?: string }) {
  return (
    <Stack spacing={1} alignItems="center" justifyContent="center" p={3} role="status">
      <Corvo animacao="teclando" pixel={3} />
      <Typography variant="body2">{label ?? 'Carregando...'}</Typography>
    </Stack>
  );
}
