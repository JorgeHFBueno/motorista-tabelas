import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import useObras from '../hooks/useObras';
import EditarEmBreveButton from './EditarEmBreveButton';

export default function ObrasSection() {
  const { addObra } = useObras({ loadOnMount: false, refreshOnAdd: false });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const handleOpenDialog = () => {
    setDialogOpen(true);
    setFormError(null);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setNome('');
    setSaving(false);
    setFormError(null);
  };

  const handleSave = async () => {
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setFormError('Informe o nome da obra.');
      return;
    }    

    try {
      setSaving(true);
      await addObra(nomeTrim);
      setSnackbar({ message: 'Obra cadastrada com sucesso.', severity: 'success' });
      handleCloseDialog();
    } catch (err) {
      setSnackbar({ message: (err as Error).message || 'Erro ao cadastrar obra.', severity: 'error' });
      setSaving(false);
    }
  };

  return (
    <Paper elevation={1} sx={{ p: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} mb={2} alignItems={{ sm: 'center' }}>
        <Box>
          <Typography variant="h6">Obras</Typography>
          <Typography variant="body2" color="text.secondary">Cadastro de obras.</Typography>
        </Box>
         <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={handleOpenDialog}>
            Cadastrar obra
          </Button>
          <EditarEmBreveButton />
        </Stack>
      </Stack>      

      <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>Adicionar obra</DialogTitle>
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
    </Paper>
  );
}