import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Container,
  FormControl,
  FormControlLabel,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { createVeiculo, VeiculoCadastroError, type VeiculoCategoria } from '../services/veiculos.service';

type VeiculoFormState = {
  categoria: VeiculoCategoria;
  placa: string;
  extra: string;
  complemento: string;
  quilometragemInicial: string;
};

type VeiculoFormErrors = {
  categoria?: string;
  principal?: string;
  quilometragemInicial?: string;
};

const DEFAULT_FORM: VeiculoFormState = {
  categoria: 'PLACA',
  placa: '',
  extra: '',
  complemento: '',
  quilometragemInicial: '',
};

function validateForm(form: VeiculoFormState): VeiculoFormErrors {
  const errors: VeiculoFormErrors = {};
  const principalValue = form.categoria === 'PLACA' ? form.placa.trim() : form.extra.trim();
  const kmRaw = form.quilometragemInicial.trim();

  if (!form.categoria) {
    errors.categoria = 'Selecione a categoria.';
  }

  if (!principalValue) {
    errors.principal =
      form.categoria === 'PLACA' ? 'Informe a placa.' : 'Informe o identificador extra.';
  }

  if (!kmRaw) {
    errors.quilometragemInicial = 'Informe a quilometragem inicial.';
    return errors;
  }

  if (!/^\d+$/.test(kmRaw)) {
    errors.quilometragemInicial = 'A quilometragem inicial deve ser um inteiro maior ou igual a zero.';
    return errors;
  }

  const kmValue = Number(kmRaw);
  if (!Number.isInteger(kmValue) || kmValue < 0) {
    errors.quilometragemInicial = 'A quilometragem inicial deve ser um inteiro maior ou igual a zero.';
  }

  return errors;
}

export default function CadastroVeiculoNovoPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<VeiculoFormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<VeiculoFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const principalLabel = form.categoria === 'PLACA' ? 'Placa' : 'Extra';
  const principalValue = form.categoria === 'PLACA' ? form.placa : form.extra;
  const identificador = useMemo(() => principalValue.trim(), [principalValue]);

  const handleCategoriaChange = (categoria: VeiculoCategoria) => {
    setForm((prev) => ({ ...prev, categoria }));
    setErrors({});
    setSubmitError(null);
  };

  const handlePrincipalChange = (value: string) => {
    setForm((prev) =>
      prev.categoria === 'PLACA'
        ? { ...prev, placa: value }
        : { ...prev, extra: value },
    );
    setErrors((prev) => ({ ...prev, principal: undefined }));
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setSubmitError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      setSaving(true);
      await createVeiculo({
        categoria: form.categoria,
        placa: form.placa,
        extra: form.extra,
        complemento: form.complemento,
        quilometragemInicial: Number(form.quilometragemInicial.trim()),
      });
      navigate('/cadastros', { state: { vehicleCreated: true } });
    } catch (error) {
      const message =
        error instanceof VeiculoCadastroError
          ? error.message
          : 'Erro ao cadastrar veÃ­culo.';
      setSubmitError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between">
            <Box>
              <Typography variant="h4" gutterBottom>
                Cadastro de veículos
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Cadastre veículos na coleção <strong>veiculos</strong> usando placa ou extra como identificador principal.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="outlined" component={RouterLink} to="/cadastros">
                Voltar
              </Button>
            </Stack>
          </Stack>
        </Box>

        <Paper elevation={1} sx={{ p: 3 }}>
          <Stack spacing={3}>
            <FormControl error={Boolean(errors.categoria)}>
              <FormLabel id="categoria-veiculo-label">Categoria</FormLabel>
              <RadioGroup
                row
                aria-labelledby="categoria-veiculo-label"
                value={form.categoria}
                onChange={(_event, value) => handleCategoriaChange(value as VeiculoCategoria)}
              >
                <FormControlLabel value="PLACA" control={<Radio />} label="PLACA" />
                <FormControlLabel value="EXTRA" control={<Radio />} label="EXTRA" />
              </RadioGroup>
            </FormControl>

            <TextField
              label={principalLabel}
              value={principalValue}
              onChange={(event) => handlePrincipalChange(event.target.value)}
              required
              fullWidth
              error={Boolean(errors.principal)}
              helperText={errors.principal}
            />

            <TextField
              label="Complemento"
              value={form.complemento}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, complemento: event.target.value }));
                setSubmitError(null);
              }}
              fullWidth
            />

            <TextField
              label="Quilometragem inicial"
              type="number"
              value={form.quilometragemInicial}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, quilometragemInicial: event.target.value }));
                setErrors((prev) => ({ ...prev, quilometragemInicial: undefined }));
                setSubmitError(null);
              }}
              required
              fullWidth
              error={Boolean(errors.quilometragemInicial)}
              helperText={errors.quilometragemInicial}
              inputProps={{ min: 0, step: 1 }}
            />

            {submitError && <Alert severity="error">{submitError}</Alert>}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
              <Button variant="outlined" component={RouterLink} to="/cadastros" disabled={saving}>
                Cancelar
              </Button>
              <Button variant="contained" onClick={handleSubmit} disabled={saving || !identificador}>
                Salvar Veículos
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
