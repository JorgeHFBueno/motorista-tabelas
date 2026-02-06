import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import PerfilDialog from './PerfilDialog';
import { useAuth } from '../contexts/AuthContext';

export default function Header() {
  const { currentUser, signOut } = useAuth();
    const [perfilOpen, setPerfilOpen] = useState(false);

  return (
    <>
      <Navbar expand="lg" className="bg-body-tertiary">
        <Container>
          <Navbar.Brand as={Link} to="/">
            JHFB
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              {currentUser && (
                <>
                  <Nav.Link as={Link} to="/combustivel">
                    Cliente
                  </Nav.Link>
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
    </>
  );
}