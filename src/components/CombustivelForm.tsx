import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Stack } from '@mui/material';
import { useEffect, useState } from 'react';
import type { Registro } from '../types';

interface Props {
  open: boolean;
  initialData?: Partial<Registro> | null;
  onClose: () => void;
  onSave: (data: Partial<Registro>) => Promise<void>;
}

export default function CombustivelForm({ open, initialData, onClose, onSave }: Props) {
  const [values, setValues] = useState<Partial<Registro>>({});

  useEffect(() => {
    setValues(initialData || {});
  }, [initialData]);

  const handleChange = (field: keyof Registro) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues(v => ({ ...v, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.motorista || !values.qa) return;
    await onSave(values);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initialData?.id ? 'Editar' : 'Novo'} Registro</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <TextField label="Data" type="datetime-local" value={values.data as any || ''} onChange={handleChange('data')} />
            <TextField label="Qnt. Abastecida" type="number" value={values.qa ?? ''} onChange={handleChange('qa')} required />
            <TextField label="Motorista" value={values.motorista ?? ''} onChange={handleChange('motorista')} required />
            <TextField label="Placa" value={values.placa ?? ''} onChange={handleChange('placa')} />
            <TextField label="Destino" value={values.local ?? ''} onChange={handleChange('local')} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained">Salvar</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}