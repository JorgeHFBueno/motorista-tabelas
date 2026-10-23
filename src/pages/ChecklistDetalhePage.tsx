import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate, useParams } from 'react-router-dom';
import { obterChecklist, urlDaFoto, type Checklist, type ChecklistFoto, type ChecklistItem, type ChecklistStatus } from '../services/checklists.service';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATUS: Record<ChecklistStatus, { label: string; color: 'success' | 'error' | 'default' }> = {
  ok: { label: 'OK', color: 'success' },
  avaria: { label: 'Avaria', color: 'error' },
  nao_se_aplica: { label: 'Não se aplica', color: 'default' },
};
const ORDEM: ChecklistStatus[] = ['avaria', 'ok', 'nao_se_aplica'];

function Foto({ foto, titulo, onAbrir }: { foto: ChecklistFoto; titulo: string; onAbrir: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let active = true;
    urlDaFoto(foto.miniatura ?? foto.path).then((u) => active && setUrl(u)).catch(() => active && setErro(true));
    return () => { active = false; };
  }, [foto]);
  if (erro) return <Typography variant="caption" color="error">Foto indisponível</Typography>;
  if (!url) return <CircularProgress size={20} />;
  return (
    <Box component="img" src={url} alt={titulo} onClick={() => urlDaFoto(foto.path).then(onAbrir)}
      sx={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 1, cursor: 'zoom-in', border: '1px solid', borderColor: 'divider' }} />
  );
}

function Item({ item, onAbrir }: { item: ChecklistItem; onAbrir: (url: string, titulo: string) => void }) {
  const s = STATUS[item.status];
  return (
    <Stack spacing={1} sx={{ py: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography fontWeight={600}>{item.titulo}</Typography>
        <Chip size="small" color={s.color} label={s.label} />
      </Stack>
      {item.observacao && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{item.observacao}</Typography>}
      {item.fotos.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {item.fotos.map((f) => <Foto key={f.path} foto={f} titulo={item.titulo} onAbrir={(url) => onAbrir(url, item.titulo)} />)}
        </Stack>
      )}
    </Stack>
  );
}

export default function ChecklistDetalhePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'nao-encontrado' | 'erro'>('carregando');
  const [aberta, setAberta] = useState<{ url: string; titulo: string } | null>(null);

  useEffect(() => {
    let active = true;
    obterChecklist(id)
      .then((c) => { if (!active) return; setChecklist(c); setEstado(c ? 'ok' : 'nao-encontrado'); })
      .catch(() => active && setEstado('erro'));
    return () => { active = false; };
  }, [id]);

  // Items grouped by part; damage first inside each part.
  const partes = useMemo(() => {
    const grupos = new Map<string, ChecklistItem[]>();
    for (const item of checklist?.itens ?? []) (grupos.get(item.parte || 'geral') ?? grupos.set(item.parte || 'geral', []).get(item.parte || 'geral')!).push(item);
    for (const itens of grupos.values()) itens.sort((a, b) => ORDEM.indexOf(a.status) - ORDEM.indexOf(b.status));
    return [...grupos.entries()];
  }, [checklist]);

  const voltar = <Button startIcon={<ArrowBackIcon />} variant="outlined" onClick={() => navigate('/checklists')}>Checklists</Button>;
  if (estado === 'carregando') return <Container sx={{ py: 4 }}><CircularProgress /></Container>;
  if (estado !== 'ok' || !checklist) {
    return <Container sx={{ py: 3 }}><Stack spacing={2}>{voltar}<Alert severity={estado === 'erro' ? 'error' : 'warning'}>{estado === 'erro' ? 'Não foi possível carregar o checklist.' : 'Checklist não encontrado.'}</Alert></Stack></Container>;
  }

  const c = checklist;
  const resumo: Array<[string, string]> = [
    ['Tipo', c.tipo === 'chegada' ? 'Chegada' : 'Saída'],
    ['Data', c.concluidoEm ? dateFmt.format(c.concluidoEm) : '—'],
    ['Veículo', [c.placa, c.veiculoNome].filter(Boolean).join(' — ') || '—'],
    [c.medidor?.tipo === 'horimetro' ? 'Horímetro' : 'KM', c.medidor?.valor != null ? new Intl.NumberFormat('pt-BR').format(c.medidor.valor) : '—'],
    ['Motorista', c.motorista || '—'],
    ['Feito por', c.mecanico || '—'],
    ['Assinatura', c.assinatura],
    ['Com guincho', c.guincho ? 'Sim' : 'Não'],
  ];

  return (
    <Container sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          {voltar}
          <Typography variant="h5">Checklist {c.placa}</Typography>
          {c.migradoDoLegado && <Chip size="small" label="Checklist antigo" />}
        </Stack>
        <Card><CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} flexWrap="wrap" useFlexGap>
            {resumo.map(([k, v]) => <Box key={k}><Typography variant="caption" color="text.secondary">{k}</Typography><Typography>{v}</Typography></Box>)}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Chip color="success" label={`OK: ${c.totais.ok}`} />
            <Chip color="error" label={`Avarias: ${c.totais.avaria}`} />
            <Chip label={`Não se aplica: ${c.totais.naoSeAplica}`} />
          </Stack>
        </CardContent></Card>
        {partes.map(([parte, itens]) => (
          <Card key={parte}><CardContent>
            <Typography variant="h6" sx={{ textTransform: 'capitalize' }}>{parte.replace(/_/g, ' ')}</Typography>
            <Stack divider={<Divider flexItem />}>{itens.map((item) => <Item key={item.itemId} item={item} onAbrir={(url, titulo) => setAberta({ url, titulo })} />)}</Stack>
          </CardContent></Card>
        ))}
      </Stack>
      <Dialog open={Boolean(aberta)} onClose={() => setAberta(null)} fullWidth maxWidth="lg">
        <DialogTitle>{aberta?.titulo}</DialogTitle>
        <DialogContent dividers>{aberta && <Box component="img" src={aberta.url} alt={aberta.titulo} sx={{ maxHeight: '72vh', maxWidth: '100%', objectFit: 'contain', display: 'block', mx: 'auto' }} />}</DialogContent>
        <DialogActions>
          {aberta && <Button component="a" href={aberta.url} target="_blank" rel="noreferrer">Abrir original</Button>}
          <Button onClick={() => setAberta(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
