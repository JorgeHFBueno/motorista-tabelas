import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Card, CardContent, CircularProgress, FormControl, InputLabel, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Data } from 'plotly.js';
import Plot from 'react-plotly.js';
import { db } from '../firebase';
import { fleetMetrics, fleetMetricsForVehicles, monthlyFleetMetrics, monthlyMetrics, PILOT_PERIOD, type ActivityAnalyticsRecord, type AnalyticsPeriod, type FuelAnalyticsRecord, type MaintenanceAnalyticsRecord, type VehicleAnalyticsIdentity } from '../services/frota-analytics.service';

type Props = { vehicles: VehicleAnalyticsIdentity[]; vehicle?: VehicleAnalyticsIdentity };
type Mode = 'all' | 'year' | 'month' | 'custom';
type Dataset = { activities: ActivityAnalyticsRecord[]; fuel: FuelAnalyticsRecord[]; maintenance: MaintenanceAnalyticsRecord[] };
const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto'];
const numberFormatter = new Intl.NumberFormat('pt-BR');
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function periodFor(mode: Mode, month: number, start: string, end: string): { period: AnalyticsPeriod; error: string | null } {
  if (mode === 'month') return { period: { start: new Date(2026, month - 1, 1), end: new Date(2026, month, 0, 23, 59, 59, 999) }, error: null };
  if (mode === 'custom') {
    const customStart = new Date(`${start}T00:00:00`);
    const customEnd = new Date(`${end}T23:59:59.999`);
    if (!start || !end || customStart > customEnd) return { period: PILOT_PERIOD, error: 'Informe um intervalo válido.' };
    if (customStart < PILOT_PERIOD.start || customEnd > PILOT_PERIOD.end) return { period: PILOT_PERIOD, error: 'O período personalizado deve ficar entre 01/01/2026 e 31/08/2026.' };
    return { period: { start: customStart, end: customEnd }, error: null };
  }
  return { period: PILOT_PERIOD, error: null };
}

const vehicleLabel = (vehicle: VehicleAnalyticsIdentity) => vehicle.placa || vehicle.extra || vehicle.identificador || vehicle.id;

function metric(value: number | null, kind: 'number' | 'km' | 'currency' | 'rate') {
  if (value === null) return 'Indisponível';
  if (kind === 'km') return `${numberFormatter.format(value)} km`;
  if (kind === 'currency') return currencyFormatter.format(value);
  if (kind === 'rate') return `${currencyFormatter.format(value)}/km`;
  return numberFormatter.format(value);
}

function CardMetric({ title, value, note }: { title: string; value: string; note?: string }) {
  return <Card variant="outlined" sx={{ minWidth: 170, flex: 1 }}><CardContent><Typography variant="body2" color="text.secondary">{title}</Typography><Typography variant="h6">{value}</Typography>{note && <Typography variant="caption" color="text.secondary">{note}</Typography>}</CardContent></Card>;
}

export default function FrotaAnalyticsPanel({ vehicles, vehicle }: Props) {
  const [mode, setMode] = useState<Mode>('all');
  const [month, setMonth] = useState(1);
  const [start, setStart] = useState('2026-01-01');
  const [end, setEnd] = useState('2026-08-31');
  const [vehicleAId, setVehicleAId] = useState('');
  const [vehicleBId, setVehicleBId] = useState('');
  const [data, setData] = useState<Dataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      getDocs(query(collection(db, 'atividades'), where('tipo', '==', 'saida'))),
      getDocs(collection(db, '03-combustivel')),
      getDocs(collection(db, 'manutencoes')),
    ]).then(([activities, fuel, maintenance]) => {
      if (active) setData({ activities: activities.docs.map(item => ({ id: item.id, ...item.data() })), fuel: fuel.docs.map(item => ({ id: item.id, ...item.data() })), maintenance: maintenance.docs.map(item => ({ id: item.id, ...item.data() })) });
    }).catch(() => active && setLoadError('Não foi possível carregar os KPIs.'));
    return () => { active = false; };
  }, []);

  const resolved = useMemo(() => periodFor(mode, month, start, end), [end, mode, month, start]);
  const vehicleA = vehicles.find(item => item.id === vehicleAId);
  const vehicleB = vehicles.find(item => item.id === vehicleBId);
  const current = data ? (vehicle ? fleetMetrics(data.activities, data.fuel, data.maintenance, resolved.period, vehicle) : fleetMetricsForVehicles(data.activities, data.fuel, data.maintenance, vehicles, resolved.period)) : null;
  const series = data ? (vehicle ? monthlyMetrics(data.activities, data.fuel, data.maintenance, resolved.period, vehicle) : monthlyFleetMetrics(data.activities, data.fuel, data.maintenance, vehicles, resolved.period)) : [];
  const seriesA = data && vehicleA ? monthlyMetrics(data.activities, data.fuel, data.maintenance, resolved.period, vehicleA) : [];
  const seriesB = data && vehicleB ? monthlyMetrics(data.activities, data.fuel, data.maintenance, resolved.period, vehicleB) : [];
  const metricsA = data && vehicleA ? fleetMetrics(data.activities, data.fuel, data.maintenance, resolved.period, vehicleA) : null;
  const metricsB = data && vehicleB ? fleetMetrics(data.activities, data.fuel, data.maintenance, resolved.period, vehicleB) : null;
  const ranking = data && !vehicle ? vehicles.map(item => ({ vehicle: item, metrics: fleetMetrics(data.activities, data.fuel, data.maintenance, resolved.period, item) })).sort((left, right) => right.metrics.viagens - left.metrics.viagens) : [];

  return <Box>
    <Typography variant="h5" gutterBottom>{vehicle ? `Análise individual · ${vehicleLabel(vehicle)}` : 'Visão geral'}</Typography>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
      <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>Período</InputLabel><Select label="Período" value={mode} onChange={event => setMode(event.target.value as Mode)}><MenuItem value="all">Todo período</MenuItem><MenuItem value="year">Ano</MenuItem><MenuItem value="month">Mês</MenuItem><MenuItem value="custom">Personalizado</MenuItem></Select></FormControl>
      {mode === 'year' && <TextField size="small" label="Ano" value="2026" disabled />}
      {mode === 'month' && <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>Mês</InputLabel><Select label="Mês" value={month} onChange={event => setMonth(Number(event.target.value))}>{months.map((name, index) => <MenuItem value={index + 1} key={name}>{name}/2026</MenuItem>)}</Select></FormControl>}
      {mode === 'custom' && <><TextField size="small" label="Data inicial" type="date" value={start} inputProps={{ min: '2026-01-01', max: '2026-08-31' }} InputLabelProps={{ shrink: true }} onChange={event => setStart(event.target.value)} /><TextField size="small" label="Data final" type="date" value={end} inputProps={{ min: '2026-01-01', max: '2026-08-31' }} InputLabelProps={{ shrink: true }} onChange={event => setEnd(event.target.value)} /></>}
    </Stack>
    {(loadError || resolved.error) && <Alert severity="error" sx={{ mt: 2 }}>{loadError || resolved.error}</Alert>}
    {!data ? <CircularProgress sx={{ mt: 3 }} /> : current && <>
      <Stack direction={{ xs: 'column', md: 'row' }} flexWrap="wrap" spacing={1} mt={2}>
        <CardMetric title="Viagens" value={metric(current.viagens, 'number')} />
        <CardMetric title="KM estimado" value={metric(current.kmEstimado, 'km')} note="Estimado pelas leituras de odômetro dos abastecimentos." />
        <CardMetric title="Custo de manutenção" value={metric(current.custoManutencao, 'currency')} />
        <CardMetric title="R$/km manutenção" value={metric(current.rsKmManutencao, 'rate')} note="Calculado com KM estimado por odômetro." />
        <CardMetric title="Obras visitadas" value="Indisponível no histórico" />
      </Stack>
      <Plot data={[{ type: 'bar', name: 'KM estimado', x: months, y: series.map(item => item.kmEstimado), yaxis: 'y' }, { type: 'scatter', mode: 'lines+markers', name: 'Manutenção', x: months, y: series.map(item => item.custoManutencao), yaxis: 'y2' }] as Data[]} layout={{ title: { text: 'KM estimado × custo de manutenção' }, yaxis: { title: { text: 'KM' } }, yaxis2: { title: { text: 'R$' }, overlaying: 'y', side: 'right' }, autosize: true }} style={{ width: '100%', height: 330 }} useResizeHandler />
      <Plot data={[{ type: 'bar', name: 'Viagens', x: months, y: series.map(item => item.viagens) }] as Data[]} layout={{ title: { text: 'Viagens por mês' }, autosize: true }} style={{ width: '100%', height: 280 }} useResizeHandler />
      {ranking.length > 0 && <Box mt={3} sx={{ overflowX: 'auto' }}><Typography variant="h6">Indicadores por veículo</Typography><Table size="small"><TableHead><TableRow><TableCell>Veículo</TableCell><TableCell>Viagens</TableCell><TableCell>KM estimado</TableCell><TableCell>Manutenção</TableCell><TableCell>R$/km manutenção</TableCell><TableCell>Cobertura KM</TableCell></TableRow></TableHead><TableBody>{ranking.map(row => <TableRow key={row.vehicle.id}><TableCell>{vehicleLabel(row.vehicle)}</TableCell><TableCell>{metric(row.metrics.viagens, 'number')}</TableCell><TableCell>{metric(row.metrics.kmEstimado, 'km')}</TableCell><TableCell>{metric(row.metrics.custoManutencao, 'currency')}</TableCell><TableCell>{metric(row.metrics.rsKmManutencao, 'rate')}</TableCell><TableCell>{row.metrics.kmQuality === 'AVAILABLE' ? 'Disponível' : row.metrics.kmQuality === 'PARTIAL' ? 'Parcial' : 'Indisponível'}</TableCell></TableRow>)}</TableBody></Table></Box>}
      {!vehicle && <Box mt={4}>
        <Typography variant="h5">Comparação A/B</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={1}>
          <FormControl size="small" sx={{ minWidth: 180 }}><InputLabel>Veículo A</InputLabel><Select label="Veículo A" value={vehicleAId} onChange={event => setVehicleAId(event.target.value)}>{vehicles.map(item => <MenuItem key={item.id} value={item.id} disabled={item.id === vehicleBId}>{vehicleLabel(item)}</MenuItem>)}</Select></FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}><InputLabel>Veículo B</InputLabel><Select label="Veículo B" value={vehicleBId} onChange={event => setVehicleBId(event.target.value)}>{vehicles.map(item => <MenuItem key={item.id} value={item.id} disabled={item.id === vehicleAId}>{vehicleLabel(item)}</MenuItem>)}</Select></FormControl>
        </Stack>
        {vehicleA && vehicleB && metricsA && metricsB && <>
          <Table size="small" sx={{ mt: 2 }}><TableHead><TableRow><TableCell>KPI</TableCell><TableCell>{vehicleLabel(vehicleA)}</TableCell><TableCell>{vehicleLabel(vehicleB)}</TableCell></TableRow></TableHead><TableBody>{[
            ['Viagens', metric(metricsA.viagens, 'number'), metric(metricsB.viagens, 'number')],
            ['KM estimado', metric(metricsA.kmEstimado, 'km'), metric(metricsB.kmEstimado, 'km')],
            ['Custo manutenção', metric(metricsA.custoManutencao, 'currency'), metric(metricsB.custoManutencao, 'currency')],
            ['R$/km manutenção', metric(metricsA.rsKmManutencao, 'rate'), metric(metricsB.rsKmManutencao, 'rate')],
            ['Obras visitadas', 'Indisponível no histórico', 'Indisponível no histórico'],
          ].map(row => <TableRow key={row[0]}>{row.map((cell, index) => <TableCell key={`${row[0]}-${index}`}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table>
          <Plot data={[{ type: 'bar', name: vehicleLabel(vehicleA), x: months, y: seriesA.map(item => item.kmEstimado) }, { type: 'bar', name: vehicleLabel(vehicleB), x: months, y: seriesB.map(item => item.kmEstimado) }] as Data[]} layout={{ title: { text: 'KM estimado — comparação' }, barmode: 'group', autosize: true }} style={{ width: '100%', height: 300 }} useResizeHandler />
          <Plot data={[{ type: 'bar', name: vehicleLabel(vehicleA), x: months, y: seriesA.map(item => item.custoManutencao) }, { type: 'bar', name: vehicleLabel(vehicleB), x: months, y: seriesB.map(item => item.custoManutencao) }] as Data[]} layout={{ title: { text: 'Custo de manutenção — comparação' }, barmode: 'group', autosize: true }} style={{ width: '100%', height: 300 }} useResizeHandler />
        </>}
      </Box>}
    </>}
  </Box>;
}
