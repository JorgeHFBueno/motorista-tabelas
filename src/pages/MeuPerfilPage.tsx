import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Container, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAuth } from '../contexts/AuthContext';
import usePerfil from '../hooks/usePerfil';
import ReautenticarDialog from '../components/ReautenticarDialog';
import { getFuncionarioData } from '../services/authorizationProfile';
import { camposExtrasFuncionario, iniciais, perfisMarcados } from '../services/funcionarios';

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

const gradeCamposSx = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 };

export default function MeuPerfilPage() {
  const { currentUser, signOut } = useAuth();
  const navigate = useNavigate();
  const { updateEmail, updatePassword, reauthenticate } = usePerfil();

  const [funcionario, setFuncionario] = useState<Record<string, unknown> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);

  const [email, setEmail] = useState(currentUser?.email ?? '');
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
      .then((data) => { if (ativo) { setFuncionario(data); setErroLeitura(null); } })
      .catch((err: unknown) => { if (ativo) setErroLeitura(err instanceof Error ? err.message : 'Erro ao ler o cadastro.'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [currentUser]);

  if (!currentUser) return null;

  const nome = typeof funcionario?.nome === 'string' && funcionario.nome.trim() ? funcionario.nome.trim() : currentUser.displayName || currentUser.email || '';
  const perfis = perfisMarcados(funcionario?.perfis);
  const ordemMotorista = (funcionario?.motorista as { ordem?: unknown } | undefined)?.ordem;
  const extras = funcionario ? camposExtrasFuncionario(funcionario) : [];
  const alterouAcesso = email.trim() !== (currentUser.email ?? '') || Boolean(password);

  function validar() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'E-mail inválido';
    if (password) {
      if (password.length < 6) return 'Senha deve ter ao menos 6 caracteres';
      if (password !== confirmPassword) return 'As senhas não coincidem';
    }
    return null;
  }

  const aplicarAlteracoes = async () => {
    if (email.trim() !== currentUser.email) await updateEmail(email.trim());
    if (password) await updatePassword(password);
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
      if ((err as { code?: unknown })?.code === 'auth/requires-recent-login') setReauthOpen(true);
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
              <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{currentUser.email}</Typography>
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
              <Box sx={gradeCamposSx}>
                <Campo rotulo="Nome">{formatarValor(funcionario.nome)}</Campo>
                <Campo rotulo="E-mail no cadastro">{formatarValor(funcionario.email)}</Campo>
                <Campo rotulo="UID">{currentUser.uid}</Campo>
                <Campo rotulo="Situação">{funcionario.ativo === true ? 'Ativo' : 'Inativo'}</Campo>
                {ordemMotorista !== undefined && <Campo rotulo="Ordem de motorista">{formatarValor(ordemMotorista)}</Campo>}
                <Campo rotulo="Cadastrado em">{formatarValor(funcionario.createdAt)}</Campo>
                <Campo rotulo="Atualizado em">{formatarValor(funcionario.updatedAt)}</Campo>
                {extras.map(([chave, valor]) => <Campo key={chave} rotulo={chave}>{formatarValor(valor)}</Campo>)}
              </Box>
              <Divider />
              <Box>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <LockOutlinedIcon fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">Nível administrativo</Typography>
                </Stack>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                  {perfis.length ? perfis.map((perfil) => <Chip key={perfil} label={perfil} />) : <Typography>Nenhum perfil</Typography>}
                </Stack>
              </Box>
              <Alert severity="info">Estes dados são mantidos pela administração, em Cadastros, e não podem ser alterados aqui.</Alert>
            </Stack>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" gutterBottom>Acesso</Typography>
          <form onSubmit={salvar}>
            <Stack spacing={2}>
              {erro && <Alert severity="error">{erro}</Alert>}
              <TextField label="E-mail de login" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
              <Box sx={gradeCamposSx}>
                <TextField label="Nova senha" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
                <TextField label="Confirmar senha" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} fullWidth />
              </Box>
              <Alert severity="info">Você precisará fazer login novamente após trocar e-mail ou senha.</Alert>
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
