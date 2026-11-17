import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { MONTHS } from "../../cronograma-obras/domain/models";
import { formatDateShort, todayCivil, yearDays } from "../../cronograma-obras/domain/temporal";
import type { ZoomCronograma } from "../../cronograma-obras/domain/models";
import { feriadoEm, fimDeSemana } from "../../cronograma-logistica/domain/feriados";

/** /testes/mkiii: calendário do ano usado pelas grades QuadroGantt (Cronograma) e QuadroMestres (Mestres). */
const LARGURA_DIA = { day: 30, week: 12 } as const;
const DOW = ["D", "S", "T", "Q", "Q", "S", "S"];
const diaNum = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 864e5;
const diaDaSemana = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const semanaIso = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
};

export type Geometria = { inicio: string; dias: string[]; dw: number; indice: (d: string) => number };

/** Days of the current year, the day width for the zoom, the paint of the rows, and the scroll that opens near today. */
export function useCalendario(zoom: ZoomCronograma, centerRequest: number) {
  const hoje = todayCivil();
  const ano = Number(hoje.slice(0, 4));
  const dias = useMemo(() => yearDays(ano), [ano]);
  const dw = zoom === "day" ? LARGURA_DIA.day : LARGURA_DIA.week;
  const geo: Geometria = useMemo(() => ({ inicio: dias[0], dias, dw, indice: (d: string) => diaNum(d) - diaNum(dias[0]) }), [dias, dw]);
  const rolagem = useRef<HTMLDivElement>(null);
  const fundo = useMemo(() => fundoDoCalendario(dias, dw, zoom === "day", hoje), [dias, dw, zoom, hoje]);
  // Opens with today near the start of the calendar (and again on Dias/Semanas or "hoje").
  useEffect(() => {
    const el = rolagem.current;
    if (el) el.scrollLeft = Math.max(0, (geo.indice(hoje) - (zoom === "day" ? 7 : 21)) * dw);
  }, [zoom, centerRequest, dw, geo, hoje]);
  return { hoje, dias, dw, geo, rolagem, fundo, largura: dias.length * dw };
}

/** Months on top; days (with weekday, weekends, holidays and today) or ISO weeks below. */
export function CabecalhoCalendario({ geo, zoom, hoje }: { geo: Geometria; zoom: ZoomCronograma; hoje: string }) {
  const { dias, dw } = geo;
  const meses = useMemo(() => MONTHS.map((nome, m) => {
    const doMes = dias.filter((d) => Number(d.slice(5, 7)) === m + 1);
    return { nome, inicio: geo.indice(doMes[0]), dias: doMes.length };
  }), [dias, geo]);
  const segundas = useMemo(() => dias.map((d, i) => ({ d, i })).filter(({ d }) => diaDaSemana(d) === 1), [dias]);
  return (
    <div className="qg-cab-cal" style={{ width: dias.length * dw }}>
      <div className="qg-meses">{meses.map((mes) => <div key={mes.nome} style={{ left: mes.inicio * dw, width: mes.dias * dw }}>{mes.nome}</div>)}</div>
      {zoom === "day" ? (
        <div className="qg-dias">{dias.map((d, i) => { const feriado = feriadoEm(d); return <div key={d} title={feriado ?? undefined} className={`${d === hoje ? "is-hoje " : ""}${feriado ? "is-feriado " : ""}${fimDeSemana(d) ? "is-fds " : ""}${diaDaSemana(d) === 1 ? "is-segunda" : ""}`} style={{ left: i * dw, width: dw }}><b>{d.slice(8)}</b><small>{DOW[diaDaSemana(d)]}</small></div>; })}</div>
      ) : (
        <div className="qg-semanas">{segundas.map(({ d, i }) => <div key={d} className={geo.indice(hoje) >= i && geo.indice(hoje) < i + 7 ? "is-atual" : ""} style={{ left: i * dw, width: 7 * dw }} title={`Semana de ${formatDateShort(d)}`}>S{semanaIso(d)}</div>)}</div>
      )}
    </div>
  );
}

/** Calendar paint for the rows: alternating weeks, week and month lines, weekends, holidays and today. */
function fundoDoCalendario(dias: string[], dw: number, porDia: boolean, hoje: string): CSSProperties {
  const coluna = (i: number, largura: number, cor: string) => `linear-gradient(${cor}, ${cor}) ${i * dw}px 0 / ${largura}px 100% no-repeat`;
  const primeiraSegunda = dias.findIndex((d) => diaDaSemana(d) === 1);
  const camadas: string[] = [];
  const iHoje = dias.indexOf(hoje);
  if (iHoje >= 0) camadas.push(coluna(iHoje, dw, "var(--qg-hoje)"), coluna(iHoje, 2, "var(--qg-hoje-linha)"));
  dias.forEach((d, i) => { if (d.slice(8) === "01") camadas.push(coluna(i, 2, "var(--qg-linha-mes)")); });
  if (porDia) {
    dias.forEach((d, i) => { if (feriadoEm(d)) camadas.push(coluna(i, dw, "var(--qg-feriado)")); else if (fimDeSemana(d)) camadas.push(coluna(i, dw, "var(--qg-fds)")); });
    camadas.push(`repeating-linear-gradient(to right, transparent 0 ${dw - 1}px, var(--qg-linha-dia) ${dw - 1}px ${dw}px)`);
  }
  camadas.push(`repeating-linear-gradient(to right, var(--qg-linha-semana) 0 1px, transparent 1px ${7 * dw}px) ${primeiraSegunda * dw}px 0 / 100% 100% no-repeat`);
  camadas.push(`repeating-linear-gradient(to right, var(--qg-banda) 0 ${7 * dw}px, transparent ${7 * dw}px ${14 * dw}px) ${primeiraSegunda * dw}px 0 / 100% 100% no-repeat`);
  return { background: camadas.join(", "), backgroundColor: "var(--qg-calendario)" };
}
