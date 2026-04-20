import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import type { AdminUser } from '../services/adminUsersApi';

type PerfilUsuario = 'Motorista' | 'Adm1' | 'Adm2';

export type AdminUserEditValues = {
  disabled: boolean;
  perfil: PerfilUsuario;
};

interface AdminUserEditModalProps {
  open: boolean;
  user: AdminUser | null;
  onClose: () => void;
  onSave: (values: AdminUserEditValues) => Promise<void>;
  saving?: boolean;
  submitError?: string | null;
}

function getDisplayName(user: AdminUser | null) {
  if (!user) {
    return '';
  }

  const displayName = user.displayName?.trim();
  if (displayName) {
    return displayName;
  }

  const authorizationName = user.authorization.nome?.trim();
  if (authorizationName) {
    return authorizationName;
  }

  const email = user.email?.trim().toLowerCase();
  if (email) {
    return email.split('@')[0];
  }

  return user.uid;
}

export default function AdminUserEditModal({
  open,
  user,
  onClose,
  onSave,
  saving = false,
  submitError = null,
}: AdminUserEditModalProps) {
  const [disabled, setDisabled] = useState(false);
  const [perfil, setPerfil] = useState<PerfilUsuario>('Motorista');

  useEffect(() => {
    if (!open || !user) {
      return;
    }

    setDisabled(user.disabled);
    setPerfil(user.authorization.profile);
  }, [open, user]);

  const handleSave = async () => {
    await onSave({ disabled, perfil });
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Editar usuario</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} mt={1}>
          {submitError && <Alert severity="error">{submitError}</Alert>}

          {!user?.authorization.exists && (
            <Alert severity="info">
              Este usuario ainda nao possui documento em <strong>00-autorizados</strong>. O documento sera criado ao salvar.
            </Alert>
          )}

          <TextField
            label="Nome"
            value={getDisplayName(user)}
            fullWidth
            InputProps={{ readOnly: true }}
          />

          <TextField
            label="Email"
            value={user?.email ?? '-'}
            fullWidth
            InputProps={{ readOnly: true }}
          />

          <FormControlLabel
            control={(
              <Switch
                checked={!disabled}
                onChange={(event) => setDisabled(!event.target.checked)}
                disabled={saving}
              />
            )}
            label={!disabled ? 'Usuario ativo' : 'Usuario inativo'}
          />

          <FormControl>
            <FormLabel id="perfil-usuario-edicao-label">Perfil</FormLabel>
            <RadioGroup
              aria-labelledby="perfil-usuario-edicao-label"
              value={perfil}
              onChange={(_event, value) => setPerfil(value as PerfilUsuario)}
            >
              <FormControlLabel value="Motorista" control={<Radio />} label="Motorista" />
              <FormControlLabel value="Adm1" control={<Radio />} label="Adm1" />
              <FormControlLabel value="Adm2" control={<Radio />} label="Adm2" />
            </RadioGroup>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={saving || !user?.email}>
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
