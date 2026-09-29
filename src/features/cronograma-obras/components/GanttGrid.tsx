import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { type DragEvent, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CalendarDisplayOptions } from './CalendarToggles';
import { TimelineHeader } from './TimelineHeader';
import { StatusBadge } from './StatusBadge';
import type { MestrePlanejado, MestreWorkload, ObraCronograma, ZoomCronograma } from '../domain/models';
import { addDays, countIntersection, formatDateShort, monthDays, monthlyHeader, todayCivil, weeklyHeader, yearDays } from '../domain/temporal';
import { getDirectMasterDropInterval } from '../domain/dropPlanning';
import { resizeMasterPlanning, type MasterResizeEdge } from '../domain/masterResize';
import { getMestreColor, normalizeMestreKey } from '../domain/mestres';
import { masterNameContent, mastersTooltip } from '../domain/calendarDisplay';
import { getBucketTimelineAggregate, getWeeklyTimeline, layoutOverlapLanes } from '../domain/timelineAggregation';
import { scrollTimelineToToday } from '../domain/timelineScroll';
import { plannedDaysInYear, yearBucket } from '../domain/calendarYears';
import { clampObraColumnWidth, OBRA_COLUMN_WIDTH, obraGridColumns, obraGridWidth } from '../domain/obraGridColumns';
import { masterSelectionForPeriod, type MasterSelection, recentStartedMaster, startedMasterPeriods } from '../domain/masterPlanningDetails';

interface Props { view: 'obras' | 'mestres'; zoom: ZoomCronograma; years: number[]; obras: ObraCronograma[]; workloads: MestreWorkload[]; selectedId: string | null; draggingMaster: string | null; display: CalendarDisplayOptions; centerRequest: number; onSelect: (obra: ObraCronograma) => void; onSelectMasters: (obra: ObraCronograma) => void; onSelectMaster: (selection: MasterSelection) => void; onDropMaster: (obra: ObraCronograma, nome: string, target: string) => void; onResizeMaster: (obraId: string, mestre: MestrePlanejado) => void; }

const BUCKET_WIDTH: Record<Exclude<ZoomCronograma, 'year'>, number> = { day: 24, week: 44, month: 88 };
const colorStyle = (key: string): React.CSSProperties => ({ '--co-master-color': getMestreColor(key).background } as React.CSSProperties);
const uniqueMasters = (masters: readonly MestrePlanejado[]) => [...new Map(masters.map((mestre) => [mestre.nome, mestre])).values()];

function TemporalLayer({ obra, start, days, liveAlerts }: { obra: ObraCronograma; start: string; days: number; liveAlerts: boolean }) {
  const aggregate = useMemo(() => getBucketTimelineAggregate(obra, start, days, undefined, liveAlerts), [obra, start, days, liveAlerts]);
  if (!liveAlerts) return null;
  return <span className="co-temporal-layer" aria-label="Camada temporal da obra">{aggregate.states.map((segment) => <i key={`${segment.type}-${segment.offset}`} className={`co-temporal-segment is-${segment.type}`} style={{ left: `${segment.offset / days * 100}%`, width: `${segment.days / days * 100}%` }} />)}</span>;
}

function MasterStrips({ obra, bucketStart, bucketDays, showNames, zoom, bucketWidth, onResize, onSelectMaster }: { obra: ObraCronograma; bucketStart: string; bucketDays: number; showNames: boolean; zoom: ZoomCronograma; bucketWidth: number; onResize?: (mestre: MestrePlanejado, edge: MasterResizeEdge, event: React.PointerEvent<HTMLButtonElement>) => void; onSelectMaster?: (selection: MasterSelection) => void }) {
  const aggregate = useMemo(() => getBucketTimelineAggregate(obra, bucketStart, bucketDays), [obra, bucketStart, bucketDays]);
  const masters = uniqueMasters(aggregate.masters.map((segment) => segment.mestre));
  const tooltip = mastersTooltip(masters);
  const lanes = layoutOverlapLanes(aggregate.masters);
  return <span className={`co-master-strips co-master-strips--${zoom}`} aria-label={tooltip}>{aggregate.masters.map((segment, index) => {
    const width = bucketWidth * segment.days / bucketDays;
    const label = masterNameContent(segment.mestre.nome, showNames, width, masters.length, zoom);
    const lane = lanes[index];
    return <i key={`${segment.mestre.localId}-${segment.offset}-${index}`} className="co-master-strip" role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onSelectMaster?.(masterSelectionForPeriod(obra, segment.mestre)); }} title={`${segment.mestre.nome}\n${formatDateShort(segment.mestre.inicio)} → ${formatDateShort(addDays(segment.mestre.inicio, segment.mestre.tempoPlanejado - 1))}\n${segment.mestre.tempoPlanejado} dias`} style={{ ...colorStyle(segment.mestre.mestreKey ?? normalizeMestreKey(segment.mestre.nome)), left: `${segment.offset / bucketDays * 100}%`, width: `${segment.days / bucketDays * 100}%`, '--co-master-index': lane.index, '--co-master-count': lane.count } as React.CSSProperties}>{onResize && zoom !== 'year' && <><button type="button" className="co-master-resize-handle is-start" aria-label={`Ajustar início de ${segment.mestre.nome}`} onPointerDown={(event) => onResize(segment.mestre, 'start', event)} onClick={(event) => event.stopPropagation()} /><button type="button" className="co-master-resize-handle is-end" aria-label={`Ajustar fim de ${segment.mestre.nome}`} onPointerDown={(event) => onResize(segment.mestre, 'end', event)} onClick={(event) => event.stopPropagation()} /></>}{label && <span>{label}</span>}</i>;
  })}</span>;
}

function MonthSummary({ obra, start, days, display, onResize, onSelectMaster }: { obra: ObraCronograma; start: string; days: number; display: CalendarDisplayOptions; onResize: (mestre: MestrePlanejado, edge: MasterResizeEdge, event: React.PointerEvent<HTMLButtonElement>) => void; onSelectMaster: (selection: MasterSelection) => void }) {
  const aggregate = useMemo(() => getBucketTimelineAggregate(obra, start, days, undefined, display.liveAlerts), [obra, start, days, display.liveAlerts]);
  return <div className="co-month-summary">
    {display.liveAlerts && <span className="co-month-state" aria-label="Camada temporal da obra">{aggregate.states.map((segment) => <i key={`${segment.type}-${segment.offset}`} className={`is-${segment.type}`} style={{ left: `${segment.offset / days * 100}%`, width: `${segment.days / days * 100}%` }} />)}</span>}
    <strong>{display.liveAlerts && aggregate.plannedDays ? aggregate.plannedDays : ''}</strong>
    <MasterStrips obra={obra} bucketStart={start} bucketDays={days} showNames={display.masterNames} zoom="month" bucketWidth={BUCKET_WIDTH.month} onResize={onResize} onSelectMaster={onSelectMaster} />
  </div>;
}

function YearSummary({ obra, year, display, onSelectMaster }: { obra: ObraCronograma; year: number; display: CalendarDisplayOptions; onSelectMaster: (selection: MasterSelection) => void }) {
  const bucket = yearBucket(year);
  const plannedDays = plannedDaysInYear(obra, year);
  return <div className="co-year-summary">
    <TemporalLayer obra={obra} start={bucket.start} days={bucket.days} liveAlerts={display.liveAlerts} />
    {plannedDays > 0 && <strong className="co-year-planned-days" title={`${plannedDays} dias planejados em ${year}`}>{plannedDays}</strong>}
    <MasterStrips obra={obra} bucketStart={bucket.start} bucketDays={bucket.days} showNames={false} zoom="year" bucketWidth={0} onSelectMaster={onSelectMaster} />
  </div>;
}

function WeeklyLanes({ obra, week, display, onResize, onSelectMaster }: { obra: ObraCronograma; week: string; display: CalendarDisplayOptions; onResize?: (mestre: MestrePlanejado, edge: MasterResizeEdge, event: React.PointerEvent<HTMLButtonElement>) => void; onSelectMaster: (selection: MasterSelection) => void }) {
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
      return <i key={`${segment.mestre.localId}-${segment.startDayIndex}-${index}`} className="co-master-strip" role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onSelectMaster(masterSelectionForPeriod(obra, segment.mestre)); }} title={`${segment.mestre.nome}\n${segment.mestre.inicio} → ${addDays(segment.mestre.inicio, segment.mestre.tempoPlanejado - 1)}\n${segment.mestre.tempoPlanejado} dias`} style={{ ...colorStyle(segment.mestre.mestreKey ?? normalizeMestreKey(segment.mestre.nome)), left: `${comparable.offset / 7 * 100}%`, width: `${comparable.days / 7 * 100}%`, '--co-week-master-index': lane.index, '--co-week-master-count': lane.count } as React.CSSProperties}>{onResize && <><button type="button" className="co-master-resize-handle is-start" aria-label={`Ajustar início de ${segment.mestre.nome}`} onPointerDown={(event) => onResize(segment.mestre, 'start', event)} onClick={(event) => event.stopPropagation()} /><button type="button" className="co-master-resize-handle is-end" aria-label={`Ajustar fim de ${segment.mestre.nome}`} onPointerDown={(event) => onResize(segment.mestre, 'end', event)} onClick={(event) => event.stopPropagation()} /></>}{label && <span>{label}</span>}</i>;
    })}</span>
  </div>;
}

function ObraCells({ obra, zoom, years, draggingMaster, display, onDrop, onResize, onSelectMaster }: { obra: ObraCronograma; zoom: ZoomCronograma; years: number[]; draggingMaster: string | null; display: CalendarDisplayOptions; onDrop: (target: string) => void; onResize: (mestre: MestrePlanejado, edge: MasterResizeEdge, event: React.PointerEvent<HTMLButtonElement>) => void; onSelectMaster: (selection: MasterSelection) => void }) {
  const [over, setOver] = useState<string | null>(null);
  const calendarYear = Number(todayCivil().slice(0, 4));
  const validTarget = (target: string) => zoom !== 'year' && Boolean(getDirectMasterDropInterval({ obra, targetDate: target, hoje: todayCivil() }));
  const events = (target: string) => ({ onDragOver: (event: DragEvent) => { if (draggingMaster && validTarget(target)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }, onDragEnter: () => { if (draggingMaster && validTarget(target)) setOver(target); }, onDragLeave: () => setOver((current) => current === target ? null : current), onDrop: (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); setOver(null); if (draggingMaster && validTarget(target)) onDrop(target); } });
  const cell = (start: string, days: number, className: string) => { const valid = validTarget(start); return <div key={start} data-co-bucket-start={start} data-co-bucket-days={days} className={`${className} co-calendar-cell ${valid ? 'is-planned' : 'is-invalid-drop'} ${over === start ? 'is-drop-target' : ''}`} {...(valid ? events(start) : {})}><div className="co-cell-lanes"><TemporalLayer obra={obra} start={start} days={days} liveAlerts={display.liveAlerts} /><span className="co-cell-space" /><MasterStrips obra={obra} bucketStart={start} bucketDays={days} showNames={display.masterNames} zoom="day" bucketWidth={BUCKET_WIDTH.day} onResize={onResize} onSelectMaster={onSelectMaster} /></div></div>; };
  if (zoom === 'day') return <div className="co-day-cells">{yearDays(calendarYear).map((date) => cell(date, 1, 'co-day-cell'))}</div>;
  if (zoom === 'month') return <div className="co-month-cells">{monthlyHeader(calendarYear).map((month) => { const days = monthDays(month.start); const valid = validTarget(month.start); return <div key={month.start} data-co-bucket-start={month.start} data-co-bucket-days={days} className={`co-month-cell co-calendar-cell co-month-cell--summary ${valid ? 'is-planned' : 'is-invalid-drop'} ${over === month.start ? 'is-drop-target' : ''}`} {...(valid ? events(month.start) : {})}><MonthSummary obra={obra} start={month.start} days={days} display={display} onResize={onResize} onSelectMaster={onSelectMaster} /></div>; })}</div>;
  if (zoom === 'year') return <div className="co-year-cells">{years.map((year) => <div key={year} className={`co-year-cell ${year === calendarYear ? 'is-current-year' : ''}`}><YearSummary obra={obra} year={year} display={display} onSelectMaster={onSelectMaster} /></div>)}</div>;
  return <div className="co-week-cells">{weeklyHeader(calendarYear).map((week) => { const valid = validTarget(week); return <div key={week} data-co-bucket-start={week} data-co-bucket-days="7" className={`co-week-cell co-calendar-cell ${valid ? 'is-planned' : 'is-invalid-drop'} ${over === week ? 'is-drop-target' : ''}`} {...(valid ? events(week) : {})}><WeeklyLanes obra={obra} week={week} display={display} onResize={onResize} onSelectMaster={onSelectMaster} /></div>; })}</div>;
}

function MasterCells({ workload, zoom, years }: { workload: MestreWorkload; zoom: ZoomCronograma; years: number[] }) {
  const calendarYear = Number(todayCivil().slice(0, 4));
  const cells = zoom === 'day' ? workload.daily.map((item) => ({ days: item.obras.length, conflict: item.conflict })) : zoom === 'week' ? workload.weekly : zoom === 'year' ? years.map((year) => { const bucket = yearBucket(year); const days = workload.obras.reduce((sum, obra) => sum + obra.mestresPlanejados.filter((mestre) => mestre.nome === workload.mestre).reduce((total, mestre) => total + countIntersection(mestre.inicio, mestre.tempoPlanejado, bucket.start, bucket.days), 0), 0); return { days, conflict: false }; }) : monthlyHeader(calendarYear).map((month) => { const items = workload.daily.filter((item) => item.date.slice(0, 7) === month.start.slice(0, 7)); return { days: items.filter((item) => item.obras.length).length, conflict: items.some((item) => item.conflict) }; });
  const className = zoom === 'day' ? 'co-day-cells' : zoom === 'week' ? 'co-week-cells' : zoom === 'year' ? 'co-year-cells' : 'co-month-cells';
  const cellClass = zoom === 'day' ? 'co-day-cell' : zoom === 'week' ? 'co-week-cell' : zoom === 'year' ? 'co-year-cell' : 'co-month-cell';
  return <div className={className}>{cells.map((cell, index) => <div className={`${cellClass} co-resource-cell ${cell.conflict ? 'is-conflict' : ''}`} key={index}>{cell.days > 0 && <span className="co-resource-block" style={colorStyle(normalizeMestreKey(workload.mestre))} />}{cell.conflict && <WarningAmberRounded className="co-conflict-icon" />}</div>)}</div>;
}

export const GanttGrid = memo(function GanttGrid({ view, zoom, years, obras, workloads, selectedId, draggingMaster, display, centerRequest, onSelect, onSelectMasters, onSelectMaster, onDropMaster, onResizeMaster }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [obraColumnWidth, setObraColumnWidth] = useState(OBRA_COLUMN_WIDTH.default);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [resizingMasterId, setResizingMasterId] = useState<string | null>(null);
  useEffect(() => () => resizeCleanupRef.current?.(), []);
  useLayoutEffect(() => { const container = scrollRef.current; if (!container || zoom === 'year') return; const frame = requestAnimationFrame(() => scrollTimelineToToday(container, { mode: zoom, today: todayCivil(), pastContextDays: 15 })); return () => cancelAnimationFrame(frame); }, [centerRequest, zoom]);
  const startObraResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation(); resizeCleanupRef.current?.();
    const pointerId = event.pointerId; const handle = event.currentTarget; const startX = event.clientX; const startWidth = obraColumnWidth;
    const move = (moveEvent: PointerEvent) => { if (moveEvent.pointerId === pointerId) setObraColumnWidth(clampObraColumnWidth(startWidth + moveEvent.clientX - startX)); };
    const cleanup = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end); document.body.classList.remove('co-is-resizing'); if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId); resizeCleanupRef.current = null; };
    const end = (endEvent: PointerEvent) => { if (endEvent.pointerId === pointerId) cleanup(); };
    handle.setPointerCapture(pointerId); document.body.classList.add('co-is-resizing'); document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end); resizeCleanupRef.current = cleanup;
  };
  const dateAtPointer = (clientX: number, clientY: number): string | null => {
    const cell = document.elementsFromPoint(clientX, clientY).find((element): element is HTMLElement => element instanceof HTMLElement && Boolean(element.dataset.coBucketStart));
    if (!cell) return null;
    const start = cell.dataset.coBucketStart; const days = Number(cell.dataset.coBucketDays); const rect = cell.getBoundingClientRect();
    if (!start || !days || !rect.width) return null;
    return addDays(start, Math.min(days - 1, Math.max(0, Math.floor((clientX - rect.left) / rect.width * days))));
  };
  const startMasterResize = (obra: ObraCronograma, mestre: MestrePlanejado, edge: MasterResizeEdge, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation(); resizeCleanupRef.current?.();
    const pointerId = event.pointerId; const handle = event.currentTarget;
    const move = (moveEvent: PointerEvent) => { if (moveEvent.pointerId !== pointerId) return; const date = dateAtPointer(moveEvent.clientX, moveEvent.clientY); if (date) onResizeMaster(obra.id, resizeMasterPlanning(obra, mestre, edge, date)); };
    const cleanup = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end); document.body.classList.remove('co-is-resizing'); if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId); setResizingMasterId(null); resizeCleanupRef.current = null; };
    const end = (endEvent: PointerEvent) => { if (endEvent.pointerId === pointerId) cleanup(); };
    handle.setPointerCapture(pointerId); setResizingMasterId(mestre.localId); document.body.classList.add('co-is-resizing'); document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end); resizeCleanupRef.current = cleanup;
  };
  const rows = view === 'obras' ? obras.length : workloads.length;
  const left = view === 'obras' ? <><span>Obra<button type="button" className="co-obra-resize-handle" aria-label="Redimensionar coluna Obra" onPointerDown={startObraResize} /></span><span>Contrato</span><span>Mestres</span><span>Status</span>{detailsVisible && <><span>Emp.</span><span>Início</span><span>Dias</span></>}<button type="button" className="co-columns-toggle" aria-label={detailsVisible ? 'Ocultar colunas complementares' : 'Mostrar colunas complementares'} title={detailsVisible ? 'Ocultar Emp., Início e Dias' : 'Mostrar Emp., Início e Dias'} onClick={() => setDetailsVisible((visible) => !visible)}>{detailsVisible ? '›' : '‹'}</button></> : <><span>Mestre</span><span>Obras</span><span>Dias</span><span>Livres</span><span>Conflitos</span></>;
  const gridStyle = { '--row-count': rows, '--co-year-count': years.length, ...(view === 'obras' ? { '--co-left-columns': obraGridColumns(obraColumnWidth, detailsVisible), '--co-left-width': `${obraGridWidth(obraColumnWidth, detailsVisible)}px` } : {}) } as React.CSSProperties;
  return <section className={`co-gantt co-gantt--${view} ${draggingMaster ? 'is-dragging-master' : ''} ${resizingMasterId ? 'is-resizing-master' : ''}`} aria-label="Cronograma anual"><div className="co-gantt-scroll" ref={scrollRef}><div className={`co-gantt-grid co-gantt-grid--${zoom}`} style={gridStyle}><div className="co-left-header">{left}</div><TimelineHeader zoom={zoom} years={years} />{view === 'obras' ? obras.map((obra) => { const active = startedMasterPeriods(obra, todayCivil()); const recent = recentStartedMaster(obra, todayCivil()); const visible = detailsVisible ? active : recent ? [recent] : []; return <button type="button" className={`co-grid-row ${selectedId === obra.id ? 'is-selected' : ''}`} key={obra.id} onClick={() => onSelect(obra)}><div className="co-left-row"><span className="co-work-name" title={obra.nomeObra}>{obra.nomeObra}</span><span title={obra.contratoNome ?? ''}>{obra.contratoNome ?? 'Não informado'}</span><span className="co-masters-cell" onClick={(event) => { event.stopPropagation(); onSelectMasters(obra); }}>{visible.length ? visible.map((group) => <i className="co-master-name-chip" key={group.key} style={colorStyle(group.key)}>{group.nome}</i>) : <em>Sem mestre</em>}</span><span><StatusBadge status={obra.status} /></span>{detailsVisible && <><span>{obra.empresa}</span><span>{formatDateShort(obra.inicioPlanejado)}</span><span>{obra.tempoPlanejado}</span></>}<span aria-hidden="true" /></div><ObraCells obra={obra} zoom={zoom} years={years} draggingMaster={draggingMaster} display={display} onDrop={(target) => onDropMaster(obra, draggingMaster!, target)} onResize={(mestre, edge, event) => startMasterResize(obra, mestre, edge, event)} onSelectMaster={onSelectMaster} /></button>; }) : workloads.map((workload) => <div className="co-grid-row co-grid-row--resource" key={workload.mestre}><div className="co-left-row"><span className="co-master-name"><i className="co-master-swatch" style={colorStyle(normalizeMestreKey(workload.mestre))} />{workload.mestre}</span><span>{workload.obras.length}</span><span>{workload.diasProgramados}</span><span>{workload.freeDays} dias</span><span className={workload.conflictDays ? 'co-invalid-value' : ''}>{workload.conflictDays}</span></div><MasterCells workload={workload} zoom={zoom} years={years} /></div>)}</div></div>{!rows && <div className="co-empty">Nenhum resultado para os filtros selecionados.</div>}</section>;
});
