import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
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
import useAdminUsers from '../hooks/useAdminUsers';

type PerfilUsuario = 'Motorista' | 'Adm1' | 'Adm2';

type UsuarioFormState = {
  nome: string;
  email: string;
  celular: boolean;
  password: string;
  perfil: PerfilUsuario | '';
};

type UsuarioFormErrors = {
  nome?: string;
  email?: string;
  password?: string;
  perfil?: string;
};

const DEFAULT_FORM: UsuarioFormState = {
  nome: '',
  email: '',
  celular: false,
  password: '',
  perfil: '',
};

function normalizeEmailInput(value: string, celular: boolean) {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return '';
  }

  if (!celular) {
    return trimmed;
  }

  return trimmed.endsWith('@example.com') ? trimmed : `${trimmed}@example.com`;
}

function validateForm(form: UsuarioFormState) {
  const errors: UsuarioFormErrors = {};
  const normalizedEmail = normalizeEmailInput(form.email, form.celular);

  if (!form.nome.trim()) {
    errors.nome = 'Informe o nome.';
  }

  if (!form.email.trim()) {
    errors.email = 'Informe o email.';
  } else if (!normalizedEmail) {
    errors.email = 'Informe um identificador valido.';
  } else if (!form.celular && !normalizedEmail.includes('@')) {
    errors.email = 'Informe um email valido.';
  }

  if (!form.password.trim()) {
    errors.password = 'Informe a senha inicial.';
  }

  if (!form.perfil) {
    errors.perfil = 'Selecione um perfil.';
  }

  return errors;
}

export default function CadastroUsuarioNovoPage() {
  const navigate = useNavigate();
  const { registerAuthorizedUser } = useAdminUsers({ loadOnMount: false, refreshOnChange: false });
  const [form, setForm] = useState<UsuarioFormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<UsuarioFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const normalizedEmail = useMemo(
    () => normalizeEmailInput(form.email, form.celular),
    [form.email, form.celular],
  );

  const handleSubmit = async () => {
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setSubmitError(null);

    if (Object.keys(nextErrors).length > 0 || !normalizedEmail) {
      return;
    }

    try {
      setSaving(true);
      await registerAuthorizedUser({
        nome: form.nome.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        perfil: form.perfil as PerfilUsuario,
        celular: form.celular,
      });
      navigate('/cadastros', { state: { userCreated: true } });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Erro ao cadastrar usuario.');
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
                Cadastro de usuarios
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Cadastre usuarios internos para acesso ao sistema e salve a autorizacao em <strong>00-autorizados</strong>.
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
            <TextField
              label="Nome"
              value={form.nome}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, nome: event.target.value }));
                setErrors((prev) => ({ ...prev, nome: undefined }));
                setSubmitError(null);
              }}
              required
              fullWidth
              error={Boolean(errors.nome)}
              helperText={errors.nome}
            />

            <Stack spacing={1}>
              <TextField
                label={form.celular ? 'Celular / identificador base' : 'Email'}
                type={form.celular ? 'text' : 'email'}
                value={form.email}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, email: event.target.value }));
                  setErrors((prev) => ({ ...prev, email: undefined }));
                  setSubmitError(null);
                }}
                required
                fullWidth
                error={Boolean(errors.email)}
                helperText={
                  errors.email
                  ?? (form.celular
                    ? 'Quando marcado, o sistema completa automaticamente com @example.com.'
                    : 'O email sera salvo com trim e lowercase.')
                }
              />
              <FormControlLabel
                control={(
                  <Checkbox
                    checked={form.celular}
                    onChange={(event) => {
                      setForm((prev) => ({ ...prev, celular: event.target.checked }));
                      setErrors((prev) => ({ ...prev, email: undefined }));
                      setSubmitError(null);
                    }}
                  />
                )}
                label="Celular"
              />
              <Alert severity="info">
                Document ID final: <strong>{normalizedEmail || '-'}</strong>
              </Alert>
            </Stack>

            <TextField
              label="Senha inicial"
              type="password"
              value={form.password}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, password: event.target.value }));
                setErrors((prev) => ({ ...prev, password: undefined }));
                setSubmitError(null);
              }}
              required
              fullWidth
              error={Boolean(errors.password)}
              helperText={errors.password}
            />

            <FormControl error={Boolean(errors.perfil)}>
              <FormLabel id="perfil-usuario-label">Perfil</FormLabel>
              <RadioGroup
                row
                aria-labelledby="perfil-usuario-label"
                value={form.perfil}
                onChange={(_event, value) => {
                  setForm((prev) => ({ ...prev, perfil: value as PerfilUsuario }));
                  setErrors((prev) => ({ ...prev, perfil: undefined }));
                  setSubmitError(null);
                }}
              >
                <FormControlLabel value="Motorista" control={<Radio />} label="Motorista" />
                <FormControlLabel value="Adm1" control={<Radio />} label="Adm1" />
                <FormControlLabel value="Adm2" control={<Radio />} label="Adm2" />
              </RadioGroup>
              {errors.perfil && (
                <Typography variant="caption" color="error">
                  {errors.perfil}
                </Typography>
              )}
            </FormControl>

            <Alert severity="info">
              Motorista: apenas para entrada e saída. Adm1: Anterior e Combustível, Adm2: Anterior e Cadastros/Area Administrativa (Aqui).
            </Alert>

            {submitError && <Alert severity="error">{submitError}</Alert>}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
              <Button variant="outlined" component={RouterLink} to="/cadastros" disabled={saving}>
                Cancelar
              </Button>
              <Button variant="contained" onClick={handleSubmit} disabled={saving || !normalizedEmail}>
                Salvar usuario
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
