import { CircularProgress, Stack, Typography } from '@mui/material';

// Carregando do sistema: páginas, validação de acesso e o Friday.
export default function LoadingFallback({ label }: { label?: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" p={3}>
      <CircularProgress size={22} />
      <Typography variant="body2">{label ?? 'Carregando...'}</Typography>
    </Stack>
  );
}
