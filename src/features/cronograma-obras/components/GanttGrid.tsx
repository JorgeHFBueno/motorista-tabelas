import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { type DragEvent, memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CalendarDisplayOptions } from './CalendarToggles';
import { TimelineHeader } from './TimelineHeader';
import { StatusBadge } from './StatusBadge';
import type { MestrePlanejado, MestreWorkload, ObraCronograma, ZoomCronograma } from '../domain/models';
import { countIntersection, monthDays, monthlyHeader, todayCivil, weeklyHeader, yearDays } from '../domain/temporal';
import { getDropPlanningStart } from '../domain/dropPlanning';
import { getMestreColor, normalizeMestreKey } from '../domain/mestres';
import { masterNameContent, mastersTooltip } from '../domain/calendarDisplay';
import { getBucketTimelineAggregate, getWeeklyTimeline, layoutOverlapLanes } from '../domain/timelineAggregation';
import { scrollTimelineToToday } from '../domain/timelineScroll';
import { plannedDaysInYear, yearBucket } from '../domain/calendarYears';

interface Props { view: 'obras' | 'mestres'; zoom: ZoomCronograma; years: number[]; obras: ObraCronograma[]; workloads: MestreWorkload[]; selectedId: string | null; draggingMaster: string | null; display: CalendarDisplayOptions; centerRequest: number; onSelect: (obra: ObraCronograma) => void; onDropMaster: (obra: ObraCronograma, nome: string, target: string) => void; }

const BUCKET_WIDTH: Record<Exclude<ZoomCronograma, 'year'>, number> = { day: 24, week: 44, month: 88 };
const colorStyle = (key: string): React.CSSProperties => ({ '--co-master-color': getMestreColor(key).background } as React.CSSProperties);
const uniqueMasters = (masters: readonly MestrePlanejado[]) => [...new Map(masters.map((mestre) => [mestre.nome, mestre])).values()];

function TemporalLayer({ obra, start, days, liveAlerts }: { obra: ObraCronograma; start: string; days: number; liveAlerts: boolean }) {
  const aggregate = useMemo(() => getBucketTimelineAggregate(obra, start, days, undefined, liveAlerts), [obra, start, days, liveAlerts]);
  if (!liveAlerts) return null;
  return <span className="co-temporal-layer" aria-label="Camada temporal da obra">{aggregate.states.map((segment) => <i key={`${segment.type}-${segment.offset}`} className={`co-temporal-segment is-${segment.type}`} style={{ left: `${segment.offset / days * 100}%`, width: `${segment.days / days * 100}%` }} />)}</span>;
}

function MasterStrips({ obra, bucketStart, bucketDays, showNames, zoom, bucketWidth }: { obra: ObraCronograma; bucketStart: string; bucketDays: number; showNames: boolean; zoom: ZoomCronograma; bucketWidth: number }) {
  const aggregate = useMemo(() => getBucketTimelineAggregate(obra, bucketStart, bucketDays), [obra, bucketStart, bucketDays]);
  const masters = uniqueMasters(aggregate.masters.map((segment) => segment.mestre));
  const tooltip = mastersTooltip(masters);
  const lanes = layoutOverlapLanes(aggregate.masters);
  return <span className={`co-master-strips co-master-strips--${zoom}`} aria-label={tooltip}>{aggregate.masters.map((segment, index) => {
    const width = bucketWidth * segment.days / bucketDays;
    const label = masterNameContent(segment.mestre.nome, showNames, width, masters.length, zoom);
    const lane = lanes[index];
    return <i key={`${segment.mestre.localId}-${segment.offset}-${index}`} className="co-master-strip" title={tooltip} style={{ ...colorStyle(segment.mestre.mestreKey ?? normalizeMestreKey(segment.mestre.nome)), left: `${segment.offset / bucketDays * 100}%`, width: `${segment.days / bucketDays * 100}%`, '--co-master-index': lane.index, '--co-master-count': lane.count } as React.CSSProperties}>{label && <span>{label}</span>}</i>;
  })}</span>;
}

function MonthSummary({ obra, start, days, display }: { obra: ObraCronograma; start: string; days: number; display: CalendarDisplayOptions }) {
  const aggregate = useMemo(() => getBucketTimelineAggregate(obra, start, days, undefined, display.liveAlerts), [obra, start, days, display.liveAlerts]);
  return <div className="co-month-summary">
    {display.liveAlerts && <span className="co-month-state" aria-label="Camada temporal da obra">{aggregate.states.map((segment) => <i key={`${segment.type}-${segment.offset}`} className={`is-${segment.type}`} style={{ left: `${segment.offset / days * 100}%`, width: `${segment.days / days * 100}%` }} />)}</span>}
    <strong>{display.liveAlerts && aggregate.plannedDays ? aggregate.plannedDays : ''}</strong>
    <MasterStrips obra={obra} bucketStart={start} bucketDays={days} showNames={display.masterNames} zoom="month" bucketWidth={BUCKET_WIDTH.month} />
  </div>;
}

function YearSummary({ obra, year, display }: { obra: ObraCronograma; year: number; display: CalendarDisplayOptions }) {
  const bucket = yearBucket(year);
  const plannedDays = plannedDaysInYear(obra, year);
  return <div className="co-year-summary">
    <TemporalLayer obra={obra} start={bucket.start} days={bucket.days} liveAlerts={display.liveAlerts} />
    {plannedDays > 0 && <strong className="co-year-planned-days" title={`${plannedDays} dias planejados em ${year}`}>{plannedDays}</strong>}
    <MasterStrips obra={obra} bucketStart={bucket.start} bucketDays={bucket.days} showNames={false} zoom="year" bucketWidth={0} />
  </div>;
}

function WeeklyLanes({ obra, week, display }: { obra: ObraCronograma; week: string; display: CalendarDisplayOptions }) {
  const timeline = useMemo(() => getWeeklyTimeline(obra, week, undefined, display.liveAlerts), [obra, week, display.liveAlerts]);
  const masters = uniqueMasters(timeline.masters.map((segment) => segment.mestre));
  const tooltip = mastersTooltip(masters);
  const weeklySegments = timeline.masters.map((item) => ({ ...item, offset: item.startDayIndex, days: item.dayCount }));
  const lanes = layoutOverlapLanes(weeklySegments);
  return <div className="co-week-lanes">
    {display.liveAlerts && <span className="co-week-temporal" aria-label="Camada temporal da obra">{timeline.states.map((segment) => <i key={`${segment.type}-${segment.startDayIndex}`} className={`is-${segment.type}`} style={{ left: `${segment.startDayIndex / 7 * 100}%`, width: `${segment.dayCount / 7 * 100}%` }} />)}</span>}
    <span className="co-week-space">{display.liveAlerts && timeline.plannedDays > 0 && timeline.plannedDays < 7 ? <b>{timeline.plannedDays}</b> : null}</span>
    <span className="co-week-masters" aria-label={tooltip}>{timeline.masters.map((segment, index) => {
      const label = masterNameContent(segment.mestre.nome, display.masterNames, BUCKET_WIDTH.week * segment.dayCount / 7, masters.length, 'week');
      const comparable = weeklySegments[index];
      const lane = lanes[index];
      return <i key={`${segment.mestre.localId}-${segment.startDayIndex}-${index}`} title={tooltip} style={{ ...colorStyle(segment.mestre.mestreKey ?? normalizeMestreKey(segment.mestre.nome)), left: `${comparable.offset / 7 * 100}%`, width: `${comparable.days / 7 * 100}%`, '--co-week-master-index': lane.index, '--co-week-master-count': lane.count } as React.CSSProperties}>{label && <span>{label}</span>}</i>;
    })}</span>
  </div>;
}

function ObraCells({ obra, zoom, years, draggingMaster, display, onDrop }: { obra: ObraCronograma; zoom: ZoomCronograma; years: number[]; draggingMaster: string | null; display: CalendarDisplayOptions; onDrop: (target: string) => void }) {
  const [over, setOver] = useState<string | null>(null);
  const calendarYear = Number(todayCivil().slice(0, 4));
  const validTarget = (target: string) => zoom !== 'year' && Boolean(getDropPlanningStart({ obra, zoom, targetDateOrPeriod: target }));
  const events = (target: string) => ({ onDragOver: (event: DragEvent) => { if (draggingMaster && validTarget(target)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }, onDragEnter: () => { if (draggingMaster && validTarget(target)) setOver(target); }, onDragLeave: () => setOver((current) => current === target ? null : current), onDrop: (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); setOver(null); if (draggingMaster && validTarget(target)) onDrop(target); } });
  const cell = (start: string, days: number, className: string) => { const valid = validTarget(start); return <div key={start} className={`${className} ${valid ? 'is-planned' : 'is-invalid-drop'} ${over === start ? 'is-drop-target' : ''}`} {...(valid ? events(start) : {})}><div className="co-cell-lanes"><TemporalLayer obra={obra} start={start} days={days} liveAlerts={display.liveAlerts} /><span className="co-cell-space" /><MasterStrips obra={obra} bucketStart={start} bucketDays={days} showNames={display.masterNames} zoom="day" bucketWidth={BUCKET_WIDTH.day} /></div></div>; };
  if (zoom === 'day') return <div className="co-day-cells">{yearDays(calendarYear).map((date) => cell(date, 1, 'co-day-cell'))}</div>;
  if (zoom === 'month') return <div className="co-month-cells">{monthlyHeader(calendarYear).map((month) => { const days = monthDays(month.start); const valid = validTarget(month.start); return <div key={month.start} className={`co-month-cell co-month-cell--summary ${valid ? 'is-planned' : 'is-invalid-drop'} ${over === month.start ? 'is-drop-target' : ''}`} {...(valid ? events(month.start) : {})}><MonthSummary obra={obra} start={month.start} days={days} display={display} /></div>; })}</div>;
  if (zoom === 'year') return <div className="co-year-cells">{years.map((year) => <div key={year} className={`co-year-cell ${year === calendarYear ? 'is-current-year' : ''}`}><YearSummary obra={obra} year={year} display={display} /></div>)}</div>;
  return <div className="co-week-cells">{weeklyHeader(calendarYear).map((week) => { const valid = validTarget(week); return <div key={week} className={`co-week-cell ${valid ? 'is-planned' : 'is-invalid-drop'} ${over === week ? 'is-drop-target' : ''}`} {...(valid ? events(week) : {})}><WeeklyLanes obra={obra} week={week} display={display} /></div>; })}</div>;
}

function MasterCells({ workload, zoom, years }: { workload: MestreWorkload; zoom: ZoomCronograma; years: number[] }) {
  const calendarYear = Number(todayCivil().slice(0, 4));
  const cells = zoom === 'day' ? workload.daily.map((item) => ({ days: item.obras.length, conflict: item.conflict })) : zoom === 'week' ? workload.weekly : zoom === 'year' ? years.map((year) => { const bucket = yearBucket(year); const days = workload.obras.reduce((sum, obra) => sum + obra.mestresPlanejados.filter((mestre) => mestre.nome === workload.mestre).reduce((total, mestre) => total + countIntersection(mestre.inicio, mestre.tempoPlanejado, bucket.start, bucket.days), 0), 0); return { days, conflict: false }; }) : monthlyHeader(calendarYear).map((month) => { const items = workload.daily.filter((item) => item.date.slice(0, 7) === month.start.slice(0, 7)); return { days: items.filter((item) => item.obras.length).length, conflict: items.some((item) => item.conflict) }; });
  const className = zoom === 'day' ? 'co-day-cells' : zoom === 'week' ? 'co-week-cells' : zoom === 'year' ? 'co-year-cells' : 'co-month-cells';
  const cellClass = zoom === 'day' ? 'co-day-cell' : zoom === 'week' ? 'co-week-cell' : zoom === 'year' ? 'co-year-cell' : 'co-month-cell';
  return <div className={className}>{cells.map((cell, index) => <div className={`${cellClass} co-resource-cell ${cell.conflict ? 'is-conflict' : ''}`} key={index}>{cell.days > 0 && <span className="co-resource-block" style={colorStyle(normalizeMestreKey(workload.mestre))} />}{cell.conflict && <WarningAmberRounded className="co-conflict-icon" />}</div>)}</div>;
}

export const GanttGrid = memo(function GanttGrid({ view, zoom, years, obras, workloads, selectedId, draggingMaster, display, centerRequest, onSelect, onDropMaster }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const container = scrollRef.current; if (!container || zoom === 'year') return; const frame = requestAnimationFrame(() => scrollTimelineToToday(container, { mode: zoom, today: todayCivil(), pastContextDays: 15 })); return () => cancelAnimationFrame(frame); }, [centerRequest, zoom]);
  const rows = view === 'obras' ? obras.length : workloads.length;
  const left = view === 'obras' ? <><span>Obra</span><span>Mestre inicial</span><span>Status</span><span>Emp.</span><span>Início</span><span>Dias</span></> : <><span>Mestre</span><span>Obras</span><span>Dias</span><span>Livres</span><span>Conflitos</span></>;
  const gridStyle = { '--row-count': rows, '--co-year-count': years.length } as React.CSSProperties;
  return <section className={`co-gantt co-gantt--${view} ${draggingMaster ? 'is-dragging-master' : ''}`} aria-label="Cronograma anual"><div className="co-gantt-scroll" ref={scrollRef}><div className={`co-gantt-grid co-gantt-grid--${zoom}`} style={gridStyle}><div className="co-left-header">{left}</div><TimelineHeader zoom={zoom} years={years} />{view === 'obras' ? obras.map((obra) => <button type="button" className={`co-grid-row ${selectedId === obra.id ? 'is-selected' : ''}`} key={obra.id} onClick={() => onSelect(obra)}><div className="co-left-row"><span className="co-work-name" title={obra.nomeObra}>{obra.nomeObra}</span><span>{obra.mestreInicial ?? <em>Sem mestre</em>}</span><span><StatusBadge status={obra.status} /></span><span>{obra.empresa}</span><span>{obra.inicioPlanejado}</span><span>{obra.tempoPlanejado}</span></div><ObraCells obra={obra} zoom={zoom} years={years} draggingMaster={draggingMaster} display={display} onDrop={(target) => onDropMaster(obra, draggingMaster!, target)} /></button>) : workloads.map((workload) => <div className="co-grid-row co-grid-row--resource" key={workload.mestre}><div className="co-left-row"><span className="co-master-name"><i className="co-master-swatch" style={colorStyle(normalizeMestreKey(workload.mestre))} />{workload.mestre}</span><span>{workload.obras.length}</span><span>{workload.diasProgramados}</span><span>{workload.freeDays} dias</span><span className={workload.conflictDays ? 'co-invalid-value' : ''}>{workload.conflictDays}</span></div><MasterCells workload={workload} zoom={zoom} years={years} /></div>)}</div></div>{!rows && <div className="co-empty">Nenhum resultado para os filtros selecionados.</div>}</section>;
});
