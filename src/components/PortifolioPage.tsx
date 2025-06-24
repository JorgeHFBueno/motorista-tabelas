import { useState, useCallback, useMemo } from 'react';
import {
  Stack,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';


/* ---------- tipos ---------- */
interface WeatherRow {
  id: number;         // número único (timestamp)
  date: string;       // yyyy-MM-dd
  tempMax: number;    // °C
  tempMin: number;    // °C
  precip: number;     // mm
}

/* ---------- colunas da grade ---------- */
const columns: GridColDef<WeatherRow>[] = [
  { field: 'date', headerName: 'Data', minWidth: 110 },
  {
    field: 'tempMax',
    headerName: 'Temp Máx (°C)',
    type: 'number',
    minWidth: 130,
    flex: 1,
  },
  {
    field: 'tempMin',
    headerName: 'Temp Mín (°C)',
    type: 'number',
    minWidth: 130,
    flex: 1,
  },
  {
    field: 'precip',
    headerName: 'Precipitação (mm)',
    type: 'number',
    minWidth: 150,
    flex: 1,
  },
];

/* ---------- funções utilitárias ---------- */
const toISO = (d: Date) => d.toISOString().split('T')[0];

/** gera intervalo padrão = últimos 3 meses (ontem inclusive) */
function defaultDates() {
  const end = new Date();
  end.setDate(end.getDate() - 1); // ontem: a API “archive” tem até 5 dias de atraso
  const start = new Date(end);
  start.setMonth(start.getMonth() - 3);
  return { start: toISO(start), end: toISO(end) };
}

/* ════════════════════════════════════════════════════════════
   Componente principal
   ════════════════════════════════════════════════════════════ */
export default function PortifolioPage() {
  const { start: defaultStart, end: defaultEnd } = defaultDates();

  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [rows, setRows] = useState<WeatherRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---------- validações simples ---------- */
  const intervalDays = useMemo(() => {
    const diff =
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
      86_400_000;
    return diff + 1;
  }, [startDate, endDate]);

  const handleFetch = useCallback(async () => {
    if (!location) return;

    setError(null);
    setRows([]);
    setLoading(true);

    try {
      /* 1. geocodificação */
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          location,
        )}&count=1&language=pt&format=json`,
      );
      const geoData = await geoRes.json();

      if (!geoData.results?.length) {
        setError('Localidade não encontrada.');
        return;
      }

      const { latitude, longitude } = geoData.results[0];

      /* 2. escolhe endpoint (histórico x previsão) */
      const todayISO = toISO(new Date());
      const isFuture = endDate > todayISO;
      const baseUrl = isFuture
        ? 'https://api.open-meteo.com/v1/forecast'
        : 'https://archive-api.open-meteo.com/v1/archive';

      /* Open-Meteo aceita no máx. 365 dias por chamada */
      if (intervalDays > 365) {
        setError('Intervalo máximo de 365 dias por busca.');
        return;
      }

      /* se houver data futura, pedimos previsão + histórico recente */
      const extraQuery = isFuture
        ? `&past_days=${Math.min(intervalDays, 92)}` // 92 ≈ 3 meses
        : `&start_date=${startDate}&end_date=${endDate}`;

      const url =
        `${baseUrl}?latitude=${latitude}&longitude=${longitude}` +
        `${extraQuery}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
        `&timezone=auto`;

      /* 3. busca dados */
      const weatherRes = await fetch(url);
      const weather = await weatherRes.json();

      if (!weather.daily?.time?.length) {
        setError('Nenhum dado retornado para o período escolhido.');
        return;
      }

      const newRows: WeatherRow[] = weather.daily.time.map(
        (day: string, idx: number) => ({
          id: Number(new Date(day)), // timestamp = id estável
          date: day,
          tempMax: weather.daily.temperature_2m_max[idx],
          tempMin: weather.daily.temperature_2m_min[idx],
          precip: weather.daily.precipitation_sum[idx],
        }),
      );

      setRows(newRows);
    } catch (e) {
      console.error(e);
      setError('Falha ao buscar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [location, startDate, endDate, intervalDays]);

  /* ---------- interface ---------- */
  return (
    <div style={{ padding: 20 }}>
      <Typography variant="h4" gutterBottom>
        Portifólio Meteorológico
      </Typography>

      <Stack direction="row" spacing={2} mb={2} flexWrap="wrap">
        <TextField
          label="Localidade"
          value={location}
          onChange={e => setLocation(e.target.value)}
          sx={{ minWidth: 180 }}
        />
        <TextField
          label="Início"
          type="date"
          InputLabelProps={{ shrink: true }}
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
        />
        <TextField
          label="Fim"
          type="date"
          InputLabelProps={{ shrink: true }}
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
        />
        <Button
          variant="contained"
          onClick={handleFetch}
          disabled={loading || !location}
        >
          Buscar
        </Button>
      </Stack>

      {loading && <CircularProgress />}

      {error && (
        <Alert severity="warning" sx={{ mb: 2, maxWidth: 500 }}>
          {error}
        </Alert>
      )}

      <div style={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          density="compact"
          localeText={{
            noRowsLabel: 'Sem dados para exibir',
          }}
        />
      </div>
    </div>
  );
}