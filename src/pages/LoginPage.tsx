import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
          <TextField
            label="Celular ou e-mail"
            placeholder="51999999999 ou nome@empresa.com.br"
            autoComplete="username"
            value={identifier}
            onChange={event => {
              setIdentifier(event.target.value);
              setError(null);
            }}
            required
            inputProps={{ autoCapitalize: 'none', spellCheck: false }}
          />
          <TextField label="Senha" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
