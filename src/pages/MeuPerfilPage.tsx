import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Container, Divider, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuth } from '../contexts/AuthContext';
import usePerfil from '../hooks/usePerfil';
import ReautenticarDialog from '../components/ReautenticarDialog';
import { getFuncionarioData } from '../services/authorizationProfile';
import { camposExtrasFuncionario, iniciais, perfisMarcados } from '../services/funcionarios';
import { descreverLogin, formatarCelular, isValidEmailIdentifier, normalizePhoneIdentifier, PHONE_LOGIN_DOMAIN, type TipoLogin } from '../services/loginIdentifier';
import { atualizarMeuPerfil, pedeLoginRecente } from '../services/meuPerfil';

const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

// Valores do Firestore em texto: Timestamp vira data/hora de Brasília; objetos aparecem como JSON.
function formatarValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (typeof valor === 'object' && typeof (valor as { toDate?: unknown }).toDate === 'function') {
    return dataHora.format((valor as { toDate: () => Date }).toDate());
  }
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" component="div">{rotulo}</Typography>
      <Box sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  );
}

const mensagemErro = (err: unknown) => (err instanceof Error ? err.message : 'Erro ao salvar.');

// Login em texto: celular formatado ou o e-mail.
function textoLogin(email: unknown) {
  const login = descreverLogin(typeof email === 'string' ? email : '');
  return login.tipo === 'celular' ? `Celular ${formatarCelular(login.valor)}` : login.valor || '—';
}

const gradeCamposSx = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 };

export default function MeuPerfilPage() {
  const { currentUser, signOut, refreshAuthorizationProfile } = useAuth();
  const navigate = useNavigate();
  const { updatePassword, reauthenticate } = usePerfil();
  const loginAtual = descreverLogin(currentUser?.email);

  const [funcionario, setFuncionario] = useState<Record<string, unknown> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);

  const [nomeEditado, setNomeEditado] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [avisoNome, setAvisoNome] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  const [tipoLogin, setTipoLogin] = useState<TipoLogin>(loginAtual.tipo);
  const [login, setLogin] = useState(loginAtual.valor);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    let ativo = true;
    setCarregando(true);
    getFuncionarioData(currentUser.uid)
      .then((data) => { if (ativo) { setFuncionario(data); setNomeEditado(typeof data?.nome === 'string' ? data.nome : ''); setErroLeitura(null); } })
      .catch((err: unknown) => { if (ativo) setErroLeitura(err instanceof Error ? err.message : 'Erro ao ler o cadastro.'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [currentUser]);

  if (!currentUser) return null;

  const nome = typeof funcionario?.nome === 'string' && funcionario.nome.trim() ? funcionario.nome.trim() : currentUser.displayName || currentUser.email || '';
  const perfis = perfisMarcados(funcionario?.perfis);
  const ordemMotorista = (funcionario?.motorista as { ordem?: unknown } | undefined)?.ordem;
  const extras = funcionario ? camposExtrasFuncionario(funcionario) : [];
  const nomeCadastro = typeof funcionario?.nome === 'string' ? funcionario.nome : '';
  const nomeLimpo = nomeEditado.trim().replace(/\s+/g, ' ');
  const alterouNome = Boolean(funcionario) && nomeLimpo !== nomeCadastro;
  const loginNormalizado = tipoLogin === 'celular' ? normalizePhoneIdentifier(login) : login.trim().toLowerCase();
  const alterouLogin = tipoLogin !== loginAtual.tipo || loginNormalizado !== loginAtual.valor;
  const alterouAcesso = alterouLogin || Boolean(password);

  const salvarNome = async (e: FormEvent) => {
    e.preventDefault();
    if (nomeLimpo.length < 3 || nomeLimpo.length > 120) { setAvisoNome({ tipo: 'error', texto: 'O nome deve ter de 3 a 120 caracteres.' }); return; }
    setSalvandoNome(true);
    setAvisoNome(null);
    try {
      const resultado = await atualizarMeuPerfil({ nome: nomeLimpo });
      setFuncionario((atual) => (atual ? { ...atual, nome: resultado.nome } : atual));
      setNomeEditado(resultado.nome);
      setAvisoNome({ tipo: 'success', texto: 'Nome atualizado.' });
      await refreshAuthorizationProfile().catch(() => undefined);
    } catch (err: unknown) {
      setAvisoNome({ tipo: 'error', texto: mensagemErro(err) });
    } finally {
      setSalvandoNome(false);
    }
  };

  function validar() {
    if (alterouLogin) {
      if (tipoLogin === 'celular') {
        if (loginNormalizado.length < 8 || loginNormalizado.length > 13) return 'Celular inválido';
      } else if (!isValidEmailIdentifier(loginNormalizado) || loginNormalizado.endsWith(PHONE_LOGIN_DOMAIN)) {
        return 'E-mail inválido';
      }
    }
    if (password) {
      if (password.length < 6) return 'Senha deve ter ao menos 6 caracteres';
      if (password !== confirmPassword) return 'As senhas não coincidem';
    }
    return null;
  }

  // Senha primeiro (no cliente) e depois o login (na Function), porque a reautenticação usa o login atual.
  const aplicarAlteracoes = async () => {
    if (password) await updatePassword(password);
    if (alterouLogin) await atualizarMeuPerfil({ login: { tipo: tipoLogin, valor: loginNormalizado } });
    await signOut();
    navigate('/login');
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const msg = validar();
    if (msg) { setErro(msg); return; }
    setErro(null);
    setSalvando(true);
    try {
      await aplicarAlteracoes();
    } catch (err: unknown) {
      if (pedeLoginRecente(err)) setReauthOpen(true);
      else setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  };

  const reautenticarESalvar = async (senhaAtual: string) => {
    try {
      await reauthenticate(senhaAtual);
      setReauthOpen(false);
      await aplicarAlteracoes();
    } catch (err: unknown) {
      setReauthOpen(false);
      setErro(mensagemErro(err));
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Typography variant="h4">Meu perfil</Typography>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <Avatar sx={{ width: 72, height: 72, fontSize: 28, fontWeight: 700, bgcolor: '#00a36c' }}>{iniciais(nome)}</Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h5" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{nome}</Typography>
              <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{textoLogin(currentUser.email)}</Typography>
              {funcionario && (
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                  <Chip size="small" label={funcionario.ativo === true ? 'Ativo' : 'Inativo'} color={funcionario.ativo === true ? 'success' : 'default'} />
                  {perfis.map((perfil) => <Chip key={perfil} size="small" variant="outlined" label={perfil} />)}
                </Stack>
              )}
            </Box>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" gutterBottom>Dados do funcionário</Typography>
          {carregando ? (
            <Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={20} /><Typography variant="body2">Carregando...</Typography></Stack>
          ) : erroLeitura ? (
            <Alert severity="error">{erroLeitura}</Alert>
          ) : !funcionario ? (
            <Alert severity="warning">Não há cadastro em funcionários para este usuário.</Alert>
          ) : (
            <Stack spacing={2.5}>
              <Box component="form" onSubmit={salvarNome}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
                  <TextField label="Nome" value={nomeEditado} onChange={(e) => { setNomeEditado(e.target.value); setAvisoNome(null); }} required fullWidth inputProps={{ maxLength: 120 }} />
                  <Button type="submit" variant="contained" disabled={salvandoNome || !alterouNome} sx={{ flexShrink: 0, minHeight: 56 }}>Salvar nome</Button>
                </Stack>
                {avisoNome && <Alert severity={avisoNome.tipo} sx={{ mt: 1.5 }}>{avisoNome.texto}</Alert>}
              </Box>
              <Box sx={gradeCamposSx}>
                <Campo rotulo="Login no cadastro">{textoLogin(funcionario.email)}</Campo>
                <Campo rotulo="UID">{currentUser.uid}</Campo>
                <Campo rotulo="Situação">{funcionario.ativo === true ? 'Ativo' : 'Inativo'}</Campo>
                {ordemMotorista !== undefined && <Campo rotulo="Ordem de motorista">{formatarValor(ordemMotorista)}</Campo>}
                <Campo rotulo="Cadastrado em">{formatarValor(funcionario.createdAt)}</Campo>
                <Campo rotulo="Atualizado em">{formatarValor(funcionario.updatedAt)}</Campo>
                <Campo rotulo="Último acesso">{formatarValor(funcionario.ultimoAcesso)}</Campo>
                {extras.map(([chave, valor]) => <Campo key={chave} rotulo={chave}>{formatarValor(valor)}</Campo>)}
              </Box>
              <Divider />
              <Box>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <LockOutlinedIcon fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">Credenciais</Typography>
                </Stack>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                  {perfis.length ? perfis.map((perfil) => <Chip key={perfil} label={perfil} />) : <Typography>Nenhum perfil</Typography>}
                </Stack>
              </Box>
              <Alert severity="info">Situação, credenciais e os demais dados são mantidos pela administração, em Cadastros.</Alert>
            </Stack>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" gutterBottom>Acesso</Typography>
          <form onSubmit={salvar}>
            <Stack spacing={2}>
              {erro && <Alert severity="error">{erro}</Alert>}
              <Typography variant="body2" color="text.secondary">Login atual: <strong>{textoLogin(currentUser.email)}</strong></Typography>
              <ToggleButtonGroup exclusive size="small" color="primary" value={tipoLogin} onChange={(_e, tipo: TipoLogin | null) => { if (tipo) { setTipoLogin(tipo); setLogin(tipo === loginAtual.tipo ? loginAtual.valor : ''); setErro(null); } }} aria-label="Tipo de login">
                <ToggleButton value="celular">Celular</ToggleButton>
                <ToggleButton value="email">E-mail</ToggleButton>
              </ToggleButtonGroup>
              {tipoLogin === 'celular' ? (
                <TextField label="Celular" type="tel" placeholder="Somente números" value={login} onChange={(e) => setLogin(normalizePhoneIdentifier(e.target.value))} required fullWidth />
              ) : (
                <TextField label="E-mail" type="email" placeholder="usuario@empresa.com.br" value={login} onChange={(e) => setLogin(e.target.value)} required fullWidth />
              )}
              <Box sx={gradeCamposSx}>
                <TextField label="Nova senha" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
                <TextField label="Confirmar senha" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} fullWidth />
              </Box>
              <Alert severity="info">Depois de trocar o login ou a senha, você entra de novo com os dados novos.</Alert>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button type="submit" variant="contained" disabled={salvando || !alterouAcesso}>Salvar</Button>
              </Stack>
            </Stack>
          </form>
        </Paper>
      </Stack>
      <ReautenticarDialog open={reauthOpen} onCancel={() => setReauthOpen(false)} onConfirm={reautenticarESalvar} />
    </Container>
  );
}
