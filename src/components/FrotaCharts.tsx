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
  dateRangeLabel?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  valueFormatter?: (value: number) => string;
  xAxisTickAngle?: number;
  hoverMode?: 'labelAndValue' | 'valueOnly';
}

function getDefaultTitle(chartTab?: ChartKey, dateRangeLabel?: string) {
  const suffix = dateRangeLabel ? ` (${dateRangeLabel})` : '';

  if (chartTab === 'caminhoes') {
    return `Caminh\u00f5es mais utilizados${suffix}`;
  }

  if (chartTab === 'km') {
    return `Quilometragem por caminh\u00e3o${suffix}`;
  }

  if (chartTab === 'motorista') {
    return `Registros por motorista${suffix}`;
  }

  return '';
}

export default function FrotaCharts({
  chartTab,
  data,
  title,
  dateRangeLabel,
  xAxisTitle,
  yAxisTitle,
  valueFormatter,
  xAxisTickAngle,
  hoverMode = 'labelAndValue',
}: Props) {
  if (data.length === 0) {
    return null;
  }

  const resolvedTitle = title ?? getDefaultTitle(chartTab, dateRangeLabel);
  const resolvedXAxisTitle =
    xAxisTitle ?? (chartTab === 'motorista' ? 'Motorista' : 'Placa');
  const resolvedYAxisTitle =
    yAxisTitle ?? (chartTab === 'km' ? 'KM' : 'Registros');

  const formattedValues = valueFormatter
    ? data.map((item) => valueFormatter(item.value))
    : undefined;
  const hoverTemplate =
    hoverMode === 'valueOnly'
      ? '%{y}<extra></extra>'
      : valueFormatter
        ? '%{x}<br>%{text}<extra></extra>'
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
          hovertemplate: hoverTemplate,
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
