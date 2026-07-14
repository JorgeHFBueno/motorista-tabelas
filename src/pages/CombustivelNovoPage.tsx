import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Paper,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Registro } from '../types';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import { listObrasNames } from '../services/obras.service';
import { listVeiculosAtivos, type VeiculoOption } from '../services/veiculos.service';
import { listMotoristasAtivos } from '../services/motoristas.service';
import { listMotivosCombustivelAtivos } from '../services/motivos.service';
import { getInitialLiValue } from '../services/combustivel.service';
import { saveCombustivelAndUpdateDieselPatio } from '../services/combustivelFirestore';
import PersistentErrorAlert from '../components/ui/PersistentErrorAlert';
import { toUserFriendlyLoadError } from '../utils/firestoreError';
import LocalAutocomplete from '../components/LocalAutocomplete';

type KmMode = 'km' | 'semOdometro' | 'galao';

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

export default function CombustivelNovoPage() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const { loading: authorizationLoading, profile } = useAuthorizationProfile(currentUser, authLoading);
  const isAdm1 = profile?.adm1 === true;

  const [values, setValues] = useState<Partial<Registro>>({});
  const [kmMode, setKmMode] = useState<KmMode>('km');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const [obrasOptions, setObrasOptions] = useState<string[]>([]);
  const [veiculosOptions, setVeiculosOptions] = useState<VeiculoOption[]>([]);
  const [motoristasOptions, setMotoristasOptions] = useState<string[]>([]);
  const [motivosOptions, setMotivosOptions] = useState<string[]>([]);

  const [obrasLoading, setObrasLoading] = useState(false);
  const [veiculosLoading, setVeiculosLoading] = useState(false);
  const [motoristasLoading, setMotoristasLoading] = useState(false);
  const [motivosLoading, setMotivosLoading] = useState(false);
  const [liLoading, setLiLoading] = useState(false);
  const [autoLi, setAutoLi] = useState<number | null>(null);

  const [obrasError, setObrasError] = useState<string | null>(null);
  const [veiculosError, setVeiculosError] = useState<string | null>(null);
  const [motoristasError, setMotoristasError] = useState<string | null>(null);
  const [motivosError, setMotivosError] = useState<string | null>(null);
  const [liError, setLiError] = useState<string | null>(null);

  const [lfEditedManually, setLfEditedManually] = useState(false);


  useEffect(() => {
    if (authorizationLoading || !profile) return;
    if (import.meta.env.DEV) {
      console.info('[combustivel/novo] renderização escolhida', { isAdm1, adm2: profile.adm2 });
    }
  }, [authorizationLoading, profile, isAdm1]);

  const defaultMotorista = useMemo(() => {
    const email = currentUser?.email?.trim().toLowerCase() ?? '';
    if (isAdm1 && currentUser?.uid) {
      return currentUser.uid;
    }
    return email.split('@')[0] || '';
  }, [isAdm1, currentUser?.uid, currentUser?.email]);

  useEffect(() => {
    setValues((current) => ({
      ...current,
      motorista: defaultMotorista,
      tipoPlaca: typeof current.tipoPlaca === 'boolean' ? current.tipoPlaca : true,
      data: isAdm1 ? new Date() : (current.data ?? new Date()),
    }));
  }, [defaultMotorista, isAdm1]);

  const loadObras = async () => {
    setObrasLoading(true);
    try {
      const obras = await listObrasNames();
      console.info('[combustivel/novo] obras carregadas', obras.length);
      setObrasOptions(obras);
      setObrasError(null);
    } catch (err) {
      console.error('[combustivel/novo] erro ao carregar obras', err);
      setObrasError(toUserFriendlyLoadError('obras', err));
    } finally {
      setObrasLoading(false);
    }
  };

  const loadVeiculos = async () => {
    setVeiculosLoading(true);
    try {
      const veiculos = await listVeiculosAtivos();
      console.info('[combustivel/novo] veículos carregados', veiculos.length);
      setVeiculosOptions(veiculos);
      setVeiculosError(null);
    } catch (err) {
      console.error('[combustivel/novo] erro ao carregar veículos', err);
      setVeiculosError(toUserFriendlyLoadError('placas', err));
    } finally {
      setVeiculosLoading(false);
    }
  };

  const loadMotoristas = async () => {
    setMotoristasLoading(true);
    try {
      const motoristas = await listMotoristasAtivos();
      console.info('[combustivel/novo] motoristas carregados', motoristas.length);
      setMotoristasOptions(motoristas);
      setMotoristasError(null);
    } catch (err) {
      console.error('[combustivel/novo] erro ao carregar motoristas', err);
      setMotoristasError(toUserFriendlyLoadError('motoristas / para quem', err));
    } finally {
      setMotoristasLoading(false);
    }
  };

  const loadMotivos = async () => {
    setMotivosLoading(true);
    try {
      const motivos = await listMotivosCombustivelAtivos();
      console.info('[combustivel/novo] motivos carregados', motivos.length);
      setMotivosOptions(motivos);
      setMotivosError(null);
    } catch (err) {
      console.error('[combustivel/novo] erro ao carregar motivos', err);
      setMotivosError(toUserFriendlyLoadError('motivos', err));
    } finally {
      setMotivosLoading(false);
    }
  };

  const loadInitialLi = async () => {
    setLiLoading(true);
    try {
      const initialLi = await getInitialLiValue();
      console.info('[combustivel/novo] LI inicial carregado', initialLi);
      setLiError(null);
      if (initialLi !== null) {
        setAutoLi(initialLi);
        setValues((current) => ({ ...current, li: initialLi }));
      }
    } catch (err) {
      console.error('[combustivel/novo] erro ao carregar LI inicial', err);
      setLiError(toUserFriendlyLoadError('LI inicial', err));
    } finally {
      setLiLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadObras(), loadVeiculos(), loadMotoristas(), loadMotivos(), loadInitialLi()]);
  }, []);

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
    if (isAdm1 && (field === 'data' || field === 'li' || field === 'motorista')) {
      return;
    }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!currentUser?.email) {
      setFormError('Usuário não autenticado. Faça login novamente.');
      return;
    }

    const data = values.data ? new Date(String(values.data)) : new Date();
    if (Number.isNaN(data.getTime())) {
      setFormError('Informe uma data válida.');
      return;
    }

    const lockedDataForAdm1 = new Date();
    const lockedLiForAdm1 = toInt(autoLi ?? values.li);
    const lockedMotoristaUid = currentUser.uid;

    const km = toInt(values.km);
    if (kmMode === 'km' && km < 0) {
      setFormError('KM deve ser maior ou igual a zero.');
      return;
    }

    const payload: Partial<Registro> = {
      data: isAdm1 ? lockedDataForAdm1 : data,
      placa: normalizeText(values.placa),
      obra: normalizeText(values.obra),
      local: normalizeText(values.local),
      motivo: normalizeText(values.motivo),
      para_quem: normalizeText(values.para_quem),
      motorista: isAdm1 ? lockedMotoristaUid : normalizeText(values.motorista),
      observacao: normalizeText(values.observacao),
      li: isAdm1 ? lockedLiForAdm1 : toInt(values.li),
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
      if (import.meta.env.DEV) {
        console.info('[combustivel/novo] payload sanitizado', {
          isAdm1,
          motorista: payload.motorista,
          data: payload.data,
          li: payload.li,
        });
      }
      setSubmitting(true);
      await saveCombustivelAndUpdateDieselPatio({
        ...payload,
        email: currentUser.email,
        frentista: currentUser.displayName?.trim() || currentUser.email,
      });
      setSnack('Abastecimento e bomba atualizados com sucesso.');
      setSuccessOpen(true);
    } catch (err) {
      console.error('[combustivel/novo] erro ao salvar abastecimento', err);
      const message = err instanceof Error ? err.message : 'Não foi possível salvar o registro.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (authorizationLoading || !profile) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" p={3}>
        <CircularProgress size={22} />
        <Typography variant="body2">Validando perfil de acesso...</Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h5">Novo abastecimento</Typography>
        <Button onClick={() => navigate(isAdm1 ? '/' : '/combustivel')} disabled={submitting}>
          Voltar
        </Button>
      </Stack>

      {formError && <Alert severity="error">{formError}</Alert>}

      <Stack spacing={1}>
        {obrasError && <PersistentErrorAlert message={obrasError} onRetry={() => void loadObras()} onDismiss={() => setObrasError(null)} />}
        {veiculosError && <PersistentErrorAlert message={veiculosError} onRetry={() => void loadVeiculos()} onDismiss={() => setVeiculosError(null)} />}
        {motoristasError && (
          <PersistentErrorAlert
            message={motoristasError}
            onRetry={() => void loadMotoristas()}
            onDismiss={() => setMotoristasError(null)}
          />
        )}
        {motivosError && <PersistentErrorAlert message={motivosError} onRetry={() => void loadMotivos()} onDismiss={() => setMotivosError(null)} />}
        {liError && <PersistentErrorAlert message={liError} onRetry={() => void loadInitialLi()} onDismiss={() => setLiError(null)} />}
      </Stack>

      <Paper sx={{ p: 2 }}>
        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2}>
              {obrasLoading && <Alert severity="info">Carregando obras...</Alert>}
              {veiculosLoading && <Alert severity="info">Carregando placas...</Alert>}
              {motoristasLoading && <Alert severity="info">Carregando motoristas...</Alert>}
              {motivosLoading && <Alert severity="info">Carregando motivos...</Alert>}
              {liLoading && <Alert severity="info">Carregando LI inicial...</Alert>}
            </Stack>

            <TextField
              label="Data"
              type="datetime-local"
              value={toDateInputValue(values.data)}
              onChange={handleChange('data')}
              InputLabelProps={{ shrink: true }}
              disabled={isAdm1}
              helperText={isAdm1 ? 'Data automática para perfil adm1.' : undefined}
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
                loading={veiculosLoading}
                renderInput={(params) => <TextField {...params} label="Placa" fullWidth />}
                fullWidth
              />

              <TextField select label="Obra" value={values.obra ?? ''} onChange={handleChange('obra')} fullWidth>
                {obrasOptions.map((obra) => (
                  <MenuItem key={obra} value={obra}>
                    {obra}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <LocalAutocomplete
                value={values.local ?? ''}
                onChange={(value) => setValues((current) => ({ ...current, local: value }))}
              />

              <Autocomplete
                freeSolo
                options={motivosOptions}
                value={values.motivo ?? ''}
                onInputChange={(_, value) => setValues((current) => ({ ...current, motivo: value }))}
                loading={motivosLoading}
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
                loading={motoristasLoading}
                renderInput={(params) => <TextField {...params} label="Para quem" fullWidth />}
                fullWidth
              />

              {isAdm1 ? (
                <TextField
                  label="Frentista (usuário logado)"
                  value={currentUser?.uid ?? ''}
                  fullWidth
                  disabled
                />
              ) : (
                <Autocomplete
                  freeSolo
                  options={motoristasOptions}
                  value={values.motorista ?? ''}
                  onInputChange={(_, value) => setValues((current) => ({ ...current, motorista: value }))}
                  loading={motoristasLoading}
                  renderInput={(params) => <TextField {...params} label="Motorista" fullWidth />}
                  fullWidth
                />
              )}
            </Stack>

            <TextField label="Observação" value={values.observacao ?? ''} onChange={handleChange('observacao')} fullWidth multiline minRows={2} />

            <FormControlLabel control={<Switch checked={Boolean(values.tipoPlaca)} onChange={handleTipoPlacaChange} />} label="Tipo placa" />

            <FormControl>
              <FormLabel>Modo de odômetro</FormLabel>
              <Stack direction="row" spacing={2}>
                <FormControlLabel control={<Checkbox checked={kmMode === 'km'} onChange={() => handleKmModeChange('km')} />} label="KM" />
                <FormControlLabel control={<Checkbox checked={kmMode === 'galao'} onChange={() => handleKmModeChange('galao')} />} label="GALÃO" />
                <FormControlLabel
                  control={<Checkbox checked={kmMode === 'semOdometro'} onChange={() => handleKmModeChange('semOdometro')} />}
                  label="SEM ODÔMETRO"
                />
              </Stack>
            </FormControl>

            {kmMode === 'km' && <TextField label="KM" type="number" inputProps={{ min: 0 }} value={values.km ?? ''} onChange={handleChange('km')} required />}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="LI"
                type="number"
                value={values.li ?? ''}
                onChange={handleChange('li')}
                fullWidth
                disabled={isAdm1}
                helperText={isAdm1 ? 'Se errado avisar TI. MAS fazer abastecimento normalmente' : undefined}
              />
              <TextField label="LF" type="number" value={values.lf ?? ''} onChange={handleChange('lf')} fullWidth />
              <TextField label="QA" type="number" value={values.qa ?? ''} onChange={handleChange('qa')} fullWidth />
              <TextField label="ARLA" type="number" value={values.arla ?? ''} onChange={handleChange('arla')} fullWidth />
            </Stack>

            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button onClick={() => navigate(isAdm1 ? '/' : '/combustivel')} disabled={submitting}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={
                  submitting || obrasLoading || veiculosLoading || motoristasLoading || motivosLoading || liLoading
                }
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
            </Stack>
          </Stack>
        </form>
      </Paper>

      <Snackbar open={!!snack} onClose={() => setSnack(null)} message={snack} autoHideDuration={10000} />

      <Dialog open={successOpen} onClose={() => { }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 30, textAlign: 'center', fontWeight: 700 }}>✅ Sucesso!</DialogTitle>
        <DialogContent>
          <Typography variant="h5" align="center" sx={{ fontWeight: 700 }}>
            Abastecimento salvo com sucesso.
          </Typography>
          <Typography align="center" sx={{ mt: 1 }}>
            O documento bombas/diesel_patio também foi atualizado.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
          <Button
            variant="contained"
            size="large"
            onClick={() => {
              setSuccessOpen(false);
              navigate('/');
            }}
          >
            Ir para o menu principal
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
