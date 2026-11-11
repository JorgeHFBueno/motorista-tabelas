import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Container,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SearchIcon from '@mui/icons-material/Search';
import SendIcon from '@mui/icons-material/Send';
import {
  alterarResponsavelAtendimento,
  alterarStatusAtendimento,
  CATEGORIAS_ATENDIMENTO,
  contratoConfere,
  erroDePermissao,
  marcarLidoPelaEquipe,
  ouvirAtendimentos,
  ouvirMensagens,
  ouvirObrasResumo,
  PRIORIDADES_ATENDIMENTO,
  responderAtendimento,
  ROTULO_CATEGORIA,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  STATUS_ATENDIMENTO,
  type Atendimento,
  type CategoriaAtendimento,
  type MensagemAtendimento,
  type ObraResumo,
  type PrioridadeAtendimento,
  type StatusAtendimento,
} from './atendimentosPortalData';
import { abrirArquivo, usePessoaAtual } from './portalArquivos';
import { apenasDigitos, formatarDocumento } from './portalDominio';

// Support tickets of the client portal, team side (adm2). The Manuscript: 01_FIRESTORE/COLECOES/portal.md
// (portal-atendimentos) and 03_APLICACAO_WEB/16_PORTAL_DO_CLIENTE.md.

const MSG_CONTRATO_MUDOU =
  'O contrato deste chamado mudou de CNPJ/CPF (ou saiu do portal), e as regras não deixam mais alterá-lo. O chamado fica só para leitura.';

const COR_STATUS: Record<StatusAtendimento, 'warning' | 'info' | 'secondary' | 'success' | 'default'> = {
  aberto: 'warning',
  em_andamento: 'info',
  aguardando_cliente: 'secondary',
  resolvido: 'success',
  fechado: 'default',
};

const COR_PRIORIDADE: Record<PrioridadeAtendimento, 'success' | 'warning' | 'error'> = {
  baixa: 'success',
  media: 'warning',
  alta: 'error',
};

const dataHora = (valor: Date | null) =>
  valor ? valor.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const normalizar = (valor: string) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Filtros = { busca: string; status: StatusAtendimento | 'todos'; categoria: CategoriaAtendimento | 'todas'; prioridade: PrioridadeAtendimento | 'todas' };

function filtrar(itens: Atendimento[], obras: Map<string, ObraResumo>, filtros: Filtros) {
  const termo = normalizar(filtros.busca.trim());
  const digitos = apenasDigitos(filtros.busca);
  return itens.filter((item) => {
    if (filtros.status !== 'todos' && item.status !== filtros.status) return false;
    if (filtros.categoria !== 'todas' && item.categoria !== filtros.categoria) return false;
    if (filtros.prioridade !== 'todas' && item.prioridade !== filtros.prioridade) return false;
    if (!termo) return true;
    if (digitos.length >= 3 && item.clienteDocumento.includes(digitos)) return true;
    const texto = [item.titulo, item.criadoPor?.nome, obras.get(item.obraId)?.nome, item.ultimaMensagem.resumo].filter(Boolean).join(' ');
    return normalizar(texto).includes(termo);
  });
}

function LinhaAtendimento({ item, obra, selecionado, onOpen }: { item: Atendimento; obra?: ObraResumo; selecionado: boolean; onOpen: () => void }) {
  return (
    <ButtonBase
      onClick={onOpen}
      sx={{
        width: '100%',
        display: 'block',
        textAlign: 'left',
        px: 2,
        py: 1.5,
        bgcolor: selecionado ? 'action.selected' : undefined,
        '&:hover': { bgcolor: selecionado ? 'action.selected' : 'action.hover' },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap mb={0.5}>
        <Chip size="small" color={COR_STATUS[item.status]} label={ROTULO_STATUS[item.status]} />
        {item.novaObra && <Chip size="small" color="warning" label="Nova obra" />}
        <Chip size="small" variant="outlined" color={COR_PRIORIDADE[item.prioridade]} label={ROTULO_PRIORIDADE[item.prioridade]} />
        {item.naoLidasEquipe > 0 && (
          <Chip size="small" color="primary" label={item.naoLidasEquipe === 1 ? '1 nova' : `${item.naoLidasEquipe} novas`} />
        )}
      </Stack>
      <Typography sx={{ fontWeight: item.naoLidasEquipe > 0 ? 700 : 600 }} noWrap>{item.titulo}</Typography>
      <Typography sx={{ fontSize: 13 }} color="text.secondary" noWrap>
        {[obra?.nome ?? item.obraId, item.criadoPor?.nome].filter(Boolean).join(' · ')}
      </Typography>
      <Typography sx={{ fontSize: 13 }} color="text.secondary" noWrap>
        {item.ultimaMensagem.autorTipo === 'equipe' ? 'Equipe: ' : ''}{item.ultimaMensagem.resumo || '—'}
      </Typography>
      <Typography sx={{ fontSize: 12 }} color="text.secondary" mt={0.5}>
        {dataHora(item.ultimaMensagem.em ?? item.criadoEm)}
      </Typography>
    </ButtonBase>
  );
}

function Mensagem({ mensagem, onAbrirAnexo }: { mensagem: MensagemAtendimento; onAbrirAnexo: (anexo: MensagemAtendimento['anexos'][number]) => void }) {
  const equipe = mensagem.autorTipo === 'equipe';
  return (
    <Box sx={{ display: 'flex', justifyContent: equipe ? 'flex-end' : 'flex-start' }}>
      <Box
        sx={{
          maxWidth: { xs: '90%', md: '75%' },
          px: 1.5,
          py: 1,
          borderRadius: 2,
          bgcolor: equipe ? 'primary.main' : 'action.hover',
          color: equipe ? 'primary.contrastText' : 'text.primary',
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>
          {mensagem.autor?.nome || (equipe ? 'Equipe Ledur' : 'Cliente')}{equipe ? ' · equipe' : ''}
        </Typography>
        <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{mensagem.texto}</Typography>
        {mensagem.anexos.map((anexo) => (
          <Button
            key={anexo.path}
            size="small"
            color="inherit"
            startIcon={<AttachFileIcon fontSize="small" />}
            onClick={() => onAbrirAnexo(anexo)}
            sx={{ textTransform: 'none', display: 'flex' }}
          >
            {anexo.nome}
          </Button>
        ))}
        <Typography sx={{ fontSize: 11, opacity: 0.75, textAlign: 'right' }}>{dataHora(mensagem.criadoEm)}</Typography>
      </Box>
    </Box>
  );
}

export default function AtendimentoPortalPage() {
  const pessoa = usePessoaAtual();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [obras, setObras] = useState<Map<string, ObraResumo>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [obrasCarregadas, setObrasCarregadas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({ busca: '', status: 'todos', categoria: 'todas', prioridade: 'todas' });
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemAtendimento[]>([]);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [erroMensagens, setErroMensagens] = useState<string | null>(null);
  const [resposta, setResposta] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; severity: 'success' | 'error'; message: string }>({ open: false, severity: 'success', message: '' });
  const marcando = useRef(new Set<string>());

  useEffect(() => {
    const pararAtendimentos = ouvirAtendimentos(
      (itens) => { setAtendimentos(itens); setCarregando(false); setErro(null); },
      (err) => {
        console.error('Erro ao ouvir portal-atendimentos', err);
        setErro('Não foi possível carregar os chamados. Tente novamente.');
        setCarregando(false);
      },
    );
    const pararObras = ouvirObrasResumo(
      (mapa) => { setObras(mapa); setObrasCarregadas(true); },
      (err) => {
        console.error('Erro ao ouvir portal-obras', err);
        setErro('Não foi possível carregar os contratos do portal. Tente novamente.');
      },
    );
    return () => { pararAtendimentos(); pararObras(); };
  }, []);

  useEffect(() => {
    if (!selecionadoId) return undefined;
    setMensagens([]);
    setErroMensagens(null);
    setCarregandoMensagens(true);
    return ouvirMensagens(
      selecionadoId,
      (itens) => { setMensagens(itens); setCarregandoMensagens(false); },
      (err) => {
        console.error('Erro ao ouvir as mensagens do chamado', err);
        setErroMensagens('Não foi possível carregar as mensagens deste chamado.');
        setCarregandoMensagens(false);
      },
    );
  }, [selecionadoId]);

  const selecionado = useMemo(() => atendimentos.find((item) => item.id === selecionadoId) ?? null, [atendimentos, selecionadoId]);
  const podeAlterar = !!selecionado && obrasCarregadas && contratoConfere(selecionado, obras);

  // Opening a ticket (and keeping it open while the client writes) marks it read by the team.
  useEffect(() => {
    if (!selecionado || selecionado.naoLidasEquipe === 0 || !podeAlterar || marcando.current.has(selecionado.id)) return;
    const id = selecionado.id;
    marcando.current.add(id);
    marcarLidoPelaEquipe(id)
      .catch((err) => console.error('Erro ao marcar o chamado como lido', err))
      .finally(() => marcando.current.delete(id));
  }, [podeAlterar, selecionado]);

  const linhas = useMemo(() => filtrar(atendimentos, obras, filtros), [atendimentos, filtros, obras]);
  const naoLidos = useMemo(() => atendimentos.filter((item) => item.naoLidasEquipe > 0).length, [atendimentos]);

  const abrir = (id: string) => {
    if (id !== selecionadoId) setResposta('');
    setSelecionadoId(id);
  };

  const avisarErro = (err: unknown, mensagem: string) => {
    console.error(mensagem, err);
    setSnackbar({ open: true, severity: 'error', message: erroDePermissao(err) ? MSG_CONTRATO_MUDOU : `${mensagem} Tente novamente.` });
  };

  const executar = async (acao: () => Promise<void>, sucesso: string, falha: string) => {
    setSalvando(true);
    try {
      await acao();
      setSnackbar({ open: true, severity: 'success', message: sucesso });
      return true;
    } catch (err) {
      avisarErro(err, falha);
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const responder = async () => {
    if (!selecionado || !pessoa || !resposta.trim()) return;
    const ok = await executar(() => responderAtendimento(selecionado.id, pessoa, resposta), 'Resposta enviada.', 'Não foi possível enviar a resposta.');
    if (ok) setResposta('');
  };

  const fechado = selecionado?.status === 'fechado';
  const obraSelecionada = selecionado ? obras.get(selecionado.obraId) : undefined;
  const souResponsavel = !!selecionado?.responsavel && selecionado.responsavel.uid === pessoa?.uid;

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
        <TextField
          size="small"
          placeholder="Buscar título, contrato, cliente ou CNPJ/CPF"
          value={filtros.busca}
          onChange={(event) => setFiltros((atual) => ({ ...atual, busca: event.target.value }))}
          sx={{ flex: 1 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': 'Buscar título, contrato, cliente ou CNPJ/CPF' },
          }}
        />
        <TextField select size="small" label="Status" value={filtros.status} sx={{ minWidth: 180 }}
          onChange={(event) => setFiltros((atual) => ({ ...atual, status: event.target.value as Filtros['status'] }))}>
          <MenuItem value="todos">Todos</MenuItem>
          {STATUS_ATENDIMENTO.map((valor) => <MenuItem key={valor} value={valor}>{ROTULO_STATUS[valor]}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Categoria" value={filtros.categoria} sx={{ minWidth: 150 }}
          onChange={(event) => setFiltros((atual) => ({ ...atual, categoria: event.target.value as Filtros['categoria'] }))}>
          <MenuItem value="todas">Todas</MenuItem>
          {CATEGORIAS_ATENDIMENTO.map((valor) => <MenuItem key={valor} value={valor}>{ROTULO_CATEGORIA[valor]}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Prioridade" value={filtros.prioridade} sx={{ minWidth: 140 }}
          onChange={(event) => setFiltros((atual) => ({ ...atual, prioridade: event.target.value as Filtros['prioridade'] }))}>
          <MenuItem value="todas">Todas</MenuItem>
          {PRIORIDADES_ATENDIMENTO.map((valor) => <MenuItem key={valor} value={valor}>{ROTULO_PRIORIDADE[valor]}</MenuItem>)}
        </TextField>
      </Stack>

      <Typography sx={{ fontSize: 13, mt: 1.5 }} color="text.secondary">
        {linhas.length} de {atendimentos.length} chamado{atendimentos.length === 1 ? '' : 's'}
        {naoLidos > 0 ? ` · ${naoLidos} com mensagem nova` : ''}
      </Typography>

      <Box mt={2}>
        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
        {carregando ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '360px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
            <Box sx={{ display: { xs: selecionado ? 'none' : 'block', md: 'block' } }}>
              {linhas.length > 0 ? (
                <Paper variant="outlined" sx={{ overflow: 'hidden', '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
                  {linhas.map((item) => (
                    <LinhaAtendimento key={item.id} item={item} obra={obras.get(item.obraId)} selecionado={item.id === selecionadoId} onOpen={() => abrir(item.id)} />
                  ))}
                </Paper>
              ) : !erro && (
                <Alert severity="info">{atendimentos.length === 0 ? 'Nenhum chamado aberto pelos clientes.' : 'Nenhum chamado com estes filtros.'}</Alert>
              )}
            </Box>

            <Paper variant="outlined" sx={{ p: 2, display: { xs: selecionado ? 'block' : 'none', md: 'block' }, minWidth: 0 }}>
              {!selecionado ? (
                <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>Selecione um chamado na lista.</Typography>
              ) : (
                <Stack spacing={2}>
                  <Box>
                    <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => setSelecionadoId(null)} sx={{ display: { md: 'none' }, mb: 1 }}>
                      Chamados
                    </Button>
                    <Typography sx={{ fontSize: 20, fontWeight: 700, overflowWrap: 'anywhere' }}>{selecionado.titulo}</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={1}>
                      <Chip size="small" color={COR_STATUS[selecionado.status]} label={ROTULO_STATUS[selecionado.status]} />
                      <Chip size="small" variant="outlined" label={ROTULO_CATEGORIA[selecionado.categoria]} />
                      <Chip size="small" variant="outlined" color={COR_PRIORIDADE[selecionado.prioridade]} label={`Prioridade ${ROTULO_PRIORIDADE[selecionado.prioridade].toLowerCase()}`} />
                    </Stack>
                  </Box>

                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                    <Box minWidth={0}>
                      <Typography sx={{ fontSize: 12 }} color="text.secondary">Contrato</Typography>
                      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                        {selecionado.novaObra
                          ? `Nova obra (aberto em ${obraSelecionada?.nome ?? selecionado.obraId})`
                          : obraSelecionada?.nome ?? selecionado.obraId}
                      </Typography>
                    </Box>
                    <Box minWidth={0}>
                      <Typography sx={{ fontSize: 12 }} color="text.secondary">Cliente</Typography>
                      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{selecionado.criadoPor?.nome || '—'}</Typography>
                      <Typography sx={{ fontSize: 13 }} color="text.secondary">{formatarDocumento(selecionado.clienteDocumento) || '—'}</Typography>
                    </Box>
                    <Box minWidth={0}>
                      <Typography sx={{ fontSize: 12 }} color="text.secondary">Aberto em</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{dataHora(selecionado.criadoEm)}</Typography>
                    </Box>
                  </Box>

                  {obrasCarregadas && !podeAlterar && <Alert severity="warning">{MSG_CONTRATO_MUDOU}</Alert>}

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
                    <TextField
                      select
                      size="small"
                      label="Status"
                      value={selecionado.status}
                      disabled={!podeAlterar || salvando}
                      sx={{ minWidth: 200 }}
                      onChange={(event) => {
                        const status = event.target.value as StatusAtendimento;
                        if (status !== selecionado.status) {
                          void executar(() => alterarStatusAtendimento(selecionado.id, status), `Status: ${ROTULO_STATUS[status]}.`, 'Não foi possível mudar o status.');
                        }
                      }}
                    >
                      {STATUS_ATENDIMENTO.map((valor) => <MenuItem key={valor} value={valor}>{ROTULO_STATUS[valor]}</MenuItem>)}
                    </TextField>
                    <Box flex={1} minWidth={0}>
                      <Typography sx={{ fontSize: 12 }} color="text.secondary">Responsável</Typography>
                      <Typography sx={{ fontWeight: 600 }} noWrap>{selecionado.responsavel?.nome || 'Ninguém'}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      {!souResponsavel && (
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={!podeAlterar || salvando || !pessoa}
                          onClick={() => {
                            if (pessoa) void executar(() => alterarResponsavelAtendimento(selecionado.id, pessoa), 'Chamado atribuído a você.', 'Não foi possível atribuir o chamado.');
                          }}
                        >
                          Assumir
                        </Button>
                      )}
                      {selecionado.responsavel && (
                        <Button
                          size="small"
                          color="inherit"
                          disabled={!podeAlterar || salvando}
                          onClick={() => void executar(() => alterarResponsavelAtendimento(selecionado.id, null), 'Responsável removido.', 'Não foi possível remover o responsável.')}
                        >
                          Remover responsável
                        </Button>
                      )}
                    </Stack>
                  </Stack>

                  <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
                    {erroMensagens && <Alert severity="error" sx={{ mb: 2 }}>{erroMensagens}</Alert>}
                    {carregandoMensagens ? (
                      <Box display="flex" justifyContent="center" py={4}><CircularProgress size={28} /></Box>
                    ) : mensagens.length > 0 ? (
                      <Stack spacing={1.5} sx={{ maxHeight: { md: 480 }, overflowY: 'auto', pr: 0.5 }}>
                        {mensagens.map((mensagem) => (
                          <Mensagem
                            key={mensagem.id}
                            mensagem={mensagem}
                            onAbrirAnexo={(anexo) => {
                              void abrirArquivo(anexo).then((aberto) => {
                                if (!aberto) setSnackbar({ open: true, severity: 'error', message: 'Não foi possível abrir o anexo.' });
                              });
                            }}
                          />
                        ))}
                      </Stack>
                    ) : !erroMensagens && (
                      <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{selecionado.descricaoInicial || 'Sem mensagens.'}</Typography>
                    )}
                  </Box>

                  {fechado ? (
                    <Alert severity="info">Chamado fechado. Para responder, mude o status.</Alert>
                  ) : (
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'flex-end' }}>
                      <TextField
                        multiline
                        minRows={2}
                        maxRows={8}
                        fullWidth
                        size="small"
                        placeholder="Responder ao cliente"
                        value={resposta}
                        disabled={!podeAlterar || salvando}
                        onChange={(event) => setResposta(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                            event.preventDefault();
                            void responder();
                          }
                        }}
                        slotProps={{ htmlInput: { 'aria-label': 'Responder ao cliente' } }}
                      />
                      <Button
                        variant="contained"
                        endIcon={<SendIcon />}
                        disabled={!podeAlterar || salvando || !pessoa || !resposta.trim()}
                        onClick={() => void responder()}
                      >
                        Enviar
                      </Button>
                    </Stack>
                  )}
                </Stack>
              )}
            </Paper>
          </Box>
        )}
      </Box>

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
