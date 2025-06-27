import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack } from '@mui/material';
import { useState } from 'react';

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
}

export default function ReautenticarDialog({ open, onCancel, onConfirm }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onConfirm(password);
      setPassword('');
      setError(null);
      onCancel();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>Reautenticar</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            {error && <div style={{ color: 'red' }}>{error}</div>}
            <TextField
              label="Senha Atual"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Cancelar</Button>
          <Button type="submit" variant="contained">Confirmar</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}