import { Box, Paper, Stack, Typography } from '@mui/material';
import Corvo from '../../components/corvo/Corvo';

// /erp (2026-11-24): página inicial do ERP próprio, que vai entrar na WEB um módulo por vez. Por enquanto só avisa
// que está em construção. The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.
export default function ErpInicioPage() {
  return (
    <Box sx={{ minHeight: 'calc(100vh - 72px)', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper sx={{ p: 3, maxWidth: 560, width: '100%' }} elevation={3}>
        <Stack spacing={2}>
          <Corvo animacao="cabeca" />
          <Typography variant="h5" fontWeight={700}>Estamos trabalhando nisso</Typography>
          <Typography variant="body1">
            O ERP da Ledur está chegando ao painel, um módulo por vez. Quando o primeiro ficar pronto, ele aparece aqui.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
