import { useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import {
  Box, Tabs, Tab, Typography, Container, Stack, Button, Paper, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, RadioGroup, FormControlLabel, Radio, Snackbar, Alert
} from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import useAtividade from '../hooks/useAtividade';
import Plot from 'react-plotly.js';
import type { Data, Layout } from 'plotly.js';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

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

type ChartPoint = {
  label: string;
  value: number;
};

type ChartKey = 'caminhoes' | 'km' | 'motorista';

export default function Frota() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>(() =>
    getValidTab(searchParams.get('tab')),
  );

  const [chartTab, setChartTab] = useState<ChartKey>('caminhoes');
  const { data: atividade, loading: loadingAtividade } = useAtividade();
  const [filtroDataInicial, setFiltroDataInicial] = useState('');
  const [filtroDataFinal, setFiltroDataFinal] = useState('');
  const [dialogAberto, setDialogAberto] = useState(false);
  const [tipoPlaca, setTipoPlaca] = useState<'normal' | 'diversos'>('normal');
  const [placaValor, setPlacaValor] = useState('');
  const [kmValor, setKmValor] = useState('');
  const [extraValor, setExtraValor] = useState('');
  const [salvandoPlaca, setSalvandoPlaca] = useState(false);
  const [snackbar, setSnackbar] = useState<
    { message: string; severity: 'success' | 'error' } | null
  >(null);
  const [errosFormulario, setErrosFormulario] = useState<{
    placa?: string;
    km?: string;
    extra?: string;
  }>({});

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

  const handleAbrirDialog = () => {
    setDialogAberto(true);
    setErrosFormulario({});
  };

  const limparFormulario = () => {
    setTipoPlaca('normal');
    setPlacaValor('');
    setKmValor('');
    setExtraValor('');
    setErrosFormulario({});
  };

  const handleFecharDialog = () => {
    setDialogAberto(false);
    setSalvandoPlaca(false);
    limparFormulario();
  };

  const handleSalvarPlaca = async () => {
    if (salvandoPlaca) return;
    const erros: { placa?: string; km?: string; extra?: string } = {};

    const placaNormalizada = placaValor.trim().toUpperCase();
    const kmNumero = Number(kmValor);
    const extraNormalizado = extraValor.trim();

    if (tipoPlaca === 'normal') {
      if (!placaNormalizada) {
        erros.placa = 'Informe a placa';
      }
      if (!Number.isFinite(kmNumero) || kmNumero <= 0) {
        erros.km = 'Informe o KM (maior que 0)';
      }
    } else {
      if (!extraNormalizado) {
        erros.extra = 'Descreva o uso';
      }
    }

    if (Object.keys(erros).length > 0) {
      setErrosFormulario(erros);
      return;
    }

    setSalvandoPlaca(true);

    try {
      const placaFinal =
        tipoPlaca === 'diversos'
          ? // Para "Diversos" deixamos a placa opcional; quando vazia, usamos um identificador padrão.
          placaNormalizada || 'DIVERSOS'
          : placaNormalizada;

      const payload = {
        placa: placaFinal,
        km:
          tipoPlaca === 'diversos'
            ? 0 // Registros diversos começam com KM zero para indicar que serão atualizados manualmente depois.
            : kmNumero,
        extra: tipoPlaca === 'diversos' ? extraNormalizado : '', // Registros normais não possuem informação extra.
      };

      await addDoc(collection(db, '01-placas'), payload);

      setSnackbar({ message: 'Placa cadastrada com sucesso', severity: 'success' });
      handleFecharDialog();
    } catch (error) {
      console.error('Erro ao cadastrar placa', error);
      setSnackbar({ message: 'Erro ao cadastrar placa', severity: 'error' });
      setSalvandoPlaca(false);
    }
  };
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
            <Plot
              data={[
                {
                  type: 'bar',
                  x: currentChartData.map((item) => item.label),
                  y: currentChartData.map((item) => item.value),
                  marker: { color: '#1976d2' },
                },
              ] as Data[]}
              layout={{
                title: {
                  text:
                    chartTab === 'caminhoes'
                      ? 'Caminhões mais utilizados (últimos 30 dias)'
                      : chartTab === 'km'
                        ? 'Quilometragem por caminhão (últimos 30 dias)'
                        : 'Registros por motorista (últimos 30 dias)',
                },
                xaxis: { title: { text: chartTab === 'motorista' ? 'Motorista' : 'Placa' } },
                yaxis: { title: { text: chartTab === 'km' ? 'KM' : 'Registros' } },
                autosize: true,
                bargap: 0.2,
                margin: { t: 60, r: 20, b: 60, l: 60 },
              } as Partial<Layout>}
              style={{ width: '100%', height: 500 }}
              useResizeHandler
            />
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
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">A ser adicionado</Typography>
              <Button variant="contained" onClick={handleAbrirDialog}>
                Adicionar
              </Button>
            </Stack>
          </Paper>
        </Stack>
      </TabPanel>
      <Dialog open={dialogAberto} onClose={handleFecharDialog} fullWidth maxWidth="sm">
        <DialogTitle>Cadastrar placa</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <RadioGroup
              row
              value={tipoPlaca}
              onChange={(_event, value) => setTipoPlaca(value as 'normal' | 'diversos')}
            >
              <FormControlLabel value="normal" control={<Radio />} label="Normal" />
              <FormControlLabel value="diversos" control={<Radio />} label="Diversos" />
            </RadioGroup>

            <TextField
              label="Placa"
              value={placaValor}
              onChange={(event) => setPlacaValor(event.target.value)}
              error={Boolean(errosFormulario.placa)}
              helperText={errosFormulario.placa}
              inputProps={{ style: { textTransform: 'uppercase' } }}
            />

            {tipoPlaca === 'normal' ? (
              <TextField
                label="KM"
                type="number"
                value={kmValor}
                onChange={(event) => setKmValor(event.target.value)}
                error={Boolean(errosFormulario.km)}
                helperText={errosFormulario.km}
              />
            ) : (
              <TextField
                label="Extra"
                value={extraValor}
                onChange={(event) => setExtraValor(event.target.value)}
                error={Boolean(errosFormulario.extra)}
                helperText={errosFormulario.extra}
                multiline
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleFecharDialog} disabled={salvandoPlaca}>
            Cancelar
          </Button>
          <Button onClick={handleSalvarPlaca} variant="contained" disabled={salvandoPlaca}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
      {snackbar && (<Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar && (
          <Alert
            onClose={() => setSnackbar(null)}
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        )}
      </Snackbar>)}
    </Container>
  );
}