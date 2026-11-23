import { useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Container,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import useAtividade from '../hooks/useAtividade';
import useOnlineStatus from '../hooks/useOnlineStatus';
import {
  FILTROS_VAZIOS,
  filtrarAtividades,
  opcoesDistintas,
  rotuloVeiculo,
  type AtividadeComData,
  type FiltrosAtividade,
} from '../services/atividade-filtros';
import AbaRastreador from '../features/rastreador/AbaRastreador';
import useRastreador from '../features/rastreador/useRastreador';
import {
  filtrarViagens,
  linhasACompletar,
  marcarDuplicados,
  valoresDaViagem,
  type Falta,
  type LinhaGeral,
} from '../features/rastreador/domain/viagem';

type TabKey = 'geral' | 'rastreador';
type FiltroLista = 'veiculos' | 'motoristas' | 'locais' | 'obras';

const TAB_KEYS: TabKey[] = ['geral', 'rastreador'];
const DEFAULT_TAB: TabKey = 'geral';
const TIPO_OPTIONS: Array<{ value: FiltrosAtividade['tipo']; label: string }> = [
  { value: 'todos', label: 'Saídas e chegadas' },
  { value: 'saida', label: 'Saídas' },
  { value: 'chegada', label: 'Chegadas' },
];
const FILTROS_LISTA: Array<{ key: FiltroLista; label: string; valor: (row: AtividadeComData) => string | undefined }> = [
  { key: 'veiculos', label: 'Veículo', valor: rotuloVeiculo },
  { key: 'motoristas', label: 'Motorista', valor: (row) => row.motorista },
  { key: 'locais', label: 'Local', valor: (row) => row.destino },
  { key: 'obras', label: 'Obra', valor: (row) => row.obra },
];

function a11yProps(tab: TabKey) {
  return {
    id: `frota-tab-${tab}`,
    'aria-controls': `frota-tabpanel-${tab}`,
  } as const;
}

function getValidTab(tabParam: string | null): TabKey {
  if (tabParam && TAB_KEYS.includes(tabParam as TabKey)) {
    return tabParam as TabKey;
  }

  return DEFAULT_TAB;
}

function formatDateInputValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function formatDateLabel(value: string): string {
  const [ano, mes, dia] = value.split('-');
  return `${dia}/${mes}/${ano}`;
}

function TabPanel({
  children,
  value,
  tabKey,
}: {
  children: ReactNode;
  value: TabKey;
  tabKey: TabKey;
}) {
  return (
    <div
      role="tabpanel"
      hidden={value !== tabKey}
      id={`frota-tabpanel-${tabKey}`}
      aria-labelledby={`frota-tab-${tabKey}`}
    >
      {value === tabKey && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

function toDateAny(raw: unknown): Date | null {
  if (!raw) return null;
  if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  if (typeof raw === 'object' && raw !== null && 'seconds' in raw) {
    const timestamp = raw as { seconds?: number; nanoseconds?: number };
    return new Date((timestamp.seconds ?? 0) * 1e3 + (timestamp.nanoseconds ?? 0) / 1e6);
  }
  if (typeof raw === 'object' && raw !== null && '_seconds' in raw) {
    const timestamp = raw as { _seconds?: number; _nanoseconds?: number };
    return new Date((timestamp._seconds ?? 0) * 1e3 + (timestamp._nanoseconds ?? 0) / 1e6);
  }

  const date = new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

const sortByDate = (a: unknown, b: unknown) =>
  (a instanceof Date ? a.getTime() : 0) - (b instanceof Date ? b.getTime() : 0);

const falta = (row: LinhaGeral, campo: Falta) => Boolean(row.aCompletar?.faltam.includes(campo));

/** Campo que falta numa linha a completar: destacado, com a sugestão quando houver. */
function ACompletar({ sugestao }: { sugestao?: string | null }) {
  return (
    <Box sx={{ py: 0.5 }}>
      <Typography variant="body2" color="warning.dark" fontWeight={600}>
        a completar
      </Typography>
      {sugestao && (
        <Typography variant="caption" color="text.secondary">
          sugestão: {sugestao}
        </Typography>
      )}
    </Box>
  );
}

export default function RegistrosPage() {
  const { isOnline } = useOnlineStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>(() => getValidTab(searchParams.get('tab')));
  const { data: atividade, loading: loadingAtividade } = useAtividade();
  const [filtros, setFiltros] = useState<FiltrosAtividade>(FILTROS_VAZIOS);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 100 });

  const rowsAtividade = useMemo<AtividadeComData[]>(
    () => atividade.map((item) => ({ ...item, dataJS: toDateAny(item.data) })),
    [atividade],
  );

  const rastreador = useRastreador(true);
  const viagens = useMemo(() => rastreador.viagens ?? [], [rastreador.viagens]);
  // Geral: os registros de atividades (App/WEB e rastreador) e as Saídas/Chegadas do rastreador a completar.
  const rowsGeral = useMemo<LinhaGeral[]>(
    () => marcarDuplicados([...rowsAtividade, ...linhasACompletar(viagens)]),
    [rowsAtividade, viagens],
  );
  const rowsFiltradas = useMemo(() => filtrarAtividades(rowsGeral, filtros), [rowsGeral, filtros]);
  const aCompletar = rowsFiltradas.filter((row) => row.aCompletar).length;
  const naAbaRastreador = tab === 'rastreador';

  // Each list's options come from the rows that match the other filters, so choices narrow each other. On the
  // Rastreador tab, from the trips.
  const opcoes = useMemo(() => {
    const result = {} as Record<FiltroLista, string[]>;
    FILTROS_LISTA.forEach(({ key, valor }) => {
      const valores = naAbaRastreador
        ? filtrarViagens(viagens, { ...filtros, [key]: [] }).flatMap((v) => valoresDaViagem(v, key))
        : filtrarAtividades(rowsGeral, { ...filtros, [key]: [] }).map(valor);
      result[key] = opcoesDistintas([...valores, ...filtros[key]]);
    });
    return result;
  }, [naAbaRastreador, viagens, rowsGeral, filtros]);
  const contagem = naAbaRastreador
    ? `${filtrarViagens(viagens, filtros).length} de ${viagens.length} viagem(ns)`
    : `${rowsFiltradas.length} de ${rowsGeral.length} registro(s)${aCompletar ? `, ${aCompletar} a completar` : ''}`;

  const atualizarFiltros = (patch: Partial<FiltrosAtividade>) => {
    setFiltros((current) => ({ ...current, ...patch }));
    setPaginationModel((current) => ({ ...current, page: 0 }));
  };

  const aplicarPeriodo = (dias: number) => {
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - (dias - 1));
    atualizarFiltros({ dataInicial: formatDateInputValue(inicio), dataFinal: formatDateInputValue(hoje) });
  };

  const filtrosAtivos =
    Boolean(filtros.dataInicial || filtros.dataFinal) ||
    filtros.tipo !== 'todos' ||
    FILTROS_LISTA.some(({ key }) => filtros[key].length > 0);

  const periodoLabel =
    filtros.dataInicial || filtros.dataFinal
      ? `${filtros.dataInicial ? formatDateLabel(filtros.dataInicial) : 'início'} a ${filtros.dataFinal ? formatDateLabel(filtros.dataFinal) : 'hoje'}`
      : 'todo o período';

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [],
  );

  const kmFormatter = useMemo(() => new Intl.NumberFormat('pt-BR'), []);

  const colunasAtividade: GridColDef<LinhaGeral>[] = useMemo(
    () => [
      {
        field: 'dataJS',
        headerName: 'Data',
        width: 130,
        renderCell: ({ row }) => (row.dataJS ? dateFmt.format(row.dataJS) : '—'),
        sortComparator: sortByDate,
      },
      {
        field: 'tipo',
        headerName: 'Tipo',
        width: 150,
        valueGetter: (_value, row) => (row.foraDoContrato ? 'Fora do contrato' : row.tipo === 'saida' ? 'Saída' : 'Chegada'),
        renderCell: ({ row, value }) => (
          <Chip
            size="small"
            label={value as string}
            color={row.foraDoContrato ? 'error' : row.tipo === 'saida' ? 'primary' : 'success'}
            variant={row.foraDoContrato ? 'filled' : 'outlined'}
          />
        ),
      },
      {
        field: 'origem',
        headerName: 'Origem',
        width: 150,
        valueGetter: (_value, row) => (row.aCompletar ? 'A completar' : row.origem === 'rastreador' ? 'Rastreador' : 'App'),
        renderCell: ({ row, value }) => (
          <Stack spacing={0.5} sx={{ py: 0.5 }} alignItems="flex-start">
            <Chip
              size="small"
              label={value as string}
              color={row.aCompletar ? 'warning' : row.origem === 'rastreador' ? 'info' : 'default'}
              variant={row.aCompletar ? 'filled' : 'outlined'}
            />
            {falta(row, 'saida') && (
              <Typography variant="caption" color="text.secondary">
                espera a Saída
              </Typography>
            )}
            {row.possivelDuplicado && (
              <Typography variant="caption" color="error.main">
                possível duplicado do App
              </Typography>
            )}
          </Stack>
        ),
      },
      {
        field: 'placa',
        headerName: 'Veículo',
        minWidth: 170,
        flex: 1,
        renderCell: ({ row }) => (
          <Box sx={{ py: 0.5 }}>
            <Typography variant="body2" fontWeight={600}>
              {row.placa || '—'}
            </Typography>
            {row.veiculoNome && (
              <Typography variant="caption" color="text.secondary">
                {row.veiculoNome}
              </Typography>
            )}
          </Box>
        ),
      },
      {
        field: 'motorista',
        headerName: 'Motorista',
        minWidth: 180,
        flex: 1.2,
        renderCell: ({ row, value }) => (falta(row, 'motorista') ? <ACompletar /> : (value as string)),
      },
      {
        field: 'destino',
        headerName: 'Local',
        minWidth: 160,
        flex: 1,
        renderCell: ({ row, value }) =>
          falta(row, 'destino') ? <ACompletar sugestao={row.aCompletar?.destinoSugerido} /> : (value as string),
      },
      {
        field: 'obra',
        headerName: 'Obra',
        minWidth: 200,
        flex: 1.4,
        renderCell: ({ row, value }) => (falta(row, 'obra') ? <ACompletar /> : (value as string)),
      },
      {
        field: 'motivo',
        headerName: 'Motivo',
        minWidth: 200,
        flex: 1.4,
        renderCell: ({ row, value }) => (falta(row, 'motivo') ? <ACompletar /> : (value as string)),
      },
      {
        field: 'km',
        headerName: 'KM',
        width: 110,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row, value }) =>
          falta(row, 'km') ? <ACompletar /> : typeof value === 'number' ? kmFormatter.format(value) : '—',
      },
      {
        field: 'acoes',
        headerName: '',
        width: 120,
        sortable: false,
        filterable: false,
        renderCell: ({ row }) =>
          row.aCompletar ? (
            <Tooltip title="Disponível na fase B">
              <span>
                <Button size="small" variant="outlined" disabled>
                  Completar
                </Button>
              </span>
            </Tooltip>
          ) : null,
      },
    ],
    [dateFmt, kmFormatter],
  );

  useEffect(() => {
    setTab(getValidTab(searchParams.get('tab')));
  }, [searchParams]);

  const handleTabChange = (_event: SyntheticEvent, newValue: TabKey) => {
    const nextTab = getValidTab(newValue);
    setTab(nextTab);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('tab', nextTab);
        return params;
      },
      { replace: true },
    );
  };

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      {!isOnline && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Modo offline: exibindo dados em cache do Firestore. As últimas alterações podem não estar visíveis.
        </Alert>
      )}

      <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
              lg: 'repeat(4, minmax(0, 1fr))',
            },
          }}
        >
          <TextField
            label="Data inicial"
            type="date"
            size="small"
            value={filtros.dataInicial}
            onChange={(event) => atualizarFiltros({ dataInicial: event.target.value })}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Data final"
            type="date"
            size="small"
            value={filtros.dataFinal}
            onChange={(event) => atualizarFiltros({ dataFinal: event.target.value })}
            InputLabelProps={{ shrink: true }}
          />
          {FILTROS_LISTA.map(({ key, label }) => (
            <Autocomplete
              key={key}
              multiple
              size="small"
              limitTags={2}
              options={opcoes[key]}
              value={filtros[key]}
              onChange={(_event, value) => atualizarFiltros({ [key]: value })}
              noOptionsText="Nenhuma opção"
              renderInput={(params) => <TextField {...params} label={label} placeholder={filtros[key].length ? '' : 'Todos'} />}
            />
          ))}
          <TextField
            select
            label="Tipo"
            size="small"
            value={filtros.tipo}
            onChange={(event) => atualizarFiltros({ tipo: event.target.value as FiltrosAtividade['tipo'] })}
          >
            {TIPO_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
          mt={2}
        >
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" variant="outlined" onClick={() => aplicarPeriodo(1)}>
              Hoje
            </Button>
            <Button size="small" variant="outlined" onClick={() => aplicarPeriodo(7)}>
              7 dias
            </Button>
            <Button size="small" variant="outlined" onClick={() => aplicarPeriodo(30)}>
              30 dias
            </Button>
            <Button size="small" disabled={!filtrosAtivos} onClick={() => atualizarFiltros(FILTROS_VAZIOS)}>
              Limpar filtros
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {contagem} · {periodoLabel}
          </Typography>
        </Stack>
      </Paper>

      <Tabs
        value={tab}
        onChange={handleTabChange}
        aria-label="Abas da frota"
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab label="Geral" value="geral" {...a11yProps('geral')} />
        <Tab label="Rastreador" value="rastreador" {...a11yProps('rastreador')} />
      </Tabs>

      <TabPanel value={tab} tabKey="geral">
        <Box sx={{ height: 'calc(100vh - 220px)', minHeight: 500, width: '100%' }}>
          <DataGrid
            rows={rowsFiltradas}
            columns={colunasAtividade}
            loading={loadingAtividade}
            getRowId={(row) => row.id}
            disableRowSelectionOnClick
            density="compact"
            getRowHeight={() => 'auto'}
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={[25, 50, 100]}
            localeText={{
              noRowsLabel: 'Nenhum registro encontrado para os filtros selecionados.',
              noResultsOverlayLabel: 'Nenhum registro encontrado para os filtros selecionados.',
            }}
            initialState={{ sorting: { sortModel: [{ field: 'dataJS', sort: 'desc' }] } }}
            getRowClassName={({ row }) => (row.foraDoContrato ? 'row-error' : row.aCompletar ? 'row-pendente' : '')}
            sx={{
              '& .MuiDataGrid-cell': {
                display: 'flex',
                alignItems: 'center',
                py: 0.75,
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                lineHeight: 1.35,
              },
              '& .row-error': { bgcolor: 'rgba(255,0,0,0.6)' },
              '& .row-pendente': { bgcolor: 'rgba(237,108,2,0.08)' },
            }}
          />
        </Box>
      </TabPanel>

      <TabPanel value={tab} tabKey="rastreador">
        <AbaRastreador filtros={filtros} atividades={rowsAtividade} dados={rastreador} />
      </TabPanel>
    </Container>
  );
}
