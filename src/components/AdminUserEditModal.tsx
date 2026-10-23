import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { loginDoUsuario, nomeDoUsuario, type AdminUser } from '../services/adminUsersApi';
import { CREDENCIAIS, semCredenciais, type Credencial, type Credenciais } from '../services/credenciais';

export type AdminUserEditValues = { ativo: boolean; credenciais: Credenciais };

interface AdminUserEditModalProps {
  open: boolean;
  user: AdminUser | null;
  onClose: () => void;
  onSave: (values: AdminUserEditValues) => Promise<void>;
  saving: boolean;
  submitError: string | null;
}

// Credenciais e situação de um funcionário. Nome e login não se editam aqui: cada pessoa troca os seus no Meu perfil.
export default function AdminUserEditModal({ open, user, onClose, onSave, saving, submitError }: AdminUserEditModalProps) {
  const [ativo, setAtivo] = useState(true);
  const [credenciais, setCredenciais] = useState<Credenciais>(semCredenciais());

  useEffect(() => {
    setAtivo(user?.funcionario?.ativo ?? true);
    setCredenciais(user?.funcionario?.credenciais ?? semCredenciais());
  }, [user]);

  const nenhuma = !Object.values(credenciais).some(Boolean);

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Editar usuário</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {submitError && <Alert severity="error">{submitError}</Alert>}
          <TextField label="Nome" value={user ? nomeDoUsuario(user) : ''} fullWidth InputProps={{ readOnly: true }} />
          <TextField label="Login" value={user ? loginDoUsuario(user) : ''} fullWidth InputProps={{ readOnly: true }}
            helperText="Nome e login são trocados pela própria pessoa, no Meu perfil." />
          <FormControlLabel control={<Switch checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />} label={ativo ? 'Ativo' : 'Inativo'} />
          <div>
            <FormLabel component="legend">Credenciais</FormLabel>
            <FormGroup>
              {CREDENCIAIS.map((c) => (
                <FormControlLabel
                  key={c.chave}
                  control={<Checkbox checked={credenciais[c.chave]} onChange={(e) => setCredenciais((prev) => ({ ...prev, [c.chave as Credencial]: e.target.checked }))} />}
                  label={<><strong>{c.rotulo}</strong> — {c.descricao}</>}
                />
              ))}
            </FormGroup>
          </div>
          {nenhuma && <Alert severity="warning">Sem nenhuma credencial, a pessoa não entra no app nem na WEB.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button variant="contained" onClick={() => void onSave({ ativo, credenciais })} disabled={saving}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
}
