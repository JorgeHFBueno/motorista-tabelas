import { Alert, Box, Button, Card, CardActionArea, Stack, Typography } from '@mui/material';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import type { ReactNode } from 'react';
import { useFilaEnvio } from './data/filaEnvio';
import PaginaMotorista from './components/PaginaMotorista';
import { CORES_LEDUR } from './appMotorista';

const BOTOES: Array<{ label: string; to: string; icon: ReactNode }> = [
  { label: 'Saída', to: '/motorista/saida', icon: <LogoutRoundedIcon /> },
  { label: 'Chegada', to: '/motorista/chegada', icon: <LoginRoundedIcon /> },
  { label: 'Meu histórico', to: '/motorista/historico', icon: <HistoryRoundedIcon /> },
  { label: 'Como usar', to: '/motorista/como-usar', icon: <HelpOutlineRoundedIcon /> },
];

/**
 * /motorista: o início do motorista (e do app Motorista instalado), com os quatro botões no estilo do menu principal
 * do app Flutter (lib/features/home/main_menu_page.dart): cartão claro com sombra leve, ícone azul-marinho e o nome.
 */
export default function MotoristaPage() {
  const fila = useFilaEnvio();
  const pendentes = fila.pendentes.length;
  return (
    <PaginaMotorista>
      <Stack spacing={2}>
        {pendentes > 0 && (
          <Alert severity="warning" action={<Button color="inherit" size="small" href="/motorista/historico">Ver</Button>}>
            {pendentes === 1 ? '1 lançamento aguardando envio.' : `${pendentes} lançamentos aguardando envio.`}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          {BOTOES.map((b) => (
            <Card
              key={b.to}
              elevation={0}
              sx={{ borderRadius: 3, bgcolor: '#FFFFFF', border: `1px solid ${CORES_LEDUR.borda}`, boxShadow: '0 1px 3px rgb(18 41 59 / 0.08)' }}
            >
              <CardActionArea
                href={b.to}
                aria-label={`Abrir ${b.label}`}
                sx={{ height: '100%', minHeight: 116, p: 1.5, '&:focus-visible': { outline: `3px solid ${CORES_LEDUR.azulMarinho}`, outlineOffset: -3 } }}
              >
                <Stack alignItems="center" justifyContent="center" spacing={1.25} sx={{ height: '100%', color: CORES_LEDUR.azulMarinho }}>
                  <Box sx={{ display: 'flex', '& svg': { fontSize: 34 } }}>{b.icon}</Box>
                  <Typography sx={{ fontSize: 15, fontWeight: 600, textAlign: 'center' }}>{b.label}</Typography>
                </Stack>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Stack>
    </PaginaMotorista>
  );
}
