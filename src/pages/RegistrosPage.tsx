import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Alert, Box, Button, Container, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import useAtividade from '../hooks/useAtividade';
import useOnlineStatus from '../hooks/useOnlineStatus';
import type { ChartKey, ChartPoint } from '../components/FrotaCharts';

const FrotaCharts = lazy(() => import('../components/FrotaCharts'));

type TabKey = 'geral' | 'graficos' | 'hibrido';

type MotoristaResumo = {
  id: string;
  totalRegistros: number;
  ultimoRegistroGeral: Date | null;
  registrosPeriodo: number;
  ultimoRegistroPeriodo: Date | null;
};

type ChartDateFilter = {
  dataInicial: string;
  dataFinal: string;
};

const TAB_KEYS: TabKey[] = ['geral', 'graficos', 'hibrido'];
const DEFAULT_TAB: TabKey = 'geral';

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

function getDefaultChartDateFilter(): ChartDateFilter {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - 29);

  return {
    dataInicial: formatDateInputValue(inicio),
    dataFinal: formatDateInputValue(hoje),
  };
}

function parseDateRange(dataInicial: string, dataFinal: string) {
  if (!dataInicial || !dataFinal) {
    return { error: 'Informe data inicial e data final para aplicar o filtro.' } as const;
  }

  const inicio = new Date(`${dataInicial}T00:00:00`);
  const fim = new Date(`${dataFinal}T23:59:59.999`);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    return { error: 'Informe um intervalo de datas valido.' } as const;
  }

  if (inicio > fim) {
    return { error: 'A data inicial nao pode ser maior que a data final.' } as const;
  }

  return { inicio, fim, error: null } as const;
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
      {value === tabKey && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function toDateAny(raw: any): Date | null {
  if (!raw) return null;
  if (typeof raw.toDate === 'function') return raw.toDate();
  if (raw.seconds != null) return new Date(raw.seconds * 1e3 + (raw.nanoseconds ?? 0) / 1e6);
  if (raw._seconds != null) return new Date(raw._seconds * 1e3 + (raw._nanoseconds ?? 0) / 1e6);

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function RegistrosPage() {
  const { isOnline } = useOnlineStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>(() => getValidTab(searchParams.get('tab')));
  const [chartTab, setChartTab] = useState<ChartKey>('caminhoes');
  const { data: atividade, loading: loadingAtividade } = useAtividade();
  const [filtroDataInicial, setFiltroDataInicial] = useState('');
  const [filtroDataFinal, setFiltroDataFinal] = useState('');
  const [graficoFiltroRascunho, setGraficoFiltroRascunho] = useState<ChartDateFilter>(() => getDefaultChartDateFilter());
  const [graficoFiltroAplicado, setGraficoFiltroAplicado] = useState<ChartDateFilter>(() => getDefaultChartDateFilter());
  const [graficoFiltroErro, setGraficoFiltroErro] = useState<string | null>(null);

  const rowsAtividade = useMemo(
    () =>
      atividade.map((item) => {
        const dataJS = toDateAny((item as any).data);
        return { ...item, dataJS };
      }),
    [atividade],
  );

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

  const colunasAtividade: GridColDef[] = useMemo(
    () => [
      {
        field: 'dataJS',
        headerName: 'Data',
        minWidth: 160,
        flex: 1.2,
        renderCell: (params) => {
          const value = params.row.dataJS as Date | null;
          return value ? dateFmt.format(value) : '—';
        },
        sortComparator: (a, b) => {
          const ta = a instanceof Date ? a.getTime() : 0;
          const tb = b instanceof Date ? b.getTime() : 0;
          return ta - tb;
        },
      },
      { field: 'motorista', headerName: 'Motorista', minWidth: 150, flex: 1.2 },
      { field: 'placa', headerName: 'Placa', minWidth: 120, flex: 1 },
      { field: 'destino', headerName: 'Destino', minWidth: 180, flex: 1.4 },
      { field: 'motivo', headerName: 'Motivo', minWidth: 200, flex: 1.4 },
      { field: 'tipo', headerName: 'Tipo', minWidth: 140, flex: 1 },
      {
        field: 'km',
        headerName: 'KM',
        minWidth: 120,
        flex: 1,
        renderCell: ({ value }) => (Number.isNaN(Number(value)) ? '—' : kmFormatter.format(Number(value))),
      },
    ],
    [dateFmt, kmFormatter],
  );

  useEffect(() => {
    const currentTab = getValidTab(searchParams.get('tab'));
    setTab(currentTab);
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
    let dataInicial: Date | null = filtroDataInicial ? new Date(filtroDataInicial) : null;
    let dataFinal: Date | null = filtroDataFinal ? new Date(filtroDataFinal) : null;

    if (dataInicial) dataInicial.setHours(0, 0, 0, 0);
    if (dataFinal) dataFinal.setHours(23, 59, 59, 999);

    if (dataInicial && dataFinal && dataInicial > dataFinal) {
      const temporaria = dataInicial;
      dataInicial = dataFinal;
      dataFinal = temporaria;
    }

    const acc = new Map<string, MotoristaResumo>();

    rowsAtividade.forEach((row) => {
      const data = row.dataJS instanceof Date ? row.dataJS : null;
      const motorista = row.motorista || '—';
      const current = acc.get(motorista) ?? {
        id: motorista,
        totalRegistros: 0,
        ultimoRegistroGeral: null,
        registrosPeriodo: 0,
        ultimoRegistroPeriodo: null,
      };

      if (data) {
        current.totalRegistros += 1;
        if (!current.ultimoRegistroGeral || current.ultimoRegistroGeral < data) {
          current.ultimoRegistroGeral = data;
        }

        const dentroIntervalo = (!dataInicial || data >= dataInicial) && (!dataFinal || data <= dataFinal);

        if (dentroIntervalo) {
          current.registrosPeriodo += 1;
          if (!current.ultimoRegistroPeriodo || current.ultimoRegistroPeriodo < data) {
            current.ultimoRegistroPeriodo = data;
          }
        }
      }

      acc.set(motorista, current);
    });

    return Array.from(acc.values()).sort(
      (a, b) => b.registrosPeriodo - a.registrosPeriodo || b.totalRegistros - a.totalRegistros,
    );
  }, [filtroDataFinal, filtroDataInicial, rowsAtividade]);

  const colunasMotoristaResumo: GridColDef<MotoristaResumo>[] = useMemo(
    () => [
      { field: 'id', headerName: 'Motorista', flex: 1.2, minWidth: 200 },
      {
        field: 'ultimoRegistroPeriodo',
        headerName: 'Último registro (período)',
        flex: 1.2,
        minWidth: 200,
        renderCell: ({ value }) => (value instanceof Date ? dateFmt.format(value) : '—'),
        sortComparator: (a, b) => {
          const ta = a instanceof Date ? a.getTime() : 0;
          const tb = b instanceof Date ? b.getTime() : 0;
          return ta - tb;
        },
      },
      {
        field: 'registrosPeriodo',
        headerName: 'Total de registros (período)',
        flex: 1,
        minWidth: 170,
        valueFormatter: ({ value }) => kmFormatter.format(Number(value)),
      },
    ],
    [dateFmt, kmFormatter],
  );

  const chartData = useMemo(() => {
    const intervalo = parseDateRange(graficoFiltroAplicado.dataInicial, graficoFiltroAplicado.dataFinal);
    if (intervalo.error) {
      return {
        caminhoes: [],
        km: [],
        motorista: [],
      };
    }

    const dadosFiltrados = rowsAtividade.filter(
      (row) =>
        row.dataJS &&
        (row.dataJS as Date) >= intervalo.inicio &&
        (row.dataJS as Date) <= intervalo.fim,
    );

    const countByPlaca = new Map<string, number>();
    const kmByPlaca = new Map<string, number>();
    const countByMotorista = new Map<string, number>();

    dadosFiltrados.forEach((row) => {
      const placa = row.placa || '—';
      const motorista = row.motorista || '—';
      const kmValue = Number(row.km) || 0;

      countByPlaca.set(placa, (countByPlaca.get(placa) ?? 0) + 1);
      kmByPlaca.set(placa, (kmByPlaca.get(placa) ?? 0) + kmValue);
      countByMotorista.set(motorista, (countByMotorista.get(motorista) ?? 0) + 1);
    });

    const sortDesc = (items: ChartPoint[]) => items.sort((a, b) => b.value - a.value);
    const toPoints = (map: Map<string, number>) =>
      sortDesc(Array.from(map.entries()).map(([label, value]) => ({ label, value })));

    return {
      caminhoes: toPoints(countByPlaca),
      km: toPoints(kmByPlaca),
      motorista: toPoints(countByMotorista),
    };
  }, [graficoFiltroAplicado.dataFinal, graficoFiltroAplicado.dataInicial, rowsAtividade]);

  const currentChartData = chartData[chartTab];
  const chartDateRangeLabel = `${graficoFiltroAplicado.dataInicial} a ${graficoFiltroAplicado.dataFinal}`;

  const handleAplicarFiltroGraficos = () => {
    const intervalo = parseDateRange(graficoFiltroRascunho.dataInicial, graficoFiltroRascunho.dataFinal);

    if (intervalo.error) {
      setGraficoFiltroErro(intervalo.error);
      return;
    }

    setGraficoFiltroErro(null);
    setGraficoFiltroAplicado(graficoFiltroRascunho);
  };

  const handleResetarFiltroGraficos = () => {
    const filtroPadrao = getDefaultChartDateFilter();
    setGraficoFiltroErro(null);
    setGraficoFiltroRascunho(filtroPadrao);
    setGraficoFiltroAplicado(filtroPadrao);
  };

  return (
    <Container sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>
        Registros
      </Typography>

      {!isOnline && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Modo offline: exibindo dados em cache do Firestore. As últimas alterações podem não estar visíveis.
        </Alert>
      )}

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
        <Box mt={2}>
          <div style={{ height: 700, width: '100%' }}>
            <DataGrid
              rows={rowsAtividade}
              columns={colunasAtividade}
              loading={loadingAtividade}
              getRowId={(row) => row.id}
              disableRowSelectionOnClick
              density="compact"
              getRowHeight={() => 'auto'}
              initialState={{ sorting: { sortModel: [{ field: 'dataJS', sort: 'desc' }] } }}
            />
          </div>
        </Box>
      </TabPanel>

      <TabPanel value={tab} tabKey="graficos">
        <Stack spacing={2} mt={1}>
          {!isOnline && (
            <Alert severity="info">
              Você está offline. Os gráficos usam os dados em cache e podem não refletir atualizações recentes.
            </Alert>
          )}

          <Paper elevation={1} sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                alignItems={{ xs: 'stretch', md: 'flex-end' }}
              >
                <TextField
                  label="Data inicial"
                  type="date"
                  size="small"
                  value={graficoFiltroRascunho.dataInicial}
                  onChange={(event) => {
                    setGraficoFiltroErro(null);
                    setGraficoFiltroRascunho((current) => ({ ...current, dataInicial: event.target.value }));
                  }}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Data final"
                  type="date"
                  size="small"
                  value={graficoFiltroRascunho.dataFinal}
                  onChange={(event) => {
                    setGraficoFiltroErro(null);
                    setGraficoFiltroRascunho((current) => ({ ...current, dataFinal: event.target.value }));
                  }}
                  InputLabelProps={{ shrink: true }}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button variant="contained" onClick={handleAplicarFiltroGraficos}>
                    Aplicar filtro
                  </Button>
                  <Button variant="outlined" onClick={handleResetarFiltroGraficos}>
                    Últimos 30 dias
                  </Button>
                </Stack>
              </Stack>

              {graficoFiltroErro && <Alert severity="warning">{graficoFiltroErro}</Alert>}
            </Stack>
          </Paper>

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
            <Typography variant="body1">Sem dados para o período selecionado.</Typography>
          ) : (
            <Suspense fallback={<Typography>Carregando gráficos...</Typography>}>
              <FrotaCharts
                chartTab={chartTab}
                data={currentChartData as ChartPoint[]}
                dateRangeLabel={chartDateRangeLabel}
                hoverMode="valueOnly"
              />
            </Suspense>
          )}
        </Stack>
      </TabPanel>

      <TabPanel value={tab} tabKey="hibrido">
        <Stack spacing={2} mt={1}>
          <Paper elevation={1} sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} mb={2}>
              <Typography variant="h6">Sobre motorista</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Data inicial"
                  type="date"
                  size="small"
                  value={filtroDataInicial}
                  onChange={(event) => setFiltroDataInicial(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Data final"
                  type="date"
                  size="small"
                  value={filtroDataFinal}
                  onChange={(event) => setFiltroDataFinal(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
            </Stack>
            <div style={{ height: 400, width: '100%' }}>
              <DataGrid
                rows={motoristaResumo}
                columns={colunasMotoristaResumo}
                loading={loadingAtividade}
                getRowId={(row) => row.id}
                disableRowSelectionOnClick
                density="compact"
                getRowHeight={() => 'auto'}
                initialState={{
                  sorting: {
                    sortModel: [{ field: 'registrosPeriodo', sort: 'desc' }],
                  },
                }}
              />
            </div>
          </Paper>

          <Paper elevation={1} sx={{ p: 2 }} />
        </Stack>
      </TabPanel>
    </Container>
  );
}
