import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Stack, Alert } from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import usePerfil from '../hooks/usePerfil';
import ReautenticarDialog from './ReautenticarDialog';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PerfilDialog({ open, onClose }: Props) {
  const { currentUser, signOut } = useAuth();
  const navigate = useNavigate();
  const { updateEmail, updatePassword, reauthenticate } = usePerfil();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);

  useEffect(() => {
    setEmail(currentUser?.email || '');
    setPassword('');
    setConfirmPassword('');
    setError(null);
  }, [currentUser, open]);

  function validate() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mail inválido';
    if (password) {
      if (password.length < 6) return 'Senha deve ter ao menos 6 caracteres';
      if (password !== confirmPassword) return 'As senhas não coincidem';
    }
    return null;
  }

  const attemptUpdate = async () => {
    if (email !== currentUser?.email) await updateEmail(email);
    if (password) await updatePassword(password);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    try {
      await attemptUpdate();
      onClose();
      await signOut();
      navigate('/login');
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setReauthOpen(true);
      } else {
        setError(err.message);
      }
    }
  };

  const handleReauth = async (pwd: string) => {
    try {
      await reauthenticate(pwd);
      setReauthOpen(false);
      await attemptUpdate();
      onClose();
      await signOut();
      navigate('/login');
    } catch (err: any) {
      setReauthOpen(false);
      setError(err.message);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>Meu Perfil</DialogTitle>
        <form onSubmit={handleSave}>
          <DialogContent sx={{ pt: 2 }}>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField label="UID" value={currentUser?.uid || ''} InputProps={{ readOnly: true }} />
              <TextField label="E-mail" value={email} onChange={e => setEmail(e.target.value)} required />
              <TextField label="Nova Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} />
              <TextField label="Confirmar Senha" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              <Alert severity="info">Você precisará fazer login novamente após trocar e-mail ou senha.</Alert>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Fechar</Button>
            <Button type="submit" variant="contained">Salvar</Button>
          </DialogActions>
        </form>
      </Dialog>
      <ReautenticarDialog
        open={reauthOpen}
        onCancel={() => setReauthOpen(false)}
        onConfirm={handleReauth}
      />
    </>
  );
}