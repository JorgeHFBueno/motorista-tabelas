import Plot from 'react-plotly.js';
import type { Data, Layout } from 'plotly.js';

export type ChartKey = 'caminhoes' | 'km' | 'motorista';

export type ChartPoint = {
  label: string;
  value: number;
};

interface Props {
  chartTab: ChartKey;
  data: ChartPoint[];
}

export default function FrotaCharts({ chartTab, data }: Props) {
  if (data.length === 0) {
    return null;
  }

  return (
    <Plot
      data={[
        {
          type: 'bar',
          x: data.map((item) => item.label),
          y: data.map((item) => item.value),
          marker: { color: '#1976d2' },
        },
      ] as Data[]}
      layout={{
        title: {
          text:
            chartTab === 'caminhoes'
              ? 'Caminhões mais utilizados (últimos 30 dias)'
              : chartTab === 'km'
                ? 'Quilometragem por caminhão (últimos 30 dias)'
                : 'Registros por motorista (últimos 30 dias)',
        },
        xaxis: { title: { text: chartTab === 'motorista' ? 'Motorista' : 'Placa' } },
        yaxis: { title: { text: chartTab === 'km' ? 'KM' : 'Registros' } },
        autosize: true,
        bargap: 0.2,
        margin: { t: 60, r: 20, b: 60, l: 60 },
      } as Partial<Layout>}
      style={{ width: '100%', height: 500 }}
      useResizeHandler
    />
  );
}