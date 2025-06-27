import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Stack, TextField, Button, Alert, Typography } from '@mui/material';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(email, password);
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
        <TextField label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <TextField label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <Button type="submit" variant="contained">Entrar</Button>
        <Button component={Link} to="/signup">Criar conta</Button>
      </Stack>
    </form>
  );
}