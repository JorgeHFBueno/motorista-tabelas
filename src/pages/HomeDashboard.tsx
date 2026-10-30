import { Box, Card, CardActionArea, CardContent, Collapse, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import { filtrarMenuPrincipal } from '../components/menuPrincipal';

export default function HomeDashboard() {
  const navigate = useNavigate();
  const { loading: authorizationLoading, profile } = useAuthorizationProfile();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const duasColunas = useMediaQuery(useTheme().breakpoints.up('sm'));

  if (authorizationLoading || !profile) {
    return null;
  }

  const resolvedActions = filtrarMenuPrincipal(profile);
  // Duas colunas de verdade (alternando, na ordem do menu): abrir um grupo de um lado não empurra o outro.
  const colunas = duasColunas
    ? [resolvedActions.filter((_item, index) => index % 2 === 0), resolvedActions.filter((_item, index) => index % 2 === 1)]
    : [resolvedActions];

  return (
    <Box
      sx={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        justifyContent: 'center',
        p: { xs: 2, sm: 3 },
        pt: { xs: 3, sm: 6 },
        background:
          'radial-gradient(circle at top left, rgba(47, 107, 152, 0.12), transparent 28rem), linear-gradient(180deg, #ffffff 0%, #f7f9fb 100%)',
      }}
    >
      <Box component="main" maxWidth={960} width="100%">
        <Stack spacing={2} textAlign="center" mb={3}>
          <Typography variant="h4" fontWeight={700} color="text.primary">
            Bem-vindo ao painel
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Escolha uma área para começar a trabalhar.
          </Typography>
        </Stack>

        {/* uma coluna no celular; a partir de sm, duas colunas independentes */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            alignItems: 'start',
            gap: 3,
          }}
        >
          {colunas.map((coluna, colunaIndex) => (
            <Stack key={colunaIndex} spacing={3}>
              {coluna.map((action) => (
                <Card key={action.label} elevation={1}>
                  <CardActionArea
                    onClick={action.children
                      ? () => setExpandedGroup((current) => current === action.label ? null : action.label)
                      : () => navigate(action.to!)}
                    aria-expanded={action.children ? expandedGroup === action.label : undefined}
                    aria-label={action.crt ? action.label : undefined}
                    className={action.crt ? 'dev-crt-card' : undefined}
                    sx={{
                      height: { xs: 68, sm: 76 },
                      backgroundColor: action.color,
                      borderTop: `4px solid ${action.accent}`,
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                      '&:hover': {
                        transform: 'translateY(-3px)',
                        boxShadow: '0 8px 24px -4px rgb(0 0 0 / 0.1)',
                      },
                    }}
                  >
                    <CardContent sx={{ height: '100%', py: 1.25 }}>
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="center"
                        spacing={1.5}
                        sx={{ height: '100%', color: '#12293B' }}
                      >
                        <Box sx={{ color: action.accent, display: 'flex' }}>{action.icon}</Box>
                        {/* Card CRT (DEV): só o ícone, sem texto nem seta. */}
                        {!action.crt && (
                          <Typography variant="h6" fontWeight={700}>
                            {action.label}
                          </Typography>
                        )}
                        {!action.crt && (action.children
                          ? <ExpandMoreIcon sx={{ ml: 'auto', transform: expandedGroup === action.label ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                          : <ChevronRightRoundedIcon sx={{ ml: 'auto' }} />)}
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                  {action.children && (
                    <Collapse in={expandedGroup === action.label} timeout="auto" unmountOnExit>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, p: 1.5 }}>
                        {action.children.map((child) => (
                          <Card key={child.label} variant="outlined" sx={{ borderColor: `${action.accent}59`, borderRadius: 2, bgcolor: action.color }}>
                            <CardActionArea
                              onClick={() => navigate(child.to)}
                              aria-label={`Abrir ${child.label}`}
                              sx={{ minHeight: 120, p: 2, transition: 'transform 0.2s ease, background-color 0.2s ease', '&:hover': { bgcolor: `${action.accent}1A`, transform: 'translateY(-2px)' }, '&:focus-visible': { outline: `3px solid ${action.accent}`, outlineOffset: -3 } }}
                            >
                              <Stack alignItems="center" justifyContent="center" spacing={0.75} sx={{ height: '100%', color: '#12293B' }}>
                                <Box sx={{ color: action.accent, display: 'flex', '& svg': { fontSize: 24 } }}>{child.icon}</Box>
                                <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{child.label}</Typography>
                                <Typography variant="body2" color="text.secondary">{child.to}</Typography>
                              </Stack>
                            </CardActionArea>
                          </Card>
                        ))}
                      </Box>
                    </Collapse>
                  )}
                </Card>
              ))}
            </Stack>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
