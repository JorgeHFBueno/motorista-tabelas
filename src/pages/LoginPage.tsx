import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Stack, TextField, Button, Alert, Typography } from '@mui/material';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const appendDomain = () => {
    setEmail(identifier ? `${identifier}@example.com` : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullEmail = identifier ? `${identifier}@example.com` : '';
    setEmail(fullEmail);
    if (!identifier) {
      setError('Digite seu identificador');
      return;
    }
    try {
      await signIn(fullEmail, password);
      navigate('/');
    } catch {
      setError('Falha ao entrar');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: 20 }}> {/* simples */}
      <Stack spacing={2} sx={{ maxWidth: 300 }}>
        <Typography variant="h4">Login</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Identificador numérico"
          type="tel"
          placeholder="Somente números"
          value={identifier}
          onChange={e => setIdentifier(e.target.value.replace(/\D/g, ''))}
          onBlur={appendDomain}
          required
          inputProps={{
            inputMode: 'numeric',
            pattern: '[0-9]*',
          }}
        />
        <TextField label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <Button type="submit" variant="contained">Entrar</Button>
      </Stack>
    </form>
  );
}