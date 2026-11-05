import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { app } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { isValidEmailIdentifier, prepareLoginIdentifier } from '../services/loginIdentifier';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [enviandoLink, setEnviandoLink] = useState(false);

  // Primeiro acesso (conta criada sem senha, ex.: vinda do monday) ou senha esquecida: o Firebase manda para o
  // e-mail o link de criar a senha. A resposta é a mesma com ou sem conta, para não revelar quem está cadastrado.
  const enviarLinkDeSenha = async () => {
    if (enviandoLink) return;
    const email = identifier.trim().toLowerCase();
    setError(null);
    setInfo(null);
    if (!email.includes('@')) {
      setError(email ? 'Quem entra pelo celular não recebe o link: peça uma senha nova ao administrador.' : 'Digite seu e-mail para receber o link.');
      return;
    }
    if (!isValidEmailIdentifier(email)) {
      setError('Digite um e-mail válido');
      return;
    }
    setEnviandoLink(true);
    try {
      await sendPasswordResetEmail(getAuth(app), email);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/user-not-found') {
        setError(code === 'auth/too-many-requests' ? 'Muitos pedidos seguidos. Tente de novo em alguns minutos.' : 'Não foi possível enviar o link. Tente de novo.');
        return;
      }
    } finally {
      setEnviandoLink(false);
    }
    setInfo(`Se houver uma conta com ${email}, enviamos para ele o link para criar a senha. Confira também a caixa de spam.`);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const preparedIdentifier = prepareLoginIdentifier(identifier);
    if (!preparedIdentifier) {
      setError('Digite seu celular ou e-mail');
      return;
    }
    if (identifier.includes('@') && !isValidEmailIdentifier(preparedIdentifier)) {
      setError('Digite um e-mail válido');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(preparedIdentifier, password);
      navigate('/');
    } catch {
      setError('Falha ao entrar');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box
      component="main"
      sx={{
        display: 'grid',
        minHeight: 'calc(100vh - 72px)',
        placeItems: 'center',
        px: 2,
        py: 4,
      }}
    >
      <Paper component="form" onSubmit={handleSubmit} elevation={2} sx={{ maxWidth: 380, p: 3, width: '100%' }}>
        <Stack spacing={2}>
          <Typography variant="h4">Login</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {info && <Alert severity="info">{info}</Alert>}
          <TextField
            label="Celular ou e-mail"
            placeholder="51999999999 ou nome@empresa.com.br"
            autoComplete="username"
            value={identifier}
            onChange={event => {
              setIdentifier(event.target.value);
              setError(null);
              setInfo(null);
            }}
            required
            inputProps={{ autoCapitalize: 'none', spellCheck: false }}
          />
          <TextField label="Senha" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </Button>
          <Button type="button" variant="text" size="small" onClick={() => void enviarLinkDeSenha()} disabled={enviandoLink}>
            {enviandoLink ? 'Enviando...' : 'Primeiro acesso ou esqueci minha senha'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
