import { useMemo, type ReactNode } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { Data } from 'plotly.js';
import Plot from 'react-plotly.js';
import { useNavigate } from 'react-router-dom';
import {
  consumo, custoPorCategoria, dadosACorrigir, duplicidadesFrotaErp,
  type AnalyticsPeriod, type VehicleAnalyticsIdentity, type VehicleData,
} from '../services/frota-analytics.service';

// "Testes de KPI": indicadores em avaliação. Não entram nos números da página.
type Alvo = { vehicle: VehicleAnalyticsIdentity; data: VehicleData };
type Props = { alvos: Alvo[]; period: AnalyticsPeriod; individual: boolean };

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const dataBr = (date: Date | null) => (date ? date.toLocaleDateString('pt-BR') : '—');
const rotulo = (vehicle: VehicleAnalyticsIdentity) => vehicle.placa || vehicle.extra || vehicle.identificador || vehicle.id;
const mediana = (valores: number[]) => { if (!valores.length) return null; const v = [...valores].sort((a, b) => a - b); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

function Teste({ titulo, resumo, descricao, children }: { titulo: string; resumo: string; descricao: string; children: ReactNode }) {
  return <Accordion disableGutters variant="outlined" sx={{ '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 2 }} alignItems={{ sm: 'center' }}>
        <Typography fontWeight={700}>{titulo}</Typography>
        <Typography variant="body2" color="text.secondary">{resumo}</Typography>
      </Stack>
    </AccordionSummary>
    <AccordionDetails>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 900 }}>{descricao}</Typography>
      {children}
    </AccordionDetails>
  </Accordion>;
}

export default function FrotaKpiTestes({ alvos, period, individual }: Props) {
  const navigate = useNavigate();

  const duplicidades = useMemo(() => alvos.map(({ vehicle, data }) => ({ vehicle, lista: duplicidadesFrotaErp(data, period) })), [alvos, period]);
  // Só veículos com placa têm ERP (máquina EXTRA não conta).
  const comPlaca = alvos.filter((item) => item.vehicle.placa);
  const comErp = duplicidades.filter((item) => item.lista !== null && item.vehicle.placa);
  const casos = comErp.flatMap((item) => item.lista!.map((d) => ({ vehicle: item.vehicle, ...d })));
  const valorDuplicado = casos.reduce((total, item) => total + item.valor, 0);

  const consumos = useMemo(() => alvos.map(({ vehicle, data }) => ({ vehicle, ...consumo(data, period) })).filter((item) => item.kmPorLitro !== null || item.litrosPorHora !== null), [alvos, period]);
  const medianaPorTipo = useMemo(() => {
    const grupos = new Map<string, { km: number[]; h: number[] }>();
    consumos.forEach((item) => { const g = grupos.get(item.vehicle.tipo ?? 'Sem tipo') ?? { km: [], h: [] }; if (item.kmPorLitro !== null) g.km.push(item.kmPorLitro); if (item.litrosPorHora !== null) g.h.push(item.litrosPorHora); grupos.set(item.vehicle.tipo ?? 'Sem tipo', g); });
    return new Map([...grupos].map(([tipo, g]) => [tipo, { km: mediana(g.km), h: mediana(g.h) }]));
  }, [consumos]);

  const categorias = useMemo(() => custoPorCategoria(alvos.map((item) => item.data), period), [alvos, period]);
  const topo = categorias.slice(0, 15);
  const totalCategorias = categorias.reduce((total, item) => total + item.valor, 0);

  const problemas = useMemo(() => alvos.flatMap(({ vehicle, data }) => dadosACorrigir(vehicle, data).map((p) => ({ vehicle, ...p }))), [alvos]);
  const porTipo = (tipo: string) => problemas.filter((p) => p.tipo === tipo).length;

  return <Box mt={5}>
    <Typography variant="h6">Testes de KPI</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, maxWidth: 900 }}>
      Indicadores em avaliação. Nada daqui muda os números acima; servem para decidirmos se viram KPI e com qual regra.
    </Typography>
    <Stack spacing={1}>
      <Teste
        titulo="Gasto lançado no FROTA e no ERP"
        resumo={comErp.length ? `${casos.length} caso(s), ${moeda.format(valorDuplicado)} (${comErp.length} de ${comPlaca.length} placa(s) com ERP)` : 'Inclua o ERP para medir'}
        descricao="Manutenção do FROTA e despesa do ERP com o mesmo valor (diferença de até R$ 0,01) e datas a até 7 dias uma da outra, no mesmo veículo. Cada lançamento casa uma vez só. Hoje o custo total soma os dois; o valor ao lado é quanto estaria contado em dobro."
      >
        {!comErp.length ? <Typography variant="body2">O ERP ainda não foi incluído{individual ? ' para este veículo' : ''}.</Typography> : casos.length === 0 ? <Typography variant="body2">Nenhum caso no período.</Typography> :
          <Box sx={{ overflowX: 'auto', maxHeight: 420 }}><Table size="small" stickyHeader>
            <TableHead><TableRow>{!individual && <TableCell>Veículo</TableCell>}<TableCell>FROTA</TableCell><TableCell>ERP</TableCell><TableCell align="right">Dias</TableCell><TableCell align="right">Valor</TableCell></TableRow></TableHead>
            <TableBody>{casos.map((c) => <TableRow key={`${c.vehicle.id}-${c.manutencaoId}`}>
              {!individual && <TableCell>{rotulo(c.vehicle)}</TableCell>}
              <TableCell>{dataBr(c.manutencaoData)} · {c.manutencaoCategoria}</TableCell>
              <TableCell>{dataBr(c.erpData)} · {c.erpNatureza}</TableCell>
              <TableCell align="right">{c.dias}</TableCell>
              <TableCell align="right">{moeda.format(c.valor)}</TableCell>
            </TableRow>)}</TableBody>
          </Table></Box>}
      </Teste>

      <Teste
        titulo="Consumo"
        resumo={consumos.length ? `${consumos.length} veículo(s) com consumo no período` : 'Sem leituras suficientes no período'}
        descricao="Veículos: km rodado ÷ litros (km/L). Máquinas: litros ÷ horas trabalhadas (L/h). Litros de todas as saídas de combustível do veículo no período. A comparação é com a mediana do mesmo tipo de veículo (quadro FROTA); muito abaixo ou acima dela pode ser abastecimento fora do padrão ou leitura errada."
      >
        {!consumos.length ? <Typography variant="body2">Nenhum veículo com KM ou horas e combustível no período.</Typography> :
          <Box sx={{ overflowX: 'auto', maxHeight: 420 }}><Table size="small" stickyHeader>
            <TableHead><TableRow><TableCell>Veículo</TableCell><TableCell>Tipo</TableCell><TableCell align="right">Litros</TableCell><TableCell align="right">Consumo</TableCell><TableCell align="right">Mediana do tipo</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>{consumos.map((c) => {
              const ref = medianaPorTipo.get(c.vehicle.tipo ?? 'Sem tipo');
              const valor = c.kmPorLitro ?? c.litrosPorHora!; const unidade = c.kmPorLitro !== null ? 'km/L' : 'L/h';
              const base = c.kmPorLitro !== null ? ref?.km : ref?.h;
              const razao = base ? valor / base : null;
              // km/L baixo é ruim; L/h alto é ruim.
              const fora = razao !== null && (c.kmPorLitro !== null ? razao < 0.7 || razao > 1.5 : razao > 1.3 || razao < 0.5);
              return <TableRow key={c.vehicle.id}>
                <TableCell>{rotulo(c.vehicle)}</TableCell>
                <TableCell>{c.vehicle.tipo ?? '—'}</TableCell>
                <TableCell align="right">{numero.format(c.litros)}</TableCell>
                <TableCell align="right">{numero.format(valor)} {unidade}</TableCell>
                <TableCell align="right">{base ? `${numero.format(base)} ${unidade}` : '—'}</TableCell>
                <TableCell>{fora && <Chip size="small" color="warning" label="fora do padrão" />}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table></Box>}
      </Teste>

      <Teste
        titulo="Para onde vai o dinheiro"
        resumo={categorias.length ? `${categorias.length} categoria(s), ${moeda.format(totalCategorias)}` : 'Sem custo no período'}
        descricao="Custo do período somado por categoria do FROTA e por natureza do ERP (marcada com “(ERP)”), com o combustível numa linha só. As duas fontes usam nomes diferentes para a mesma coisa; o teste mostra o que precisaria ser unificado. Aparecem as 15 maiores."
      >
        {!topo.length ? <Typography variant="body2">Sem custo no período.</Typography> :
          <Plot data={[{ type: 'bar', orientation: 'h', x: [...topo].reverse().map((item) => item.valor), y: [...topo].reverse().map((item) => item.categoria), hovertemplate: '%{y}<br>R$ %{x:,.2f}<extra></extra>' }] as Data[]}
            layout={{ autosize: true, margin: { l: 280, r: 20, t: 10, b: 40 }, xaxis: { title: { text: 'R$' } } }}
            style={{ width: '100%', height: Math.max(220, topo.length * 28 + 60) }} useResizeHandler />}
      </Teste>

      <Teste
        titulo="Dados a corrigir"
        resumo={problemas.length ? `${problemas.length} problema(s): ${porTipo('leitura-solta')} leitura(s) solta(s), ${porTipo('km-inicial')} KM inicial vazio ou 0, ${porTipo('sem-atualizacao')} sem atualização há mais de 30 dias` : 'Nada a corrigir'}
        descricao="Problemas no cadastro e nas leituras que pioram os números acima (todo o histórico, não só o período): leitura de KM ou horímetro fora da sequência (ignorada no cálculo), KM inicial vazio ou 0 e KM sem atualização pelo app há mais de 30 dias. O botão abre o veículo."
      >
        {!problemas.length ? <Typography variant="body2">Nenhum problema encontrado.</Typography> :
          <Box sx={{ overflowX: 'auto', maxHeight: 420 }}><Table size="small" stickyHeader>
            <TableHead><TableRow>{!individual && <TableCell>Veículo</TableCell>}<TableCell>Problema</TableCell><TableCell>Detalhe</TableCell><TableCell>Registro</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>{problemas.map((p, index) => <TableRow key={`${p.vehicle.id}-${index}`}>
              {!individual && <TableCell>{rotulo(p.vehicle)}</TableCell>}
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{p.tipo === 'leitura-solta' ? 'Leitura solta' : p.tipo === 'km-inicial' ? 'KM inicial' : 'Sem atualização'}</TableCell>
              <TableCell>{p.detalhe}</TableCell>
              <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{p.origem ?? '—'}</TableCell>
              <TableCell><Button size="small" onClick={() => navigate(`/frota/veiculos/${encodeURIComponent(p.vehicle.id)}`)}>Abrir</Button></TableCell>
            </TableRow>)}</TableBody>
          </Table></Box>}
      </Teste>
    </Stack>
  </Box>;
}
