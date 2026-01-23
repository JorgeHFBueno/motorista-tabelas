import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import useObras from '../hooks/useObras';

export default function ObrasSection() {
  const { obras, loading, error, addObra } = useObras();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  const obrasNormalizadas = useMemo(
    () => obras.map((obra) => obra.nome.trim().toLowerCase()),
    [obras],
  );

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

    if (obrasNormalizadas.includes(nomeTrim.toLowerCase())) {
      setFormError('Já existe uma obra com este nome.');
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
          <Typography variant="body2" color="text.secondary">
            Cadastro e manutenção das obras disponíveis.
          </Typography>
        </Box>
        <Button variant="contained" onClick={handleOpenDialog}>
          Adicionar
        </Button>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Nome</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {obras.map((obra) => (
            <TableRow key={obra.id} hover>
              <TableCell>{obra.nome}</TableCell>
            </TableRow>
          ))}
          {!loading && obras.length === 0 && (
            <TableRow>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  Nenhuma obra cadastrada.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

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