import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  ButtonBase,
  Chip,
  CircularProgress,
  Container,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { listarObras } from './obrasData';
import { contratoTexto, filtrarObras, localPendente, obraFinalizada, type FiltroObras, type ObraDetalhe } from './obrasDomain';

// Obras de obras-v2 (The Manuscript, 03_APLICACAO_WEB/07_ENGENHARIA_E_CRONOOBRA.md). O cadastro é do Friday;
// aqui só o local é editável, no detalhe da obra.

function ObraLinha({ obra, onOpen }: { obra: ObraDetalhe; onOpen: () => void }) {
  const semLocal = localPendente(obra.local);
  const detalhes = [obra.siglaObra && `Sinônimo: ${obra.siglaObra}`, obra.empresa, obra.tipoObra, contratoTexto(obra) && `Contrato ${contratoTexto(obra)}`].filter(Boolean).join(' · ');
  return (
    <ButtonBase
      onClick={onOpen}
      sx={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 280px' },
        columnGap: 2,
        rowGap: 0.5,
        alignItems: 'center',
        textAlign: 'left',
        px: 2,
        py: 1.5,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box minWidth={0}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography sx={{ fontSize: 18, fontWeight: 700 }} noWrap>{obra.nomeObra}</Typography>
          {obraFinalizada(obra) && <Chip label="Finalizada" size="small" />}
        </Stack>
        <Typography sx={{ fontSize: 14 }} color="text.secondary" noWrap>{detalhes || '—'}</Typography>
      </Box>
      <Box sx={{ textAlign: { xs: 'left', sm: 'right' }, minWidth: 0 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 600 }} color={semLocal ? 'warning.dark' : 'text.primary'} noWrap>
          {semLocal ? 'Local a corrigir' : obra.local}
        </Typography>
        <Typography sx={{ fontSize: 13 }} color="text.secondary" noWrap>{obra.situacao || obra.status || '—'}</Typography>
      </Box>
    </ButtonBase>
  );
}

export default function ObrasPage() {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<FiltroObras>('ATIVAS');
  const [busca, setBusca] = useState('');
  const [obras, setObras] = useState<ObraDetalhe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listarObras()
      .then((items) => { if (active) setObras(items); })
      .catch((err) => {
        console.error('Erro ao carregar obras', err);
        if (active) setError('Não foi possível carregar as obras. Tente novamente.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const contagem = useMemo(() => ({
    ATIVAS: obras.filter((obra) => !obraFinalizada(obra)).length,
    SEM_LOCAL: obras.filter((obra) => localPendente(obra.local)).length,
    FINALIZADAS: obras.filter(obraFinalizada).length,
    TODAS: obras.length,
  }), [obras]);

  const rows = useMemo(() => filtrarObras(obras, busca, filtro), [busca, filtro, obras]);

  return (
    <Container sx={{ py: 3 }}>
      <Typography variant="h4">Obras</Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mt={3} alignItems={{ xs: 'stretch', md: 'center' }}>
        <TextField
          size="small"
          placeholder="Buscar obra, sinônimo, contrato ou local"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          sx={{ flex: 1 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': 'Buscar obra, sinônimo, contrato ou local' },
          }}
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filtro}
          onChange={(_event, value: FiltroObras | null) => { if (value) setFiltro(value); }}
          aria-label="Filtro das obras"
          sx={{ flexWrap: 'wrap' }}
        >
          <ToggleButton value="ATIVAS">Ativas {contagem.ATIVAS}</ToggleButton>
          <ToggleButton value="SEM_LOCAL">Sem local {contagem.SEM_LOCAL}</ToggleButton>
          <ToggleButton value="FINALIZADAS">Finalizadas {contagem.FINALIZADAS}</ToggleButton>
          <ToggleButton value="TODAS">Todas {contagem.TODAS}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Box mt={3}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : rows.length > 0 ? (
          <Paper variant="outlined" sx={{ overflow: 'hidden', '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
            {rows.map((obra) => (
              <ObraLinha key={obra.id} obra={obra} onOpen={() => navigate(`/engenharia/obras/${encodeURIComponent(obra.id)}`)} />
            ))}
          </Paper>
        ) : !error && (
          <Alert severity="info">Nenhuma obra encontrada.</Alert>
        )}
      </Box>
    </Container>
  );
}
