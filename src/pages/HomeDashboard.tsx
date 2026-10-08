import { Box, Card, CardActionArea, CardContent, Collapse, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ListAltIcon from '@mui/icons-material/ListAlt';
import DirectionsCarFilledIcon from '@mui/icons-material/DirectionsCarFilled';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import EngineeringIcon from '@mui/icons-material/Engineering';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ConstructionIcon from '@mui/icons-material/Construction';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import { useAdm1MontanteGate } from '../hooks/useAdm1MontanteGate';
import { useAuth } from '../contexts/AuthContext';
import PerfilDialog from '../components/PerfilDialog';

type HomeAction = {
  label: string;
  description: string;
  icon: ReactNode;
  color: string;
  accent: string;
  to?: string;
  requiresAdm2?: boolean;
  children?: Array<{ label: string; to: string; icon: ReactNode }>;
};

const actions: HomeAction[] = [
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
  {
    label: 'Engenharia',
    description: '',
    icon: <EngineeringIcon fontSize="large" />,
    color: '#F2F0FA',
    accent: '#6B5CA5',
    requiresAdm2: true,
    children: [
      { label: 'Obras', to: '/engenharia/obras', icon: <ConstructionIcon /> },
      { label: 'Cronograma', to: '/engenharia/cronograma', icon: <CalendarMonthIcon /> },
    ],
  },
];

export default function HomeDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { loading: authorizationLoading, profile } = useAuthorizationProfile();
  const isAdm1 = profile?.adm1 === true;
  const isAdm2 = profile?.adm2 === true;
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('home-sidebar-collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const { requestAccess, dialog } = useAdm1MontanteGate(isAdm1);
  const { signOut } = useAuth();

  useEffect(() => {
    localStorage.setItem('home-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const handleCombustivelClick = useCallback(() => {
    const combustivelDestino = isAdm2 ? '/combustivel' : '/combustivel/novo';

    if (combustivelDestino === '/combustivel/novo') {
      requestAccess(() => navigate(combustivelDestino));
      return;
    }

    navigate(combustivelDestino);
  }, [isAdm2, navigate, requestAccess]);

  const resolvedActions = actions.filter((action) => {
    if (action.requiresAdm2) return isAdm2;
    return !isAdm1 || action.label === 'Combustível';
  });

  const isActiveRoute = (to: string) => to === '/' ? location.pathname === to : location.pathname === to || location.pathname.startsWith(`${to}/`);
  const closeMobileSidebar = () => setMobileSidebarOpen(false);
  const navigateFromSidebar = (to: string) => {
    navigate(to);
    closeMobileSidebar();
  };

  const sidebarContent = (collapsed: boolean, temporary = false) => (
    <Box
      component="nav"
      aria-label="Menu rápido"
      sx={{
        width: collapsed ? 68 : 252,
        height: temporary ? '100%' : '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        bgcolor: 'var(--ledur-primary, #174f76)',
        color: '#fff',
        borderRight: temporary ? 0 : '1px solid rgb(255 255 255 / 0.12)',
        position: temporary ? 'static' : 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        transition: 'width 0.2s ease',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent={collapsed ? 'center' : 'space-between'} sx={{ minHeight: 72, px: collapsed ? 0.5 : 1.25, borderBottom: '1px solid rgb(255 255 255 / 0.12)' }}>
        <Box component="img" src="/logo-ledur-branco.png" alt="Ledur" sx={{ width: collapsed ? 34 : 42, height: collapsed ? 34 : 42, objectFit: 'contain', flexShrink: 0 }} />
        <Tooltip title={collapsed ? 'Expandir menu' : 'Recolher menu'} placement="right">
          <IconButton aria-label={temporary ? 'Fechar menu' : collapsed ? 'Expandir menu' : 'Recolher menu'} onClick={() => temporary ? closeMobileSidebar() : setSidebarCollapsed((value) => !value)} sx={{ color: 'inherit', '&:hover': { bgcolor: 'rgb(255 255 255 / 0.14)' } }}>
            {collapsed ? <ChevronRightRoundedIcon /> : <ChevronLeftRoundedIcon />}
          </IconButton>
        </Tooltip>
      </Stack>
      <List disablePadding sx={{ py: 1, '& .MuiListItemButton-root': { color: 'inherit', borderRadius: 1, mx: 0.75, width: 'auto', '&:hover, &:focus-visible': { bgcolor: 'rgb(255 255 255 / 0.14)' }, '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'rgb(255 255 255 / 0.22)' } } }}>
        {resolvedActions.map((action) => {
          const hasChildren = Boolean(action.children);
          const childIsActive = action.children?.some((child) => isActiveRoute(child.to)) ?? false;
          const actionDestination = action.label === 'Combustível' ? (isAdm2 ? '/combustivel' : '/combustivel/novo') : action.to!;
          const expanded = expandedGroup === action.label || childIsActive;
          const selectAction = () => {
            if (hasChildren) {
              if (collapsed && !temporary) setSidebarCollapsed(false);
              setExpandedGroup((current) => current === action.label ? null : action.label);
              return;
            }
            if (action.label === 'Combustível') {
              handleCombustivelClick();
              closeMobileSidebar();
              return;
            }
            navigateFromSidebar(action.to!);
          };

          return (
            <Box key={action.label}>
              <Tooltip title={collapsed ? action.label : ''} placement="right">
                <ListItemButton selected={hasChildren ? childIsActive : isActiveRoute(actionDestination)} aria-current={!hasChildren && isActiveRoute(actionDestination) ? 'page' : undefined} aria-expanded={hasChildren ? expanded : undefined} onClick={selectAction} sx={{ minHeight: 48, justifyContent: collapsed ? 'center' : 'initial', px: collapsed ? 1.5 : 2 }}>
                  <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, color: 'inherit', justifyContent: 'center' }}>{action.icon}</ListItemIcon>
                  {!collapsed && <><ListItemText primary={action.label} /><Box component="span" sx={{ display: 'flex', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>{hasChildren && <ExpandMoreIcon fontSize="small" />}</Box></>}
                </ListItemButton>
              </Tooltip>
              {hasChildren && !collapsed && (
                <Collapse in={expanded} timeout="auto" unmountOnExit>
                  <List disablePadding>
                    {action.children!.map((child) => (
                      <ListItemButton key={child.label} selected={isActiveRoute(child.to)} aria-current={isActiveRoute(child.to) ? 'page' : undefined} onClick={() => navigateFromSidebar(child.to)} sx={{ minHeight: 44, pl: 6, pr: 2 }}>
                        <ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}>{child.icon}</ListItemIcon>
                        <ListItemText primary={child.label} />
                      </ListItemButton>
                    ))}
                  </List>
                </Collapse>
              )}
            </Box>
          );
        })}
      </List>
      <Box sx={{ mt: 'auto', py: 1, borderTop: '1px solid rgb(255 255 255 / 0.12)' }}>
        <Tooltip title={collapsed ? 'Usuário' : ''} placement="right">
          <ListItemButton onClick={() => setPerfilOpen(true)} sx={{ minHeight: 48, justifyContent: collapsed ? 'center' : 'initial', px: collapsed ? 1.5 : 2, color: 'inherit', borderRadius: 1, mx: 0.75, width: 'auto', '&:hover, &:focus-visible': { bgcolor: 'rgb(255 255 255 / 0.14)' } }}>
            <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, color: 'inherit', justifyContent: 'center' }}><PersonOutlineRoundedIcon /></ListItemIcon>
            {!collapsed && <ListItemText primary="Usuário" />}
          </ListItemButton>
        </Tooltip>
        <Tooltip title={collapsed ? 'Logout' : ''} placement="right">
          <ListItemButton onClick={() => signOut()} sx={{ minHeight: 48, justifyContent: collapsed ? 'center' : 'initial', px: collapsed ? 1.5 : 2, color: 'inherit', borderRadius: 1, mx: 0.75, width: 'auto', '&:hover, &:focus-visible': { bgcolor: 'rgb(255 255 255 / 0.14)' } }}>
            <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, color: 'inherit', justifyContent: 'center' }}><LogoutRoundedIcon /></ListItemIcon>
            {!collapsed && <ListItemText primary="Logout" />}
          </ListItemButton>
        </Tooltip>
      </Box>
    </Box>
  );

  if (authorizationLoading || !profile) {
    return null;
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        background:
          'radial-gradient(circle at top left, rgba(47, 107, 152, 0.12), transparent 28rem), linear-gradient(180deg, #ffffff 0%, #f7f9fb 100%)',
      }}
    >
      {!isMobile && sidebarContent(sidebarCollapsed)}
      {isMobile && <Drawer anchor="left" open={mobileSidebarOpen} onClose={closeMobileSidebar} slotProps={{ paper: { sx: { width: 280, maxWidth: '85vw', bgcolor: 'var(--ledur-primary, #174f76)' } } }}>{sidebarContent(false, true)}</Drawer>}
      <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: 2, sm: 3 }, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box maxWidth={960} width="100%">
        {isMobile && <IconButton aria-label="Abrir menu principal" onClick={() => setMobileSidebarOpen(true)} sx={{ mb: 1, color: '#fff', bgcolor: 'var(--ledur-primary, #174f76)', '&:hover': { bgcolor: '#0d3651' } }}><MenuRoundedIcon /></IconButton>}
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
                onClick={action.children
                  ? () => setExpandedGroup((current) => current === action.label ? null : action.label)
                  : action.label === 'Combustível'
                    ? handleCombustivelClick
                    : () => navigate(action.to!)}
                aria-expanded={action.children ? expandedGroup === action.label : undefined}
                sx={{
                  height: action.children ? { xs: 68, sm: 76 } : { xs: 150, sm: 200 },
                  backgroundColor: action.color,
                  borderTop: `4px solid ${action.accent}`,
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-3px)',
                    boxShadow: '0 8px 24px -4px rgb(0 0 0 / 0.1)',
                  },
                }}
              >
                <CardContent sx={{ height: '100%', py: action.children ? 1.25 : undefined }}>
                  <Stack
                    direction={action.children ? 'row' : 'column'}
                    alignItems="center"
                    justifyContent="center"
                    spacing={1.5}
                    sx={{ height: '100%', color: '#12293B' }}
                  >
                    <Box sx={{ color: action.accent }}>{action.icon}</Box>
                    <Typography variant="h6" fontWeight={700}>
                      {action.label}
                    </Typography>
                    {!action.children && <Typography variant="body2" textAlign="center">
                      {action.description}
                    </Typography>}
                    {action.children && <ExpandMoreIcon sx={{ ml: 'auto', transform: expandedGroup === action.label ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />}
                  </Stack>
                </CardContent>
              </CardActionArea>
              {action.children && (
                <Collapse in={expandedGroup === action.label} timeout="auto" unmountOnExit>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, p: 1.5 }}>
                    {action.children.map((child) => (
                      <Card key={child.label} variant="outlined" sx={{ borderColor: 'rgba(107, 92, 165, 0.35)', borderRadius: 2, bgcolor: 'rgba(242, 240, 250, 0.55)' }}>
                        <CardActionArea
                          onClick={() => navigate(child.to)}
                          aria-label={`Abrir ${child.label}`}
                          sx={{ minHeight: 120, p: 2, transition: 'transform 0.2s ease, background-color 0.2s ease', '&:hover': { bgcolor: 'rgba(107, 92, 165, 0.1)', transform: 'translateY(-2px)' }, '&:focus-visible': { outline: '3px solid #6B5CA5', outlineOffset: -3 } }}
                        >
                          <Stack alignItems="center" justifyContent="center" spacing={0.75} sx={{ height: '100%', color: '#12293B' }}>
                            <Box sx={{ color: '#6B5CA5', display: 'flex', '& svg': { fontSize: 24 } }}>{child.icon}</Box>
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
        </Box>
      </Box>
      </Box>
      {dialog}
      <PerfilDialog open={perfilOpen} onClose={() => setPerfilOpen(false)} />
    </Box>
  );
}
