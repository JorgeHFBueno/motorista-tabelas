import {Box, Card, CardActionArea, CardContent, Typography, Stack} from '@mui/material';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ListAltIcon from '@mui/icons-material/ListAlt';
import DirectionsCarFilledIcon from '@mui/icons-material/DirectionsCarFilled';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import { useAdm1MontanteGate } from '../hooks/useAdm1MontanteGate';

const actions = [
  {
    label: 'Cadastros',
    description: 'Cadastrar e organizar pessoas',
    icon: <AssignmentIndIcon fontSize="large" />,
    color: '#EAF2F8',
    accent: '#2F6B98',
    to: '/cadastros',
  },
  {
    label: 'Registros',
    description: 'Acompanhe registros de chegadas e saídas da frota',
    icon: <ListAltIcon fontSize="large" />,
    color: '#F6F7F8',
    accent: '#5B5D5B',
    to: '/registros',
  },
  {
    label: 'Frota',
    description: 'Gerencie veículos (placas, maquinas, registros)',
    icon: <DirectionsCarFilledIcon fontSize="large" />,
    color: '#EEF5F1',
    accent: '#2E9D6F',
    to: '/frota',
  },
  {
    label: 'Combustível',
    description: 'Controle de abastecimentos',
    icon: <LocalGasStationIcon fontSize="large" />,
    color: '#FFF6E8',
    accent: '#E79A25',
    to: '/combustivel/novo',
  },
  {
    label: 'Portifólio',
    description: 'Campo de ideias a serem exploradas',
    icon: <WorkspacesIcon fontSize="large" />,
    color: '#EDF3F7',
    accent: '#12293B',
    to: '/portfolio',
  },
];

export default function HomeDashboard() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const { loading: authorizationLoading, profile } = useAuthorizationProfile(currentUser, authLoading);
  const isAdm1 = profile?.adm1 === true;
  const isAdm2 = profile?.adm2 === true;
  const { requestAccess, dialog } = useAdm1MontanteGate(isAdm1);

  const handleCombustivelClick = useCallback(() => {
    const combustivelDestino = isAdm2 ? '/combustivel' : '/combustivel/novo';

    if (combustivelDestino === '/combustivel/novo') {
      requestAccess(() => navigate(combustivelDestino));
      return;
    }

    navigate(combustivelDestino);
  }, [isAdm2, navigate, requestAccess]);

  const resolvedActions = actions.filter((action) => !isAdm1 || action.label === 'Combustível');

  if (authorizationLoading || !profile) {
    return null;
  }

  return (
    <Box
      sx={{
        minHeight: 'calc(100vh - 72px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
        background:
          'radial-gradient(circle at top left, rgba(47, 107, 152, 0.12), transparent 28rem), linear-gradient(180deg, #ffffff 0%, #f7f9fb 100%)',
      }}
    >
      <Box maxWidth={960} width="100%">
        <Stack spacing={2} textAlign="center" mb={2}>
          <Typography variant="h4" fontWeight={700} color="text.primary">
            Bem-vindo ao painel
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Escolha uma área para começar a trabalhar.
          </Typography>
        </Stack>

        {/* grade 2x2 responsiva, sem usar Grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 3,
          }}
        >
          {resolvedActions.map((action) => (
            <Card key={action.label} elevation={1}>
              <CardActionArea
                onClick={action.label === 'Combustível' ? handleCombustivelClick : () => navigate(action.to)}
                sx={{
                  height: { xs: 150, sm: 200 },
                  backgroundColor: action.color,
                  borderTop: `4px solid ${action.accent}`,
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-3px)',
                    boxShadow: '0 8px 24px -4px rgb(0 0 0 / 0.1)',
                  },
                }}
              >
                <CardContent sx={{ height: '100%' }}>
                  <Stack
                    alignItems="center"
                    justifyContent="center"
                    spacing={1.5}
                    sx={{ height: '100%', color: '#12293B' }}
                  >
                    <Box sx={{ color: action.accent }}>{action.icon}</Box>
                    <Typography variant="h6" fontWeight={700}>
                      {action.label}
                    </Typography>
                    <Typography variant="body2" textAlign="center">
                      {action.description}
                    </Typography>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Box>
      {dialog}
    </Box>
  );
}
