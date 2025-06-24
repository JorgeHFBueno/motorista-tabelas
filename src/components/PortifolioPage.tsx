import { useState } from 'react';
import { Stack, TextField, Button } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';

interface WeatherRow {
  id: number;
  date: string;
  tempMax: number;
  tempMin: number;
  precip: number;
}

const columns: GridColDef<WeatherRow>[] = [
  { field: 'date', headerName: 'Data', minWidth: 110 },
  { field: 'tempMax', headerName: 'Temp Máx (°C)', type: 'number', minWidth: 130, flex: 1 },
  { field: 'tempMin', headerName: 'Temp Mín (°C)', type: 'number', minWidth: 130, flex: 1 },
  { field: 'precip', headerName: 'Precipitação (mm)', type: 'number', minWidth: 150, flex: 1 },
];

function defaultDates() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 3);
  const toISO = (d: Date) => d.toISOString().split('T')[0];
  return { start: toISO(start), end: toISO(end) };
}

export default function PortifolioPage() {
  const { start: defaultStart, end: defaultEnd } = defaultDates();
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [rows, setRows] = useState<WeatherRow[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    if (!location) return;
    setLoading(true);
    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=pt&format=json`
      );
      const geoData = await geoRes.json();
      if (!geoData.results?.length) {
        setRows([]);
        return;
      }
      const { latitude, longitude } = geoData.results[0];
      const url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}` +
        `&start_date=${startDate}&end_date=${endDate}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
      const weatherRes = await fetch(url);
      const weather = await weatherRes.json();
      const r: WeatherRow[] = weather.daily.time.map((t: string, idx: number) => ({
        id: idx,
        date: t,
        tempMax: weather.daily.temperature_2m_max[idx],
        tempMin: weather.daily.temperature_2m_min[idx],
        precip: weather.daily.precipitation_sum[idx],
      }));
      setRows(r);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Portifólio</h1>
      <Stack direction="row" spacing={2} mb={2}>
        <TextField label="Localidade" value={location} onChange={e => setLocation(e.target.value)} />
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
        <Button variant="contained" onClick={handleFetch} disabled={loading || !location}>
          Buscar
        </Button>
      </Stack>
      <div style={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          density="compact"
        />
      </div>
    </div>
  );
}