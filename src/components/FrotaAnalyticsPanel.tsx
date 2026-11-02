import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, FormControl, InputLabel, LinearProgress, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Data } from 'plotly.js';
import Plot from 'react-plotly.js';
import { db } from '../firebase';
import { normalizarMovimentoCombustivel } from '../services/combustivel-normalizer';
import { normalizarAtividade } from '../services/atividade-normalizer';
import { fetchVehicleErpRows } from '../services/vehicle-report.service';
import {
  agruparPorVeiculo, fleetMetrics, KPI_INICIO, monthlyMetrics, periodoKpi, placaParaErp, vehicleMetrics,
  type ActivityAnalyticsRecord, type AnalyticsPeriod, type ErpAnalyticsRow, type FleetMetrics, type FuelAnalyticsRecord,
  type MaintenanceAnalyticsRecord, type MonthlyMetric, type VehicleAnalyticsIdentity,
} from '../services/frota-analytics.service';

type Props = { vehicles: VehicleAnalyticsIdentity[]; vehicle?: VehicleAnalyticsIdentity };
type Mode = 'all' | 'year' | 'month' | 'custom';
type Dataset = { activities: ActivityAnalyticsRecord[]; fuel: FuelAnalyticsRecord[]; maintenance: MaintenanceAnalyticsRecord[] };
type ErpEstado = { status: 'carregando' | 'ok' | 'erro'; rows: ErpAnalyticsRow[] | null };

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// ERP por placa, guardado enquanto a WEB estiver aberta (cada placa custa uma consulta ao ERP).
const cacheErp = new Map<string, Promise<ErpAnalyticsRow[]>>();
function erpDaPlaca(placa: string, dataInicial: string, dataFinal: string) {
  const chave = `${placa}|${dataInicial}|${dataFinal}`;
  if (!cacheErp.has(chave)) cacheErp.set(chave, fetchVehicleErpRows(placa, dataInicial, dataFinal).catch((error) => { cacheErp.delete(chave); throw error; }));
  return cacheErp.get(chave)!;
}

function periodFor(mode: Mode, year: number, month: number, start: string, end: string, limite: AnalyticsPeriod): { period: AnalyticsPeriod; error: string | null } {
  const recorte = (p: AnalyticsPeriod) => ({ start: p.start < limite.start ? limite.start : p.start, end: p.end > limite.end ? limite.end : p.end });
  if (mode === 'year') return { period: recorte({ start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59, 999) }), error: null };
  if (mode === 'month') return { period: recorte({ start: new Date(year, month - 1, 1), end: new Date(year, month, 0, 23, 59, 59, 999) }), error: null };
  if (mode === 'custom') {
    const customStart = new Date(`${start}T00:00:00`);
    const customEnd = new Date(`${end}T23:59:59.999`);
    if (!start || !end || Number.isNaN(customStart.getTime()) || Number.isNaN(customEnd.getTime()) || customStart > customEnd) return { period: limite, error: 'Informe um intervalo válido.' };
    if (customStart < limite.start || customEnd > limite.end) return { period: limite, error: `O período deve ficar entre 01/01/2025 e ${limite.end.toLocaleDateString('pt-BR')}.` };
    return { period: { start: customStart, end: customEnd }, error: null };
  }
  return { period: limite, error: null };
}

const vehicleLabel = (vehicle: VehicleAnalyticsIdentity) => vehicle.placa || vehicle.extra || vehicle.identificador || vehicle.id;

function metric(value: number | null, kind: 'number' | 'km' | 'currency' | 'rate') {
  if (value === null) return 'Indisponível';
  if (kind === 'km') return `${numberFormatter.format(value)} km`;
  if (kind === 'currency') return currencyFormatter.format(value);
  if (kind === 'rate') return `${currencyFormatter.format(value)}/km`;
  return numberFormatter.format(value);
}
const erpTexto = (m: FleetMetrics) => (m.custoErp === null ? 'ERP não carregado' : `ERP ${currencyFormatter.format(m.custoErp)}${m.erpCompleto ? '' : ' (parcial)'}`);

function CardMetric({ title, value, note }: { title: string; value: string; note?: string }) {
  return <Card variant="outlined" sx={{ minWidth: 200, flex: 1 }}><CardContent><Typography variant="body2" color="text.secondary">{title}</Typography><Typography variant="h6">{value}</Typography>{note && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{note}</Typography>}</CardContent></Card>;
}

function Cartoes({ m }: { m: FleetMetrics }) {
  return <Stack direction={{ xs: 'column', md: 'row' }} flexWrap="wrap" useFlexGap spacing={1} mt={2}>
    <CardMetric title="Viagens" value={metric(m.viagens, 'number')} note="Saídas registradas no app." />
    <CardMetric title="KM rodado" value={metric(m.kmRodado, 'km')} note={`Pelas leituras de abastecimentos e atividades${m.leiturasIgnoradas ? `; ${m.leiturasIgnoradas} leitura(s) solta(s) ignorada(s)` : ''}.`} />
    <CardMetric title="Custo total" value={metric(m.custoTotal, 'currency')} note={`Combustível ${currencyFormatter.format(m.custoCombustivel)} · Manutenção ${currencyFormatter.format(m.custoManutencao)} · ${erpTexto(m)}`} />
    <CardMetric title="R$/km" value={metric(m.rsKm, 'rate')} note="Custo total dos veículos com KM ÷ KM rodado." />
  </Stack>;
}

function Graficos({ series, titulo }: { series: MonthlyMetric[]; titulo?: string }) {
  const x = series.map((item) => item.label);
  return <>
    <Plot data={[
      { type: 'bar', name: 'Combustível', x, y: series.map((item) => item.custoCombustivel) },
      { type: 'bar', name: 'Manutenção', x, y: series.map((item) => item.custoManutencao) },
      { type: 'bar', name: 'ERP', x, y: series.map((item) => item.custoErp ?? 0) },
    ] as Data[]} layout={{ title: { text: `Custo por mês${titulo ?? ''}` }, barmode: 'stack', yaxis: { title: { text: 'R$' } }, autosize: true }} style={{ width: '100%', height: 320 }} useResizeHandler />
    <Plot data={[
      { type: 'bar', name: 'KM rodado', x, y: series.map((item) => item.kmRodado), yaxis: 'y' },
      { type: 'scatter', mode: 'lines+markers', name: 'Viagens', x, y: series.map((item) => item.viagens), yaxis: 'y2' },
    ] as Data[]} layout={{ title: { text: `KM rodado e viagens por mês${titulo ?? ''}` }, yaxis: { title: { text: 'KM' } }, yaxis2: { title: { text: 'Viagens' }, overlaying: 'y', side: 'right' }, autosize: true }} style={{ width: '100%', height: 300 }} useResizeHandler />
  </>;
}

export default function FrotaAnalyticsPanel({ vehicles, vehicle }: Props) {
  const limite = useMemo(() => periodoKpi(), []);
  const anos = useMemo(() => Array.from({ length: limite.end.getFullYear() - KPI_INICIO.getFullYear() + 1 }, (_, i) => KPI_INICIO.getFullYear() + i), [limite]);
  const [mode, setMode] = useState<Mode>('all');
  const [year, setYear] = useState(limite.end.getFullYear());
  const [month, setMonth] = useState(limite.end.getMonth() + 1);
  const [start, setStart] = useState(iso(KPI_INICIO));
  const [end, setEnd] = useState(iso(limite.end));
  const [vehicleAId, setVehicleAId] = useState('');
  const [vehicleBId, setVehicleBId] = useState('');
  const [data, setData] = useState<Dataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [erp, setErp] = useState<Map<string, ErpEstado>>(new Map());

  useEffect(() => {
    let active = true;
    Promise.all([
      getDocs(query(collection(db, 'atividades'), where('tipo', '==', 'saida'))),
      getDocs(collection(db, '03-combustivel')),
      getDocs(collection(db, 'manutencoes')),
    ]).then(([activities, fuel, maintenance]) => {
      if (active) setData({ activities: activities.docs.map(item => normalizarAtividade(item.data(), item.id)), fuel: fuel.docs.map(item => normalizarMovimentoCombustivel(item.data(), item.id) as unknown as FuelAnalyticsRecord), maintenance: maintenance.docs.map(item => ({ id: item.id, ...item.data() })) });
    }).catch(() => active && setLoadError('Não foi possível carregar os KPIs.'));
    return () => { active = false; };
  }, []);

  // ERP: uma consulta por placa (01/01/2025 até hoje), três de cada vez. Veículo sem placa (EXTRA) não tem ERP.
  const carregarErp = useCallback(async (alvos: VehicleAnalyticsIdentity[]) => {
    const pendentes = alvos.filter((item) => erp.get(item.id)?.status !== 'ok' && erp.get(item.id)?.status !== 'carregando');
    if (!pendentes.length) return;
    setErp((atual) => { const novo = new Map(atual); pendentes.forEach((item) => novo.set(item.id, placaParaErp(item.placa) ? { status: 'carregando', rows: null } : { status: 'ok', rows: [] })); return novo; });
    const fila = pendentes.filter((item) => placaParaErp(item.placa));
    const trabalhar = async () => {
      for (let item = fila.shift(); item; item = fila.shift()) {
        const atual = item;
        try {
          const rows = await erpDaPlaca(placaParaErp(atual.placa)!, iso(KPI_INICIO), iso(limite.end));
          setErp((mapa) => new Map(mapa).set(atual.id, { status: 'ok', rows }));
        } catch (error) {
          console.error(`Erro ao consultar o ERP de ${vehicleLabel(atual)}`, error);
          setErp((mapa) => new Map(mapa).set(atual.id, { status: 'erro', rows: null }));
        }
      }
    };
    await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
  }, [erp, limite]);

  const vehicleA = vehicles.find(item => item.id === vehicleAId);
  const vehicleB = vehicles.find(item => item.id === vehicleBId);
  useEffect(() => { if (vehicle) void carregarErp([vehicle]); }, [vehicle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const alvos = [vehicleA, vehicleB].filter((item): item is VehicleAnalyticsIdentity => Boolean(item)); if (alvos.length) void carregarErp(alvos); }, [vehicleA, vehicleB]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolved = useMemo(() => periodFor(mode, year, month, start, end, limite), [end, limite, mode, month, start, year]);
  const base = useMemo(() => (data ? agruparPorVeiculo(data.activities, data.fuel, data.maintenance, vehicles) : null), [data, vehicles]);
  const grupos = useMemo(() => (base ? new Map([...base].map(([id, item]) => [id, { ...item, erp: erp.get(id)?.rows ?? null }])) : null), [base, erp]);

  const alvo = useMemo(() => (vehicle ? [vehicle] : vehicles), [vehicle, vehicles]);
  const dadosAlvo = useMemo(() => (grupos ? alvo.map((item) => grupos.get(item.id)!).filter(Boolean) : []), [alvo, grupos]);
  const current = useMemo(() => (grupos ? fleetMetrics(dadosAlvo.map((item) => vehicleMetrics(item, resolved.period))) : null), [dadosAlvo, grupos, resolved.period]);
  const series = useMemo(() => (grupos ? monthlyMetrics(dadosAlvo, resolved.period) : []), [dadosAlvo, grupos, resolved.period]);
  const ranking = useMemo(() => (grupos && !vehicle ? vehicles.map((item) => ({ vehicle: item, metrics: vehicleMetrics(grupos.get(item.id)!, resolved.period) })).sort((a, b) => b.metrics.custoTotal - a.metrics.custoTotal) : []), [grupos, resolved.period, vehicle, vehicles]);
  const metricsA = grupos && vehicleA ? vehicleMetrics(grupos.get(vehicleA.id)!, resolved.period) : null;
  const metricsB = grupos && vehicleB ? vehicleMetrics(grupos.get(vehicleB.id)!, resolved.period) : null;
  const seriesA = useMemo(() => (grupos && vehicleA ? monthlyMetrics([grupos.get(vehicleA.id)!], resolved.period) : []), [grupos, resolved.period, vehicleA]);
  const seriesB = useMemo(() => (grupos && vehicleB ? monthlyMetrics([grupos.get(vehicleB.id)!], resolved.period) : []), [grupos, resolved.period, vehicleB]);

  const comPlaca = alvo.filter((item) => placaParaErp(item.placa));
  const estados = comPlaca.map((item) => erp.get(item.id)?.status);
  const carregando = estados.filter((s) => s === 'carregando').length;
  const prontos = estados.filter((s) => s === 'ok').length;
  const falharam = comPlaca.filter((item) => erp.get(item.id)?.status === 'erro');
  const naoCarregados = comPlaca.filter((item) => !erp.get(item.id));

  return <Box>
    <Typography variant="h5" gutterBottom>{vehicle ? `Análise individual · ${vehicleLabel(vehicle)}` : 'Visão geral'}</Typography>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
      <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>Período</InputLabel><Select label="Período" value={mode} onChange={event => setMode(event.target.value as Mode)}><MenuItem value="all">Todo período</MenuItem><MenuItem value="year">Ano</MenuItem><MenuItem value="month">Mês</MenuItem><MenuItem value="custom">Personalizado</MenuItem></Select></FormControl>
      {mode === 'month' && <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>Mês</InputLabel><Select label="Mês" value={month} onChange={event => setMonth(Number(event.target.value))}>{MESES.map((name, index) => <MenuItem value={index + 1} key={name}>{name}</MenuItem>)}</Select></FormControl>}
      {(mode === 'year' || mode === 'month') && <FormControl size="small" sx={{ minWidth: 110 }}><InputLabel>Ano</InputLabel><Select label="Ano" value={year} onChange={event => setYear(Number(event.target.value))}>{anos.map((item) => <MenuItem value={item} key={item}>{item}</MenuItem>)}</Select></FormControl>}
      {mode === 'custom' && <>
        <TextField size="small" label="Data inicial" type="date" value={start} onChange={event => setStart(event.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: iso(KPI_INICIO), max: iso(limite.end) } }} />
        <TextField size="small" label="Data final" type="date" value={end} onChange={event => setEnd(event.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: iso(KPI_INICIO), max: iso(limite.end) } }} />
      </>}
    </Stack>
    {(loadError || resolved.error) && <Alert severity="error" sx={{ mt: 2 }}>{loadError || resolved.error}</Alert>}

    {comPlaca.length > 0 && <Alert
      severity={carregando > 0 || naoCarregados.length ? 'info' : falharam.length ? 'warning' : 'success'}
      sx={{ mt: 2 }}
      action={naoCarregados.length || falharam.length ? <Button color="inherit" size="small" disabled={carregando > 0} onClick={() => void carregarErp([...naoCarregados, ...falharam])}>{falharam.length && !naoCarregados.length ? 'Tentar de novo' : 'Incluir ERP'}</Button> : undefined}
    >
      {carregando > 0
        ? <>Consultando o ERP: {prontos} de {comPlaca.length} placa(s)…<LinearProgress variant="determinate" value={(prontos / comPlaca.length) * 100} sx={{ mt: 1 }} /></>
        : naoCarregados.length
          ? `Custos do ERP (Query 47, desde 01/01/2025) ainda não incluídos: uma consulta por placa (${naoCarregados.length}).`
          : falharam.length
            ? `ERP incluído para ${prontos} de ${comPlaca.length} placa(s); falhou: ${falharam.map(vehicleLabel).join(', ')}.`
            : `ERP incluído para ${comPlaca.length} placa(s).`}
    </Alert>}

    {!data ? <CircularProgress sx={{ mt: 3 }} /> : current && <>
      <Cartoes m={current} />
      <Graficos series={series} />
      {ranking.length > 0 && <Box mt={3} sx={{ overflowX: 'auto' }}>
        <Typography variant="h6">Indicadores por veículo</Typography>
        <Table size="small">
          <TableHead><TableRow><TableCell>Veículo</TableCell><TableCell align="right">Viagens</TableCell><TableCell align="right">KM rodado</TableCell><TableCell align="right">Combustível</TableCell><TableCell align="right">Manutenção</TableCell><TableCell align="right">ERP</TableCell><TableCell align="right">Custo total</TableCell><TableCell align="right">R$/km</TableCell></TableRow></TableHead>
          <TableBody>{ranking.map(row => <TableRow key={row.vehicle.id}>
            <TableCell>{vehicleLabel(row.vehicle)}</TableCell>
            <TableCell align="right">{metric(row.metrics.viagens, 'number')}</TableCell>
            <TableCell align="right">{metric(row.metrics.kmRodado, 'km')}{row.metrics.kmQuality === 'PARTIAL' ? '*' : ''}</TableCell>
            <TableCell align="right">{metric(row.metrics.custoCombustivel, 'currency')}</TableCell>
            <TableCell align="right">{metric(row.metrics.custoManutencao, 'currency')}</TableCell>
            <TableCell align="right">{row.metrics.custoErp === null ? (placaParaErp(row.vehicle.placa) ? '—' : 'sem placa') : metric(row.metrics.custoErp, 'currency')}</TableCell>
            <TableCell align="right">{metric(row.metrics.custoTotal, 'currency')}</TableCell>
            <TableCell align="right">{metric(row.metrics.rsKm, 'rate')}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <Typography variant="caption" color="text.secondary">* KM com leitura(s) solta(s) ignorada(s) no período. ERP "—": não incluído.</Typography>
      </Box>}
      {!vehicle && <Box mt={4}>
        <Typography variant="h5">Comparação A/B</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={1}>
          <FormControl size="small" sx={{ minWidth: 180 }}><InputLabel>Veículo A</InputLabel><Select label="Veículo A" value={vehicleAId} onChange={event => setVehicleAId(event.target.value)}>{vehicles.map(item => <MenuItem key={item.id} value={item.id} disabled={item.id === vehicleBId}>{vehicleLabel(item)}</MenuItem>)}</Select></FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}><InputLabel>Veículo B</InputLabel><Select label="Veículo B" value={vehicleBId} onChange={event => setVehicleBId(event.target.value)}>{vehicles.map(item => <MenuItem key={item.id} value={item.id} disabled={item.id === vehicleAId}>{vehicleLabel(item)}</MenuItem>)}</Select></FormControl>
        </Stack>
        {vehicleA && vehicleB && metricsA && metricsB && <>
          <Table size="small" sx={{ mt: 2 }}><TableHead><TableRow><TableCell>KPI</TableCell><TableCell>{vehicleLabel(vehicleA)}</TableCell><TableCell>{vehicleLabel(vehicleB)}</TableCell></TableRow></TableHead><TableBody>{[
            ['Viagens', metric(metricsA.viagens, 'number'), metric(metricsB.viagens, 'number')],
            ['KM rodado', metric(metricsA.kmRodado, 'km'), metric(metricsB.kmRodado, 'km')],
            ['Combustível', metric(metricsA.custoCombustivel, 'currency'), metric(metricsB.custoCombustivel, 'currency')],
            ['Manutenção', metric(metricsA.custoManutencao, 'currency'), metric(metricsB.custoManutencao, 'currency')],
            ['ERP', metricsA.custoErp === null ? '—' : metric(metricsA.custoErp, 'currency'), metricsB.custoErp === null ? '—' : metric(metricsB.custoErp, 'currency')],
            ['Custo total', metric(metricsA.custoTotal, 'currency'), metric(metricsB.custoTotal, 'currency')],
            ['R$/km', metric(metricsA.rsKm, 'rate'), metric(metricsB.rsKm, 'rate')],
          ].map(row => <TableRow key={row[0]}>{row.map((cell, index) => <TableCell key={`${row[0]}-${index}`}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table>
          <Plot data={[{ type: 'bar', name: vehicleLabel(vehicleA), x: seriesA.map(item => item.label), y: seriesA.map(item => item.kmRodado) }, { type: 'bar', name: vehicleLabel(vehicleB), x: seriesB.map(item => item.label), y: seriesB.map(item => item.kmRodado) }] as Data[]} layout={{ title: { text: 'KM rodado — comparação' }, barmode: 'group', autosize: true }} style={{ width: '100%', height: 300 }} useResizeHandler />
          <Plot data={[{ type: 'bar', name: vehicleLabel(vehicleA), x: seriesA.map(item => item.label), y: seriesA.map(item => item.custoTotal) }, { type: 'bar', name: vehicleLabel(vehicleB), x: seriesB.map(item => item.label), y: seriesB.map(item => item.custoTotal) }] as Data[]} layout={{ title: { text: 'Custo total — comparação' }, barmode: 'group', autosize: true }} style={{ width: '100%', height: 300 }} useResizeHandler />
        </>}
      </Box>}
    </>}
  </Box>;
}
