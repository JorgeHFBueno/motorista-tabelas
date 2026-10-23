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
  FormGroup,
  FormHelperText,
  FormLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import useAdminUsers from '../hooks/useAdminUsers';
import { CREDENCIAIS, semCredenciais, type Credencial, type Credenciais } from '../services/credenciais';

type UsuarioFormState = {
  nome: string;
  email: string;
  celular: boolean;
  password: string;
  credenciais: Credenciais;
};

type UsuarioFormErrors = {
  nome?: string;
  email?: string;
  password?: string;
  credenciais?: string;
};

const DEFAULT_FORM: UsuarioFormState = {
  nome: '',
  email: '',
  celular: false,
  password: '',
  credenciais: semCredenciais(),
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

  if (!Object.values(form.credenciais).some(Boolean)) {
    errors.credenciais = 'Marque ao menos uma credencial.';
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
  const [contaExistente, setContaExistente] = useState<string | null>(null);

  const normalizedEmail = useMemo(
    () => normalizeEmailInput(form.email, form.celular),
    [form.email, form.celular],
  );

  const handleSubmit = async () => {
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setSubmitError(null);
    setContaExistente(null);

    if (Object.keys(nextErrors).length > 0 || !normalizedEmail) {
      return;
    }

    try {
      setSaving(true);
      const resultado = await registerAuthorizedUser({
        nome: form.nome.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        credenciais: form.credenciais,
        celular: form.celular,
      });
      // Conta que já existia: a tela fica aberta com o aviso, para a administração avisar a pessoa da senha.
      if (resultado.contaExistente) {
        setContaExistente(form.nome.trim());
        setForm(DEFAULT_FORM);
        return;
      }
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
                Cadastre usuarios internos no Firebase Authentication e em <strong>funcionarios/{'{uid}'}</strong>.
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
              O e-mail e atributo; o document ID sera o UID real do Firebase Authentication.
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

            <FormControl error={Boolean(errors.credenciais)} component="fieldset">
              <FormLabel component="legend">Credenciais</FormLabel>
              <FormGroup>
                {CREDENCIAIS.map((c) => (
                  <FormControlLabel
                    key={c.chave}
                    control={(
                      <Checkbox
                        checked={form.credenciais[c.chave]}
                        onChange={(event) => {
                          const marcada = event.target.checked;
                          setForm((prev) => ({ ...prev, credenciais: { ...prev.credenciais, [c.chave as Credencial]: marcada } }));
                          setErrors((prev) => ({ ...prev, credenciais: undefined }));
                          setSubmitError(null);
                        }}
                      />
                    )}
                    label={<><strong>{c.rotulo}</strong> — {c.descricao}</>}
                  />
                ))}
              </FormGroup>
              <FormHelperText>{errors.credenciais ?? 'Cada credencial libera as suas telas; a pessoa pode ter várias. O adm2 entra em tudo.'}</FormHelperText>
            </FormControl>

            {submitError && <Alert severity="error">{submitError}</Alert>}

            {contaExistente && (
              <Alert
                severity="warning"
                action={<Button color="inherit" size="small" component={RouterLink} to="/cadastros">Concluir</Button>}
              >
                {contaExistente} foi cadastrado(a). Já existia uma conta com este login; a senha foi trocada pela informada
                e as sessões abertas nessa conta foram encerradas. Avise a pessoa da nova senha.
              </Alert>
            )}

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
