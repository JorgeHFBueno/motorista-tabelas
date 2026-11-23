import { Alert, Box, Button, Card, CardActionArea, Stack, Typography } from '@mui/material';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { lazy, Suspense, type ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { temCredencial, type Credencial } from '../../services/credenciais';
import { useFilaEnvio } from './data/filaEnvio';
import PaginaMotorista from './components/PaginaMotorista';
import AvisoInstalar from './components/AvisoInstalar';
import { CORES_LEDUR } from './appMotorista';

// Só no chunk de quem tem o Checklist.
const AvisoChecklistsPendentes = lazy(() => import('../checklist-mecanico/components/AvisoChecklistsPendentes'));
const AvisoRevisoesPendentes = lazy(() => import('../revisao/components/AvisoRevisoesPendentes'));

// Cada botão só aparece para quem tem uma das credenciais (o adm2 vê todos); Como usar é de todos.
const BOTOES: Array<{ label: string; to: string; icon: ReactNode; credenciais?: Credencial[] }> = [
  { label: 'Saída', to: '/motorista/saida', icon: <LogoutRoundedIcon />, credenciais: ['motorista'] },
  { label: 'Chegada', to: '/motorista/chegada', icon: <LoginRoundedIcon />, credenciais: ['motorista'] },
  { label: 'Meu histórico', to: '/motorista/historico', icon: <HistoryRoundedIcon />, credenciais: ['motorista', 'mecanico'] },
  { label: 'Checklist', to: '/motorista/checklist', icon: <ChecklistRoundedIcon />, credenciais: ['mecanico'] },
  { label: 'Revisão', to: '/motorista/revisao', icon: <BuildOutlinedIcon />, credenciais: ['mecanico'] },
  { label: 'Como usar', to: '/motorista/como-usar', icon: <HelpOutlineRoundedIcon /> },
];

/**
 * /motorista: o início do motorista e do mecânico (e do app Motorista instalado), com os botões no estilo do menu principal
 * do app Flutter (lib/features/home/main_menu_page.dart): cartão claro com sombra leve, ícone azul-marinho e o nome.
 */
export default function MotoristaPage() {
  const { authorizationProfile } = useAuth();
  const fila = useFilaEnvio();
  const pendentes = fila.pendentes.length;
  const botoes = BOTOES.filter((b) => !b.credenciais || temCredencial(authorizationProfile, ...b.credenciais));
  return (
    <PaginaMotorista>
      <Stack spacing={2}>
        <AvisoInstalar />
        {pendentes > 0 && (
          <Alert severity="warning" action={<Button color="inherit" size="small" href="/motorista/historico">Ver</Button>}>
            {pendentes === 1 ? '1 lançamento aguardando envio.' : `${pendentes} lançamentos aguardando envio.`}
          </Alert>
        )}
        {temCredencial(authorizationProfile, 'mecanico') && <Suspense fallback={null}><AvisoChecklistsPendentes /><AvisoRevisoesPendentes /></Suspense>}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          {botoes.map((b) => (
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
