import { useEffect, useState } from 'react';
import {
  Alert,
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
  numero?: string;
};

interface CadastroEditModalProps {
  open: boolean;
  title: string;
  initialValues?: CadastroEditFormValues;
  onClose: () => void;
  onSave: (values: CadastroEditFormValues) => Promise<void>;
  saving?: boolean;
  showNumero?: boolean;
  submitError?: string | null;
}

export default function CadastroEditModal({
  open,
  title,
  initialValues,
  onClose,
  onSave,
  saving = false,
  showNumero = false,
  submitError = null,
}: CadastroEditModalProps) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [numero, setNumero] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNome(initialValues?.nome ?? '');
    setDescricao(initialValues?.descricao ?? '');
    setNumero(initialValues?.numero ?? '');
    setFormError(null);
  }, [open, initialValues]);

  const handleSave = async () => {
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setFormError('Informe o nome.');
      return;
    }

    if (showNumero && (!/^\d+$/.test(numero.trim()) || Number(numero.trim()) <= 0)) {
      setFormError('Informe um numero inteiro positivo.');
      return;
    }

    await onSave({ nome: nomeTrim, descricao: descricao.trim(), numero: numero.trim() });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} mt={1}>
          {submitError && <Alert severity="error">{submitError}</Alert>}
          {showNumero && (
            <TextField
              label="Numero"
              value={numero}
              onChange={(event) => setNumero(event.target.value)}
              required
              error={Boolean(formError) && (!/^\d+$/.test(numero.trim()) || Number(numero.trim()) <= 0)}
              helperText={Boolean(formError) && (!/^\d+$/.test(numero.trim()) || Number(numero.trim()) <= 0) ? formError : undefined}
              fullWidth
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
            />
          )}
          <TextField
            label="Nome"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            required
            error={Boolean(formError) && !nome.trim()}
            helperText={Boolean(formError) && !nome.trim() ? formError : undefined}
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
