import { Box, Collapse, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Tooltip } from '@mui/material';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import { filtrarMenuPrincipal } from './menuPrincipal';

// Menu lateral das páginas internas, aberto pelo botão de menu do cabeçalho.
export default function MenuLateral({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuthorizationProfile();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const actions = filtrarMenuPrincipal(profile);

  const isActiveRoute = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`);
  const ir = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <>
      {/* Same look as the client portal's menu: logo only, active item in the technical blue. */}
      <Drawer anchor="left" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: 256, maxWidth: '85vw', bgcolor: 'primary.main', color: '#fff', borderRadius: 0 } } }}>
        <Box component="nav" aria-label="Menu principal" sx={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 3, borderBottom: '1px solid rgb(255 255 255 / 0.10)' }}>
            <Box component="img" src="/logo-ledur-branco.png" alt="Ledur Pré-Fabricados" sx={{ height: 40, width: 'auto' }} />
            <Tooltip title="Fechar menu" placement="right">
              <IconButton aria-label="Fechar menu" onClick={onClose} sx={{ color: 'rgb(255 255 255 / 0.70)', mr: -1, '&:hover': { color: '#fff', bgcolor: 'rgb(255 255 255 / 0.10)' } }}>
                <ChevronLeftRoundedIcon />
              </IconButton>
            </Tooltip>
          </Stack>
          <List disablePadding sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.5, '& .MuiListItemButton-root': { color: 'rgb(255 255 255 / 0.70)', borderRadius: '8px', width: 'auto', transition: 'all 0.2s', '& .MuiListItemText-primary': { fontSize: 14 }, '&:hover, &:focus-visible': { color: '#fff', bgcolor: 'rgb(255 255 255 / 0.10)' }, '&.Mui-selected, &.Mui-selected:hover': { color: '#fff', bgcolor: 'secondary.main', '& .MuiListItemText-primary': { fontWeight: 500 } } } }}>
            {actions.map((action) => {
              const hasChildren = Boolean(action.children);
              const childIsActive = action.children?.some((child) => isActiveRoute(child.to)) ?? false;
              const destino = action.to ?? '';
              const expanded = expandedGroup === action.label || childIsActive;
              const selecionar = () => {
                if (hasChildren) {
                  setExpandedGroup((current) => (current === action.label ? null : action.label));
                  return;
                }
                ir(destino);
              };

              return (
                <Box key={action.label}>
                  {/* A group with the active page stays white; only the page itself gets the technical blue. */}
                  <ListItemButton selected={!hasChildren && isActiveRoute(destino)} aria-current={!hasChildren && isActiveRoute(destino) ? 'page' : undefined} aria-expanded={hasChildren ? expanded : undefined} onClick={selecionar} aria-label={action.crt ? action.label : undefined} sx={{ minHeight: 44, px: 2, gap: 1.5, ...(childIsActive && { color: '#fff !important' }) }}>
                    <ListItemIcon sx={{ minWidth: 0, color: 'inherit', '& svg': { fontSize: 20 } }}>{action.icon}</ListItemIcon>
                    {!action.crt && <ListItemText primary={action.label} />}
                    {hasChildren && <ExpandMoreIcon fontSize="small" sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />}
                  </ListItemButton>
                  {hasChildren && (
                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                      <List disablePadding sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 0.5 }}>
                        {action.children!.map((child) => (
                          <ListItemButton key={child.label} selected={isActiveRoute(child.to)} aria-current={isActiveRoute(child.to) ? 'page' : undefined} onClick={() => ir(child.to)} sx={{ minHeight: 40, pl: 5, pr: 2, gap: 1.5 }}>
                            <ListItemIcon sx={{ minWidth: 0, color: 'inherit', '& svg': { fontSize: 18 } }}>{child.icon}</ListItemIcon>
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
    </>
  );
}
