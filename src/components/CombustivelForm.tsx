import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Registro } from '../types';
import { DESTINOS_OPTIONS } from '../constants/combustivel';
import { listObrasNames } from '../services/obras.service';
import { listVeiculosAtivos, type VeiculoOption } from '../services/veiculos.service';
import { listMotoristasAtivos } from '../services/motoristas.service';
import { listMotivosCombustivelAtivos } from '../services/motivos.service';
import { getInitialLiValue } from '../services/combustivel.service';

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
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [obrasOptions, setObrasOptions] = useState<string[]>([]);
  const [veiculosOptions, setVeiculosOptions] = useState<VeiculoOption[]>([]);
  const [motoristasOptions, setMotoristasOptions] = useState<string[]>([]);
  const [motivosOptions, setMotivosOptions] = useState<string[]>([]);

  const [lfEditedManually, setLfEditedManually] = useState(false);

  const defaultMotorista = useMemo(() => {
    const email = currentUser?.email?.trim().toLowerCase() ?? '';
    return email.split('@')[0] || '';
  }, [currentUser?.email]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;

    const loadOptions = async () => {
      setLoadingOptions(true);
      setFormError(null);
      try {
        const [obras, veiculos, motoristas, motivos] = await Promise.all([
          listObrasNames(),
          listVeiculosAtivos(),
          listMotoristasAtivos(),
          listMotivosCombustivelAtivos(),
        ]);

        if (!mounted) return;
        setObrasOptions(obras);
        setVeiculosOptions(veiculos);
        setMotoristasOptions(motoristas);
        setMotivosOptions(motivos);
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : 'Erro ao carregar listas do formulário.';
        setFormError(message);
      } finally {
        if (mounted) setLoadingOptions(false);
      }
    };

    void loadOptions();

    return () => {
      mounted = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let mounted = true;
    const nextValues = initialData ? { ...initialData } : {};
    
    if (!nextValues.motorista && defaultMotorista) {
      nextValues.motorista = defaultMotorista;
    }
    if (typeof nextValues.tipoPlaca !== 'boolean') {
      nextValues.tipoPlaca = true;
    }
    
    const initValues = async () => {
      if (!initialData?.id && typeof nextValues.li === 'undefined') {
        try {
          const initialLi = await getInitialLiValue();
          if (mounted && initialLi !== null) {
            nextValues.li = initialLi;
          }
        } catch {
          // silencioso: campo continua livre para preenchimento manual
        }
      }

      if (!mounted) return;
      setValues(nextValues);
      setKmMode(getInitialKmMode(initialData));
      setLfEditedManually(false);
      setSubmitting(false);
      setFormError(null);
    };

    void initValues();

    return () => {
      mounted = false;
    };
  }, [initialData, defaultMotorista, open]);

  useEffect(() => {
    if (lfEditedManually) return;
    const li = toInt(values.li);
    const qa = toInt(values.qa);
    const computedLf = li + qa;
    if (toInt(values.lf) !== computedLf) {
      setValues((current) => ({ ...current, lf: computedLf }));
    }
  }, [values.li, values.qa, values.lf, lfEditedManually]);

  const handleChange = (field: keyof Registro) => (e: ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    if (field === 'lf') {
      setLfEditedManually(true);
    }
    setValues((v) => ({ ...v, [field]: nextValue }));
  };

  const handleTipoPlacaChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, tipoPlaca: e.target.checked }));
  };

  const handleKmModeChange = (nextMode: KmMode) => {
    setKmMode(nextMode);
    setValues((current) => {
      const next = { ...current };
      if (nextMode === 'km') {
        next.semKm = '';
      } else if (nextMode === 'galao') {
        next.km = undefined;
        next.semKm = 'Galão';
      } else {
        next.km = undefined;
        next.semKm = 'Sem Odômetro';
      }
      return next;
    });
  };

  const clearForm = () => {
    setValues({ motorista: defaultMotorista, tipoPlaca: true });
    setKmMode('km');
    setLfEditedManually(false);
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
      payload.semKm = '';
    }
    if (kmMode === 'semOdometro') {
      payload.km = null as unknown as number;
      payload.semKm = 'Sem Odômetro';
    }
    if (kmMode === 'galao') {
      payload.km = null as unknown as number;
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
            
            {loadingOptions && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CircularProgress size={18} />
                <Alert severity="info">Carregando listas do formulário...</Alert>
              </Stack>
            )}

            <TextField
              label="Data"
              type="datetime-local"
              value={toDateInputValue(values.data)}
              onChange={handleChange('data')}
              InputLabelProps={{ shrink: true }}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
               <Autocomplete
                options={veiculosOptions}
                getOptionLabel={(option) => option.identificador}
                value={veiculosOptions.find((v) => v.identificador === values.placa) ?? null}
                onChange={(_, vehicle) => {
                  setValues((current) => ({
                    ...current,
                    placa: vehicle?.identificador ?? '',
                    km: vehicle?.quilometragemUltima ?? current.km,
                  }));
                }}
                loading={loadingOptions}
                renderInput={(params) => <TextField {...params} label="Placa" fullWidth />}
                fullWidth
              />

              <TextField select label="Obra" value={values.obra ?? ''} onChange={handleChange('obra')} fullWidth>
                {obrasOptions.map((obra) => (
                  <MenuItem key={obra} value={obra}>{obra}</MenuItem>
                ))}
              </TextField>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Autocomplete
                freeSolo
                options={DESTINOS_OPTIONS}
                value={values.local ?? ''}
                onInputChange={(_, value) => setValues((current) => ({ ...current, local: value }))}
                renderInput={(params) => <TextField {...params} label="Local" fullWidth />}
                fullWidth
              />

              <Autocomplete
                freeSolo
                options={motivosOptions}
                value={values.motivo ?? ''}
                onInputChange={(_, value) => setValues((current) => ({ ...current, motivo: value }))}
                loading={loadingOptions}
                renderInput={(params) => <TextField {...params} label="Motivo" fullWidth />}
                fullWidth
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Autocomplete
                freeSolo
                options={motoristasOptions}
                value={values.para_quem ?? ''}
                onInputChange={(_, value) => setValues((current) => ({ ...current, para_quem: value }))}
                loading={loadingOptions}
                renderInput={(params) => <TextField {...params} label="Para quem" fullWidth />}
                fullWidth
              />

              <Autocomplete
                freeSolo
                options={motoristasOptions}
                value={values.motorista ?? ''}
                onInputChange={(_, value) => setValues((current) => ({ ...current, motorista: value }))}
                loading={loadingOptions}
                renderInput={(params) => <TextField {...params} label="Motorista" fullWidth />}
                fullWidth
              />
            </Stack>

            <TextField label="Observação" value={values.observacao ?? ''} onChange={handleChange('observacao')} fullWidth multiline minRows={2} />

            <FormControlLabel
              control={<Switch checked={Boolean(values.tipoPlaca)} onChange={handleTipoPlacaChange} />}
              label="Tipo placa"
            />

            <FormControl>
              <FormLabel>Modo de odômetro</FormLabel>
              <Stack direction="row" spacing={2}>
                <FormControlLabel
                  control={<Checkbox checked={kmMode === 'km'} onChange={() => handleKmModeChange('km')} />}
                  label="KM"
                />
                <FormControlLabel
                  control={<Checkbox checked={kmMode === 'galao'} onChange={() => handleKmModeChange('galao')} />}
                  label="GALÃO"
                />
                <FormControlLabel
                  control={<Checkbox checked={kmMode === 'semOdometro'} onChange={() => handleKmModeChange('semOdometro')} />}
                  label="SEM ODÔMETRO"
                />
              </Stack>
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
          <Button type="submit" variant="contained" disabled={submitting || loadingOptions}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}