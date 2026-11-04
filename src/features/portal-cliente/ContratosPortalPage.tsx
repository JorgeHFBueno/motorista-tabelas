import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
import type { ObraDetalhe } from '../obras/obrasDomain';
import { localPendente, obraFinalizada } from '../obras/obrasDomain';
import { listarContratos } from './contratosPortalData';
import { filtrarContratos, type FiltroContratos, type LinhaContrato } from './contratosPortalDominio';
import PublicarContratoDialog from './PublicarContratoDialog';
import { formatarDocumento } from './portalDominio';

// Contracts in the client portal (adm2): every obras-v2 contract, published (portal-obras/{id}) or not.
// The Manuscript: 03_APLICACAO_WEB/16_PORTAL_DO_CLIENTE.md, "Telas do adm2 na WEB".

function LinhaContratoPortal({ linha, onOpen, onPublicar }: { linha: LinhaContrato; onOpen: () => void; onPublicar: () => void }) {
  const { obra, portal } = linha;
  const detalhes = [obra.numeroContrato && `Contrato ${obra.numeroContrato}`, !localPendente(obra.local) && obra.local].filter(Boolean).join(' · ');
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 260px' },
        columnGap: 2,
        rowGap: 1,
        alignItems: 'center',
        px: 2,
        py: 1.5,
      }}
    >
      <ButtonBase onClick={onOpen} sx={{ display: 'block', textAlign: 'left', minWidth: 0, borderRadius: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" minWidth={0}>
          <Typography sx={{ fontSize: 18, fontWeight: 700 }} noWrap>{obra.nomeObra}</Typography>
          {obraFinalizada(obra) && <Chip label="Finalizada" size="small" />}
        </Stack>
        <Typography sx={{ fontSize: 14 }} color="text.secondary" noWrap>{detalhes || '—'}</Typography>
      </ButtonBase>
      <Box sx={{ textAlign: { xs: 'left', sm: 'right' }, minWidth: 0 }}>
        {portal ? (
          <ButtonBase onClick={onOpen} sx={{ display: 'block', textAlign: 'inherit', width: '100%', borderRadius: 1 }}>
            <Chip label="Publicado" color="success" size="small" />
            <Typography sx={{ fontSize: 14, mt: 0.5 }} color="text.secondary" noWrap>
              Cliente {formatarDocumento(portal.clienteDocumento)}
            </Typography>
          </ButtonBase>
        ) : (
          <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'flex-start', sm: 'flex-end' }}>
            <Chip label="Não publicado" size="small" variant="outlined" />
            <Button size="small" variant="outlined" onClick={onPublicar}>Publicar no portal</Button>
          </Stack>
        )}
      </Box>
    </Box>
  );
}

export default function ContratosPortalPage() {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<FiltroContratos>('TODOS');
  const [busca, setBusca] = useState('');
  const [linhas, setLinhas] = useState<LinhaContrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publicando, setPublicando] = useState<ObraDetalhe | null>(null);

  const carregar = useCallback(() => {
    let ativo = true;
    listarContratos()
      .then((items) => { if (ativo) { setLinhas(items); setError(null); } })
      .catch((err) => {
        console.error('Erro ao carregar os contratos do portal', err);
        if (ativo) setError('Não foi possível carregar os contratos. Tente novamente.');
      })
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, []);

  useEffect(() => carregar(), [carregar]);

  const contagem = useMemo(() => {
    const publicados = linhas.filter((linha) => linha.portal).length;
    return { PUBLICADOS: publicados, NAO_PUBLICADOS: linhas.length - publicados, TODOS: linhas.length };
  }, [linhas]);

  const rows = useMemo(() => filtrarContratos(linhas, busca, filtro), [busca, filtro, linhas]);
  const abrir = (obraId: string) => navigate(`/portal-cliente/contratos/${encodeURIComponent(obraId)}`);

  return (
    <Container sx={{ py: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
        <TextField
          size="small"
          placeholder="Buscar contrato, local ou CNPJ/CPF"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          sx={{ flex: 1 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': 'Buscar contrato, local ou CNPJ/CPF' },
          }}
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filtro}
          onChange={(_event, value: FiltroContratos | null) => { if (value) setFiltro(value); }}
          aria-label="Filtro dos contratos"
          sx={{ flexWrap: 'wrap' }}
        >
          <ToggleButton value="PUBLICADOS">Publicados {contagem.PUBLICADOS}</ToggleButton>
          <ToggleButton value="NAO_PUBLICADOS">Não publicados {contagem.NAO_PUBLICADOS}</ToggleButton>
          <ToggleButton value="TODOS">Todos {contagem.TODOS}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Box mt={3}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : rows.length > 0 ? (
          <Paper variant="outlined" sx={{ overflow: 'hidden', '& > *:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
            {rows.map((linha) => (
              <LinhaContratoPortal
                key={linha.obra.id}
                linha={linha}
                onOpen={() => abrir(linha.obra.id)}
                onPublicar={() => setPublicando(linha.obra)}
              />
            ))}
          </Paper>
        ) : !error && (
          <Alert severity="info">Nenhum contrato encontrado.</Alert>
        )}
      </Box>

      <PublicarContratoDialog
        obra={publicando}
        onClose={() => setPublicando(null)}
        onPublicado={(obraId) => { setPublicando(null); abrir(obraId); }}
      />
    </Container>
  );
}
