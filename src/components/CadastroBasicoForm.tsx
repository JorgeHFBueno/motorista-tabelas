import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  TextField,
  type ButtonProps,
} from '@mui/material';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { createFornecedorComNumero, getFornecedorNumeroErrorMessage } from '../services/fornecedores.service';

interface CadastroBasicoFormProps {
  buttonLabel?: string;
  buttonVariant?: ButtonProps['variant'];
  dialogTitle: string;
  collectionName: string;
  successMessage: string;
  disabled?: boolean;
  autoGenerateFornecedorNumero?: boolean;
}

export default function CadastroBasicoForm({
  buttonLabel = 'Adicionar',
  buttonVariant = 'contained',
  dialogTitle,
  collectionName,
  successMessage,
  disabled,
  autoGenerateFornecedorNumero = false,
}: CadastroBasicoFormProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<
    { message: string; severity: 'success' | 'error' } | null
  >(null);

  const handleOpenDialog = () => {
    setDialogOpen(true);
    setFormError(null);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setNome('');
    setDescricao('');
    setFormError(null);
    setSaving(false);
  };

  const handleSave = async () => {
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setFormError('Informe o nome.');
      return;
    }

    try {
      setSaving(true);
      if (autoGenerateFornecedorNumero) {
        await createFornecedorComNumero({ nome: nomeTrim, descricao });
      } else {
        await addDoc(collection(db, collectionName), {
          nome: nomeTrim,
          descricao: descricao.trim(),
          createdAt: serverTimestamp(),
        });
      }
      setSnackbar({ message: successMessage, severity: 'success' });
      handleCloseDialog();
    } catch (error) {
      console.error('Erro ao salvar cadastro básico', error);
      setSnackbar({ message: getFornecedorNumeroErrorMessage(error) ?? 'Erro ao salvar.', severity: 'error' });
      setSaving(false);
    }
  };

  const triggerProps = useMemo(() => ({
    variant: buttonVariant,
    onClick: handleOpenDialog,
    disabled: disabled || saving,
  }), [buttonVariant, disabled, saving]);

  return (
    <>
      <Button {...triggerProps}>{buttonLabel}</Button>
      <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{dialogTitle}</DialogTitle>
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
          <Button onClick={handleCloseDialog} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
      {snackbar && (
        <Snackbar
          open={Boolean(snackbar)}
          autoHideDuration={4000}
          onClose={() => setSnackbar(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setSnackbar(null)} severity={snackbar.severity} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      )}
    </>
  );
}
