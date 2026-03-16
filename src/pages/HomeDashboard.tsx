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
    color: '#8ecae6',
    to: '/cadastros',
  },
  {
    label: 'Registros',
    description: 'Acompanhe registros e gráficos',
    icon: <ListAltIcon fontSize="large" />,
    color: '#ffb703',
    to: '/registros',
  },
  {
    label: 'Frota',
    description: 'Gerencie veículos (placa e extra)',
    icon: <DirectionsCarFilledIcon fontSize="large" />,
    color: '#ffd166',
    to: '/frota',
  },
  {
    label: 'Combustível',
    description: 'Controle de abastecimentos',
    icon: <LocalGasStationIcon fontSize="large" />,
    color: '#fb8500',
    to: '/combustivel/novo',
  },
  {
    label: 'Portifólio',
    description: 'Campo de ideias a serem exploradas',
    icon: <WorkspacesIcon fontSize="large" />,
    color: '#90be6d',
    to: '/portfolio',
  },
];

export default function HomeDashboard() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const { loading: authorizationLoading, profile } = useAuthorizationProfile(currentUser, authLoading);
  const isAdm1 = profile?.adm1 === true;
  const { requestAccess, dialog } = useAdm1MontanteGate(isAdm1);

  const handleCombustivelClick = useCallback(() => {
    requestAccess(() => navigate('/combustivel/novo'));
  }, [navigate, requestAccess]);

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
        background: 'linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%)',
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
            <Card key={action.label} elevation={3} sx={{ borderRadius: 3 }}>
              <CardActionArea
                onClick={action.label === 'Combustível' ? handleCombustivelClick : () => navigate(action.to)}
                sx={{
                  height: { xs: 150, sm: 200 },
                  backgroundColor: action.color,
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 6,
                  },
                }}
              >
                <CardContent sx={{ height: '100%' }}>
                  <Stack
                    alignItems="center"
                    justifyContent="center"
                    spacing={1.5}
                    sx={{ height: '100%', color: '#0b1b2b' }}
                  >
                    {action.icon}
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
