import { useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  AvatarGroup,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControlLabel,
  InputAdornment,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import { iniciais } from '../../services/funcionarios';
import { usePessoaAtual } from '../portal-cliente/portalArquivos';
import { moverEtapa, novoIdNegocio } from './comercialDados';
import {
  FILTRO_INICIAL, anosDisponiveis, duracaoDias, etapa as etapaDe, etapasDoSegmento, filtrarNegocios, formatarData,
  formatarMoeda, formatarMoedaCurta, hojeBrasilia, prioridade, rotuloSegmento,
  type Etapa, type FiltroNegocios, type Negocio, type NegocioForm,
} from './comercialDominio';
import FiltrosComercial from './FiltrosComercial';
import NegocioDialog from './NegocioDialog';
import { useComercial } from './useComercial';

type Aberto = { negocio: Negocio | null; novoId: string; inicial?: Partial<NegocioForm> } | null;

// Negócios do Comercial: funil (colunas por etapa, arrastar muda a etapa) e lista. Clicar abre o negócio.
export default function NegociosPage() {
  const { negocios, contatos, pessoas, nomes, podeEditar, erro } = useComercial();
  const autor = usePessoaAtual();
  const [filtro, setFiltro] = useState<FiltroNegocios>(FILTRO_INICIAL);
  const [vista, setVista] = useState<'funil' | 'lista'>('funil');
  const [aberto, setAberto] = useState<Aberto>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const hoje = hojeBrasilia();

  const anos = useMemo(() => anosDisponiveis(negocios ?? []), [negocios]);
  const visiveis = useMemo(() => filtrarNegocios(negocios ?? [], filtro), [negocios, filtro]);
  const etapas = etapasDoSegmento(filtro.segmento);

  async function soltar(etapaNova: Etapa) {
    const n = visiveis.find((x) => x.id === arrastando);
    setArrastando(null);
    if (!n || !autor || n.etapa === etapaNova) return;
    if (n.segmento === 'privado' && etapaNova === 'licitado') { setAviso('"Licitado" é só de negócio público.'); return; }
    // Perdido pede o motivo: abre o negócio já na etapa nova, para salvar com ele.
    if (etapaNova === 'perdido') { setAberto({ negocio: n, novoId: n.id, inicial: { etapa: 'perdido' } }); return; }
    try {
      await moverEtapa(n, etapaNova, autor, hoje);
      setAviso(`"${n.titulo}" foi para ${etapaDe(etapaNova)?.rotulo}.`);
    } catch (err) {
      console.error('Erro ao mudar a etapa', err);
      setAviso('Não foi possível mudar a etapa.');
    }
  }

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} mb={2}>
        <TextField size="small" placeholder="Buscar negócio ou cliente" value={filtro.busca} sx={{ flex: 1, minWidth: 220 }}
          onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        <ToggleButtonGroup size="small" exclusive value={vista} onChange={(_e, v) => { if (v) setVista(v); }} aria-label="Vista">
          <ToggleButton value="funil"><ViewKanbanOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} />Funil</ToggleButton>
          <ToggleButton value="lista"><TableRowsOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} />Lista</ToggleButton>
        </ToggleButtonGroup>
        {podeEditar && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAberto({ negocio: null, novoId: novoIdNegocio(), inicial: filtro.segmento !== 'todos' ? { segmento: filtro.segmento } : undefined })}>
            Novo negócio
          </Button>
        )}
      </Stack>
      <FiltrosComercial filtro={filtro} onChange={setFiltro} anos={anos} pessoas={pessoas}>
        <FormControlLabel control={<Switch checked={filtro.lixeira} onChange={(e) => setFiltro({ ...filtro, lixeira: e.target.checked })} />} label="Lixeira" />
        <Typography variant="body2" color="text.secondary" sx={{ ml: { md: 'auto' } }}>
          {visiveis.length} negócio{visiveis.length === 1 ? '' : 's'} · {formatarMoeda(visiveis.reduce((t, n) => t + (n.valor ?? 0), 0))}
        </Typography>
      </FiltrosComercial>

      {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
      {!negocios ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : vista === 'funil' ? (
        <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', mt: 2, pb: 1, alignItems: 'flex-start' }}>
          {etapas.map((e) => {
            const itens = visiveis.filter((n) => n.etapa === e.id);
            return (
              <Paper key={e.id} variant="outlined"
                onDragOver={(ev) => { if (arrastando) ev.preventDefault(); }}
                onDrop={(ev) => { ev.preventDefault(); void soltar(e.id); }}
                sx={{ minWidth: 260, width: 260, flexShrink: 0, bgcolor: '#F6F8FA', borderTop: `4px solid ${e.cor}` }}>
                <Box px={1.5} py={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography variant="subtitle2">{e.rotulo}</Typography>
                    <Typography variant="caption" color="text.secondary">{itens.length}</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">{formatarMoedaCurta(itens.reduce((t, n) => t + (n.valor ?? 0), 0))}</Typography>
                </Box>
                <Stack spacing={1} px={1} pb={1} sx={{ maxHeight: '65vh', overflowY: 'auto' }}>
                  {itens.map((n) => (
                    <CartaoNegocio key={n.id} n={n} nomes={nomes} hoje={hoje} arrastavel={podeEditar && !filtro.lixeira}
                      onDragStart={() => setArrastando(n.id)} onDragEnd={() => setArrastando(null)}
                      onClick={() => setAberto({ negocio: n, novoId: n.id })} />
                  ))}
                  {!itens.length && <Typography variant="caption" color="text.secondary" sx={{ px: 0.5, pb: 1 }}>Nenhum negócio.</Typography>}
                </Stack>
              </Paper>
            );
          })}
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Negócio', 'Cliente', 'Segmento', 'Etapa', 'Responsável', 'Valor', 'Criado em', 'Dias'].map((t) => (
                  <TableCell key={t} sx={{ fontWeight: 700 }} align={t === 'Valor' || t === 'Dias' ? 'right' : 'left'}>{t}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {visiveis.map((n) => {
                const e = etapaDe(n.etapa);
                return (
                  <TableRow key={n.id} hover sx={{ cursor: 'pointer' }} onClick={() => setAberto({ negocio: n, novoId: n.id })}>
                    <TableCell sx={{ fontWeight: 600 }}>{n.titulo}</TableCell>
                    <TableCell>{n.cliente || '—'}</TableCell>
                    <TableCell>{rotuloSegmento(n.segmento)}{n.tipo === 'projeto' ? ' · Projeto' : ''}</TableCell>
                    <TableCell><Chip size="small" label={e?.rotulo} sx={{ bgcolor: e?.cor, color: '#fff' }} /></TableCell>
                    <TableCell>{n.responsaveis.map((u) => nomes[u] ?? 'Sem cadastro ativo').join(', ') || '—'}</TableCell>
                    <TableCell align="right">{formatarMoeda(n.valor)}</TableCell>
                    <TableCell>{formatarData(n.dataCriacao)}</TableCell>
                    <TableCell align="right">{duracaoDias(n, hoje) ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
              {!visiveis.length && (
                <TableRow><TableCell colSpan={8}><Typography variant="body2" color="text.secondary">Nenhum negócio com estes filtros.</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {aberto && (
        <NegocioDialog negocio={aberto.negocio} novoId={aberto.novoId} inicial={aberto.inicial} contatos={contatos ?? []} pessoas={pessoas}
          podeEditar={podeEditar} onClose={() => setAberto(null)} onAviso={setAviso} />
      )}
      <Snackbar open={Boolean(aviso)} autoHideDuration={4000} onClose={() => setAviso(null)} message={aviso} />
    </Container>
  );
}

function CartaoNegocio({ n, nomes, hoje, arrastavel, onClick, onDragStart, onDragEnd }: {
  n: Negocio; nomes: Record<string, string>; hoje: string; arrastavel: boolean;
  onClick: () => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const p = prioridade(n.prioridade);
  const dias = duracaoDias(n, hoje);
  return (
    <Paper elevation={0} draggable={arrastavel} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}
      sx={{ p: 1.25, cursor: arrastavel ? 'grab' : 'pointer', border: 1, borderColor: 'divider', '&:hover': { borderColor: 'secondary.main' } }}>
      <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{n.titulo}</Typography>
      {n.cliente && <Typography variant="caption" color="text.secondary" display="block" sx={{ overflowWrap: 'anywhere' }}>{n.cliente}</Typography>}
      <Stack direction="row" spacing={0.75} alignItems="center" mt={0.75} flexWrap="wrap" useFlexGap>
        <Typography variant="body2" fontWeight={600}>{formatarMoedaCurta(n.valor)}</Typography>
        <Chip size="small" variant="outlined" label={n.segmento === 'publico' ? 'Público' : 'Privado'} sx={{ height: 20, fontSize: 11 }} />
        {n.tipo === 'projeto' && <Chip size="small" variant="outlined" label="Projeto" sx={{ height: 20, fontSize: 11 }} />}
        {p && <Chip size="small" label={p.rotulo} sx={{ height: 20, fontSize: 11, bgcolor: p.cor, color: '#fff' }} />}
        <Box flex={1} />
        {dias != null && <Typography variant="caption" color="text.secondary">{dias} d</Typography>}
        {n.responsaveis.length > 0 && (
          <AvatarGroup max={3} sx={{ '& .MuiAvatar-root': { width: 22, height: 22, fontSize: 10 } }}>
            {n.responsaveis.map((u) => (
              <Tooltip key={u} title={nomes[u] ?? 'Pessoa sem cadastro ativo'}><Avatar sx={{ bgcolor: 'secondary.main' }}>{iniciais(nomes[u] ?? '?')}</Avatar></Tooltip>
            ))}
          </AvatarGroup>
        )}
      </Stack>
    </Paper>
  );
}
