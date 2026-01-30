import Plot from 'react-plotly.js';
import type { Data, Layout } from 'plotly.js';

export type ChartKey = 'caminhoes' | 'km' | 'motorista';

export type ChartPoint = {
  label: string;
  value: number;
};

interface Props {
  chartTab?: ChartKey;
  data: ChartPoint[];
  title?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  valueFormatter?: (value: number) => string;
  xAxisTickAngle?: number;
}

export default function FrotaCharts({
  chartTab,
  data,
  title,
  xAxisTitle,
  yAxisTitle,
  valueFormatter,
  xAxisTickAngle,
}: Props) {
  if (data.length === 0) {
    return null;
  }

  const resolvedTitle =
    title ??
    (chartTab === 'caminhoes'
      ? 'Caminhões mais utilizados (últimos 30 dias)'
      : chartTab === 'km'
        ? 'Quilometragem por caminhão (últimos 30 dias)'
        : chartTab === 'motorista'
          ? 'Registros por motorista (últimos 30 dias)'
          : '');

  const resolvedXAxisTitle =
    xAxisTitle ?? (chartTab === 'motorista' ? 'Motorista' : 'Placa');
  const resolvedYAxisTitle =
    yAxisTitle ?? (chartTab === 'km' ? 'KM' : 'Registros');

  const formattedValues = valueFormatter
    ? data.map((item) => valueFormatter(item.value))
    : undefined;

  return (
    <Plot
      data={[
        {
          type: 'bar',
          x: data.map((item) => item.label),
          y: data.map((item) => item.value),
          marker: { color: '#1976d2' },
          text: formattedValues,
          hovertemplate: valueFormatter ? '%{x}<br>%{text}<extra></extra>' : undefined,
        },
      ] as Data[]}
      layout={{
        title: { text: resolvedTitle },
        xaxis: {
          title: { text: resolvedXAxisTitle },
          automargin: true,
          tickangle: xAxisTickAngle,
        },
        yaxis: { title: { text: resolvedYAxisTitle } },
        autosize: true,
        bargap: 0.2,
        margin: { t: 60, r: 20, b: 60, l: 60 },
      } as Partial<Layout>}
      style={{ width: '100%', height: 500 }}
      useResizeHandler
    />
  );
}