import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactElement } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ImageNotSupportedIcon from '@mui/icons-material/ImageNotSupported';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getAtividadeSaida,
  getChecklistSaidaDownloadUrl,
  getChecklistSaidaItens,
} from '../services/checklistSaida.service';
import type { AtividadeSaida, ChecklistSaidaItem, ChecklistSaidaStatus } from '../types/checklistSaida';

const ETAPA_ORDER = [
  'dianteira',
  'lateral direita',
  'lateral esquerda',
  'traseira',
  'interior/cabine',
  'parte mecanica',
];

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    color: 'success' | 'error' | 'default' | 'warning';
    icon: ReactElement;
  }
> = {
  ok: { label: 'OK', color: 'success', icon: <CheckCircleOutlineIcon /> },
  avaria: { label: 'Avaria', color: 'error', icon: <ReportProblemOutlinedIcon /> },
  nao_aplicavel: { label: 'Não aplicável', color: 'default', icon: <RemoveCircleOutlineIcon /> },
  nao_informado: { label: 'Não informado', color: 'warning', icon: <HelpOutlineIcon /> },
};

function decodeRouteParam(value: string | undefined): string {
  if (!value) return '';

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeEtapa(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function toDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  if (typeof raw === 'object' && raw !== null && 'seconds' in raw) {
    const seconds = (raw as { seconds?: number }).seconds ?? 0;
    const nanoseconds = (raw as { nanoseconds?: number }).nanoseconds ?? 0;
    return new Date(seconds * 1000 + nanoseconds / 1e6);
  }

  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getStatusConfig(status: ChecklistSaidaStatus | undefined) {
  return STATUS_CONFIG[String(status ?? 'nao_informado')] ?? {
    label: status ? String(status) : 'Não informado',
    color: 'warning' as const,
    icon: <HelpOutlineIcon />,
  };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Não informado';
  return String(value);
}

function formatKm(value: AtividadeSaida['km'], formatter: Intl.NumberFormat): string {
  if (value === undefined || value === '') return 'Não informado';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatter.format(parsed) : 'Não informado';
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5">{value}</Typography>
      </CardContent>
    </Card>
  );
}

function ChecklistImagemModal({
  item,
  imageUrl,
  onClose,
}: {
  item: ChecklistSaidaItem | null;
  imageUrl: string | null;
  onClose: () => void;
}) {
  const statusConfig = getStatusConfig(item?.status);

  return (
    <Dialog open={Boolean(item && imageUrl)} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{item?.titulo || item?.itemId || 'Imagem do checklist'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={item?.etapa || 'Sem etapa'} />
            <Chip icon={statusConfig.icon} color={statusConfig.color} label={statusConfig.label} />
          </Stack>
          {item?.observacao && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {item.observacao}
            </Typography>
          )}
          {imageUrl && (
            <Box
              component="img"
              src={imageUrl}
              alt={item?.titulo || 'Foto do checklist'}
              sx={{
                maxHeight: '72vh',
                maxWidth: '100%',
                objectFit: 'contain',
                alignSelf: 'center',
                borderRadius: 1,
              }}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {imageUrl && (
          <Button component="a" href={imageUrl} target="_blank" rel="noreferrer" startIcon={<OpenInNewIcon />}>
            Abrir original
          </Button>
        )}
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}

function ChecklistItemCard({
  item,
  imageUrlCache,
  onOpenImage,
}: {
  item: ChecklistSaidaItem;
  imageUrlCache: MutableRefObject<Map<string, string>>;
  onOpenImage: (item: ChecklistSaidaItem, imageUrl: string) => void;
}) {
  const cacheKey = item.downloadUrl || item.storagePath || '';
  const [imageUrl, setImageUrl] = useState<string | null>(() => (cacheKey ? imageUrlCache.current.get(cacheKey) ?? null : null));
  const [imageLoading, setImageLoading] = useState(Boolean(cacheKey && !imageUrl));
  const [imageError, setImageError] = useState<string | null>(null);
  const statusConfig = getStatusConfig(item.status);

  useEffect(() => {
    let active = true;

    async function resolveImage() {
      if (!cacheKey) {
        setImageLoading(false);
        return;
      }

      const cached = imageUrlCache.current.get(cacheKey);
      if (cached) {
        setImageUrl(cached);
        setImageLoading(false);
        setImageError(null);
        return;
      }

      setImageLoading(true);
      setImageError(null);

      try {
        const resolvedUrl = item.downloadUrl || (item.storagePath ? await getChecklistSaidaDownloadUrl(item.storagePath) : '');
        if (!active) return;
        if (!resolvedUrl) {
          setImageError('Imagem indisponível.');
          return;
        }
        imageUrlCache.current.set(cacheKey, resolvedUrl);
        setImageUrl(resolvedUrl);
      } catch {
        if (active) setImageError('Imagem indisponível.');
      } finally {
        if (active) setImageLoading(false);
      }
    }

    resolveImage();

    return () => {
      active = false;
    };
  }, [cacheKey, imageUrlCache, item.downloadUrl, item.storagePath]);

  const hasImageReference = Boolean(item.downloadUrl || item.storagePath);

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack spacing={1}>
            <Typography variant="subtitle1" fontWeight={800}>
              {item.titulo || item.itemId || item.id}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" icon={statusConfig.icon} color={statusConfig.color} label={statusConfig.label} />
              {item.fotoObrigatoria && <Chip size="small" icon={<PhotoCameraIcon />} label="Foto obrigatória" />}
            </Stack>
          </Stack>

          {item.observacao && (
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {item.observacao}
            </Typography>
          )}

          <Box
            sx={{
              alignItems: 'center',
              bgcolor: 'grey.100',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              display: 'flex',
              justifyContent: 'center',
              minHeight: 180,
              overflow: 'hidden',
            }}
          >
            {imageLoading ? (
              <Stack alignItems="center" spacing={1}>
                <CircularProgress size={24} />
                <Typography variant="body2" color="text.secondary">
                  Carregando imagem...
                </Typography>
              </Stack>
            ) : imageUrl ? (
              <ButtonBase
                onClick={() => onOpenImage(item, imageUrl)}
                sx={{ display: 'block', height: 220, width: '100%' }}
              >
                <Box
                  component="img"
                  src={imageUrl}
                  alt={item.titulo || 'Foto do checklist'}
                  loading="lazy"
                  onError={() => setImageError('Imagem indisponível.')}
                  sx={{ height: '100%', objectFit: 'contain', width: '100%' }}
                />
              </ButtonBase>
            ) : (
              <Stack alignItems="center" spacing={1} p={2} textAlign="center">
                <ImageNotSupportedIcon color={imageError || hasImageReference ? 'warning' : 'disabled'} />
                <Typography variant="body2" color="text.secondary">
                  {imageError || 'Sem foto registrada'}
                </Typography>
              </Stack>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function ChecklistSaidaPage() {
  const { atividadeId: atividadeIdParam } = useParams();
  const atividadeId = decodeRouteParam(atividadeIdParam);
  const navigate = useNavigate();
  const imageUrlCache = useRef(new Map<string, string>());
  const [atividade, setAtividade] = useState<AtividadeSaida | null>(null);
  const [itens, setItens] = useState<ChecklistSaidaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [modalState, setModalState] = useState<{ item: ChecklistSaidaItem; imageUrl: string } | null>(null);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    [],
  );

  const kmFormatter = useMemo(() => new Intl.NumberFormat('pt-BR'), []);

  useEffect(() => {
    let active = true;

    async function loadChecklist() {
      if (!atividadeId) {
        setAtividade(null);
        setItens([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [atividadeData, checklistItens] = await Promise.all([
          getAtividadeSaida(atividadeId),
          getChecklistSaidaItens(atividadeId),
        ]);

        if (!active) return;
        setAtividade(atividadeData);
        setItens(checklistItens);
      } catch {
        if (active) setError('Não foi possível carregar o checklist fotográfico.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadChecklist();

    return () => {
      active = false;
    };
  }, [atividadeId, reloadKey]);

  const summary = useMemo(() => {
    const counts = {
      total: itens.length,
      ok: 0,
      avaria: 0,
      naoAplicavel: 0,
      naoInformado: 0,
      comFoto: 0,
    };

    itens.forEach((item) => {
      if (item.status === 'ok') counts.ok += 1;
      else if (item.status === 'avaria') counts.avaria += 1;
      else if (item.status === 'nao_aplicavel') counts.naoAplicavel += 1;
      else counts.naoInformado += 1;

      if (item.downloadUrl || item.storagePath) counts.comFoto += 1;
    });

    return counts;
  }, [itens]);

  const groupedItens = useMemo(() => {
    const groups = new Map<string, ChecklistSaidaItem[]>();

    itens.forEach((item) => {
      const etapa = item.etapa?.trim() || 'Sem etapa';
      groups.set(etapa, [...(groups.get(etapa) ?? []), item]);
    });

    return Array.from(groups.entries())
      .map(([etapa, etapaItens]) => ({
        etapa,
        itens: etapaItens.sort((a, b) => {
          const ordemA = Number(a.ordem);
          const ordemB = Number(b.ordem);
          if (Number.isFinite(ordemA) && Number.isFinite(ordemB) && ordemA !== ordemB) return ordemA - ordemB;
          return (a.titulo || a.itemId || a.id).localeCompare(b.titulo || b.itemId || b.id, 'pt-BR');
        }),
      }))
      .sort((a, b) => {
        const indexA = ETAPA_ORDER.indexOf(normalizeEtapa(a.etapa));
        const indexB = ETAPA_ORDER.indexOf(normalizeEtapa(b.etapa));
        const knownA = indexA >= 0;
        const knownB = indexB >= 0;
        if (knownA && knownB) return indexA - indexB;
        if (knownA) return -1;
        if (knownB) return 1;
        return a.etapa.localeCompare(b.etapa, 'pt-BR');
      });
  }, [itens]);

  if (loading) {
    return (
      <Container sx={{ py: 4 }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" p={3}>
          <CircularProgress size={22} />
          <Typography variant="body2">Carregando checklist...</Typography>
        </Stack>
      </Container>
    );
  }

  if (!atividade) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity={error ? 'error' : 'warning'} sx={{ mb: 2 }}>
          {error || 'Registro não encontrado.'}
        </Alert>
        {error && (
          <Button variant="outlined" onClick={() => setReloadKey((current) => current + 1)} sx={{ mr: 1 }}>
            Tentar novamente
          </Button>
        )}
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate('/registros')}>
          Voltar para registros
        </Button>
      </Container>
    );
  }

  const dataSaida = toDate(atividade.data);

  return (
    <Container sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
          <Box>
            <Typography variant="h4">Checklist fotográfico da saída</Typography>
            <Typography variant="subtitle1" color="text.secondary">
              {formatValue(atividade.placa)} - {dataSaida ? dateFormatter.format(dataSaida) : 'Data não informada'}
            </Typography>
          </Box>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate('/registros')}>
            Voltar para registros
          </Button>
        </Stack>

        <Paper elevation={1} sx={{ p: 2 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Placa</Typography>
              <Typography fontWeight={800}>{formatValue(atividade.placa)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Data da saída</Typography>
              <Typography fontWeight={800}>{dataSaida ? dateFormatter.format(dataSaida) : 'Não informado'}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Quilometragem</Typography>
              <Typography fontWeight={800}>{formatKm(atividade.km, kmFormatter)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Typography variant="body2" color="text.secondary">Motorista</Typography>
              <Typography fontWeight={800}>{formatValue(atividade.motorista)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="body2" color="text.secondary">Destino</Typography>
              <Typography fontWeight={800}>{formatValue(atividade.destino)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="body2" color="text.secondary">Motivo</Typography>
              <Typography fontWeight={800}>{formatValue(atividade.motivo)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="body2" color="text.secondary">Guincho</Typography>
              <Typography fontWeight={800}>{atividade.checklistSaidaGuincho ? 'Sim' : 'Não'}</Typography>
            </Grid>
            {atividade.checklistSaidaVersao !== undefined && (
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="body2" color="text.secondary">Versão do checklist</Typography>
                <Typography fontWeight={800}>{formatValue(atividade.checklistSaidaVersao)}</Typography>
              </Grid>
            )}
          </Grid>
        </Paper>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><SummaryCard label="Total de itens" value={summary.total} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><SummaryCard label="Itens OK" value={summary.ok} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><SummaryCard label="Itens com avaria" value={summary.avaria} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><SummaryCard label="Não aplicáveis" value={summary.naoAplicavel} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><SummaryCard label="Não informados" value={summary.naoInformado} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><SummaryCard label="Itens com foto" value={summary.comFoto} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard label="Checklist concluído" value={atividade.checklistSaidaConcluido ? 'Sim' : 'Não'} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <SummaryCard label="Guincho" value={atividade.checklistSaidaGuincho ? 'Sim' : 'Não'} />
          </Grid>
        </Grid>

        {itens.length === 0 ? (
          <Alert severity="info">Este registro não possui itens de checklist fotográfico.</Alert>
        ) : (
          <Stack spacing={2}>
            {groupedItens.map((group) => (
              <Accordion key={group.etapa} defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="h6">{group.etapa}</Typography>
                    <Chip size="small" label={`${group.itens.length} itens`} />
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    {group.itens.map((item) => (
                      <Grid key={item.id} size={{ xs: 12, md: 6, lg: 4 }}>
                        <ChecklistItemCard
                          item={item}
                          imageUrlCache={imageUrlCache}
                          onOpenImage={(selectedItem, imageUrl) => setModalState({ item: selectedItem, imageUrl })}
                        />
                      </Grid>
                    ))}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        )}
      </Stack>

      <ChecklistImagemModal
        item={modalState?.item ?? null}
        imageUrl={modalState?.imageUrl ?? null}
        onClose={() => setModalState(null)}
      />
    </Container>
  );
}
