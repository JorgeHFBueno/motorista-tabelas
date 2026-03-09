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
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Registro } from '../types';

type KmMode = 'km' | 'semOdometro' | 'galao';

interface Props {
  open: boolean;
  initialData?: Partial<Registro> | null;
  onClose: () => void;
  onSave: (data: Partial<Registro>) => Promise<void>;
}

function toDateInputValue(raw: unknown): string {
  if (!raw) return '';
  const date = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }
  return 0;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getInitialKmMode(data?: Partial<Registro> | null): KmMode {
  if (data?.semKm === 'Sem Odômetro') return 'semOdometro';
  if (data?.semKm === 'Galão') return 'galao';
  return 'km';
}

export default function CombustivelForm({ open, initialData, onClose, onSave }: Props) {
  const { currentUser } = useAuth();
  const [values, setValues] = useState<Partial<Registro>>({});
  const [kmMode, setKmMode] = useState<KmMode>('km');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const defaultMotorista = useMemo(() => {
    const email = currentUser?.email?.trim().toLowerCase() ?? '';
    return email.split('@')[0] || '';
  }, [currentUser?.email]);

  useEffect(() => {
    const nextValues = initialData ? { ...initialData } : {};
    if (!nextValues.motorista && defaultMotorista) {
      nextValues.motorista = defaultMotorista;
    }
    if (typeof nextValues.tipoPlaca !== 'boolean') {
      nextValues.tipoPlaca = true;
    }
    setValues(nextValues);
    setKmMode(getInitialKmMode(initialData));
    setSubmitting(false);
    setFormError(null);
  }, [initialData, defaultMotorista, open]);

  const handleChange = (field: keyof Registro) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
  };

  const handleTipoPlacaChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, tipoPlaca: e.target.checked }));
  };

  const clearForm = () => {
    setValues({ motorista: defaultMotorista, tipoPlaca: true });
    setKmMode('km');
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const data = values.data ? new Date(String(values.data)) : new Date();
    if (Number.isNaN(data.getTime())) {
      setFormError('Informe uma data válida.');
      return;
    }

    const km = toInt(values.km);
    if (kmMode === 'km' && km < 0) {
      setFormError('KM deve ser maior ou igual a zero.');
      return;
    }

    const payload: Partial<Registro> = {
      data,
      placa: normalizeText(values.placa),
      obra: normalizeText(values.obra),
      local: normalizeText(values.local),
      motivo: normalizeText(values.motivo),
      para_quem: normalizeText(values.para_quem),
      motorista: normalizeText(values.motorista),
      observacao: normalizeText(values.observacao),
      li: toInt(values.li),
      lf: toInt(values.lf),
      qa: toInt(values.qa),
      arla: toInt(values.arla),
      tipoPlaca: Boolean(values.tipoPlaca),
    };

    if (kmMode === 'km') {
      payload.km = km;
    }
    if (kmMode === 'semOdometro') {
      payload.semKm = 'Sem Odômetro';
    }
    if (kmMode === 'galao') {
      payload.semKm = 'Galão';
    }

    try {
      setSubmitting(true);
      await onSave(payload);
      clearForm();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Não foi possível salvar o registro.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{initialData?.id ? 'Editar' : 'Novo'} Registro</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField
              label="Data"
              type="datetime-local"
              value={toDateInputValue(values.data)}
              onChange={handleChange('data')}
              InputLabelProps={{ shrink: true }}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Placa" value={values.placa ?? ''} onChange={handleChange('placa')} fullWidth />
              <TextField label="Obra" value={values.obra ?? ''} onChange={handleChange('obra')} fullWidth />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Local" value={values.local ?? ''} onChange={handleChange('local')} fullWidth />
              <TextField label="Motivo" value={values.motivo ?? ''} onChange={handleChange('motivo')} fullWidth />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Para quem" value={values.para_quem ?? ''} onChange={handleChange('para_quem')} fullWidth />
              <TextField label="Motorista" value={values.motorista ?? ''} onChange={handleChange('motorista')} fullWidth />
            </Stack>

            <TextField label="Observação" value={values.observacao ?? ''} onChange={handleChange('observacao')} fullWidth multiline minRows={2} />

            <FormControlLabel
              control={<Switch checked={Boolean(values.tipoPlaca)} onChange={handleTipoPlacaChange} />}
              label="Tipo placa"
            />

            <FormControl>
              <FormLabel>Modo de odômetro</FormLabel>
              <RadioGroup row value={kmMode} onChange={(_, value) => setKmMode(value as KmMode)}>
                <FormControlLabel value="km" control={<Radio />} label="KM" />
                <FormControlLabel value="semOdometro" control={<Radio />} label="Sem Odômetro" />
                <FormControlLabel value="galao" control={<Radio />} label="Galão" />
              </RadioGroup>
            </FormControl>

            {kmMode === 'km' && (
              <TextField label="KM" type="number" inputProps={{ min: 0 }} value={values.km ?? ''} onChange={handleChange('km')} required />
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="LI" type="number" value={values.li ?? ''} onChange={handleChange('li')} fullWidth />
              <TextField label="LF" type="number" value={values.lf ?? ''} onChange={handleChange('lf')} fullWidth />
              <TextField label="QA" type="number" value={values.qa ?? ''} onChange={handleChange('qa')} fullWidth />
              <TextField label="ARLA" type="number" value={values.arla ?? ''} onChange={handleChange('arla')} fullWidth />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}