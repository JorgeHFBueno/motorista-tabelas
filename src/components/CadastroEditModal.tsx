import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';

export type CadastroEditFormValues = {
  nome: string;
  descricao: string;
};

interface CadastroEditModalProps {
  open: boolean;
  title: string;
  initialValues?: CadastroEditFormValues;
  onClose: () => void;
  onSave: (values: CadastroEditFormValues) => Promise<void>;
  saving?: boolean;
}

export default function CadastroEditModal({
  open,
  title,
  initialValues,
  onClose,
  onSave,
  saving = false,
}: CadastroEditModalProps) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNome(initialValues?.nome ?? '');
    setDescricao(initialValues?.descricao ?? '');
    setFormError(null);
  }, [open, initialValues]);

  const handleSave = async () => {
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setFormError('Informe o nome.');
      return;
    }

    await onSave({ nome: nomeTrim, descricao: descricao.trim() });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} mt={1}>
          <TextField
            label="Nome"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            required
            error={Boolean(formError)}
            helperText={formError}
            fullWidth
          />
          <TextField
            label="Descrição (opcional)"
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
            fullWidth
            multiline
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
}