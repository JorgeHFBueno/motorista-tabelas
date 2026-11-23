import Plot from 'react-plotly.js';
import type { Data, Layout } from 'plotly.js';

export type ChartPoint = {
  label: string;
  value: number;
};

interface Props {
  data: ChartPoint[];
  title?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  valueFormatter?: (value: number) => string;
  xAxisTickAngle?: number;
}

export default function FrotaCharts({
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

  const resolvedTitle = title ?? '';
  const resolvedXAxisTitle = xAxisTitle ?? '';
  const resolvedYAxisTitle = yAxisTitle ?? '';

  const formattedValues = valueFormatter
    ? data.map((item) => valueFormatter(item.value))
    : undefined;
  const hoverTemplate = valueFormatter ? '%{x}<br>%{text}<extra></extra>' : undefined;

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
