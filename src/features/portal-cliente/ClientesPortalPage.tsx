import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import { contarContratosPorDocumento, criarCliente, definirClienteAtivo, definirSenhaCliente, listarClientes, salvarCliente } from './clientesApi';
import { apenasDigitos, formatarDocumento, normalizarDocumento, type ClientePortal } from './portalDominio';

// Clientes do portal (engenharia, escritorio ou adm2): login de cada cliente e os CNPJ/CPF que ele representa. Contrato: The Manuscript,
// 01_FIRESTORE/COLECOES/users.md e 03_APLICACAO_WEB/16_PORTAL_DO_CLIENTE.md ("Telas do adm2 na WEB").

type Aviso = { message: string; severity: 'success' | 'error' } | null;
const erroDe = (e: unknown, padrao: string) => (e instanceof Error && e.message ? e.message : padrao);

const AVISO_DOCUMENTOS = 'Os CNPJ/CPF definem quais contratos o cliente vê no portal: ele vê todo contrato publicado para eles e deixa de ver os de um CNPJ/CPF retirado.';

const contratosTexto = (n: number) => (n === 0 ? 'Nenhum contrato publicado' : n === 1 ? '1 contrato publicado' : `${n} contratos publicados`);

/** CNPJ/CPF digitados -> lista gravável (sem repetição), ou null quando algum está inválido ou não há nenhum. */
function documentosValidos(textos: string[]): string[] | null {
  const preenchidos = textos.filter((t) => t.trim());
  const normalizados = preenchidos.map((t) => normalizarDocumento(t));
  if (normalizados.length === 0 || normalizados.some((d) => !d)) return null;
  return [...new Set(normalizados as string[])];
}

function DocumentosEditor({ valores, onChange, contratos, disabled }: {
  valores: string[];
  onChange: (valores: string[]) => void;
  contratos: Map<string, number>;
  disabled: boolean;
}) {
  return (
    <Stack spacing={1.5}>
      {valores.map((valor, i) => {
        const documento = normalizarDocumento(valor);
        const invalido = Boolean(valor.trim()) && !documento;
        const ajuda = invalido ? 'CNPJ/CPF inválido' : documento ? contratosTexto(contratos.get(documento) ?? 0) : ' ';
        return (
          <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
            <TextField
              label={`CNPJ/CPF ${valores.length > 1 ? i + 1 : ''}`.trim()}
              value={valor}
              onChange={(e) => onChange(valores.map((v, k) => (k === i ? e.target.value : v)))}
              onBlur={() => { if (documento) onChange(valores.map((v, k) => (k === i ? formatarDocumento(documento) : v))); }}
              error={invalido}
              helperText={ajuda}
              disabled={disabled}
              fullWidth
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            />
            {valores.length > 1 && (
              <Tooltip title="Retirar este CNPJ/CPF">
                <span>
                  <IconButton aria-label={`Retirar o CNPJ/CPF ${i + 1}`} onClick={() => onChange(valores.filter((_, k) => k !== i))} disabled={disabled} sx={{ mt: 1 }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Stack>
        );
      })}
      <Box>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...valores, ''])} disabled={disabled}>Adicionar CNPJ/CPF</Button>
      </Box>
    </Stack>
  );
}

function ClienteLinha({ cliente, contratos, onEditar, onSenha, onSituacao }: {
  cliente: ClientePortal;
  contratos: number;
  onEditar: () => void;
  onSenha: () => void;
  onSituacao: () => void;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 220px auto' },
        columnGap: 2,
        rowGap: 1,
        alignItems: 'center',
        px: 2,
        py: 1.5,
      }}
    >
      <Box minWidth={0}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography sx={{ fontSize: 18, fontWeight: 700 }} noWrap>{cliente.nome}</Typography>
          {!cliente.ativo && <Chip label="Inativo" size="small" />}
        </Stack>
        <Typography sx={{ fontSize: 14 }} color="text.secondary" noWrap>{cliente.email || '—'}</Typography>
        <Typography sx={{ fontSize: 14 }} color={cliente.documentos.length ? 'text.secondary' : 'warning.dark'}>
          {cliente.documentos.length ? cliente.documentos.map(formatarDocumento).join(' · ') : 'Sem CNPJ/CPF'}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 15, fontWeight: 600 }} color={contratos ? 'text.primary' : 'text.secondary'}>{contratosTexto(contratos)}</Typography>
      <Stack direction="row" spacing={0.5} justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
        <Tooltip title="Editar nome e CNPJ/CPF">
          <IconButton aria-label={`Editar ${cliente.nome}`} onClick={onEditar}><EditOutlinedIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="Definir senha nova">
          <IconButton aria-label={`Definir senha de ${cliente.nome}`} onClick={onSenha}><KeyOutlinedIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title={cliente.ativo ? 'Desativar o login' : 'Ativar o login'}>
          <IconButton aria-label={`${cliente.ativo ? 'Desativar' : 'Ativar'} ${cliente.nome}`} color={cliente.ativo ? 'default' : 'success'} onClick={onSituacao}>
            {cliente.ativo ? <BlockOutlinedIcon fontSize="small" /> : <CheckCircleOutlineIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}

const NOVO_VAZIO = { nome: '', email: '', senha: '', documentos: [''] };

export default function ClientesPortalPage() {
  const [clientes, setClientes] = useState<ClientePortal[]>([]);
  const [contratos, setContratos] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [dialogErro, setDialogErro] = useState<string | null>(null);

  const [novo, setNovo] = useState<typeof NOVO_VAZIO | null>(null);
  const [editando, setEditando] = useState<{ cliente: ClientePortal; nome: string; documentos: string[] } | null>(null);
  const [senhaDe, setSenhaDe] = useState<ClientePortal | null>(null);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [situacaoDe, setSituacaoDe] = useState<ClientePortal | null>(null);

  const carregar = useCallback(async () => {
    setError(null);
    try {
      const [lista, contagem] = await Promise.all([listarClientes(), contarContratosPorDocumento()]);
      setClientes(lista);
      setContratos(contagem);
    } catch (err) {
      console.error('Erro ao carregar os clientes do portal', err);
      setError('Não foi possível carregar os clientes. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const contratosDe = useCallback(
    (cliente: ClientePortal) => [...new Set(cliente.documentos)].reduce((soma, d) => soma + (contratos.get(d) ?? 0), 0),
    [contratos],
  );

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = apenasDigitos(termo);
    if (!termo) return clientes;
    return clientes.filter((c) => c.nome.toLowerCase().includes(termo)
      || c.email.toLowerCase().includes(termo)
      || (termoDigitos.length >= 3 && c.documentos.some((d) => d.includes(termoDigitos))));
  }, [busca, clientes]);

  const executar = async (acao: () => Promise<void>, padrao: string) => {
    try {
      setSaving(true);
      setDialogErro(null);
      await acao();
    } catch (e) {
      setDialogErro(erroDe(e, padrao));
    } finally {
      setSaving(false);
    }
  };

  const salvarNovo = () => novo && executar(async () => {
    const documentos = documentosValidos(novo.documentos);
    if (!novo.nome.trim()) throw new Error('Informe o nome.');
    if (!novo.email.trim()) throw new Error('Informe o e-mail do login.');
    if (novo.senha.trim().length < 6) throw new Error('A senha precisa ter ao menos 6 caracteres.');
    if (!documentos) throw new Error('Informe ao menos um CNPJ/CPF e corrija os inválidos.');
    const { contaExistente } = await criarCliente({ nome: novo.nome.trim(), email: novo.email.trim(), password: novo.senha.trim(), documentos });
    setNovo(null);
    setAviso({
      severity: 'success',
      message: contaExistente
        ? 'Cliente cadastrado. Já havia uma conta com esse login, sem funcionário nem cliente: a senha dela passou a ser a informada.'
        : 'Cliente cadastrado. Informe a ele o login e a senha inicial.',
    });
    await carregar();
  }, 'Erro ao cadastrar o cliente.');

  const salvarEdicao = () => editando && executar(async () => {
    const documentos = documentosValidos(editando.documentos);
    if (!editando.nome.trim()) throw new Error('Informe o nome.');
    if (!documentos) throw new Error('Informe ao menos um CNPJ/CPF e corrija os inválidos.');
    await salvarCliente(editando.cliente.uid, { nome: editando.nome.trim(), documentos });
    setEditando(null);
    setAviso({ severity: 'success', message: 'Cliente atualizado.' });
    await carregar();
  }, 'Erro ao salvar o cliente.');

  const salvarSenha = () => senhaDe && executar(async () => {
    if (senha.length < 6) throw new Error('A senha precisa ter ao menos 6 caracteres.');
    if (senha !== confirmacao) throw new Error('As senhas não coincidem.');
    await definirSenhaCliente(senhaDe.uid, senha);
    setAviso({ severity: 'success', message: `Senha de ${senhaDe.nome} definida; as sessões abertas foram encerradas.` });
    setSenhaDe(null);
  }, 'Erro ao definir a senha.');

  const salvarSituacao = () => situacaoDe && executar(async () => {
    await definirClienteAtivo(situacaoDe.uid, !situacaoDe.ativo);
    setAviso({ severity: 'success', message: situacaoDe.ativo ? `${situacaoDe.nome} desativado.` : `${situacaoDe.nome} ativado.` });
    setSituacaoDe(null);
    await carregar();
  }, 'Erro ao alterar a situação do cliente.');

  const fechar = (fn: () => void) => (saving ? undefined : () => { setDialogErro(null); fn(); });

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
        <TextField
          size="small"
          placeholder="Buscar por nome, login ou CNPJ/CPF"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          sx={{ flex: 1 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': 'Buscar por nome, login ou CNPJ/CPF' },
          }}
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setDialogErro(null); setNovo(NOVO_VAZIO); }}>Novo cliente</Button>
      </Stack>

      <Box mt={3}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => { setLoading(true); void carregar(); }}>Tentar novamente</Button>}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : linhas.length > 0 ? (
          <Paper variant="outlined" sx={{ overflow: 'hidden', '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
            {linhas.map((cliente) => (
              <ClienteLinha
                key={cliente.uid}
                cliente={cliente}
                contratos={contratosDe(cliente)}
                onEditar={() => { setDialogErro(null); setEditando({ cliente, nome: cliente.nome, documentos: cliente.documentos.length ? cliente.documentos.map(formatarDocumento) : [''] }); }}
                onSenha={() => { setDialogErro(null); setSenha(''); setConfirmacao(''); setSenhaDe(cliente); }}
                onSituacao={() => { setDialogErro(null); setSituacaoDe(cliente); }}
              />
            ))}
          </Paper>
        ) : !error && (
          <Alert severity="info">{clientes.length ? 'Nenhum cliente encontrado para a busca.' : 'Nenhum cliente cadastrado.'}</Alert>
        )}
      </Box>

      <Dialog open={Boolean(novo)} onClose={fechar(() => setNovo(null))} fullWidth maxWidth="sm">
        <DialogTitle>Novo cliente</DialogTitle>
        <DialogContent>
          {novo && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField label="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} disabled={saving} fullWidth autoFocus />
              <TextField label="Login (e-mail)" type="email" autoComplete="off" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} disabled={saving} fullWidth />
              <TextField label="Senha inicial" type="password" autoComplete="new-password" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })}
                helperText="Ao menos 6 caracteres. O cliente pode trocá-la pelo portal." disabled={saving} fullWidth />
              <DocumentosEditor valores={novo.documentos} onChange={(documentos) => setNovo({ ...novo, documentos })} contratos={contratos} disabled={saving} />
              <Alert severity="info">{AVISO_DOCUMENTOS}</Alert>
              {dialogErro && <Alert severity="error">{dialogErro}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNovo(null)} disabled={saving}>Cancelar</Button>
          <Button variant="contained" onClick={() => void salvarNovo()} disabled={saving}>Cadastrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editando)} onClose={fechar(() => setEditando(null))} fullWidth maxWidth="sm">
        <DialogTitle>Editar cliente</DialogTitle>
        <DialogContent>
          {editando && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary">Login: {editando.cliente.email || '—'}</Typography>
              <TextField label="Nome" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} disabled={saving} fullWidth />
              <DocumentosEditor valores={editando.documentos} onChange={(documentos) => setEditando({ ...editando, documentos })} contratos={contratos} disabled={saving} />
              <Alert severity="warning">{AVISO_DOCUMENTOS}</Alert>
              {dialogErro && <Alert severity="error">{dialogErro}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditando(null)} disabled={saving}>Cancelar</Button>
          <Button variant="contained" onClick={() => void salvarEdicao()} disabled={saving}>Salvar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(senhaDe)} onClose={fechar(() => setSenhaDe(null))} fullWidth maxWidth="xs">
        <DialogTitle>Definir senha nova</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">{senhaDe ? `${senhaDe.nome} — ${senhaDe.email}` : ''}</Typography>
            <TextField label="Senha nova" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} disabled={saving} fullWidth />
            <TextField label="Confirmar senha" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} disabled={saving} fullWidth />
            <Alert severity="info">As sessões abertas do cliente são encerradas. Avise-o da senha nova.</Alert>
            {dialogErro && <Alert severity="error">{dialogErro}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSenhaDe(null)} disabled={saving}>Cancelar</Button>
          <Button variant="contained" onClick={() => void salvarSenha()} disabled={saving}>Definir senha</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(situacaoDe)} onClose={fechar(() => setSituacaoDe(null))} fullWidth maxWidth="xs">
        <DialogTitle>{situacaoDe?.ativo ? 'Desativar cliente' : 'Ativar cliente'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              {situacaoDe?.ativo
                ? <>Desativar <strong>{situacaoDe.nome}</strong>? O cliente perde o acesso ao portal na hora e as sessões abertas são encerradas. Nada é apagado.</>
                : <>Ativar <strong>{situacaoDe?.nome}</strong>? O cliente volta a entrar no portal com a mesma senha.</>}
            </Typography>
            {dialogErro && <Alert severity="error">{dialogErro}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSituacaoDe(null)} disabled={saving}>Cancelar</Button>
          <Button variant="contained" color={situacaoDe?.ativo ? 'error' : 'primary'} onClick={() => void salvarSituacao()} disabled={saving}>
            {situacaoDe?.ativo ? 'Desativar' : 'Ativar'}
          </Button>
        </DialogActions>
      </Dialog>

      {aviso && (
        <Snackbar open autoHideDuration={6000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
          <Alert onClose={() => setAviso(null)} severity={aviso.severity} sx={{ width: '100%' }}>{aviso.message}</Alert>
        </Snackbar>
      )}
    </Container>
  );
}
