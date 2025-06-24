import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Stack,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Typography,
} from '@mui/material';
import WeatherCharts from './WeatherCharts';

/* ---------- tipos ---------- */
interface WeatherRow {
  id: number;
  date: string;
  tempMax: number;
  tempMin: number;
  precip: number;
}

/* ---------- util ---------- */
const toISO = (d: Date) => d.toISOString().split('T')[0];

function defaultDates() {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setMonth(start.getMonth() - 3);
  return { start: toISO(start), end: toISO(end) };
}

/* ════════════════════════════════════════════════════════ */
export default function PortifolioPage() {
  const { start: defaultStart, end: defaultEnd } = defaultDates();

  /* estado ------------------------------------------------ */
  const [location, setLocation] = useState('Passo Fundo - RS');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [rows, setRows] = useState<WeatherRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* dias no intervalo ------------------------------------ */
  const intervalDays = useMemo(() => {
    const diff =
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
      86_400_000;
    return diff + 1;
  }, [startDate, endDate]);

  /* fetch ------------------------------------------------- */
  const handleFetch = useCallback(async () => {
    if (!location) return;
    setError(null);
    setRows([]);
    setLoading(true);

    try {
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
      if (intervalDays > 365) {
        setError('Intervalo máximo de 365 dias por busca.');
        return;
      }

      const todayISO = toISO(new Date());
      const isFuture = endDate > todayISO;
      const baseUrl = isFuture
        ? 'https://api.open-meteo.com/v1/forecast'
        : 'https://archive-api.open-meteo.com/v1/archive';

      const extraQuery = isFuture
        ? `&past_days=${Math.min(intervalDays, 92)}`
        : `&start_date=${startDate}&end_date=${endDate}`;

      const url =
        `${baseUrl}?latitude=${latitude}&longitude=${longitude}` +
        `${extraQuery}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
        `&timezone=auto`;

      const weatherRes = await fetch(url);
      const weather = await weatherRes.json();
      if (!weather.daily?.time?.length) {
        setError('Nenhum dado retornado para o período escolhido.');
        return;
      }

      const newRows: WeatherRow[] = weather.daily.time.map(
        (day: string, idx: number) => ({
          id: Number(new Date(day)),
          date: day,
          tempMax: weather.daily.temperature_2m_max[idx],
          tempMin: weather.daily.temperature_2m_min[idx],
          precip: weather.daily.precipitation_sum[idx],
        }),
      );
      setRows(newRows);
    } catch {
      setError('Falha ao buscar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [location, startDate, endDate, intervalDays]);

  /* carrega Passo Fundo ao montar ------------------------ */
  useEffect(() => {
    handleFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* render ----------------------------------------------- */
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
          sx={{ minWidth: 220 }}
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

      {/* ────────── gráficos ────────── */}
      {rows.length > 0 && <WeatherCharts rows={rows} />}
    </div>
  );
}
