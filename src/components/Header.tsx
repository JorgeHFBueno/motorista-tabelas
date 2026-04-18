import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import { Link, useNavigate  } from 'react-router-dom';
import { useState } from 'react';
import PerfilDialog from './PerfilDialog';
import { useAuth } from '../contexts/AuthContext';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import { useAdm1MontanteGate } from '../hooks/useAdm1MontanteGate';

export default function Header() {
  const { currentUser, signOut, loading: authLoading } = useAuth();
  const { loading: authorizationLoading, profile } = useAuthorizationProfile(currentUser, authLoading);
  const isAdm1 = profile?.adm1 === true;
  const [perfilOpen, setPerfilOpen] = useState(false);
  const navigate = useNavigate();
  const { requestAccess, dialog } = useAdm1MontanteGate(isAdm1);

  return (
    <>
      <Navbar expand="lg" className="ledur-navbar" variant="dark">
        <Container>
          <Navbar.Brand as={Link} to="/">
            <img src="/logo-ledur-branco.png" alt="" aria-hidden="true" />
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              {currentUser && !authorizationLoading && profile && (
                <>
                  <Nav.Link
                    as={Link}
                    to={isAdm1 ? '/combustivel/novo' : '/combustivel'}
                    onClick={(event) => {
                      if (!isAdm1) return;
                      event.preventDefault();
                      requestAccess(() => navigate('/combustivel/novo'));
                    }}
                  >
                    Combustível
                  </Nav.Link>
                  {!isAdm1 && (
                    <>
                      <Nav.Link as={Link} to="/registros">
                        Registros
                      </Nav.Link>
                      <Nav.Link as={Link} to="/frota">
                        Frota
                      </Nav.Link>
                      <Nav.Link as={Link} to="/portfolio">
                        Portifólio
                      </Nav.Link>
                    </>
                  )}
                </>
              )}
            </Nav>
            <Nav>
              {currentUser ? (
                <>
                  <Nav.Link onClick={() => setPerfilOpen(true)}>Usuário</Nav.Link>
                  <Nav.Link onClick={() => signOut()}>Logout</Nav.Link>
                </>
              ) : (
                <>
                  <Nav.Link as={Link} to="/login">
                    Login
                  </Nav.Link>
                  <Nav.Link as={Link} to="/signup">
                    Cadastro
                  </Nav.Link>
                </>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <PerfilDialog open={perfilOpen} onClose={() => setPerfilOpen(false)} />
      {dialog}
    </>
  );
}
