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
import LocalAutocomplete from './LocalAutocomplete';

export type CadastroEditFormValues = {
  nome: string;
  descricao: string;
  local: string;
  aka: string;
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
  showObraFields?: boolean;
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
  showObraFields = false,
  submitError = null,
}: CadastroEditModalProps) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [local, setLocal] = useState('');
  const [aka, setAka] = useState('');
  const [numero, setNumero] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNome(initialValues?.nome ?? '');
    setDescricao(initialValues?.descricao ?? '');
    setLocal(initialValues?.local ?? '');
    setAka(initialValues?.aka ?? '');
    setNumero(initialValues?.numero ?? '');
    setFormError(null);
  }, [open, initialValues]);

  const handleSave = async () => {
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setFormError('Informe o nome.');
      return;
    }

    if (showObraFields && !local.trim()) {
      setFormError('Informe o local da obra.');
      return;
    }

    if (showNumero && (!/^\d+$/.test(numero.trim()) || Number(numero.trim()) <= 0)) {
      setFormError('Informe um numero inteiro positivo.');
      return;
    }

    await onSave({
      nome: nomeTrim,
      descricao: descricao.trim(),
      local: local.trim(),
      aka: aka.trim(),
      numero: numero.trim(),
    });
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
          {showObraFields ? (
            <>
              <LocalAutocomplete
                value={local}
                onChange={setLocal}
                required
                error={Boolean(formError) && !local.trim()}
                helperText={Boolean(formError) && !local.trim() ? formError : undefined}
                placeholder="Local da obra"
              />
              <TextField
                label="Sinônimo"
                value={aka}
                onChange={(event) => setAka(event.target.value)}
                placeholder="Nome alternativo da obra"
                fullWidth
              />
            </>
          ) : (
            <TextField
              label="Descrição (opcional)"
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              fullWidth
              multiline
            />
          )}
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
