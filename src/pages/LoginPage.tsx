import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { isValidEmailIdentifier, normalizePhoneIdentifier, prepareLoginIdentifier } from '../services/loginIdentifier';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [enterWithPhone, setEnterWithPhone] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLoginModeChange = (checked: boolean) => {
    setEnterWithPhone(checked);
    setIdentifier('');
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const preparedIdentifier = prepareLoginIdentifier(identifier, enterWithPhone);
    if (!preparedIdentifier || (enterWithPhone && !normalizePhoneIdentifier(identifier))) {
      setError(enterWithPhone ? 'Digite seu celular' : 'Digite seu e-mail');
      return;
    }
    if (!enterWithPhone && !isValidEmailIdentifier(preparedIdentifier)) {
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
          <FormControlLabel
            control={<Checkbox checked={enterWithPhone} onChange={event => handleLoginModeChange(event.target.checked)} />}
            label="Entrar com celular"
          />
          <TextField
            label={enterWithPhone ? 'Celular' : 'E-mail'}
            type={enterWithPhone ? 'tel' : 'email'}
            placeholder={enterWithPhone ? 'Somente números' : 'usuario@empresa.com.br'}
            value={identifier}
            onChange={event => {
              setIdentifier(enterWithPhone ? normalizePhoneIdentifier(event.target.value) : event.target.value);
              setError(null);
            }}
            required
            inputProps={enterWithPhone ? {
              inputMode: 'numeric',
              pattern: '[0-9]*',
            } : undefined}
          />
          <TextField label="Senha" type="password" value={password} onChange={event => setPassword(event.target.value)} required />
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
