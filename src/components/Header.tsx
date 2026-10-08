import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import PerfilDialog from './PerfilDialog';
import { useAuth } from '../contexts/AuthContext';

export default function Header() {
  const { currentUser, signOut } = useAuth();
  const location = useLocation();
  const [perfilOpen, setPerfilOpen] = useState(false);

  // A Home possui sua própria navegação lateral; as outras rotas continuam
  // usando este cabeçalho global, inclusive Perfil e Logout.
  if (location.pathname === '/') return null;

  return (
    <>
      <Navbar expand="lg" className="ledur-navbar" variant="dark">
        <Container>
          <Navbar.Brand as={Link} to="/">
            <img src="/logo-ledur-branco.png" alt="" aria-hidden="true" />
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="ms-auto">
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
    </>
  );
}
