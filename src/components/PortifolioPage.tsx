import { Suspense, useCallback, useEffect, useMemo, useState, lazy } from 'react';
import { Stack, TextField, Button, Alert, CircularProgress, Typography, Card, CardContent } from '@mui/material';
import useOnlineStatus from '../hooks/useOnlineStatus';
import type { WeatherRow } from './WeatherCharts';

const WeatherCharts = lazy(() => import('./WeatherCharts'));

//
const toISO = (d: Date) => d.toISOString().split('T')[0];

function defaultDates() {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setMonth(start.getMonth() - 3);
  return { start: toISO(start), end: toISO(end) };
}

export default function PortifolioPage() {
  const { start: defaultStart, end: defaultEnd } = defaultDates();
  const { isOnline } = useOnlineStatus();
  const [pendingAutoRefresh, setPendingAutoRefresh] = useState(false);

  // localizacao
  const [location, setLocation] = useState('Passo Fundo');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [rows, setRows] = useState<WeatherRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // periodo
  const intervalDays = useMemo(() => {
    const diff =
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
      86_400_000;
    return diff + 1;
  }, [startDate, endDate]);

  // fetch
  const handleFetch = useCallback(async () => {
    if (!location) return;
    if (!isOnline) {
      setError('Dados indisponíveis offline para esta funcionalidade.');
      setPendingAutoRefresh(true);
      return;
    }
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
      setPendingAutoRefresh(false);
    } catch {
      setError('Falha ao buscar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [location, startDate, endDate, intervalDays, isOnline]);

  // busca Passo Fundo ao iniciar 
  useEffect(() => {
    handleFetch();
 }, [handleFetch]);

  useEffect(() => {
    if (isOnline && pendingAutoRefresh && !loading) {
      handleFetch();
    }
  }, [handleFetch, isOnline, pendingAutoRefresh, loading]);

  return (
    <div style={{ padding: 20 }}>
      <Typography variant="h4" gutterBottom>Meteorologia</Typography>

       {!isOnline && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="body1" gutterBottom>
              Dados meteorológicos precisam de conexão. Você está offline no momento.
            </Typography>
            <Button variant="outlined" onClick={handleFetch} disabled={!isOnline}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      <Stack direction="row" spacing={2} mb={2} flexWrap="wrap">
        <TextField
          label="Local"
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
          disabled={loading || !location || !isOnline}
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

       {rows.length > 0 && (
        <Suspense fallback={<CircularProgress />}>
          <WeatherCharts rows={rows} />
        </Suspense>
      )}
    </div>
  );
}
