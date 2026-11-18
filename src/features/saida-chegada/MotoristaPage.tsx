import { Alert, Box, Button, Card, CardActionArea, Stack, Typography } from '@mui/material';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import type { ReactNode } from 'react';
import { useFilaEnvio } from './data/filaEnvio';

const COR = '#EEF5F1';
const DESTAQUE = '#2E7D5B';

const BOTOES: Array<{ label: string; to: string; icon: ReactNode; descricao: string }> = [
  { label: 'Saída', to: '/motorista/saida', icon: <LogoutRoundedIcon />, descricao: 'Registrar a saída de um veículo' },
  { label: 'Chegada', to: '/motorista/chegada', icon: <LoginRoundedIcon />, descricao: 'Registrar a chegada na Fábrica' },
  { label: 'Meu histórico', to: '/motorista/historico', icon: <HistoryRoundedIcon />, descricao: 'Suas saídas e chegadas e o que falta enviar' },
  { label: 'Como usar', to: '/motorista/como-usar', icon: <HelpOutlineRoundedIcon />, descricao: 'O que fazer em cada tela e como instalar no celular' },
];

/** /motorista: o início do motorista (e do app Motorista instalado), com os quatro botões. */
export default function MotoristaPage() {
  const fila = useFilaEnvio();
  const pendentes = fila.pendentes.length;
  return (
    // width 100%: na coluna flex da página, com mx auto, a caixa encolheria ou cresceria conforme o conteúdo.
    <Box sx={{ width: '100%', maxWidth: 640, mx: 'auto', px: 2, py: 2, pb: 6 }}>
      <Stack spacing={2}>
        {pendentes > 0 && (
          <Alert severity="warning" action={<Button color="inherit" size="small" href="/motorista/historico">Ver</Button>}>
            {pendentes === 1 ? '1 lançamento aguardando envio.' : `${pendentes} lançamentos aguardando envio.`}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          {BOTOES.map((b) => (
            <Card key={b.to} variant="outlined" sx={{ borderColor: `${DESTAQUE}59`, borderRadius: 2, bgcolor: COR }}>
              <CardActionArea
                href={b.to}
                aria-label={`Abrir ${b.label}`}
                sx={{ height: '100%', minHeight: 140, p: 1.5, '&:hover': { bgcolor: `${DESTAQUE}1A` }, '&:focus-visible': { outline: `3px solid ${DESTAQUE}`, outlineOffset: -3 } }}
              >
                <Stack alignItems="center" justifyContent="center" spacing={0.75} sx={{ height: '100%', color: '#12293B' }}>
                  <Box sx={{ color: DESTAQUE, display: 'flex', '& svg': { fontSize: 30 } }}>{b.icon}</Box>
                  <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{b.label}</Typography>
                  <Typography variant="body2" color="text.secondary" textAlign="center">{b.descricao}</Typography>
                </Stack>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
