import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import { Avatar, Box, Divider, IconButton, ListItemIcon, Menu, MenuItem, Popover, Tooltip, Typography } from '@mui/material';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { Bell, HelpCircle } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import MenuLateral from './MenuLateral';
import { useAuth } from '../contexts/AuthContext';
import { iniciais } from '../services/funcionarios';

// Páginas sem menu lateral: a Home já é o menu; as demais são de quem ainda não entrou.
const SEM_MENU_LATERAL = ['/', '/login', '/signup', '/acesso-negado'];

const botaoIconeSx = { color: '#fff', width: 40, height: 40, '&:hover': { bgcolor: 'rgb(255 255 255 / 0.12)' } };

// Botão do cabeçalho cuja função ainda não existe: abre um aviso curto.
function BotaoEmBreve({ rotulo, icone, mensagem }: { rotulo: string; icone: ReactNode; mensagem: string }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title={rotulo}>
        <IconButton aria-label={rotulo} onClick={(e) => setAncora(e.currentTarget)} sx={botaoIconeSx}>{icone}</IconButton>
      </Tooltip>
      <Popover open={Boolean(ancora)} anchorEl={ancora} onClose={() => setAncora(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ p: 2, maxWidth: 300 }}>
          <Typography fontWeight={700} gutterBottom>{rotulo}</Typography>
          <Typography variant="body2" color="text.secondary">{mensagem}</Typography>
        </Box>
      </Popover>
    </>
  );
}

export default function Header() {
  const { currentUser, authorizationProfile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuLateralOpen, setMenuLateralOpen] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState<HTMLElement | null>(null);
  const comMenuLateral = Boolean(currentUser) && !SEM_MENU_LATERAL.includes(location.pathname);
  const nome = authorizationProfile?.nome || currentUser?.displayName || currentUser?.email || '';

  return (
    <>
      <Navbar expand className="ledur-navbar" variant="dark">
        <Container fluid className="gap-2">
          {comMenuLateral && (
            <Tooltip title="Menu">
              <IconButton aria-label="Abrir menu" onClick={() => setMenuLateralOpen(true)} sx={{ ...botaoIconeSx, ml: -1 }}>
                <MenuRoundedIcon />
              </IconButton>
            </Tooltip>
          )}
          <Navbar.Brand as={Link} to="/" className="me-auto">
            <img src="/logo-ledur-branco.png" alt="" aria-hidden="true" />
          </Navbar.Brand>
          {currentUser ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <BotaoEmBreve rotulo="Avisos" icone={<Bell size={20} />} mensagem="As notificações do sistema ainda serão implementadas." />
              <BotaoEmBreve rotulo="Ajuda" icone={<HelpCircle size={20} />} mensagem="A ajuda do sistema ainda será implementada." />
              <Tooltip title="Menu do usuário">
                <IconButton aria-label="Menu do usuário" onClick={(e) => setMenuUsuario(e.currentTarget)} sx={{ ...botaoIconeSx, ml: 0.5 }}>
                  <Avatar sx={{ width: 32, height: 32, fontSize: 13, fontWeight: 700, bgcolor: '#00a36c' }}>{iniciais(nome)}</Avatar>
                </IconButton>
              </Tooltip>
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
                  Logout
                </MenuItem>
              </Menu>
            </Box>
          ) : (
            <Nav>
              <Nav.Link as={Link} to="/login">
                Login
              </Nav.Link>
              <Nav.Link as={Link} to="/signup">
                Cadastro
              </Nav.Link>
            </Nav>
          )}
        </Container>
      </Navbar>
      {comMenuLateral && <MenuLateral open={menuLateralOpen} onClose={() => setMenuLateralOpen(false)} />}
    </>
  );
}
