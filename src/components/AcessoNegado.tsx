import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ehAppMotorista } from '../features/saida-chegada/appMotorista';
import Corvo from './corvo/Corvo';

export type MotivoAcessoNegado = 'firestore-error' | 'missing-funcionario' | 'inactive' | 'sem-credencial' | 'sem-acesso-area';

const mensagens: Record<MotivoAcessoNegado, { titulo: string; texto: string }> = {
  'firestore-error': {
    titulo: 'Não foi possível verificar seu acesso',
    texto: 'A conexão falhou ao conferir o seu cadastro. Tente de novo.',
  },
  'missing-funcionario': { titulo: 'Acesso negado', texto: 'Seu usuário não possui cadastro em Funcionários.' },
  inactive: { titulo: 'Acesso negado', texto: 'Seu cadastro em Funcionários está inativo.' },
  'sem-credencial': {
    titulo: 'Acesso negado',
    texto: 'Seu cadastro não tem nenhuma credencial. Peça à administração para liberar o seu acesso.',
  },
  'sem-acesso-area': {
    titulo: 'Acesso negado',
    texto: 'Sua credencial não dá acesso a esta área. Use o menu para ver o que está liberado para você.',
  },
};

// Shown by PrivateRoute at the address the person opened, without changing the URL:
// reloading the page checks the access again. The raven (the WEB mascot) shouts.
export default function AcessoNegado({ motivo }: { motivo: MotivoAcessoNegado }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { titulo, texto } = mensagens[motivo];
  // No app Motorista instalado, sair volta ao login dentro de /motorista, e não há "início" para onde ir.
  const appMotorista = ehAppMotorista();

  const sair = async () => {
    await signOut();
    navigate(appMotorista ? '/motorista' : '/login', { replace: true });
  };

  return (
    <Box sx={{ minHeight: 'calc(100vh - 72px)', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper sx={{ p: 3, maxWidth: 560, width: '100%' }} elevation={3}>
        <Stack spacing={2}>
          <Corvo animacao="grito" />
          <Typography variant="h5" fontWeight={700}>{titulo}</Typography>
          <Typography variant="body1">{texto}</Typography>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            {motivo === 'firestore-error' ? (
              <Button variant="contained" onClick={() => window.location.reload()}>Tentar novamente</Button>
            ) : motivo === 'sem-acesso-area' && !appMotorista ? (
              <Button variant="contained" onClick={() => navigate('/')}>Ir para o início</Button>
            ) : (
              <Button variant="outlined" onClick={() => void sair()}>Sair</Button>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
