import { useEffect, useMemo, useState } from 'react';
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
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import {
  alterarStatusNoticia,
  CATEGORIAS_NOTICIA,
  criarNoticiaInstitucional,
  editarNoticiaInstitucional,
  moverNoticiaParaLixeira,
  novoIdNoticia,
  ouvirNoticias,
  restaurarNoticia,
  ROTULO_CATEGORIA_NOTICIA,
  validarNoticia,
  type Noticia,
  type NoticiaForm,
  type OrigemNoticia,
  type StatusNoticia,
} from './noticiasPortalData';
import { abrirArquivo, enviarArquivo, usePessoaAtual } from './portalArquivos';
import { caminhosPortal, LIMITES_ARQUIVO, type ArquivoPortal } from './portalDominio';

// News of the client portal, team side (adm2). The Manuscript: 01_FIRESTORE/COLECOES/portal.md (portal-noticias)
// and 03_APLICACAO_WEB/16_PORTAL_DO_CLIENTE.md. adm2 writes the institutional ones; the external ones come from a
// Function and here are only published/unpublished or moved to the trash.

type FiltroOrigem = OrigemNoticia | 'todas';
type FiltroStatus = StatusNoticia | 'todos';

const FORM_VAZIO: NoticiaForm = { titulo: '', resumo: '', conteudo: '', url: '', categoria: 'institucional', destaque: false, status: 'rascunho' };

const dataCurta = (valor: Date | null) =>
  valor ? valor.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const normalizar = (valor: string) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const tamanho = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

type Edicao = { id: string; atual: Noticia | null };

// Same ingestion as the 12-hour schedule (Function portalNoticiasAtualizar: engenharia, escritorio or adm2).
type ResumoColeta = { fontes: number; lidas: number; aceitas: number; criadas: number; atualizadas: number; ignoradas: number; rebaixadas: number };
const buscarNoticiasExternas = httpsCallable<void, ResumoColeta>(functions, 'portalNoticiasAtualizar', { timeout: 320_000 });

const textoDoResumo = (r: ResumoColeta) =>
  `Notícias externas: ${r.criadas} novas, ${r.atualizadas} atualizadas, ${r.rebaixadas} viraram rascunho pelo limite de 5 por categoria `
  + `(${r.fontes} fontes lidas, ${r.lidas} notícias lidas, ${r.aceitas} aceitas, ${r.ignoradas} sem mudança ou na lixeira).`;

function NoticiaDialog({
  edicao,
  onClose,
  onSalva,
}: {
  edicao: Edicao;
  onClose: () => void;
  onSalva: (mensagem: string) => void;
}) {
  const pessoa = usePessoaAtual();
  const { atual } = edicao;
  const [form, setForm] = useState<NoticiaForm>(() =>
    atual
      ? {
        titulo: atual.titulo,
        resumo: atual.resumo,
        conteudo: atual.conteudo ?? '',
        url: atual.url ?? '',
        categoria: atual.categoria ?? 'institucional',
        destaque: atual.destaque,
        status: atual.status,
      }
      : FORM_VAZIO,
  );
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [removerImagem, setRemoverImagem] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const campo = <K extends keyof NoticiaForm>(chave: K, valor: NoticiaForm[K]) => setForm((f) => ({ ...f, [chave]: valor }));
  const imagemAtual = atual?.imagem && !removerImagem ? atual.imagem : null;

  const escolherArquivo = (file: File | null) => {
    setErro(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErro('Escolha um arquivo de imagem.');
      return;
    }
    if (file.size > LIMITES_ARQUIVO.imagemNoticia) {
      setErro(`A imagem passa do limite de ${Math.round(LIMITES_ARQUIVO.imagemNoticia / (1024 * 1024))} MB.`);
      return;
    }
    setArquivo(file);
    setRemoverImagem(false);
  };

  const salvar = async () => {
    const invalido = validarNoticia(form);
    if (invalido) {
      setErro(invalido);
      return;
    }
    if (!pessoa) return;
    setSalvando(true);
    setErro(null);
    try {
      let imagem: ArquivoPortal | null | undefined;
      if (arquivo) {
        imagem = await enviarArquivo(caminhosPortal.imagemNoticia(edicao.id, arquivo.name), arquivo, LIMITES_ARQUIVO.imagemNoticia);
      } else if (removerImagem) {
        imagem = null;
      }
      if (atual) {
        await editarNoticiaInstitucional(atual, form, imagem);
        onSalva('Notícia salva.');
      } else {
        await criarNoticiaInstitucional(edicao.id, form, imagem ?? null, pessoa);
        onSalva(form.status === 'publicada' ? 'Notícia publicada.' : 'Rascunho salvo.');
      }
    } catch (err) {
      console.error('Erro ao salvar a notícia', err);
      setErro(err instanceof Error && err.message && !(err as { code?: unknown }).code ? err.message : 'Não foi possível salvar a notícia. Tente novamente.');
      setSalvando(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={salvando ? undefined : onClose}>
      <DialogTitle>{atual ? 'Editar notícia' : 'Nova notícia institucional'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {erro && <Alert severity="error">{erro}</Alert>}
          <TextField label="Título" required value={form.titulo} onChange={(e) => campo('titulo', e.target.value)} disabled={salvando} />
          <TextField label="Resumo" required multiline minRows={2} value={form.resumo} onChange={(e) => campo('resumo', e.target.value)} disabled={salvando} />
          <TextField label="Conteúdo" multiline minRows={4} value={form.conteudo} onChange={(e) => campo('conteudo', e.target.value)} disabled={salvando} />
          <TextField
            label="Link (opcional)"
            placeholder="https://"
            value={form.url}
            onChange={(e) => campo('url', e.target.value)}
            disabled={salvando}
            helperText="O cliente vê o botão “Ler mais” quando há link."
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Categoria" value={form.categoria} onChange={(e) => campo('categoria', e.target.value as NoticiaForm['categoria'])} disabled={salvando} sx={{ flex: 1 }}>
              {CATEGORIAS_NOTICIA.map((valor) => <MenuItem key={valor} value={valor}>{ROTULO_CATEGORIA_NOTICIA[valor]}</MenuItem>)}
            </TextField>
            <TextField select label="Situação" value={form.status} onChange={(e) => campo('status', e.target.value as StatusNoticia)} disabled={salvando} sx={{ flex: 1 }}>
              <MenuItem value="publicada">Publicada</MenuItem>
              <MenuItem value="rascunho">Rascunho</MenuItem>
            </TextField>
          </Stack>
          <FormControlLabel
            control={<Switch checked={form.destaque} onChange={(e) => campo('destaque', e.target.checked)} disabled={salvando} />}
            label="Destaque"
          />

          <Box>
            <Typography sx={{ fontSize: 13, mb: 1 }} color="text.secondary">Imagem (até {Math.round(LIMITES_ARQUIVO.imagemNoticia / (1024 * 1024))} MB)</Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Button component="label" variant="outlined" size="small" disabled={salvando}>
                {arquivo || imagemAtual ? 'Trocar imagem' : 'Escolher imagem'}
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    escolherArquivo(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
              </Button>
              {arquivo ? (
                <>
                  <Typography sx={{ fontSize: 14, overflowWrap: 'anywhere' }}>{arquivo.name} ({tamanho(arquivo.size)})</Typography>
                  <Button size="small" color="inherit" onClick={() => setArquivo(null)} disabled={salvando}>Desfazer</Button>
                </>
              ) : imagemAtual ? (
                <>
                  <Button size="small" onClick={() => void abrirArquivo(imagemAtual)} sx={{ textTransform: 'none' }}>{imagemAtual.nome}</Button>
                  <Button size="small" color="inherit" onClick={() => setRemoverImagem(true)} disabled={salvando}>Remover</Button>
                </>
              ) : (
                <Typography sx={{ fontSize: 14 }} color="text.secondary">Sem imagem</Typography>
              )}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button variant="contained" onClick={() => void salvar()} disabled={salvando || !pessoa}>
          {salvando ? <CircularProgress size={20} /> : 'Salvar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function LinhaNoticia({
  noticia,
  ocupado,
  onEditar,
  onStatus,
  onLixeira,
  onRestaurar,
  onAbrirImagem,
}: {
  noticia: Noticia;
  ocupado: boolean;
  onEditar: () => void;
  onStatus: (status: StatusNoticia) => void;
  onLixeira: () => void;
  onRestaurar: () => void;
  onAbrirImagem: () => void;
}) {
  const naLixeira = !!noticia.excluidoEm;
  const institucional = noticia.origem === 'institucional';
  return (
    <Box sx={{ px: 2, py: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap mb={0.5}>
        <Chip size="small" color={noticia.status === 'publicada' ? 'success' : 'default'} label={noticia.status === 'publicada' ? 'Publicada' : 'Rascunho'} />
        <Chip size="small" variant="outlined" label={institucional ? 'Institucional' : 'Externa'} />
        <Chip size="small" variant="outlined" color={noticia.categoria ? 'default' : 'warning'} label={noticia.categoria ? ROTULO_CATEGORIA_NOTICIA[noticia.categoria] : 'Categoria inválida'} />
        {noticia.destaque && <Chip size="small" color="primary" label="Destaque" />}
      </Stack>
      <Typography sx={{ fontSize: 17, fontWeight: 700, overflowWrap: 'anywhere' }}>{noticia.titulo || '(sem título)'}</Typography>
      <Typography sx={{ fontSize: 14, overflowWrap: 'anywhere' }} color="text.secondary">{noticia.resumo}</Typography>
      <Typography sx={{ fontSize: 13, mt: 0.5 }} color="text.secondary">
        {[noticia.fonte, noticia.publicadoEm ? `publicada em ${dataCurta(noticia.publicadoEm)}` : `criada em ${dataCurta(noticia.criadoEm)}`].filter(Boolean).join(' · ')}
        {naLixeira ? ` · na lixeira desde ${dataCurta(noticia.excluidoEm)}${noticia.excluidoPor?.nome ? `, por ${noticia.excluidoPor.nome}` : ''}` : ''}
      </Typography>
      <Stack direction="row" spacing={1} mt={1} flexWrap="wrap" useFlexGap>
        {naLixeira ? (
          <Button size="small" variant="outlined" disabled={ocupado} onClick={onRestaurar}>Restaurar</Button>
        ) : (
          <>
            {institucional && <Button size="small" variant="outlined" disabled={ocupado} onClick={onEditar}>Editar</Button>}
            {noticia.status === 'publicada' ? (
              <Button size="small" disabled={ocupado} onClick={() => onStatus('rascunho')}>Tirar do ar</Button>
            ) : (
              <Button size="small" disabled={ocupado} onClick={() => onStatus('publicada')}>Publicar</Button>
            )}
            <Button size="small" color="error" disabled={ocupado} onClick={onLixeira}>Lixeira</Button>
          </>
        )}
        {noticia.url && (
          <Button size="small" color="inherit" href={noticia.url} target="_blank" rel="noopener noreferrer">Abrir link</Button>
        )}
        {noticia.imagem ? (
          <Button size="small" color="inherit" onClick={onAbrirImagem}>Ver imagem</Button>
        ) : noticia.imagemUrl && (
          <Button size="small" color="inherit" href={noticia.imagemUrl} target="_blank" rel="noopener noreferrer">Ver imagem</Button>
        )}
      </Stack>
    </Box>
  );
}

export default function NoticiasPortalPage() {
  const pessoa = usePessoaAtual();
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [origem, setOrigem] = useState<FiltroOrigem>('todas');
  const [status, setStatus] = useState<FiltroStatus>('todos');
  const [lixeira, setLixeira] = useState(false);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [buscandoExternas, setBuscandoExternas] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; severity: 'success' | 'error'; message: string }>({ open: false, severity: 'success', message: '' });

  useEffect(() => ouvirNoticias(
    (itens) => { setNoticias(itens); setCarregando(false); setErro(null); },
    (err) => {
      console.error('Erro ao ouvir portal-noticias', err);
      setErro('Não foi possível carregar as notícias. Tente novamente.');
      setCarregando(false);
    },
  ), []);

  const naLixeira = useMemo(() => noticias.filter((n) => !!n.excluidoEm).length, [noticias]);

  const linhas = useMemo(() => {
    const termo = normalizar(busca.trim());
    return noticias.filter((n) => {
      if (!!n.excluidoEm !== lixeira) return false;
      if (origem !== 'todas' && n.origem !== origem) return false;
      if (status !== 'todos' && n.status !== status) return false;
      return !termo || normalizar([n.titulo, n.resumo, n.fonte].join(' ')).includes(termo);
    });
  }, [busca, lixeira, noticias, origem, status]);

  const executar = async (id: string, acao: () => Promise<void>, sucesso: string, falha: string) => {
    setOcupadoId(id);
    try {
      await acao();
      setSnackbar({ open: true, severity: 'success', message: sucesso });
    } catch (err) {
      console.error(falha, err);
      setSnackbar({ open: true, severity: 'error', message: `${falha} Tente novamente.` });
    } finally {
      setOcupadoId(null);
    }
  };

  const buscarExternas = async () => {
    setBuscandoExternas(true);
    try {
      const { data } = await buscarNoticiasExternas();
      setSnackbar({ open: true, severity: 'success', message: textoDoResumo(data) });
    } catch (err) {
      console.error('Erro ao buscar notícias externas', err);
      const negado = (err as { code?: unknown })?.code === 'functions/permission-denied';
      setSnackbar({ open: true, severity: 'error', message: negado ? 'Só engenharia, escritório ou adm2 podem buscar notícias externas.' : 'Não foi possível buscar as notícias externas. Tente novamente.' });
    } finally {
      setBuscandoExternas(false);
    }
  };

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
        <TextField
          size="small"
          placeholder="Buscar título, resumo ou fonte"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          sx={{ flex: 1 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': 'Buscar título, resumo ou fonte' },
          }}
        />
        <Button
          variant="outlined"
          onClick={() => void buscarExternas()}
          disabled={buscandoExternas}
          startIcon={buscandoExternas ? <CircularProgress size={16} /> : undefined}
        >
          Buscar notícias externas agora
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEdicao({ id: novoIdNoticia(), atual: null })}>
          Nova notícia
        </Button>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mt={2} flexWrap="wrap" useFlexGap>
        <ToggleButtonGroup size="small" exclusive value={origem} onChange={(_e, v: FiltroOrigem | null) => { if (v) setOrigem(v); }} aria-label="Origem">
          <ToggleButton value="todas">Todas</ToggleButton>
          <ToggleButton value="institucional">Institucionais</ToggleButton>
          <ToggleButton value="externa">Externas</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup size="small" exclusive value={status} onChange={(_e, v: FiltroStatus | null) => { if (v) setStatus(v); }} aria-label="Situação">
          <ToggleButton value="todos">Todas</ToggleButton>
          <ToggleButton value="publicada">Publicadas</ToggleButton>
          <ToggleButton value="rascunho">Rascunhos</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup size="small" exclusive value={lixeira} onChange={(_e, v: boolean | null) => { if (v !== null) setLixeira(v); }} aria-label="Lixeira">
          <ToggleButton value={false}>Ativas {noticias.length - naLixeira}</ToggleButton>
          <ToggleButton value={true}>Lixeira {naLixeira}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Box mt={3}>
        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
        {carregando ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : linhas.length > 0 ? (
          <Paper variant="outlined" sx={{ overflow: 'hidden', '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
            {linhas.map((noticia) => (
              <LinhaNoticia
                key={noticia.id}
                noticia={noticia}
                ocupado={ocupadoId === noticia.id}
                onEditar={() => setEdicao({ id: noticia.id, atual: noticia })}
                onStatus={(novo) => void executar(
                  noticia.id,
                  () => alterarStatusNoticia(noticia, novo),
                  novo === 'publicada' ? 'Notícia publicada.' : 'Notícia tirada do ar.',
                  'Não foi possível mudar a situação da notícia.',
                )}
                onLixeira={() => {
                  if (pessoa) void executar(noticia.id, () => moverNoticiaParaLixeira(noticia.id, pessoa), 'Notícia movida para a lixeira.', 'Não foi possível mover a notícia para a lixeira.');
                }}
                onRestaurar={() => void executar(noticia.id, () => restaurarNoticia(noticia.id), 'Notícia restaurada.', 'Não foi possível restaurar a notícia.')}
                onAbrirImagem={() => {
                  void abrirArquivo(noticia.imagem).then((aberto) => {
                    if (!aberto) setSnackbar({ open: true, severity: 'error', message: 'Não foi possível abrir a imagem.' });
                  });
                }}
              />
            ))}
          </Paper>
        ) : !erro && (
          <Alert severity="info">{lixeira ? 'A lixeira está vazia.' : 'Nenhuma notícia encontrada.'}</Alert>
        )}
      </Box>

      {edicao && (
        <NoticiaDialog
          key={edicao.id}
          edicao={edicao}
          onClose={() => setEdicao(null)}
          onSalva={(mensagem) => {
            setEdicao(null);
            setSnackbar({ open: true, severity: 'success', message: mensagem });
          }}
        />
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((atual) => ({ ...atual, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar((atual) => ({ ...atual, open: false }))} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
