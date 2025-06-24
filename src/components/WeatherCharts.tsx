import Plot from 'react-plotly.js';
import type { Data, Layout } from 'plotly.js';
import { useMemo } from 'react';

/* mesmo tipo usado no PortifolioPage -------------------------- */
export interface WeatherRow {
  id: number;
  date: string;   // yyyy-MM-dd
  tempMax: number;
  tempMin: number;
  precip: number;
}

interface Props {
  rows: WeatherRow[];
}

/* ============================================================ */
export default function WeatherCharts({ rows }: Props) {
  /* ────────── prepara dados ────────── */
  const { lineData, boxData } = useMemo(() => {
    /* série temporal -------------------------------------------------- */
    const dates = rows.map(r => r.date);

    const lineData: Partial<Data>[] = [
      {
        x: dates,
        y: rows.map(r => r.tempMax),
        type: 'scatter' as const,
        mode: 'lines',
        name: 'Temp Máx (°C)',
      },
      {
        x: dates,
        y: rows.map(r => r.tempMin),
        type: 'scatter' as const,
        mode: 'lines',
        name: 'Temp Mín (°C)',
      },
      {
        x: dates,
        y: rows.map(r => r.precip),
        type: 'scatter' as const,
        mode: 'lines',
        name: 'Precipitação (mm)',
      },
    ];

    /* boxplots --------------------------------------------------------- */
    type BoxAcc = Record<string, number[]>;
    const acc: { tempMax: BoxAcc; tempMin: BoxAcc; precip: BoxAcc } = {
      tempMax: {},
      tempMin: {},
      precip: {},
    };

    rows.forEach(r => {
      const m = r.date.slice(0, 7); // yyyy-MM
      (acc.tempMax[m] ??= []).push(r.tempMax);
      (acc.tempMin[m] ??= []).push(r.tempMin);
      (acc.precip[m] ??= []).push(r.precip);
    });

    const months = Object.keys(acc.tempMax).sort();

    const makeBox = (label: string, src: BoxAcc): Partial<Data> => ({
      type: 'box' as const,
      name: label,
      boxpoints: false,
      x: months.flatMap(m => Array(src[m].length).fill(m)),
      y: months.flatMap(m => src[m]),
    });

    const boxData: Partial<Data>[] = [
      makeBox('Temp Máx (°C)', acc.tempMax),
      makeBox('Temp Mín (°C)', acc.tempMin),
      makeBox('Precipitação (mm)', acc.precip),
    ];

    return { lineData, boxData };
  }, [rows]);

  if (!rows.length) return null;

  /* ────────── layouts ────────── */
  const lineLayout: Partial<Layout> = {
    title: { text: 'Série temporal das variáveis meteorológicas' },
    xaxis: { title: { text: 'Data' } },
    yaxis: { title: { text: 'Valor' } },
    legend: { orientation: 'h' },
    autosize: true,
  };

  const boxLayout: Partial<Layout> = {
    title: { text: 'Distribuição mensal (Boxplot)' },
    boxmode: 'group' as const,
    yaxis: { title: { text: 'Valor' } },
    autosize: true,
  };

  /* ────────── render ────────── */
  return (
    <>
      <Plot
        data={lineData as Data[]}
        layout={lineLayout}
        style={{ width: '100%', height: 500 }}
        useResizeHandler
      />

      <Plot
        data={boxData as Data[]}
        layout={boxLayout}
        style={{ width: '100%', height: 500 }}
        useResizeHandler
      />
    </>
  );
}
