import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
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
  Typography,
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import useAtividade from '../hooks/useAtividade';
import useOnlineStatus from '../hooks/useOnlineStatus';
import type { ChartKey, ChartPoint } from '../components/FrotaCharts';
import {
  FILTROS_VAZIOS,
  filtrarAtividades,
  opcoesDistintas,
  rotuloVeiculo,
  type AtividadeComData,
  type FiltrosAtividade,
} from '../services/atividade-filtros';

const FrotaCharts = lazy(() => import('../components/FrotaCharts'));

type TabKey = 'geral' | 'graficos' | 'hibrido';
type FiltroLista = 'veiculos' | 'motoristas' | 'locais' | 'obras';

type MotoristaResumo = {
  id: string;
  registros: number;
  ultimoRegistro: Date | null;
};

const TAB_KEYS: TabKey[] = ['geral', 'graficos', 'hibrido'];
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

export default function RegistrosPage() {
  const { isOnline } = useOnlineStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>(() => getValidTab(searchParams.get('tab')));
  const [chartTab, setChartTab] = useState<ChartKey>('caminhoes');
  const { data: atividade, loading: loadingAtividade } = useAtividade();
  const [filtros, setFiltros] = useState<FiltrosAtividade>(FILTROS_VAZIOS);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 100 });

  const rowsAtividade = useMemo<AtividadeComData[]>(
    () => atividade.map((item) => ({ ...item, dataJS: toDateAny(item.data) })),
    [atividade],
  );

  const rowsFiltradas = useMemo(() => filtrarAtividades(rowsAtividade, filtros), [rowsAtividade, filtros]);

  // Each list's options come from the rows that match the other filters, so choices narrow each other.
  const opcoes = useMemo(() => {
    const result = {} as Record<FiltroLista, string[]>;
    FILTROS_LISTA.forEach(({ key, valor }) => {
      const outros = filtrarAtividades(rowsAtividade, { ...filtros, [key]: [] });
      result[key] = opcoesDistintas([...outros.map(valor), ...filtros[key]]);
    });
    return result;
  }, [rowsAtividade, filtros]);

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

  const colunasAtividade: GridColDef<AtividadeComData>[] = useMemo(
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
      { field: 'motorista', headerName: 'Motorista', minWidth: 180, flex: 1.2 },
      { field: 'destino', headerName: 'Local', minWidth: 160, flex: 1 },
      { field: 'obra', headerName: 'Obra', minWidth: 200, flex: 1.4 },
      { field: 'motivo', headerName: 'Motivo', minWidth: 200, flex: 1.4 },
      {
        field: 'km',
        headerName: 'KM',
        width: 110,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ value }) => (typeof value === 'number' ? kmFormatter.format(value) : '—'),
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

  const motoristaResumo: MotoristaResumo[] = useMemo(() => {
    const acc = new Map<string, MotoristaResumo>();
    rowsFiltradas.forEach((row) => {
      const motorista = row.motorista || '—';
      const current = acc.get(motorista) ?? { id: motorista, registros: 0, ultimoRegistro: null };
      current.registros += 1;
      if (row.dataJS && (!current.ultimoRegistro || current.ultimoRegistro < row.dataJS)) {
        current.ultimoRegistro = row.dataJS;
      }
      acc.set(motorista, current);
    });
    return Array.from(acc.values());
  }, [rowsFiltradas]);

  const colunasMotoristaResumo: GridColDef<MotoristaResumo>[] = useMemo(
    () => [
      { field: 'id', headerName: 'Motorista', flex: 1.2, minWidth: 200 },
      {
        field: 'ultimoRegistro',
        headerName: 'Último registro',
        flex: 1,
        minWidth: 160,
        renderCell: ({ value }) => (value instanceof Date ? dateFmt.format(value) : '—'),
        sortComparator: sortByDate,
      },
      {
        field: 'registros',
        headerName: 'Registros',
        flex: 1,
        minWidth: 120,
        valueFormatter: (value) => kmFormatter.format(Number(value)),
      },
    ],
    [dateFmt, kmFormatter],
  );

  const chartData = useMemo(() => {
    const countByPlaca = new Map<string, number>();
    const kmByPlaca = new Map<string, number>();
    const countByMotorista = new Map<string, number>();

    rowsFiltradas.forEach((row) => {
      const placa = row.placa || '—';
      const motorista = row.motorista || '—';
      const kmValue = Number(row.km) || 0;

      countByPlaca.set(placa, (countByPlaca.get(placa) ?? 0) + 1);
      kmByPlaca.set(placa, (kmByPlaca.get(placa) ?? 0) + kmValue);
      countByMotorista.set(motorista, (countByMotorista.get(motorista) ?? 0) + 1);
    });

    const toPoints = (map: Map<string, number>): ChartPoint[] =>
      Array.from(map.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);

    return {
      caminhoes: toPoints(countByPlaca),
      km: toPoints(kmByPlaca),
      motorista: toPoints(countByMotorista),
    };
  }, [rowsFiltradas]);

  const currentChartData = chartData[chartTab];

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>
        Registros
      </Typography>

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
            {rowsFiltradas.length} de {rowsAtividade.length} registro(s) · {periodoLabel}
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
        <Tab label="Gráficos" value="graficos" {...a11yProps('graficos')} />
        <Tab label="Híbrido" value="hibrido" {...a11yProps('hibrido')} />
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
            getRowClassName={({ row }) => (row.foraDoContrato ? 'row-error' : '')}
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
            }}
          />
        </Box>
      </TabPanel>

      <TabPanel value={tab} tabKey="graficos">
        <Stack spacing={2}>
          {!isOnline && (
            <Alert severity="info">
              Você está offline. Os gráficos usam os dados em cache e podem não refletir atualizações recentes.
            </Alert>
          )}

          <Tabs
            value={chartTab}
            onChange={(_event, value) => setChartTab(value)}
            aria-label="Gráficos da frota"
            variant="scrollable"
            allowScrollButtonsMobile
          >
            <Tab label="Caminhões" value="caminhoes" />
            <Tab label="KM" value="km" />
            <Tab label="Motorista" value="motorista" />
          </Tabs>

          {currentChartData.length === 0 ? (
            <Typography variant="body1">Sem dados para os filtros selecionados.</Typography>
          ) : (
            <Suspense fallback={<Typography>Carregando gráficos...</Typography>}>
              <FrotaCharts
                chartTab={chartTab}
                data={currentChartData}
                dateRangeLabel={periodoLabel}
                hoverMode="valueOnly"
              />
            </Suspense>
          )}
        </Stack>
      </TabPanel>

      <TabPanel value={tab} tabKey="hibrido">
        <Paper elevation={1} sx={{ p: 2 }}>
          <Typography variant="h6" mb={2}>
            Sobre motorista
          </Typography>
          <div style={{ height: 400, width: '100%' }}>
            <DataGrid
              rows={motoristaResumo}
              columns={colunasMotoristaResumo}
              loading={loadingAtividade}
              getRowId={(row) => row.id}
              disableRowSelectionOnClick
              density="compact"
              initialState={{
                sorting: {
                  sortModel: [{ field: 'registros', sort: 'desc' }],
                },
              }}
            />
          </div>
        </Paper>
      </TabPanel>
    </Container>
  );
}
