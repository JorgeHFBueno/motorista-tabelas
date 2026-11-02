import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, CircularProgress, FormControl, InputLabel, LinearProgress, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Data } from 'plotly.js';
import Plot from 'react-plotly.js';
import { db } from '../firebase';
import { normalizarMovimentoCombustivel } from '../services/combustivel-normalizer';
import { normalizarAtividade } from '../services/atividade-normalizer';
import { atualizarErpVeiculos, lerErpVeiculos, type ErpGuardado } from '../services/erp-veiculos.service';
import { RegistrosFiltros, type MasterDetailFilters } from './ManutencoesList';
import FrotaKpiTestes from './FrotaKpiTestes';
import {
  agruparPorVeiculo, fleetMetrics, KPI_INICIO, monthlyMetrics, periodoKpi, placaParaErp, registrosDoPeriodo, vehicleMetrics,
  type ActivityAnalyticsRecord, type AnalyticsPeriod, type ErpAnalyticsRow, type FleetMetrics, type FuelAnalyticsRecord,
  type FonteRegistro, type MaintenanceAnalyticsRecord, type MonthlyMetric, type VehicleAnalyticsIdentity, type VehicleData,
} from '../services/frota-analytics.service';

type Props = { vehicles: VehicleAnalyticsIdentity[]; vehicle?: VehicleAnalyticsIdentity };
type Mode = 'all' | 'year' | 'month' | 'custom';
type Dataset = { activities: ActivityAnalyticsRecord[]; fuel: FuelAnalyticsRecord[]; maintenance: MaintenanceAnalyticsRecord[] };

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const dataHoraCurta = (value: Date) => value.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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

function metric(value: number | null, kind: 'number' | 'km' | 'h' | 'currency' | 'rate' | 'rateH') {
  if (value === null) return 'Indisponível';
  if (kind === 'km') return `${numberFormatter.format(value)} km`;
  if (kind === 'h') return `${numberFormatter.format(value)} h`;
  if (kind === 'rateH') return `${currencyFormatter.format(value)}/h`;
  if (kind === 'currency') return currencyFormatter.format(value);
  if (kind === 'rate') return `${currencyFormatter.format(value)}/km`;
  return numberFormatter.format(value);
}
const erpTexto = (m: FleetMetrics) => (m.custoErp === null ? 'sem ERP guardado' : `ERP ${currencyFormatter.format(m.custoErp)}${m.erpCompleto ? '' : ' (parcial)'}`);

function CardMetric({ title, value, note }: { title: string; value: string; note?: string }) {
  return <Card variant="outlined" sx={{ minWidth: 0 }}><CardContent><Typography variant="body2" color="text.secondary">{title}</Typography><Typography variant="h6">{value}</Typography>{note && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{note}</Typography>}</CardContent></Card>;
}

function Secao({ titulo, descricao, acao, children }: { titulo: string; descricao: ReactNode; acao?: ReactNode; children?: ReactNode }) {
  return <Box mt={4}>
    <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between"><Typography variant="h6">{titulo}</Typography>{acao}</Stack>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1, maxWidth: 900 }}>{descricao}</Typography>
    {children}
  </Box>;
}

/** `medidor`: 'km' (veículo), 'h' (máquina) ou 'ambos' (frota). */
function Cartoes({ m, medidor }: { m: FleetMetrics; medidor: 'km' | 'h' | 'ambos' }) {
  const soltas = m.leiturasIgnoradas ? `; ${m.leiturasIgnoradas} leitura(s) solta(s) ignorada(s)` : '';
  const colunas = medidor === 'ambos' ? 6 : medidor === 'km' ? 4 : 3;
  return <Box sx={{ mt: 2, display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: `repeat(${Math.min(3, colunas)}, minmax(0, 1fr))`, lg: `repeat(${colunas}, minmax(0, 1fr))` } }}>
    {medidor !== 'h' && <CardMetric title="Viagens" value={metric(m.viagens, 'number')} note="Saídas registradas no app." />}
    {medidor !== 'h' && <CardMetric title="KM rodado" value={metric(m.kmRodado, 'km')} note={`Veículos, pelas leituras de abastecimentos e atividades${medidor === 'km' ? soltas : ''}.`} />}
    {medidor !== 'km' && <CardMetric title="Horas trabalhadas" value={metric(m.horasTrabalhadas, 'h')} note={`Máquinas, pelo horímetro dos abastecimentos${medidor === 'h' ? soltas : ''}.`} />}
    <CardMetric title="Custo total" value={metric(m.custoTotal, 'currency')} note={`Combustível ${currencyFormatter.format(m.custoCombustivel)} · Manutenção ${currencyFormatter.format(m.custoManutencao)} · ${erpTexto(m)}`} />
    {medidor !== 'h' && <CardMetric title="R$/km" value={metric(m.rsKm, 'rate')} note="Custo total dos veículos com KM ÷ KM rodado." />}
    {medidor !== 'km' && <CardMetric title="R$/h" value={metric(m.rsHora, 'rateH')} note="Custo total das máquinas com horas ÷ horas trabalhadas." />}
  </Box>;
}

function Graficos({ series, titulo }: { series: MonthlyMetric[]; titulo?: string }) {
  const x = series.map((item) => item.label);
  return <>
    <Secao titulo={`Custo por mês${titulo ?? ''}`} descricao="Quanto foi gasto em cada mês, separado pela origem do gasto: combustível (diesel interno a R$ 5,90 por litro, sem o abastecimento externo que já foi lançado como manutenção), manutenções lançadas no FROTA e despesas do ERP (Query 47, quando incluído). Mês sem barra não teve gasto registrado.">
    <Plot data={[
      { type: 'bar', name: 'Combustível', x, y: series.map((item) => item.custoCombustivel) },
      { type: 'bar', name: 'Manutenção', x, y: series.map((item) => item.custoManutencao) },
      { type: 'bar', name: 'ERP', x, y: series.map((item) => item.custoErp ?? 0) },
    ] as Data[]} layout={{ barmode: 'stack', yaxis: { title: { text: 'R$' } }, autosize: true, margin: { t: 20 } }} style={{ width: '100%', height: 320 }} useResizeHandler />
    </Secao>
    <Secao titulo={`KM rodado e viagens por mês${titulo ?? ''}`} descricao="Barras: quilômetros rodados em cada mês, pela diferença entre leituras de odômetro seguidas (abastecimentos e saídas do app; leituras soltas, como zero ou um dígito a mais, ficam de fora). Linha: número de saídas registradas no app no mês.">
    <Plot data={[
      { type: 'bar', name: 'KM rodado', x, y: series.map((item) => item.kmRodado), yaxis: 'y' },
      { type: 'scatter', mode: 'lines+markers', name: 'Viagens', x, y: series.map((item) => item.viagens), yaxis: 'y2' },
    ] as Data[]} layout={{ yaxis: { title: { text: 'KM' } }, yaxis2: { title: { text: 'Viagens' }, overlaying: 'y', side: 'right' }, autosize: true, margin: { t: 20 } }} style={{ width: '100%', height: 300 }} useResizeHandler />
    </Secao>
    {series.some((item) => item.horasTrabalhadas) && <Secao titulo={`Horas trabalhadas por mês${titulo ?? ''}`} descricao="Horas das máquinas (EXTRA) em cada mês, pela diferença entre leituras de horímetro seguidas nos abastecimentos; leituras soltas (zero, queda ou mais de 24 h por dia) ficam de fora.">
    <Plot data={[{ type: 'bar', name: 'Horas', x, y: series.map((item) => item.horasTrabalhadas) }] as Data[]} layout={{ yaxis: { title: { text: 'h' } }, autosize: true, margin: { t: 20 } }} style={{ width: '100%', height: 280 }} useResizeHandler />
    </Secao>}
  </>;
}

const FONTE_FILTRO: Record<FonteRegistro, keyof MasterDetailFilters> = { atividade: 'atividades', abastecimento: 'abastecimento', manutencao: 'manutencoes2026', erp: 'manutencoesErp' };
const FONTE_TEXTO: Record<FonteRegistro, string> = { atividade: 'Atividade', abastecimento: 'Abastecimento', manutencao: 'Manutenção FROTA', erp: 'ERP' };
const dataHora = (value: Date | null) => (value ? value.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** A tabela do detalhe do veículo, no período do KPI: os lançamentos que formam os indicadores. */
function RegistrosVeiculo({ data, period }: { data: VehicleData; period: AnalyticsPeriod }) {
  const [filtros, setFiltros] = useState<MasterDetailFilters>({ atividades: false, abastecimento: true, manutencoes2026: true, manutencoesErp: true });
  const registros = useMemo(() => registrosDoPeriodo(data, period), [data, period]);
  const contagem = useMemo(() => {
    const c = { atividades: 0, abastecimento: 0, manutencoes2026: 0, manutencoesErp: 0 };
    registros.forEach((r) => { c[FONTE_FILTRO[r.fonte]] += 1; });
    return c;
  }, [registros]);
  const visiveis = registros.filter((r) => filtros[FONTE_FILTRO[r.fonte]]);
  const soma = visiveis.reduce((total, r) => total + (r.valor ?? 0), 0);
  return <Secao
    titulo="Registros do período"
    descricao={<>Os lançamentos que formam os indicadores acima, como na tabela do detalhe do veículo. Com Abastecimento, Manutenções FROTA e Manutenções ERP marcados, a soma da coluna Valor é o custo total do período. Sem valor: atividade (mostra o km), abastecimento externo já lançado como manutenção e linha do ERP que não é despesa.{data.erp === null ? ' O ERP ainda não foi incluído para este veículo.' : ''}</>}
  >
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ lg: 'center' }} justifyContent="space-between">
      <RegistrosFiltros filters={filtros} counts={contagem} onToggleFilter={(key, value) => setFiltros((atual) => ({ ...atual, [key]: value }))} />
      <Card variant="outlined" sx={{ px: 2.5, py: 1, flexShrink: 0 }}><Typography component="span" sx={{ fontSize: 18 }}>Soma: </Typography><Typography component="span" sx={{ fontSize: 18, fontWeight: 700 }}>{currencyFormatter.format(soma)}</Typography></Card>
    </Stack>
    <Box sx={{ mt: 2, maxHeight: 520, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 2 }}>
      <Table size="small" stickyHeader>
        <TableHead><TableRow><TableCell>Data</TableCell><TableCell>Fonte</TableCell><TableCell>Categoria</TableCell><TableCell align="right">Valor</TableCell></TableRow></TableHead>
        <TableBody>
          {visiveis.length === 0 && <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary', py: 3 }}>Nenhum registro no período.</TableCell></TableRow>}
          {visiveis.map((r) => <TableRow key={r.id} hover>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{dataHora(r.data)}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{FONTE_TEXTO[r.fonte]}</TableCell>
            <TableCell>{r.categoria}</TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: r.valor === null ? 'text.secondary' : undefined }}>{r.valor === null ? (r.valorTexto ?? '—') : currencyFormatter.format(r.valor)}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </Box>
  </Secao>;
}

export default function FrotaAnalyticsPanel({ vehicles, vehicle }: Props) {
  const navigate = useNavigate();
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
  const [erpDocs, setErpDocs] = useState<Map<string, ErpGuardado> | null>(null); // null = lendo
  const [atualizando, setAtualizando] = useState(false);
  const [erroErp, setErroErp] = useState<string | null>(null);

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

  // ERP guardado (erp-veiculos): gravado pela Function todo dia às 03:00; "Atualizar agora" consulta o ERP na hora.
  useEffect(() => {
    let active = true;
    lerErpVeiculos()
      .then((docs) => { if (active) setErpDocs(docs); })
      .catch((error) => { console.error('Erro ao ler o ERP guardado', error); if (active) { setErpDocs(new Map()); setErroErp('Não foi possível ler o ERP guardado.'); } });
    return () => { active = false; };
  }, []);

  const atualizarErp = useCallback(async (ids?: string[]) => {
    setAtualizando(true);
    setErroErp(null);
    try {
      const resumo = await atualizarErpVeiculos(ids);
      setErpDocs(await lerErpVeiculos());
      if (resumo.erro) setErroErp(`O ERP falhou para ${resumo.erro} de ${resumo.veiculos} placa(s): ${resumo.falhas.map((f) => f.placa).join(', ')}.`);
    } catch (error) {
      console.error('Erro ao atualizar o ERP', error);
      setErroErp(`Não foi possível atualizar o ERP agora: ${(error as Error)?.message ?? error}`);
    } finally {
      setAtualizando(false);
    }
  }, []);

  const vehicleA = vehicles.find(item => item.id === vehicleAId);
  const vehicleB = vehicles.find(item => item.id === vehicleBId);
  const resolved = useMemo(() => periodFor(mode, year, month, start, end, limite), [end, limite, mode, month, start, year]);
  const base = useMemo(() => (data ? agruparPorVeiculo(data.activities, data.fuel, data.maintenance, vehicles) : null), [data, vehicles]);
  const grupos = useMemo(() => {
    if (!base) return null;
    const placaDe = new Map(vehicles.map((item) => [item.id, placaParaErp(item.placa)]));
    // Veículo sem placa (EXTRA) não tem ERP: conta como vazio. Com placa, as linhas guardadas (numa falha, as anteriores).
    return new Map([...base].map(([id, item]) => [id, { ...item, erp: placaDe.get(id) ? (erpDocs?.get(id)?.linhas as ErpAnalyticsRow[] | null | undefined) ?? null : [] }]));
  }, [base, erpDocs, vehicles]);

  const alvo = useMemo(() => (vehicle ? [vehicle] : vehicles), [vehicle, vehicles]);
  const dadosAlvo = useMemo(() => (grupos ? alvo.map((item) => grupos.get(item.id)!).filter(Boolean) : []), [alvo, grupos]);
  const alvosTestes = useMemo(() => (grupos ? alvo.map((item) => ({ vehicle: item, data: grupos.get(item.id)! })).filter((item) => item.data) : []), [alvo, grupos]);
  const current = useMemo(() => (grupos ? fleetMetrics(dadosAlvo.map((item) => vehicleMetrics(item, resolved.period))) : null), [dadosAlvo, grupos, resolved.period]);
  const series = useMemo(() => (grupos ? monthlyMetrics(dadosAlvo, resolved.period) : []), [dadosAlvo, grupos, resolved.period]);
  const ranking = useMemo(() => (grupos && !vehicle ? vehicles.map((item) => ({ vehicle: item, metrics: vehicleMetrics(grupos.get(item.id)!, resolved.period) })).sort((a, b) => b.metrics.custoTotal - a.metrics.custoTotal) : []), [grupos, resolved.period, vehicle, vehicles]);
  const metricsA = grupos && vehicleA ? vehicleMetrics(grupos.get(vehicleA.id)!, resolved.period) : null;
  const metricsB = grupos && vehicleB ? vehicleMetrics(grupos.get(vehicleB.id)!, resolved.period) : null;
  const seriesA = useMemo(() => (grupos && vehicleA ? monthlyMetrics([grupos.get(vehicleA.id)!], resolved.period) : []), [grupos, resolved.period, vehicleA]);
  const seriesB = useMemo(() => (grupos && vehicleB ? monthlyMetrics([grupos.get(vehicleB.id)!], resolved.period) : []), [grupos, resolved.period, vehicleB]);

  const comPlaca = alvo.filter((item) => placaParaErp(item.placa));
  const semErp = comPlaca.filter((item) => !erpDocs?.get(item.id)?.linhas);
  const comFalha = comPlaca.filter((item) => erpDocs?.get(item.id)?.status === 'erro');
  const datas = comPlaca.map((item) => erpDocs?.get(item.id)?.atualizadoEm).filter((d): d is Date => Boolean(d));
  const maisAntiga = datas.length ? new Date(Math.min(...datas.map((d) => d.getTime()))) : null;

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
      severity={!erpDocs || atualizando ? 'info' : erroErp || semErp.length || comFalha.length ? 'warning' : 'success'}
      sx={{ mt: 2 }}
      action={erpDocs && <Button color="inherit" size="small" disabled={atualizando} onClick={() => void atualizarErp(vehicle ? [vehicle.id] : undefined)}>Atualizar agora</Button>}
    >
      {!erpDocs
        ? 'Lendo o ERP guardado…'
        : atualizando
          ? <>Consultando o ERP de {vehicle ? 'uma placa' : `${comPlaca.length} placas`} (pode levar até um minuto)…<LinearProgress sx={{ mt: 1 }} /></>
          : <>
            ERP (Query 47, desde 01/01/2025) guardado para {comPlaca.length - semErp.length} de {comPlaca.length} placa(s){maisAntiga ? `, atualizado em ${dataHoraCurta(maisAntiga)}` : ''}; atualiza sozinho todo dia às 3h.
            {comFalha.length > 0 && ` A última consulta falhou para ${comFalha.map(vehicleLabel).join(', ')} (ficou a anterior).`}
            {semErp.length > 0 && ` Sem ERP guardado: ${semErp.map(vehicleLabel).join(', ')}.`}
            {erroErp && <Box component="span" sx={{ display: 'block', mt: 0.5 }}>{erroErp}</Box>}
          </>}
    </Alert>}

    {!data ? <CircularProgress sx={{ mt: 3 }} /> : current && <>
      <Secao titulo="Indicadores do período" descricao="Resumo do período escolhido. Viagens são as saídas registradas no app; KM rodado vem das leituras de odômetro dos veículos e horas trabalhadas, do horímetro das máquinas; custo total soma combustível, manutenções FROTA e ERP; R$/km e R$/h dividem o custo pelo KM ou pelas horas (só de quem tem leitura)."><Cartoes m={current} medidor={vehicle ? (vehicle.placa ? 'km' : 'h') : 'ambos'} /></Secao>
      <Graficos series={series} />
      {vehicle && grupos?.get(vehicle.id) && <RegistrosVeiculo data={grupos.get(vehicle.id)!} period={resolved.period} />}
      {ranking.length > 0 && <Secao titulo="Indicadores por veículo" descricao="Um veículo por linha, do maior custo para o menor, no período escolhido. Clique no veículo para abrir a análise individual, com a tabela de registros.">
        <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Veículo</TableCell><TableCell align="right">Viagens</TableCell><TableCell align="right">KM / horas</TableCell><TableCell align="right">Combustível</TableCell><TableCell align="right">Manutenção</TableCell><TableCell align="right">ERP</TableCell><TableCell align="right">Custo total</TableCell><TableCell align="right">R$/km · R$/h</TableCell></TableRow></TableHead>
          <TableBody>{ranking.map(row => <TableRow key={row.vehicle.id}>
            <TableCell><Button size="small" sx={{ p: 0, minWidth: 0, textTransform: 'none', justifyContent: 'flex-start' }} onClick={() => navigate(`/frota/analytics?veiculo=${encodeURIComponent(row.vehicle.id)}`)}>{vehicleLabel(row.vehicle)}</Button></TableCell>
            <TableCell align="right">{metric(row.metrics.viagens, 'number')}</TableCell>
            <TableCell align="right">{row.metrics.horasTrabalhadas !== null && row.metrics.kmRodado === null ? metric(row.metrics.horasTrabalhadas, 'h') : `${metric(row.metrics.kmRodado, 'km')}${row.metrics.kmQuality === 'PARTIAL' ? '*' : ''}`}</TableCell>
            <TableCell align="right">{metric(row.metrics.custoCombustivel, 'currency')}</TableCell>
            <TableCell align="right">{metric(row.metrics.custoManutencao, 'currency')}</TableCell>
            <TableCell align="right">{row.metrics.custoErp === null ? (placaParaErp(row.vehicle.placa) ? '—' : 'sem placa') : metric(row.metrics.custoErp, 'currency')}</TableCell>
            <TableCell align="right">{metric(row.metrics.custoTotal, 'currency')}</TableCell>
            <TableCell align="right">{row.metrics.rsHora !== null && row.metrics.rsKm === null ? metric(row.metrics.rsHora, 'rateH') : metric(row.metrics.rsKm, 'rate')}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        </Box>
        <Typography variant="caption" color="text.secondary">* KM com leitura(s) solta(s) ignorada(s) no período. ERP "—": sem ERP guardado.</Typography>
      </Secao>}
      {!vehicle && <Secao titulo="Comparação A/B" descricao="Escolha dois veículos para ver os mesmos indicadores lado a lado e, nos gráficos, mês a mês. O ERP vem do que está guardado.">
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} mt={1}>
          <FormControl size="small" sx={{ minWidth: 180 }}><InputLabel>Veículo A</InputLabel><Select label="Veículo A" value={vehicleAId} onChange={event => setVehicleAId(event.target.value)}>{vehicles.map(item => <MenuItem key={item.id} value={item.id} disabled={item.id === vehicleBId}>{vehicleLabel(item)}</MenuItem>)}</Select></FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}><InputLabel>Veículo B</InputLabel><Select label="Veículo B" value={vehicleBId} onChange={event => setVehicleBId(event.target.value)}>{vehicles.map(item => <MenuItem key={item.id} value={item.id} disabled={item.id === vehicleAId}>{vehicleLabel(item)}</MenuItem>)}</Select></FormControl>
        </Stack>
        {vehicleA && vehicleB && metricsA && metricsB && <>
          <Table size="small" sx={{ mt: 2 }}><TableHead><TableRow><TableCell>KPI</TableCell><TableCell>{vehicleLabel(vehicleA)}</TableCell><TableCell>{vehicleLabel(vehicleB)}</TableCell></TableRow></TableHead><TableBody>{[
            ['Viagens', metric(metricsA.viagens, 'number'), metric(metricsB.viagens, 'number')],
            ['KM rodado', metric(metricsA.kmRodado, 'km'), metric(metricsB.kmRodado, 'km')],
            ['Horas trabalhadas', metric(metricsA.horasTrabalhadas, 'h'), metric(metricsB.horasTrabalhadas, 'h')],
            ['Combustível', metric(metricsA.custoCombustivel, 'currency'), metric(metricsB.custoCombustivel, 'currency')],
            ['Manutenção', metric(metricsA.custoManutencao, 'currency'), metric(metricsB.custoManutencao, 'currency')],
            ['ERP', metricsA.custoErp === null ? '—' : metric(metricsA.custoErp, 'currency'), metricsB.custoErp === null ? '—' : metric(metricsB.custoErp, 'currency')],
            ['Custo total', metric(metricsA.custoTotal, 'currency'), metric(metricsB.custoTotal, 'currency')],
            ['R$/km', metric(metricsA.rsKm, 'rate'), metric(metricsB.rsKm, 'rate')],
            ['R$/h', metric(metricsA.rsHora, 'rateH'), metric(metricsB.rsHora, 'rateH')],
          ].map(row => <TableRow key={row[0]}>{row.map((cell, index) => <TableCell key={`${row[0]}-${index}`}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table>
          <Plot data={[{ type: 'bar', name: vehicleLabel(vehicleA), x: seriesA.map(item => item.label), y: seriesA.map(item => item.kmRodado) }, { type: 'bar', name: vehicleLabel(vehicleB), x: seriesB.map(item => item.label), y: seriesB.map(item => item.kmRodado) }] as Data[]} layout={{ title: { text: 'KM rodado — comparação' }, barmode: 'group', autosize: true }} style={{ width: '100%', height: 300 }} useResizeHandler />
          <Plot data={[{ type: 'bar', name: vehicleLabel(vehicleA), x: seriesA.map(item => item.label), y: seriesA.map(item => item.custoTotal) }, { type: 'bar', name: vehicleLabel(vehicleB), x: seriesB.map(item => item.label), y: seriesB.map(item => item.custoTotal) }] as Data[]} layout={{ title: { text: 'Custo total — comparação' }, barmode: 'group', autosize: true }} style={{ width: '100%', height: 300 }} useResizeHandler />
        </>}
      </Secao>}
      <FrotaKpiTestes alvos={alvosTestes} period={resolved.period} individual={Boolean(vehicle)} />
    </>}
  </Box>;
}
