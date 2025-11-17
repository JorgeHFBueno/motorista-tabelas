import { useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Box, Tabs, Tab, Typography, Container } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import useAtividade from '../hooks/useAtividade';

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

export default function Frota() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>(() =>
    getValidTab(searchParams.get('tab')),
  );

const { data: atividade, loading: loadingAtividade } = useAtividade();

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
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.set('tab', newTab);
      return params;
    }, { replace: true });
  };

  return (
    <Container sx={{ py: 3 }}>
      <Typography variant="h4" gutterBottom>
        Frota
      </Typography>

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
        <Typography>Seção: Gráficos</Typography>
      </TabPanel>
      <TabPanel value={tab} tabKey="hibrido">
        <Typography>Seção: Híbrido</Typography>
      </TabPanel>
    </Container>
  );
}