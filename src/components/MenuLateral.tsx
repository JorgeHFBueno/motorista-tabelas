import { Box, Collapse, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Tooltip } from '@mui/material';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import { useAdm1MontanteGate } from '../hooks/useAdm1MontanteGate';
import { destinoCombustivel, filtrarMenuPrincipal } from './menuPrincipal';

// Menu lateral das páginas internas, aberto pelo botão de menu do cabeçalho.
export default function MenuLateral({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuthorizationProfile();
  const isAdm2 = profile?.adm2 === true;
  const { requestAccess, dialog } = useAdm1MontanteGate(profile?.adm1 === true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const actions = filtrarMenuPrincipal(profile);

  const isActiveRoute = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`);
  const ir = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <>
      <Drawer anchor="left" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: 280, maxWidth: '85vw', bgcolor: 'var(--ledur-primary, #12293b)', color: '#fff' } } }}>
        <Box component="nav" aria-label="Menu principal" sx={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 64, px: 1.25, borderBottom: '1px solid rgb(255 255 255 / 0.12)' }}>
            <Box component="img" src="/logo-ledur-branco.png" alt="Ledur" sx={{ width: 42, height: 42, objectFit: 'contain' }} />
            <Tooltip title="Fechar menu" placement="right">
              <IconButton aria-label="Fechar menu" onClick={onClose} sx={{ color: 'inherit', '&:hover': { bgcolor: 'rgb(255 255 255 / 0.14)' } }}>
                <ChevronLeftRoundedIcon />
              </IconButton>
            </Tooltip>
          </Stack>
          <List disablePadding sx={{ py: 1, '& .MuiListItemButton-root': { color: 'inherit', borderRadius: 1, mx: 0.75, width: 'auto', '&:hover, &:focus-visible': { bgcolor: 'rgb(255 255 255 / 0.14)' }, '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'rgb(255 255 255 / 0.22)' } } }}>
            {actions.map((action) => {
              const hasChildren = Boolean(action.children);
              const childIsActive = action.children?.some((child) => isActiveRoute(child.to)) ?? false;
              const destino = action.label === 'Combustível' ? destinoCombustivel(isAdm2) : action.to!;
              const expanded = expandedGroup === action.label || childIsActive;
              const selecionar = () => {
                if (hasChildren) {
                  setExpandedGroup((current) => (current === action.label ? null : action.label));
                  return;
                }
                if (destino === '/combustivel/novo') {
                  onClose();
                  requestAccess(() => navigate(destino));
                  return;
                }
                ir(destino);
              };

              return (
                <Box key={action.label}>
                  <ListItemButton selected={hasChildren ? childIsActive : isActiveRoute(destino)} aria-current={!hasChildren && isActiveRoute(destino) ? 'page' : undefined} aria-expanded={hasChildren ? expanded : undefined} onClick={selecionar} sx={{ minHeight: 48, px: 2 }}>
                    <ListItemIcon sx={{ minWidth: 36, color: 'inherit', '& svg': { fontSize: 24 } }}>{action.icon}</ListItemIcon>
                    <ListItemText primary={action.label} />
                    {hasChildren && <ExpandMoreIcon fontSize="small" sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />}
                  </ListItemButton>
                  {hasChildren && (
                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                      <List disablePadding>
                        {action.children!.map((child) => (
                          <ListItemButton key={child.label} selected={isActiveRoute(child.to)} aria-current={isActiveRoute(child.to) ? 'page' : undefined} onClick={() => ir(child.to)} sx={{ minHeight: 44, pl: 6, pr: 2 }}>
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
        </Box>
      </Drawer>
      {dialog}
    </>
  );
}
