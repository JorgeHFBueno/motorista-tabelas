import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import Corvo from '../components/corvo/Corvo';
import { ehAppMotorista } from '../features/saida-chegada/appMotorista';

// Endereço que não existe na WEB (antes, a tela ficava em branco). O corvo tira uma placa com "?" das costas.
export default function PaginaNaoEncontradaPage() {
  const navigate = useNavigate();
  // No app Motorista instalado, o início é /motorista.
  const inicio = ehAppMotorista() ? '/motorista' : '/';
  return (
    <Box sx={{ minHeight: 'calc(100vh - 72px)', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper sx={{ p: 3, maxWidth: 560, width: '100%' }} elevation={3}>
        <Stack spacing={2}>
          <Corvo animacao="placa" />
          <Typography variant="h5" fontWeight={700}>Página não encontrada</Typography>
          <Typography variant="body1">Este endereço não existe. Confira o link ou volte para o início.</Typography>
          <Stack direction="row" justifyContent="flex-end">
            <Button variant="contained" onClick={() => navigate(inicio)}>Ir para o início</Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
