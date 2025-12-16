import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Box, Tabs, Tab, Typography, Container, Stack, Paper, TextField, Alert } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import useAtividade from '../hooks/useAtividade';
import Plot from 'react-plotly.js';
import type { Data, Layout } from 'plotly.js';
import useOnlineStatus from '../hooks/useOnlineStatus';
import type { ChartKey, ChartPoint } from '../components/FrotaCharts';

const FrotaCharts = lazy(() => import('../components/FrotaCharts'));
type TabKey = 'geral' | 'graficos' | 'hibrido';
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

type MotoristaResumo = {
  id: string;
  totalRegistros: number;
  ultimoRegistroGeral: Date | null;
  registrosPeriodo: number;
  ultimoRegistroPeriodo: Date | null;
};

export default function Frota() {
  const { isOnline } = useOnlineStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>(() =>
    getValidTab(searchParams.get('tab')),
  );

  const [chartTab, setChartTab] = useState<ChartKey>('caminhoes');
  const { data: atividade, loading: loadingAtividade } = useAtividade();
  const [filtroDataInicial, setFiltroDataInicial] = useState('');
  const [filtroDataFinal, setFiltroDataFinal] = useState('');
  
  function toDateAny(raw: any): Date | null {
    if (!raw) return null;
    if (typeof raw.toDate === 'function') return raw.toDate();
    if (raw.seconds != null) return new Date(raw.seconds * 1e3 + (raw.nanoseconds ?? 0) / 1e6);
    if (raw._seconds != null) return new Date(raw._seconds * 1e3 + (raw._nanoseconds ?? 0) / 1e6);
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  const rowsAtividade = useMemo(
    () =>
      atividade.map((item) => {
        const dataJS = toDateAny((item as any).data);
        if (!dataJS) console.log('Data inválida:', item);
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
          const v = params.row.dataJS as Date | null;
          return v ? dateFmt.format(v) : '—';
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
        renderCell: ({ value }) =>
          isNaN(Number(value)) ? '—' : kmFormatter.format(Number(value)),
      },
    ],
    [dateFmt, kmFormatter],
  );

  useEffect(() => {
    const currentTab = getValidTab(searchParams.get('tab'));
    setTab(currentTab);
  }, [searchParams]);

  const handleTabChange = (_event: SyntheticEvent, newValue: TabKey) => {
    const newTab = getValidTab(newValue);
    setTab(newTab);
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('tab', newTab);
      return params;
    }, { replace: true });
  };

  const motoristaResumo: MotoristaResumo[] = useMemo(() => {
    let dataInicial: Date | null = filtroDataInicial
      ? new Date(filtroDataInicial)
      : null;
    let dataFinal: Date | null = filtroDataFinal ? new Date(filtroDataFinal) : null;

    if (dataInicial) dataInicial.setHours(0, 0, 0, 0);
    if (dataFinal) dataFinal.setHours(23, 59, 59, 999);

    if (dataInicial && dataFinal && dataInicial > dataFinal) {
      // Se o usuário inverter as datas, trocamos para manter o intervalo válido.
      const tmp = dataInicial;
      dataInicial = dataFinal;
      dataFinal = tmp;
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

        const dentroIntervalo =
          (!dataInicial || data >= dataInicial) &&
          (!dataFinal || data <= dataFinal);

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
  }, [rowsAtividade, filtroDataInicial, filtroDataFinal]);

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
    // Usa registros dos últimos 30 dias para os gráficos
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const recent = rowsAtividade.filter(
      (row) => row.dataJS && (row.dataJS as Date) >= cutoff,
    );

    const countByPlaca = new Map<string, number>();
    const kmByPlaca = new Map<string, number>();
    const countByMotorista = new Map<string, number>();

    recent.forEach((row) => {
      const placa = row.placa || '—';
      const motorista = row.motorista || '—';
      const kmValue = Number(row.km) || 0;

      countByPlaca.set(placa, (countByPlaca.get(placa) ?? 0) + 1);
      kmByPlaca.set(placa, (kmByPlaca.get(placa) ?? 0) + kmValue);
      countByMotorista.set(
        motorista,
        (countByMotorista.get(motorista) ?? 0) + 1,
      );
    });

    const sortDesc = (arr: ChartPoint[]) => arr.sort((a, b) => b.value - a.value);

    const toPoints = (map: Map<string, number>) =>
      sortDesc(
        Array.from(map.entries()).map(([label, value]) => ({ label, value })),
      );

    return {
      caminhoes: toPoints(countByPlaca),
      km: toPoints(kmByPlaca),
      motorista: toPoints(countByMotorista),
    };
  }, [rowsAtividade]);

  const currentChartData = chartData[chartTab];

  return (
    <Container sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>
        Frota
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
          <Tabs
            value={chartTab}
            onChange={(_e, val) => setChartTab(val)}
            aria-label="Gráficos da frota"
            variant="scrollable"
            allowScrollButtonsMobile
          >
            <Tab label="Caminhões" value="caminhoes" />
            <Tab label="KM" value="km" />
            <Tab label="Motorista" value="motorista" />
          </Tabs>

          {currentChartData.length === 0 ? (
            <Typography variant="body1">
              Sem dados para o período selecionado.
            </Typography>
          ) : (
            <Suspense fallback={<Typography>Carregando gráficos...</Typography>}>
              <FrotaCharts chartTab={chartTab} data={currentChartData as ChartPoint[]} />
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
                {/* Campos simples com type="date" para selecionar o intervalo desejado */}
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

          <Paper elevation={1} sx={{ p: 2 }}>
            
          </Paper>
        </Stack>
      </TabPanel>      
    </Container>
  );
}