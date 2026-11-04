import { Box, Button, Divider, IconButton, ListItemIcon, Menu, MenuItem, Popover, Tooltip, Typography } from '@mui/material';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { Bell } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import MenuLateral from './MenuLateral';
import { useAuth } from '../contexts/AuthContext';
import { useCabecalhoPagina } from './cabecalhoPagina';

// Header in the client portal's model: menu button, page title and subtitle, notices and the signed-in user.
// Pages without the side menu: the Home is the menu itself; the others are for whoever has not signed in yet. The mechanic's
// checklist is full screen for phones.
const SEM_MENU_LATERAL = ['/', '/login', '/acesso-negado'];
const semMenuLateral = (caminho: string) => SEM_MENU_LATERAL.includes(caminho) || caminho === '/checklist' || caminho.startsWith('/checklist/');

const botaoClaroSx = {
  color: '#fff',
  bgcolor: 'rgb(255 255 255 / 0.10)',
  borderRadius: '8px',
  '&:hover': { bgcolor: 'rgb(255 255 255 / 0.15)' },
};

// Notices do not exist yet: the bell opens a short note.
function BotaoAvisos() {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title="Avisos">
        <IconButton aria-label="Avisos" onClick={(e) => setAncora(e.currentTarget)} sx={{ ...botaoClaroSx, width: 40, height: 40 }}>
          <Bell size={20} />
        </IconButton>
      </Tooltip>
      <Popover open={Boolean(ancora)} anchorEl={ancora} onClose={() => setAncora(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ p: 2, maxWidth: 300 }}>
          <Typography fontWeight={700} gutterBottom>Avisos</Typography>
          <Typography variant="body2" color="text.secondary">As notificações do sistema ainda serão implementadas.</Typography>
        </Box>
      </Popover>
    </>
  );
}

export default function Header() {
  const { currentUser, authorizationProfile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pagina = useCabecalhoPagina();
  const [menuLateralOpen, setMenuLateralOpen] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState<HTMLElement | null>(null);
  const comMenuLateral = Boolean(currentUser) && !semMenuLateral(location.pathname);
  const nome = authorizationProfile?.nome || currentUser?.displayName || currentUser?.email || '';

  return (
    <>
      <Box
        component="header"
        sx={{ bgcolor: 'primary.main', color: '#fff', borderBottom: '1px solid rgb(255 255 255 / 0.10)' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 2 }, px: { xs: 2, md: 4 }, py: { xs: 1.5, md: 2 } }}>
          {comMenuLateral && (
            <Tooltip title="Menu">
              <IconButton aria-label="Abrir menu" onClick={() => setMenuLateralOpen(true)} sx={{ ...botaoClaroSx, width: 40, height: 40 }}>
                <MenuRoundedIcon />
              </IconButton>
            </Tooltip>
          )}

          <Box sx={{ minWidth: 0, flex: 1 }}>
            {pagina ? (
              <>
                <Typography component="h1" noWrap sx={{ fontSize: { xs: 17, md: 20 }, fontWeight: 600, lineHeight: 1.3 }}>
                  {pagina.titulo}
                </Typography>
                {pagina.subtitulo && (
                  <Typography noWrap sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 14, color: 'rgb(255 255 255 / 0.70)' }}>
                    {pagina.subtitulo}
                  </Typography>
                )}
              </>
            ) : (
              <Box component={Link} to="/" sx={{ display: 'inline-flex' }}>
                <Box component="img" src="/logo-ledur-branco.png" alt="Ledur" sx={{ height: 32 }} />
              </Box>
            )}
          </Box>

          {currentUser ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <BotaoAvisos />
              <Button
                aria-label="Menu do usuário"
                onClick={(e) => setMenuUsuario(e.currentTarget)}
                sx={{ ...botaoClaroSx, minHeight: 40, px: 1.5, gap: 1, fontWeight: 500, fontSize: 14 }}
              >
                <PersonOutlineRoundedIcon fontSize="small" />
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nome}
                </Box>
                <ExpandMoreRoundedIcon fontSize="small" sx={{ opacity: 0.7 }} />
              </Button>
              <Menu anchorEl={menuUsuario} open={Boolean(menuUsuario)} onClose={() => setMenuUsuario(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { minWidth: 240 } } }}>
                <Box sx={{ px: 2, py: 1 }}>
                  <Typography fontWeight={700} noWrap>{nome}</Typography>
                  {currentUser.email && currentUser.email !== nome && <Typography variant="body2" color="text.secondary" noWrap>{currentUser.email}</Typography>}
                </Box>
                <Divider />
                <MenuItem onClick={() => { setMenuUsuario(null); navigate('/perfil'); }}>
                  <ListItemIcon><PersonOutlineRoundedIcon fontSize="small" /></ListItemIcon>
                  Meu perfil
                </MenuItem>
                <MenuItem onClick={() => { setMenuUsuario(null); signOut(); }}>
                  <ListItemIcon><LogoutRoundedIcon fontSize="small" /></ListItemIcon>
                  Sair
                </MenuItem>
              </Menu>
            </Box>
          ) : location.pathname !== '/login' && (
            <Button component={Link} to="/login" sx={{ ...botaoClaroSx, minHeight: 40, px: 2 }}>
              Entrar
            </Button>
          )}
        </Box>
      </Box>
      {comMenuLateral && <MenuLateral open={menuLateralOpen} onClose={() => setMenuLateralOpen(false)} />}
    </>
  );
}
