import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Stack, TextField, Button, Alert, Typography } from '@mui/material';

export default function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signUp(email, password);
      navigate('/');
    } catch {
      setError('Falha ao cadastrar');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: 20 }}>
      <Stack spacing={2} sx={{ maxWidth: 300 }}>
        <Typography variant="h4">Cadastro</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <TextField label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        <Button type="submit" variant="contained">Cadastrar</Button>
        <Button component={Link} to="/login">Já tenho conta</Button>
      </Stack>
    </form>
  );
}