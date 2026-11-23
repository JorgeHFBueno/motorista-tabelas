import { useMemo, useState } from 'react';
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
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { usePessoaAtual } from '../portal-cliente/portalArquivos';
import { contatoParaLixeira, criarContato, editarContato, restaurarContato } from './comercialDados';
import {
  CATEGORIAS_CONTATO, TIPOS_CONTATO, categoriaContato, contatoFormVazio, contatoParaForm, etapa, tipoContato, validarContato,
  type Contato, type ContatoForm, type Negocio,
} from './comercialDominio';
import { useComercial } from './useComercial';

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Contatos do Comercial: lista, busca, cadastro e os negócios em que cada contato aparece.
export default function ContatosPage() {
  const { contatos, negocios, podeEditar, erro } = useComercial();
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [lixeira, setLixeira] = useState(false);
  const [aberto, setAberto] = useState<{ contato: Contato | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const visiveis = useMemo(() => {
    const b = semAcento(busca.trim());
    return (contatos ?? []).filter((c) => Boolean(c.excluidoEm) === lixeira && (!tipo || c.tipo === tipo)
      && (!b || semAcento(`${c.nome} ${c.empresa} ${c.email} ${c.telefone}`).includes(b)));
  }, [contatos, busca, tipo, lixeira]);
  const negociosDe = (id: string) => (negocios ?? []).filter((n) => !n.excluidoEm && n.contatoIds.includes(id));

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
        <TextField size="small" placeholder="Buscar nome, empresa, e-mail ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} sx={{ flex: 1 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <TextField select size="small" label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="">Todos</MenuItem>
          {TIPOS_CONTATO.map((t) => <MenuItem key={t.id} value={t.id}>{t.rotulo}</MenuItem>)}
        </TextField>
        <FormControlLabel control={<Switch checked={lixeira} onChange={(e) => setLixeira(e.target.checked)} />} label="Lixeira" />
        {podeEditar && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAberto({ contato: null })}>Novo contato</Button>}
      </Stack>

      {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
      {!contatos ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Nome', 'Tipo', 'Empresa', 'Cargo', 'Telefone', 'E-mail', 'Negócios'].map((t) => <TableCell key={t} sx={{ fontWeight: 700 }}>{t}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {visiveis.map((c) => (
                <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => setAberto({ contato: c })}>
                  <TableCell sx={{ fontWeight: 600 }}>{c.nome}</TableCell>
                  <TableCell>{tipoContato(c.tipo)?.rotulo ?? '—'}{c.categoria ? ` · ${categoriaContato(c.categoria)?.rotulo}` : ''}</TableCell>
                  <TableCell>{c.empresa || '—'}</TableCell>
                  <TableCell>{c.cargo || '—'}</TableCell>
                  <TableCell>{c.telefone || '—'}</TableCell>
                  <TableCell sx={{ overflowWrap: 'anywhere' }}>{c.email || '—'}</TableCell>
                  <TableCell>{negociosDe(c.id).length || '—'}</TableCell>
                </TableRow>
              ))}
              {!visiveis.length && (
                <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.secondary">{lixeira ? 'Nenhum contato na lixeira.' : 'Nenhum contato encontrado.'}</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {aberto && (
        <ContatoDialog contato={aberto.contato} negocios={aberto.contato ? negociosDe(aberto.contato.id) : []} podeEditar={podeEditar}
          onClose={() => setAberto(null)} onAviso={setAviso} />
      )}
      <Snackbar open={Boolean(aviso)} autoHideDuration={4000} onClose={() => setAviso(null)} message={aviso} />
    </Container>
  );
}

function ContatoDialog({ contato, negocios, podeEditar, onClose, onAviso }: {
  contato: Contato | null; negocios: Negocio[]; podeEditar: boolean; onClose: () => void; onAviso: (m: string) => void;
}) {
  const autor = usePessoaAtual();
  const [form, setForm] = useState<ContatoForm>(() => (contato ? contatoParaForm(contato) : contatoFormVazio()));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const editavel = podeEditar && !contato?.excluidoEm;
  const set = <K extends keyof ContatoForm>(campo: K, valor: ContatoForm[K]) => setForm((f) => ({ ...f, [campo]: valor }));

  async function executar(acao: () => Promise<unknown>, mensagem: string) {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
      onAviso(mensagem);
      onClose();
    } catch (err) {
      console.error('Erro ao gravar o contato', err);
      setErro('Não foi possível gravar o contato. Tente novamente.');
      setOcupado(false);
    }
  }

  function salvar() {
    const problema = validarContato(form);
    if (problema) { setErro(problema); return; }
    if (!autor) return;
    void executar(() => (contato ? editarContato(contato.id, form, autor) : criarContato(form, autor)), contato ? 'Contato salvo.' : 'Contato criado.');
  }

  return (
    <Dialog open onClose={ocupado ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{contato ? contato.nome : 'Novo contato'}{contato?.excluidoEm && <Chip size="small" color="error" label="Na lixeira" sx={{ ml: 1 }} />}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField label="Nome" value={form.nome} onChange={(e) => set('nome', e.target.value)} required disabled={!editavel} autoFocus={!contato} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Tipo" value={form.tipo} onChange={(e) => set('tipo', e.target.value as ContatoForm['tipo'])} fullWidth disabled={!editavel}>
              <MenuItem value="">—</MenuItem>
              {TIPOS_CONTATO.map((t) => <MenuItem key={t.id} value={t.id}>{t.rotulo}</MenuItem>)}
            </TextField>
            <TextField select label="Categoria" value={form.categoria} onChange={(e) => set('categoria', e.target.value as ContatoForm['categoria'])} fullWidth disabled={!editavel}>
              <MenuItem value="">—</MenuItem>
              {CATEGORIAS_CONTATO.map((t) => <MenuItem key={t.id} value={t.id}>{t.rotulo}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Empresa" value={form.empresa} onChange={(e) => set('empresa', e.target.value)} fullWidth disabled={!editavel} />
            <TextField label="Cargo" value={form.cargo} onChange={(e) => set('cargo', e.target.value)} fullWidth disabled={!editavel} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Telefone" value={form.telefone} onChange={(e) => set('telefone', e.target.value)} fullWidth disabled={!editavel} />
            <TextField label="E-mail" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} fullWidth disabled={!editavel} />
          </Stack>
          <TextField label="Notas" value={form.notas} onChange={(e) => set('notas', e.target.value)} multiline minRows={3} disabled={!editavel} />
          {contato && (
            <Box>
              <Typography variant="subtitle2" mb={0.5}>Negócios</Typography>
              {!negocios.length ? <Typography variant="body2" color="text.secondary">Nenhum negócio ligado a este contato.</Typography> : (
                <Stack spacing={0.5}>
                  {negocios.map((n) => (
                    <Typography key={n.id} variant="body2">{n.titulo} · {etapa(n.etapa)?.rotulo}{n.cliente ? ` · ${n.cliente}` : ''}</Typography>
                  ))}
                </Stack>
              )}
            </Box>
          )}
          {erro && <Alert severity="error">{erro}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Box>
          {contato && podeEditar && autor && (
            <Button color={contato.excluidoEm ? 'primary' : 'error'} disabled={ocupado}
              onClick={() => void executar(() => (contato.excluidoEm ? restaurarContato(contato.id, autor) : contatoParaLixeira(contato.id, autor)),
                contato.excluidoEm ? 'Contato restaurado.' : 'Contato movido para a lixeira.')}>
              {contato.excluidoEm ? 'Restaurar' : 'Mover para a lixeira'}
            </Button>
          )}
        </Box>
        <Box>
          <Button onClick={onClose} disabled={ocupado}>{editavel ? 'Cancelar' : 'Fechar'}</Button>
          {editavel && <Button variant="contained" onClick={salvar} disabled={ocupado || !autor} sx={{ ml: 1 }}>{contato ? 'Salvar' : 'Criar contato'}</Button>}
        </Box>
      </DialogActions>
    </Dialog>
  );
}
