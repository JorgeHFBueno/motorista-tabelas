import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Stack, Typography,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { useTituloPagina } from '../components/cabecalhoPagina';
import SalvarFoto from '../components/SalvarFoto';
import { urlDaFoto } from '../services/checklists.service';
import { obterRevisao } from '../features/revisao/data/revisaoFirestore';
import type { RevisaoLida } from '../features/revisao/domain/documento';
import { TIPOS, tituloDe } from '../features/revisao/domain/listas';
import { estaAberta, exibirDia, horimetroDe, tituloStatus, type RevisaoItem } from '../features/revisao/domain/registro';
import { resumoDoItem } from '../features/revisao/domain/regras';
import type { ChecklistFoto } from '../features/checklist-mecanico/domain/rascunho';

const dataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const numero = new Intl.NumberFormat('pt-BR');

type FotoAberta = { url: string; titulo: string; path: string };

function Foto({ foto, titulo, onAbrir }: { foto: ChecklistFoto; titulo: string; onAbrir: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let active = true;
    urlDaFoto(foto.miniatura).then((u) => active && setUrl(u)).catch(() => active && setErro(true));
    return () => { active = false; };
  }, [foto.miniatura]);
  if (erro) return <Typography variant="caption" color="error">Foto indisponível</Typography>;
  if (!url) return <CircularProgress size={20} />;
  return (
    <Box component="img" src={url} alt={titulo} onClick={() => urlDaFoto(foto.arquivo).then(onAbrir)}
      sx={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 1, cursor: 'zoom-in', border: '1px solid', borderColor: 'divider' }} />
  );
}

function Item({ item, onAbrir }: { item: RevisaoItem; onAbrir: (aberta: FotoAberta) => void }) {
  const titulo = resumoDoItem(item) || 'Item sem dados';
  const detalhes: Array<[string, string]> = [
    ...(item.motivo ? [['Motivo próprio', item.motivo] as [string, string]] : []),
    ...(item.especificacao.trim() ? [['Marca / especificação', item.especificacao.trim()] as [string, string]] : []),
    ...(item.numeroNota.trim() ? [['Nº da nota', item.numeroNota.trim()] as [string, string]] : []),
  ];
  return (
    <Box sx={{ py: 1.5 }}>
      <Typography fontWeight={600}>{titulo}</Typography>
      {detalhes.map(([k, v]) => <Typography key={k} variant="body2" color="text.secondary">{k}: {v}</Typography>)}
      {item.fotos.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          {item.fotos.map((f) => <Foto key={f.arquivo} foto={f} titulo={titulo} onAbrir={(url) => onAbrir({ url, titulo, path: f.arquivo })} />)}
        </Stack>
      )}
    </Box>
  );
}

/** /mecanica/revisoes/:id: uma revisão (manutencoes-v2), só consulta: cabeçalho, itens e fotos. Continuar é no celular. */
export default function RevisaoDetalheMecanicaPage() {
  const { id = '' } = useParams();
  const [lida, setLida] = useState<RevisaoLida | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'nao-encontrado' | 'erro'>('carregando');
  const [aberta, setAberta] = useState<FotoAberta | null>(null);

  useEffect(() => {
    let active = true;
    obterRevisao(id)
      .then((l) => { if (!active) return; setLida(l); setEstado(l ? 'ok' : 'nao-encontrado'); })
      .catch(() => active && setEstado('erro'));
    return () => { active = false; };
  }, [id]);

  useTituloPagina(lida ? `Revisão ${lida.registro.veiculo.identificador}` : null);

  if (estado === 'carregando') return <Container sx={{ py: 4 }}><CircularProgress /></Container>;
  if (estado !== 'ok' || !lida) {
    return <Container sx={{ py: 3 }}><Alert severity={estado === 'erro' ? 'error' : 'warning'}>{estado === 'erro' ? 'Não foi possível carregar a revisão.' : 'Revisão não encontrada.'}</Alert></Container>;
  }

  const r = lida.registro;
  const resumo: Array<[string, string]> = [
    ['Tipo', tituloDe(TIPOS, r.tipo) ?? '—'],
    ['Veículo', [r.veiculo.identificador, r.veiculo.nome].filter(Boolean).join(' — ') || '—'],
    [horimetroDe(r.veiculo) ? 'Horímetro' : 'KM', r.medidor != null ? `${numero.format(r.medidor)}${r.medidorCorrigido ? ' (corrigido pelo mecânico)' : ''}` : '—'],
    ['Parou', r.dataParada ? exibirDia(r.dataParada) : '—'],
    ['Foi ao mecânico', r.dataEntrada ? exibirDia(r.dataEntrada) : '—'],
    ['Voltou', r.dataRetorno ? exibirDia(r.dataRetorno) : '—'],
    ['Nº da nota', r.numeroNota.trim() || '—'],
    ['Aberta por', lida.criadoPorNome || '—'],
    ...(lida.fechadoPorNome ? [['Fechada por', lida.fechadoPorNome] as [string, string]] : []),
    ['Última gravação', lida.atualizadaEm ? dataHora.format(lida.atualizadaEm) : '—'],
  ];

  return (
    <Container sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Card><CardContent>
          <Chip size="small" color={estaAberta(r) ? 'warning' : 'default'} variant={estaAberta(r) ? 'outlined' : 'filled'} label={tituloStatus(r)} sx={{ mb: 2 }} />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} flexWrap="wrap" useFlexGap>
            {resumo.map(([k, v]) => <Box key={k}><Typography variant="caption" color="text.secondary">{k}</Typography><Typography>{v}</Typography></Box>)}
          </Stack>
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">Motivo</Typography>
            <Typography>{r.motivo.trim() || '—'}</Typography>
          </Box>
        </CardContent></Card>
        <Card><CardContent>
          <Typography variant="h6">Itens ({r.itens.length})</Typography>
          {r.itens.length === 0
            ? <Typography color="text.secondary" sx={{ py: 1 }}>Nenhum item lançado ainda.</Typography>
            : <Stack divider={<Divider flexItem />}>{r.itens.map((i) => <Item key={i.itemId} item={i} onAbrir={setAberta} />)}</Stack>}
        </CardContent></Card>
      </Stack>
      <Dialog open={Boolean(aberta)} onClose={() => setAberta(null)} fullWidth maxWidth="lg">
        <DialogTitle>{aberta?.titulo}</DialogTitle>
        <DialogContent dividers>{aberta && <Box component="img" src={aberta.url} alt={aberta.titulo} sx={{ maxHeight: '72vh', maxWidth: '100%', objectFit: 'contain', display: 'block', mx: 'auto' }} />}</DialogContent>
        <DialogActions>
          {aberta && <Button component="a" href={aberta.url} target="_blank" rel="noreferrer">Abrir original</Button>}
          {aberta && <SalvarFoto key={aberta.path} path={aberta.path} titulo={aberta.titulo} />}
          <Button onClick={() => setAberta(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
