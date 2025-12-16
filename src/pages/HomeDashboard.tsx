import {Box, Card, CardActionArea, CardContent, Typography, Stack} from '@mui/material';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import DirectionsCarFilledIcon from '@mui/icons-material/DirectionsCarFilled';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import { useNavigate } from 'react-router-dom';

const actions = [
  {
    label: 'Cadastros',
    description: 'Cadastrar e organizar pessoas',
    icon: <AssignmentIndIcon fontSize="large" />,
    color: '#8ecae6',
    to: '/cadastros',
  },
  {
    label: 'Frotas',
    description: 'Gerencie veículos e motoristas',
    icon: <DirectionsCarFilledIcon fontSize="large" />,
    color: '#ffb703',
    to: '/frota',
  },
  {
    label: 'Combustível',
    description: 'Controle de abastecimentos',
    icon: <LocalGasStationIcon fontSize="large" />,
    color: '#fb8500',
    to: '/combustivel',
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
          {actions.map((action) => (
            <Card key={action.label} elevation={3} sx={{ borderRadius: 3 }}>
              <CardActionArea
                onClick={() => navigate(action.to)}
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
    </Box>
  );
}
