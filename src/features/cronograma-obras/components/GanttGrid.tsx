import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import {
  type DragEvent,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CalendarDisplayOptions } from "./CalendarToggles";
import { TimelineHeader } from "./TimelineHeader";
import { StatusBadge } from "./StatusBadge";
import { MondaySubitemStatusControl } from "./MondaySubitemStatusControl";
import { ContractAnalysisRequest } from "./ContractAnalysisRequest";
import { ContractRowControls } from "./ContractRowControls";
import type { MondaySubitemStatus } from "../../../services/mondaySubitemStatusService";
import type {
  ContratoCronograma,
  MestrePlanejado,
  MestreWorkload,
  ObraCronograma,
  ZoomCronograma,
} from "../domain/models";
import {
  addDays,
  countIntersection,
  dailyHeader,
  formatDateShort,
  inclusiveCivilDays,
  monthDays,
  monthlyHeader,
  todayCivil,
  weeklyTimelineCells,
} from "../domain/temporal";
import { getDirectMasterDropInterval } from "../domain/dropPlanning";
import { requiresContractReview } from "../data/source/rawCronogramaAdapter";
import {
  resizeMasterPlanning,
  type MasterResizeEdge,
} from "../domain/masterResize";
import { getMestreColor, normalizeMestreKey } from "../domain/mestres";
import { masterNameContent, mastersTooltip } from "../domain/calendarDisplay";
import {
  getBucketTimelineAggregate,
  layoutMasterAllocationLanes,
  layoutOverlapLanes,
  type MasterAllocationLane,
} from "../domain/timelineAggregation";
import {
  scrollTimelineToDate,
  scrollTimelineToToday,
} from "../domain/timelineScroll";
import { clientXToCalendarDay, clientXToTimelineBucket } from "../domain/timelineGeometry";
import { plannedDaysInYear, yearBucket } from "../domain/calendarYears";
import {
  clampColumnWidth,
  OBRA_COLUMN_WIDTH,
  notStartedPanelLayout,
  obraPanelLayout,
  RESIZABLE_COLUMNS,
  type ObraPanelColumn,
} from "../domain/obraGridColumns";
import {
  masterSelectionForPeriod,
  aggregateMastersWithRealPeriods,
  mastersWithRealPeriods,
  type MasterSelection,
  recentStartedMaster,
} from "../domain/masterPlanningDetails";
import {
  buildFlatWorkGroupsByWorkType,
  contractAllocationSummary,
  groupContractGroupsByWorkType,
  groupObrasByContract,
  reconcileContractGroups,
  type ContractGroup,
} from "../domain/contractGroups";
import { nextTableSort, sortContractGroups, sortObras, type TableSort } from "../domain/tableSort";
import {
  countCronogramaRender,
  measureCronogramaCompute,
} from "../debug/cronogramaPerf";

interface Props {
  view: "obras" | "mestres";
  viewMode?: "contracts" | "flat";
  variant?: "started" | "not-started";
  zoom: ZoomCronograma;
  years: number[];
  obras: ObraCronograma[];
  contratos: ReadonlyMap<string, ContratoCronograma>;
  workloads: MestreWorkload[];
  selectedId: string | null;
  draggingMaster: string | null;
  display: CalendarDisplayOptions;
  centerRequest: number;
  focusDate: string | null;
  onSelect: (obra: ObraCronograma) => void;
  onSelectMasters: (obra: ObraCronograma) => void;
  onSelectMaster: (selection: MasterSelection) => void;
  onOpenContract: (contrato: ContratoCronograma) => void;
  onDropMaster: (obra: ObraCronograma, nome: string, target: string) => void;
  onResizeMasterPreview: (mestre: MestrePlanejado) => void;
  onResizeMasterCommit: (obraId: string, mestre: MestrePlanejado) => void;
  onResizeMasterCancel: (id: string) => void;
  onFocusDate: (date: string) => void;
  onStatusConfirmed?: (mondaySubitemId: string, status: MondaySubitemStatus) => void;
  /** Allows the initial contract expansion state to be supplied by an embedding view. */
  initialExpandedContractIds?: readonly string[];
}

const BUCKET_WIDTH: Record<Exclude<ZoomCronograma, "year">, number> = {
  day: 24,
  week: 44,
  month: 88,
};
const DAY_GRID_LINE = "#dfe8ec";
const WEEK_GRID_LINE = "#b7c8d1";
const displayRawValue = (value: unknown): string => {
  if (value === null || value === undefined) return "â€”";
  if (typeof value === "string") return value.trim() || "â€”";
  if (["number", "boolean", "bigint"].includes(typeof value)) return String(value);
  if (typeof value === "object") {
    const normalized = value as { label?: unknown; name?: unknown; text?: unknown; value?: unknown };
    return displayRawValue(normalized.label ?? normalized.name ?? normalized.text ?? normalized.value);
  }
  return "â€”";
};
const MONTH_GRID_LINE = "#8ca6b6";
const colorStyle = (key: string): React.CSSProperties =>
  ({
    "--co-master-color": getMestreColor(key).background,
  }) as React.CSSProperties;
const uniqueMasters = (masters: readonly MestrePlanejado[]) => [
  ...new Map(masters.map((mestre) => [mestre.nome, mestre])).values(),
];

function useLatestCallback<T extends (...args: any[]) => any>(callback: T): T {
  const latest = useRef(callback);
  latest.current = callback;
  return useMemo(
    () => ((...args: Parameters<T>) => latest.current(...args)) as T,
    [],
  );
}

function TemporalLayer({
  obra,
  start,
  days,
}: {
  obra: ObraCronograma;
  start: string;
  days: number;
}) {
  const aggregate = useMemo(
    () => getBucketTimelineAggregate(obra, start, days),
    [obra, start, days],
  );
  return (
    <span className="co-temporal-layer" aria-label="Camada temporal da obra">
      {aggregate.states.map((segment) => (
        <i
          key={`${segment.type}-${segment.offset}`}
          className={`co-temporal-segment is-${segment.type}`}
          style={{
            left: `${(segment.offset / days) * 100}%`,
            width: `${(segment.days / days) * 100}%`,
          }}
        />
      ))}
    </span>
  );
}

function MasterStrips({
  obra,
  bucketStart,
  bucketDays,
  showNames,
  liveAlerts,
  zoom,
  bucketWidth,
  masterLanes,
  onResize,
  onSelectMaster,
}: {
  obra: ObraCronograma;
  bucketStart: string;
  bucketDays: number;
  showNames: boolean;
  liveAlerts: boolean;
  zoom: ZoomCronograma;
  bucketWidth: number;
  masterLanes?: ReadonlyMap<MestrePlanejado, MasterAllocationLane>;
  onResize?: (
    mestre: MestrePlanejado,
    edge: MasterResizeEdge,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  onSelectMaster?: (selection: MasterSelection) => void;
}) {
  const aggregate = useMemo(
    () => getBucketTimelineAggregate(obra, bucketStart, bucketDays),
    [obra, bucketStart, bucketDays],
  );
  const masters = uniqueMasters(
    aggregate.masters.map((segment) => segment.mestre),
  );
  const tooltip = mastersTooltip(masters);
  const lanes = layoutOverlapLanes(aggregate.masters);
  return (
    <span
      className={`co-master-strips co-master-strips--${zoom} ${liveAlerts ? "co-master-strips--alert-on" : "co-master-strips--alert-off"}`}
      aria-label={tooltip}
    >
      {aggregate.masters.map((segment, index) => {
        const width = (bucketWidth * segment.days) / bucketDays;
        const label = masterNameContent(
          segment.mestre.nome,
          showNames,
          width,
          masters.length,
          zoom,
        );
        const lane = masterLanes?.get(segment.mestre) ?? lanes[index];
        return (
          <i
            key={`${segment.mestre.localId}-${segment.offset}-${index}`}
            className="co-master-strip"
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onSelectMaster?.(masterSelectionForPeriod(obra, segment.mestre));
            }}
            title={`${segment.mestre.nome}\n${formatDateShort(segment.mestre.inicio)} → ${formatDateShort(addDays(segment.mestre.inicio, segment.mestre.tempoPlanejado - 1))}\n${segment.mestre.tempoPlanejado} dias`}
            style={
              {
                ...colorStyle(
                  segment.mestre.mestreKey ??
                    normalizeMestreKey(segment.mestre.nome),
                ),
                left: `${(segment.offset / bucketDays) * 100}%`,
                width: `${(segment.days / bucketDays) * 100}%`,
                ...(liveAlerts
                  ? {
                      "--co-master-index": lane.index,
                      "--co-master-count": lane.count,
                    }
                  : {}),
              } as React.CSSProperties
            }
          >
            {onResize && zoom !== "year" && (
              <>
                <button
                  type="button"
                  className="co-master-resize-handle is-start"
                  aria-label={`Ajustar início de ${segment.mestre.nome}`}
                  onPointerDown={(event) =>
                    onResize(segment.mestre, "start", event)
                  }
                  onClick={(event) => event.stopPropagation()}
                />
                <button
                  type="button"
                  className="co-master-resize-handle is-end"
                  aria-label={`Ajustar fim de ${segment.mestre.nome}`}
                  onPointerDown={(event) =>
                    onResize(segment.mestre, "end", event)
                  }
                  onClick={(event) => event.stopPropagation()}
                />
              </>
            )}
            {label && <span className="co-master-strip-label">{label}</span>}
          </i>
        );
      })}
    </span>
  );
}

function MonthSummary({
  obra,
  start,
  days,
  display,
  masterLanes,
  onResize,
  onSelectMaster,
}: {
  obra: ObraCronograma;
  start: string;
  days: number;
  display: CalendarDisplayOptions;
  masterLanes?: ReadonlyMap<MestrePlanejado, MasterAllocationLane>;
  onResize: (
    mestre: MestrePlanejado,
    edge: MasterResizeEdge,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  onSelectMaster: (selection: MasterSelection) => void;
}) {
  const aggregate = useMemo(
    () => getBucketTimelineAggregate(obra, start, days),
    [obra, start, days],
  );
  return (
    <div
      className={`co-month-summary ${display.liveAlerts ? "co-month-summary--alert-on" : "co-month-summary--alert-off"}`}
    >
      <span className="co-month-state" aria-label="Camada temporal da obra">
        {aggregate.states.map((segment) => (
          <i
            key={`${segment.type}-${segment.offset}`}
            className={`is-${segment.type}`}
            style={{
              left: `${(segment.offset / days) * 100}%`,
              width: `${(segment.days / days) * 100}%`,
            }}
          />
        ))}
      </span>
      <strong>{aggregate.plannedDays || ""}</strong>
      <MasterStrips
        obra={obra}
        bucketStart={start}
        bucketDays={days}
        showNames={display.masterNames}
        liveAlerts={display.liveAlerts}
        zoom="month"
        bucketWidth={BUCKET_WIDTH.month}
        masterLanes={masterLanes}
        onResize={onResize}
        onSelectMaster={onSelectMaster}
      />
    </div>
  );
}

function YearSummary({
  obra,
  year,
  display,
  masterLanes,
  onSelectMaster,
}: {
  obra: ObraCronograma;
  year: number;
  display: CalendarDisplayOptions;
  masterLanes?: ReadonlyMap<MestrePlanejado, MasterAllocationLane>;
  onSelectMaster: (selection: MasterSelection) => void;
}) {
  const bucket = yearBucket(year);
  const plannedDays = plannedDaysInYear(obra, year);
  return (
    <div
      className={`co-year-summary ${display.liveAlerts ? "co-year-summary--alert-on" : "co-year-summary--alert-off"}`}
    >
      <TemporalLayer obra={obra} start={bucket.start} days={bucket.days} />
      {plannedDays > 0 && (
        <strong
          className="co-year-planned-days"
          title={`${plannedDays} dias planejados em ${year}`}
        >
          {plannedDays}
        </strong>
      )}
      <MasterStrips
        obra={obra}
        bucketStart={bucket.start}
        bucketDays={bucket.days}
        showNames={false}
        liveAlerts={display.liveAlerts}
        zoom="year"
        bucketWidth={0}
        masterLanes={masterLanes}
        onSelectMaster={onSelectMaster}
      />
    </div>
  );
}

/**
 * The daily body grid is paint-only.  Keeping its separators in a background
 * avoids creating 365 drop zones (and their nested lanes) for every row.
 */
function dailyGridStyle(
  days: ReturnType<typeof dailyHeader>,
  dropIndex: number | null,
): React.CSSProperties {
  const boundary = (index: number, color: string, width: number) =>
    `linear-gradient(to right, ${color}, ${color}) ${index * BUCKET_WIDTH.day}px 0 / ${width}px 100% no-repeat`;
  return {
    "--co-day-grid": [
      `repeating-linear-gradient(to right, transparent 0, transparent calc(var(--co-day-width) - 1px), ${DAY_GRID_LINE} calc(var(--co-day-width) - 1px), ${DAY_GRID_LINE} var(--co-day-width))`,
      ...days
        .map((day, index) => (day.isWeekStart ? boundary(index, WEEK_GRID_LINE, 2) : null))
        .filter(Boolean),
      ...days
        .map((day, index) => (day.isMonthStart ? boundary(index, MONTH_GRID_LINE, 3) : null))
        .filter(Boolean),
    ].join(", "),
    ...(dropIndex === null
      ? {}
      : { "--co-day-drop-left": `${dropIndex * BUCKET_WIDTH.day}px` }),
  } as React.CSSProperties;
}

/** Weekly equivalent of the paint-only daily grid. */
function weeklyGridStyle(
  weeks: ReturnType<typeof weeklyTimelineCells>,
  dropIndex: number | null,
): React.CSSProperties {
  const boundary = (index: number, color: string, width: number) =>
    `linear-gradient(to right, ${color}, ${color}) ${index * BUCKET_WIDTH.week}px 0 / ${width}px 100% no-repeat`;
  return {
    "--co-week-grid": [
      `repeating-linear-gradient(to right, transparent 0, transparent calc(var(--co-week-width) - 1px), ${DAY_GRID_LINE} calc(var(--co-week-width) - 1px), ${DAY_GRID_LINE} var(--co-week-width))`,
      ...weeks
        .map((week, index) => (week.isMonthStart ? boundary(index, MONTH_GRID_LINE, 3) : null))
        .filter(Boolean),
    ].join(", "),
    ...(dropIndex === null ? {} : { "--co-week-drop-left": `${dropIndex * BUCKET_WIDTH.week}px` }),
  } as React.CSSProperties;
}

const ObraCells = memo(function ObraCells({
  obra,
  zoom,
  years,
  draggingMaster,
  display,
  masterLanes,
  onDropMaster,
  onResizeMaster,
  onSelectMaster,
}: {
  obra: ObraCronograma;
  zoom: ZoomCronograma;
  years: number[];
  draggingMaster: string | null;
  display: CalendarDisplayOptions;
  masterLanes?: ReadonlyMap<MestrePlanejado, MasterAllocationLane>;
  onDropMaster: (obra: ObraCronograma, target: string) => void;
  onResizeMaster?: (
    obra: ObraCronograma,
    mestre: MestrePlanejado,
    edge: MasterResizeEdge,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  onSelectMaster?: (selection: MasterSelection) => void;
}) {
  const [over, setOver] = useState<string | null>(null);
  const calendarYear = Number(todayCivil().slice(0, 4));
  const days = dailyHeader(calendarYear);
  const weeks = weeklyTimelineCells(calendarYear);
  const validTarget = (target: string) =>
    zoom !== "year" &&
    Boolean(
      getDirectMasterDropInterval({
        obra,
        targetDate: target,
        hoje: todayCivil(),
      }),
    );
  const events = (target: string) => ({
    onDragOver: (event: DragEvent) => {
      if (draggingMaster && validTarget(target)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    },
    onDragEnter: () => {
      if (draggingMaster && validTarget(target)) setOver(target);
    },
    onDragLeave: () =>
      setOver((current) => (current === target ? null : current)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setOver(null);
      if (draggingMaster && validTarget(target)) onDropMaster(obra, target);
    },
  });
  const resize = onResizeMaster
    ? (
        mestre: MestrePlanejado,
        edge: MasterResizeEdge,
        event: React.PointerEvent<HTMLButtonElement>,
      ) => onResizeMaster(obra, mestre, edge, event)
    : undefined;
  const dayTarget = (event: DragEvent) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return clientXToCalendarDay({ clientX: event.clientX, start: days[0].date, days: days.length, left: bounds.left, width: bounds.width });
  };
  const dayEvents = {
    onDragOver: (event: DragEvent) => {
      const target = dayTarget(event);
      if (target && draggingMaster && validTarget(target)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOver(target);
      }
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const target = dayTarget(event);
      setOver(null);
      if (target && draggingMaster && validTarget(target)) onDropMaster(obra, target);
    },
  };
  const weekTarget = (event: DragEvent) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return clientXToTimelineBucket({ clientX: event.clientX, start: weeks[0].date, days: weeks.length * 7, unitDays: 7, left: bounds.left, width: bounds.width });
  };
  const weekEvents = {
    onDragOver: (event: DragEvent) => {
      const target = weekTarget(event);
      if (target && draggingMaster && validTarget(target)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOver(target);
      }
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const target = weekTarget(event);
      setOver(null);
      if (target && draggingMaster && validTarget(target)) onDropMaster(obra, target);
    },
  };
  const cell = (
    start: string,
    days: number,
    className: string,
    boundaries = "",
  ) => {
    const valid = validTarget(start);
    return (
      <div
        key={start}
        data-co-bucket-start={start}
        data-co-bucket-days={days}
        className={`${className} ${boundaries} co-calendar-cell ${valid ? "is-planned" : "is-invalid-drop"} ${over === start ? "is-drop-target" : ""}`}
        {...(valid ? events(start) : {})}
      >
        <div
          className={`co-cell-lanes ${display.liveAlerts ? "co-cell-lanes--alert-on" : "co-cell-lanes--alert-off"}`}
        >
          <TemporalLayer obra={obra} start={start} days={days} />
          <span className="co-cell-space" />
          <MasterStrips
            obra={obra}
            bucketStart={start}
            bucketDays={days}
            showNames={display.masterNames}
            liveAlerts={display.liveAlerts}
            zoom="day"
            bucketWidth={BUCKET_WIDTH.day}
            masterLanes={masterLanes}
            onResize={resize}
            onSelectMaster={onSelectMaster}
          />
        </div>
      </div>
    );
  };
  if (zoom === "day")
    return (
      <div
        className={`co-day-timeline co-calendar-cell ${over ? "is-drop-target" : ""}`}
        style={dailyGridStyle(days, over ? days.findIndex((day) => day.date === over) : null)}
        {...dayEvents}
      >
        <div className={`co-day-lanes ${display.liveAlerts ? "co-cell-lanes--alert-on" : "co-cell-lanes--alert-off"}`}>
          <TemporalLayer obra={obra} start={days[0].date} days={days.length} />
          <span className="co-cell-space" />
          <MasterStrips
            obra={obra}
            bucketStart={days[0].date}
            bucketDays={days.length}
            showNames={display.masterNames}
            liveAlerts={display.liveAlerts}
            zoom="day"
            bucketWidth={BUCKET_WIDTH.day * days.length}
            masterLanes={masterLanes}
            onResize={resize}
            onSelectMaster={onSelectMaster}
          />
        </div>
      </div>
    );
  if (zoom === "month")
    return (
      <div className="co-month-cells">
        {monthlyHeader(calendarYear).map((month) => {
          const days = monthDays(month.start);
          const valid = validTarget(month.start);
          return (
            <div
              key={month.start}
              data-co-bucket-start={month.start}
              data-co-bucket-days={days}
              className={`co-month-cell co-calendar-cell co-month-cell--summary ${valid ? "is-planned" : "is-invalid-drop"} ${over === month.start ? "is-drop-target" : ""}`}
              {...(valid ? events(month.start) : {})}
            >
              <MonthSummary
                obra={obra}
                start={month.start}
                days={days}
                display={display}
                masterLanes={masterLanes}
                onResize={resize}
                onSelectMaster={onSelectMaster}
              />
            </div>
          );
        })}
      </div>
    );
  if (zoom === "year")
    return (
      <div className="co-year-cells">
        {years.map((year) => (
          <div
            key={year}
            className={`co-year-cell ${year === calendarYear ? "is-current-year" : ""}`}
          >
            <YearSummary
              obra={obra}
              year={year}
              display={display}
              masterLanes={masterLanes}
              onSelectMaster={onSelectMaster}
            />
          </div>
        ))}
      </div>
    );
  return (
    <div
      className={`co-week-timeline co-calendar-cell ${over ? "is-drop-target" : ""}`}
      style={weeklyGridStyle(weeks, over ? weeks.findIndex((week) => week.date === over) : null)}
      {...weekEvents}
    >
      <div className={`co-week-lanes ${display.liveAlerts ? "co-cell-lanes--alert-on" : "co-cell-lanes--alert-off"}`}>
        <TemporalLayer obra={obra} start={weeks[0].date} days={weeks.length * 7} />
        <span className="co-cell-space" />
        <MasterStrips obra={obra} bucketStart={weeks[0].date} bucketDays={weeks.length * 7} showNames={display.masterNames} liveAlerts={display.liveAlerts} zoom="week" bucketWidth={BUCKET_WIDTH.week * weeks.length} masterLanes={masterLanes} onResize={resize} onSelectMaster={onSelectMaster} />
      </div>
    </div>
  );
});

const CONTRACT_DISPLAY: CalendarDisplayOptions = {
  liveAlerts: false,
  masterNames: true,
};
const ContractCells = memo(function ContractCells({
  obras,
  zoom,
  years,
  display,
}: {
  obras: readonly ObraCronograma[];
  zoom: ZoomCronograma;
  years: number[];
  display: CalendarDisplayOptions;
}) {
  const summary = useMemo(() => contractAllocationSummary(obras), [obras]);
  const masterLanes = useMemo(
    () =>
      summary
        ? layoutMasterAllocationLanes(summary.mestresPlanejados)
        : new Map<MestrePlanejado, MasterAllocationLane>(),
    [summary],
  );
  return summary ? (
    <ObraCells
      obra={summary}
      zoom={zoom}
      years={years}
      draggingMaster={null}
      display={CONTRACT_DISPLAY}
      masterLanes={masterLanes}
      onDropMaster={NOOP_DROP}
    />
  ) : null;
});

const NOOP_DROP = () => undefined;

function MasterCells({
  workload,
  zoom,
  years,
}: {
  workload: MestreWorkload;
  zoom: ZoomCronograma;
  years: number[];
}) {
  const calendarYear = Number(todayCivil().slice(0, 4));
  const cells =
    zoom === "day"
      ? workload.daily.map((item) => ({
          days: item.obras.length,
          conflict: item.conflict,
        }))
      : zoom === "week"
        ? workload.weekly
        : zoom === "year"
          ? years.map((year) => {
              const bucket = yearBucket(year);
              const days = workload.obras.reduce(
                (sum, obra) =>
                  sum +
                  obra.mestresPlanejados
                    .filter((mestre) => mestre.nome === workload.mestre)
                    .reduce(
                      (total, mestre) =>
                        total +
                        countIntersection(
                          mestre.inicio,
                          mestre.tempoPlanejado,
                          bucket.start,
                          bucket.days,
                        ),
                      0,
                    ),
                0,
              );
              return { days, conflict: false };
            })
          : monthlyHeader(calendarYear).map((month) => {
              const items = workload.daily.filter(
                (item) => item.date.slice(0, 7) === month.start.slice(0, 7),
              );
              return {
                days: items.filter((item) => item.obras.length).length,
                conflict: items.some((item) => item.conflict),
              };
            });
  const boundaries =
    zoom === "day"
      ? dailyHeader(calendarYear)
      : zoom === "week"
        ? weeklyTimelineCells(calendarYear)
        : [];
  const className =
    zoom === "day"
      ? "co-day-cells"
      : zoom === "week"
        ? "co-week-cells"
        : zoom === "year"
          ? "co-year-cells"
          : "co-month-cells";
  const cellClass =
    zoom === "day"
      ? "co-day-cell"
      : zoom === "week"
        ? "co-week-cell"
        : zoom === "year"
          ? "co-year-cell"
        : "co-month-cell";
  if (zoom === "day") {
    const days = dailyHeader(calendarYear);
    return (
      <div className="co-day-resource-timeline" style={dailyGridStyle(days, null)}>
        {cells.map(
          (cell, index) =>
            (cell.days > 0 || cell.conflict) && (
              <span
                key={index}
                className={`co-day-resource-marker ${cell.conflict ? "is-conflict" : ""}`}
                style={{ left: `${index * BUCKET_WIDTH.day}px`, width: `${BUCKET_WIDTH.day}px` }}
              >
                {cell.days > 0 && (
                  <i
                    className="co-resource-block"
                    style={colorStyle(normalizeMestreKey(workload.mestre))}
                  />
                )}
                {cell.conflict && <WarningAmberRounded className="co-conflict-icon" />}
              </span>
            ),
        )}
      </div>
    );
  }
  if (zoom === "week") {
    const weeks = weeklyTimelineCells(calendarYear);
    return (
      <div className="co-week-resource-timeline" style={weeklyGridStyle(weeks, null)}>
        {cells.map(
          (cell, index) =>
            (cell.days > 0 || cell.conflict) && (
              <span
                key={index}
                className={`co-week-resource-marker ${cell.conflict ? "is-conflict" : ""}`}
                style={{ left: `${index * BUCKET_WIDTH.week}px`, width: `${BUCKET_WIDTH.week}px` }}
              >
                {cell.days > 0 && <i className="co-resource-block" style={colorStyle(normalizeMestreKey(workload.mestre))} />}
                {cell.conflict && <WarningAmberRounded className="co-conflict-icon" />}
              </span>
            ),
        )}
      </div>
    );
  }
  return (
    <div className={className}>
      {cells.map((cell, index) => (
        <div
          className={`${cellClass} ${boundaries[index]?.isWeekStart ? "is-week-start " : ""}${boundaries[index]?.isMonthStart ? "is-month-start " : ""}co-resource-cell ${cell.conflict ? "is-conflict" : ""}`}
          key={index}
        >
          {cell.days > 0 && (
            <span
              className="co-resource-block"
              style={colorStyle(normalizeMestreKey(workload.mestre))}
            />
          )}
          {cell.conflict && (
            <WarningAmberRounded className="co-conflict-icon" />
          )}
        </div>
      ))}
    </div>
  );
}

export const GanttGrid = memo(function GanttGrid({
  view,
  viewMode = "contracts",
  variant = "started",
  zoom,
  years,
  obras,
  contratos,
  workloads,
  selectedId,
  draggingMaster,
  display,
  centerRequest,
  focusDate,
  onSelect,
  onSelectMasters,
  onSelectMaster,
  onOpenContract,
  onDropMaster,
  onResizeMasterPreview,
  onResizeMasterCommit,
  onResizeMasterCancel,
  onFocusDate,
  onStatusConfirmed,
  initialExpandedContractIds = [],
}: Props) {
  countCronogramaRender("GanttGrid");
  const scrollRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const groupsRef = useRef<ContractGroup[]>(groupObrasByContract(obras));
  const draggingMasterRef = useRef(draggingMaster);
  draggingMasterRef.current = draggingMaster;
  const [columnWidths, setColumnWidths] = useState<Partial<Record<ObraPanelColumn, number>>>({});
  const defaultObraWidth = view === "obras" && variant === "started" && viewMode === "flat" ? 285 : OBRA_COLUMN_WIDTH.default;
  const obraColumnWidth = columnWidths.obra ?? defaultObraWidth;
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [sorts, setSorts] = useState<Record<string, TableSort>>({});
  const [resizingMasterId, setResizingMasterId] = useState<string | null>(null);
  // Only expanded IDs are stored, so every contract starts closed after F5.
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(
    () => new Set(initialExpandedContractIds),
  );
  useEffect(() => () => resizeCleanupRef.current?.(), []);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    type StripDebugWindow = Window & {
      __CRONO_STRIP_DEBUG__?: (index?: number) => void;
    };
    const debugWindow = window as StripDebugWindow;
    debugWindow.__CRONO_STRIP_DEBUG__ = (index = 0) => {
      const strip = document.querySelectorAll<HTMLElement>(".co-master-strip")[index];
      if (!strip) {
        console.warn("Nenhuma faixa de mestre encontrada.");
        return;
      }
      const elements: Array<[string, HTMLElement | null]> = [
        ["row-timeline", strip.closest<HTMLElement>(".co-row-timeline, .co-year-summary, .co-month-summary")],
        ["cell-lanes", strip.closest<HTMLElement>(".co-cell-lanes, .co-day-lanes, .co-week-lanes")],
        ["master-strips", strip.closest<HTMLElement>(".co-master-strips")],
        ["master-strip", strip],
      ];
      console.table(elements.filter(([, element]) => element).map(([element, node]) => {
        const target = node!;
        const css = getComputedStyle(target);
        return {
          element,
          className: target.className,
          styleAttribute: target.getAttribute("style"),
          height: target.getBoundingClientRect().height,
          rectHeight: target.getBoundingClientRect().height,
          position: css.position,
          top: css.top,
          bottom: css.bottom,
          cssHeight: css.height,
          blockSize: css.blockSize,
          insetBlock: css.insetBlock,
          minHeight: css.minHeight,
          maxHeight: css.maxHeight,
          paddingTop: css.paddingTop,
          paddingBottom: css.paddingBottom,
          marginTop: css.marginTop,
          marginBottom: css.marginBottom,
          alignItems: css.alignItems,
          alignSelf: css.alignSelf,
          overflow: css.overflow,
          transform: css.transform,
        };
      }));
    };
    return () => { delete debugWindow.__CRONO_STRIP_DEBUG__; };
  }, []);
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || zoom === "year") return;
    const frame = requestAnimationFrame(() =>
      scrollTimelineToToday(container, {
        mode: zoom,
        today: todayCivil(),
        pastContextDays: 15,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [centerRequest, zoom]);
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || !focusDate) return;
    const frame = requestAnimationFrame(() =>
      scrollTimelineToDate(container, { mode: zoom, date: focusDate }),
    );
    return () => cancelAnimationFrame(frame);
  }, [focusDate, zoom]);
  const startColumnResize = (column: ObraPanelColumn) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeCleanupRef.current?.();
    const pointerId = event.pointerId;
    const handle = event.currentTarget;
    const startX = event.clientX;
    const defaults: Partial<Record<ObraPanelColumn, number>> = {
      nomeContrato: 230, obra: defaultObraWidth, empresa: 82,
      status: viewMode === "flat" ? 120 : 185, mestres: 130,
      ordemInicio: 105, confirmacaoRecurso: 100, inicio: 92, dias: 55,
    };
    const startWidth = columnWidths[column] ?? defaults[column] ?? 0;
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId === pointerId)
        setColumnWidths((current) => ({ ...current, [column]: clampColumnWidth(column, startWidth + moveEvent.clientX - startX) }));
    };
    const cleanup = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      document.body.classList.remove("co-is-resizing");
      if (handle.hasPointerCapture(pointerId))
        handle.releasePointerCapture(pointerId);
      resizeCleanupRef.current = null;
    };
    const end = (endEvent: PointerEvent) => {
      if (endEvent.pointerId === pointerId) cleanup();
    };
    handle.setPointerCapture(pointerId);
    document.body.classList.add("co-is-resizing");
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    resizeCleanupRef.current = cleanup;
  };
  const resizeHandle = (column: ObraPanelColumn, label: string) => (
    <button
      type="button"
      className="co-obra-resize-handle"
      aria-label={`Redimensionar coluna ${label}`}
      onPointerDown={startColumnResize(column)}
      onClick={(event) => event.stopPropagation()}
    />
  );
  const startMasterResize = (
    obra: ObraCronograma,
    mestre: MestrePlanejado,
    edge: MasterResizeEdge,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    resizeCleanupRef.current?.();
    const pointerId = event.pointerId;
    const handle = event.currentTarget;
    const timeline = handle.closest(
      zoom === "day"
        ? ".co-day-timeline"
        : zoom === "week"
          ? ".co-week-timeline"
          : ".co-month-cell",
    );
    const calendarYear = Number(todayCivil().slice(0, 4));
    const timelineUnits = zoom === "day" ? dailyHeader(calendarYear) : zoom === "week" ? weeklyTimelineCells(calendarYear) : [];
    const visualUnitDays = zoom === "week" ? 7 : 1;
    const rect = timeline?.getBoundingClientRect();
    const geometry = zoom === "month"
      ? timeline instanceof HTMLElement && rect && timeline.dataset.coBucketStart && Number(timeline.dataset.coBucketDays)
        ? { start: timeline.dataset.coBucketStart, days: Number(timeline.dataset.coBucketDays), left: rect.left, width: rect.width }
        : null
      : rect && timelineUnits.length
        ? { start: timelineUnits[0].date, days: timelineUnits.length * visualUnitDays, left: rect.left, width: rect.width }
        : null;
    let draft = mestre;
    let latestMove: PointerEvent | null = null;
    let frame = 0;
    const previewLatestMove = () => {
      frame = 0;
      if (!latestMove) return;
      const date = geometry
        ? clientXToCalendarDay({ ...geometry, clientX: latestMove.clientX })
        : null;
      if (date) {
        draft = resizeMasterPlanning(obra, mestre, edge, date);
        onResizeMasterPreview(draft);
      }
      latestMove = null;
    };
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      latestMove = moveEvent;
      if (!frame) frame = requestAnimationFrame(previewLatestMove);
    };
    const cleanup = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      latestMove = null;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      document.body.classList.remove("co-is-resizing");
      if (handle.hasPointerCapture(pointerId))
        handle.releasePointerCapture(pointerId);
      setResizingMasterId(null);
      resizeCleanupRef.current = null;
    };
    const end = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      if (endEvent.type !== "pointercancel") previewLatestMove();
      cleanup();
      if (endEvent.type === "pointercancel")
        onResizeMasterCancel(mestre.localId);
      else void onResizeMasterCommit(obra.id, draft);
    };
    handle.setPointerCapture(pointerId);
    setResizingMasterId(mestre.localId);
    document.body.classList.add("co-is-resizing");
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    resizeCleanupRef.current = cleanup;
  };
  const stableStartMasterResize = useLatestCallback(startMasterResize);
  const stableSelectMaster = useLatestCallback(onSelectMaster);
  const stableDropMaster = useLatestCallback(
    (obra: ObraCronograma, target: string) => {
      const mestre = draggingMasterRef.current;
      if (mestre) onDropMaster(obra, mestre, target);
    },
  );
  const groups = useMemo(() => {
    groupsRef.current = measureCronogramaCompute("reconcileContractGroups", () =>
      reconcileContractGroups(groupsRef.current, obras),
    );
    return groupsRef.current;
  }, [obras]);
  const workTypeGroups = useMemo(
    () =>
      measureCronogramaCompute("groupContractGroupsByWorkType", () =>
        view === "obras" ? groupContractGroupsByWorkType(groups, contratos) : [],
      ),
    [view, groups, contratos],
  );
  const flatWorkTypeGroups = useMemo(
    () =>
      measureCronogramaCompute("buildFlatWorkGroupsByWorkType", () =>
        view === "obras" && viewMode === "flat"
          ? buildFlatWorkGroupsByWorkType(obras, contratos)
          : [],
      ),
    [view, viewMode, obras, contratos],
  );
  const sortKey = `${variant}.${viewMode}`;
  const sort = sorts[sortKey] ?? { column: null, direction: null };
  const sortedWorkTypeGroups = useMemo(() => workTypeGroups.map((workType) => ({ ...workType, groups: sortContractGroups(workType.groups, contratos, sort) })), [workTypeGroups, contratos, sort]);
  const sortedFlatWorkTypeGroups = useMemo(() => flatWorkTypeGroups.map((workType) => ({ ...workType, obras: sortObras(workType.obras, contratos, sort) })), [flatWorkTypeGroups, contratos, sort]);
  const changeSort = (column: Parameters<typeof nextTableSort>[1]) => setSorts((current) => ({ ...current, [sortKey]: nextTableSort(current[sortKey] ?? { column: null, direction: null }, column) }));
  const rows =
    view === "obras"
      ? viewMode === "flat"
        ? sortedFlatWorkTypeGroups.length + obras.length
        : sortedWorkTypeGroups.length +
          groups.length +
          groups.reduce(
            (total, group) =>
              total +
              (expandedContracts.has(group.id) ? group.obras.length : 0),
            0,
          )
      : workloads.length;
  // Keep the existing collapsed rendering branch: it is the aggregate contract
  // summary.  The stored state above is inverted so newly arriving contracts
  // are closed too, without persisting anything between sessions.
  const collapsedContracts = new Set(
    groups
      .filter((group) => !expandedContracts.has(group.id))
      .map((group) => group.id),
  );
  const setCollapsedContracts = (
    update: (current: Set<string>) => Set<string>,
  ) =>
    setExpandedContracts(() => {
      const nextCollapsed = update(collapsedContracts);
      return new Set(
        groups
          .filter((group) => !nextCollapsed.has(group.id))
          .map((group) => group.id),
      );
    });
  const notStarted = variant === "not-started";
  const obraPanel = notStarted
    ? notStartedPanelLayout(obraColumnWidth, viewMode, columnWidths)
    : obraPanelLayout(obraColumnWidth, viewMode, detailsVisible, true, columnWidths);
  const HeaderCell = ({ column, label, sortable = false }: { column: ObraPanelColumn; label: string; sortable?: boolean }) => (
    <span className={`co-header-column${sortable ? " co-sort-header" : ""}`} role={sortable ? "button" : undefined} tabIndex={sortable ? 0 : undefined} onClick={sortable ? () => changeSort(column) : undefined}>
      <span className="co-header-label">{label}</span>
      {resizeHandle(column, label)}
    </span>
  );
  const legacyLeft =
    notStarted && viewMode === "flat" ? <><span>Nome contrato</span><span>Obra</span><span>Emp.</span><span>Status</span><span>Ordem de Ini</span><span>Recurso</span><span>Início</span><span>Dias</span></>
    : notStarted && view === "obras" ? <><span>Nome contrato</span><span>Emp.</span><span>Status</span><span>Ordem de Ini</span><span>Recurso</span><span>Início</span><span>Dias</span></>
    : view === "obras" && viewMode === "flat" ? (
      <>
        <span className="co-sort-header" role="button" tabIndex={0} onClick={() => changeSort("nomeContrato")}>Nome contrato{RESIZABLE_COLUMNS.startedFlat.includes("nomeContrato") && <button type="button" className="co-obra-resize-handle" aria-label="Redimensionar coluna Nome contrato" onPointerDown={startColumnResize("nomeContrato")} />}</span>
        <span className="co-sort-header" role="button" tabIndex={0} onClick={() => changeSort("obra")}>
          Obra
          <button
            type="button"
            className="co-obra-resize-handle"
            aria-label="Redimensionar coluna Obra"
            onPointerDown={startColumnResize("obra")}
          />
        </span>
        {detailsVisible && <><span className="co-sort-header" role="button" tabIndex={0} onClick={() => changeSort("empresa")}>Emp.</span><span className="co-sort-header" role="button" tabIndex={0} onClick={() => changeSort("status")}>Status</span></>}
        <span className="co-sort-header" role="button" tabIndex={0} onClick={() => changeSort("mestres")}>Mestres</span>
        {detailsVisible ? (
          <>
            <span>Início</span>
            <span>Dias</span>
          </>
        ) : (
          <span>Início</span>
        )}
        <button
          type="button"
          className="co-columns-toggle"
          aria-label={
            detailsVisible
              ? "Ocultar colunas complementares"
              : "Mostrar colunas complementares"
          }
          title={
            detailsVisible
              ? "Ocultar Emp., Início e Dias"
              : "Mostrar Emp., Início e Dias"
          }
          onClick={() => setDetailsVisible((visible) => !visible)}
        >
          {detailsVisible ? "›" : "‹"}
        </button>
      </>
    ) : view === "obras" ? (
      <>
        <span>Nome contrato{RESIZABLE_COLUMNS.startedContracts.includes("nomeContrato") && <button type="button" className="co-obra-resize-handle" aria-label="Redimensionar coluna Nome contrato" onPointerDown={startColumnResize("nomeContrato")} />}</span>
        {detailsVisible && <><span>Emp.{RESIZABLE_COLUMNS.startedContracts.includes("empresa") && <button type="button" className="co-obra-resize-handle" aria-label="Redimensionar coluna Emp." onPointerDown={startColumnResize("empresa")} />}</span><span>Status{RESIZABLE_COLUMNS.startedContracts.includes("status") && <button type="button" className="co-obra-resize-handle" aria-label="Redimensionar coluna Status" onPointerDown={startColumnResize("status")} />}</span></>}
        <span>Mestres</span><span>Início</span>
        {detailsVisible && <span>Dias</span>}
        <button type="button" className="co-columns-toggle" aria-label={detailsVisible ? "Ocultar colunas complementares" : "Mostrar colunas complementares"} title={detailsVisible ? "Ocultar Emp., Status e Dias" : "Mostrar todas as colunas"} onClick={() => setDetailsVisible((visible) => !visible)}>{detailsVisible ? "›" : "‹"}</button>
      </>
    ) : (
      <>
        <span>Mestre</span>
        <span>Obras</span>
        <span>Dias</span>
        <span>Livres</span>
        <span>Conflitos</span>
      </>
    );
  const left =
    notStarted && viewMode === "flat" ? <>{([['nomeContrato', 'Nome contrato'], ['obra', 'Obra'], ['empresa', 'Emp.'], ['status', 'Status'], ['ordemInicio', 'Ordem de Ini'], ['confirmacaoRecurso', 'Recurso'], ['inicio', 'In\u00edcio'], ['dias', 'Dias']] as const).map(([column, label]) => <HeaderCell key={column} column={column} label={label} />)}</>
    : notStarted && view === "obras" ? <>{([['nomeContrato', 'Nome contrato'], ['empresa', 'Emp.'], ['status', 'Status'], ['ordemInicio', 'Ordem de Ini'], ['confirmacaoRecurso', 'Recurso'], ['inicio', 'In\u00edcio'], ['dias', 'Dias']] as const).map(([column, label]) => <HeaderCell key={column} column={column} label={label} />)}</>
    : view === "obras" && viewMode === "flat" ? <>
      {([['nomeContrato', 'Nome contrato'], ['obra', 'Obra'], ...(detailsVisible ? [['empresa', 'Emp.'], ['status', 'Status']] : []), ['mestres', 'Mestres'], ['inicio', 'In\u00edcio'], ...(detailsVisible ? [['dias', 'Dias']] : [])] as [ObraPanelColumn, string][]).map(([column, label]) => <HeaderCell key={column} column={column} label={label} sortable />)}
      <button type="button" className="co-columns-toggle" aria-label={detailsVisible ? "Ocultar colunas complementares" : "Mostrar colunas complementares"} title={detailsVisible ? "Ocultar Emp., In\u00edcio e Dias" : "Mostrar Emp., In\u00edcio e Dias"} onClick={() => setDetailsVisible((visible) => !visible)}>{detailsVisible ? <ChevronRightRounded fontSize="inherit" /> : <ChevronLeftRounded fontSize="inherit" />}</button>
    </>
    : view === "obras" ? <>
      {([['nomeContrato', 'Nome contrato'], ...(detailsVisible ? [['empresa', 'Emp.'], ['status', 'Status']] : []), ['mestres', 'Mestres'], ['inicio', 'In\u00edcio'], ...(detailsVisible ? [['dias', 'Dias']] : [])] as [ObraPanelColumn, string][]).map(([column, label]) => <HeaderCell key={column} column={column} label={label} sortable />)}
      <button type="button" className="co-columns-toggle" aria-label={detailsVisible ? "Ocultar colunas complementares" : "Mostrar colunas complementares"} title={detailsVisible ? "Ocultar Emp., Status e Dias" : "Mostrar todas as colunas"} onClick={() => setDetailsVisible((visible) => !visible)}>{detailsVisible ? <ChevronRightRounded fontSize="inherit" /> : <ChevronLeftRounded fontSize="inherit" />}</button>
    </>
    : legacyLeft;
  const gridStyle = {
    "--row-count": rows,
    "--co-year-count": years.length,
    ...(view === "obras"
      ? {
          "--co-left-columns": obraPanel.gridTemplateColumns,
          "--co-left-width": obraPanel.width,
        }
      : {}),
  } as React.CSSProperties;
  const sortFromHeaderClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (notStarted || view !== "obras" || (event.target as HTMLElement).closest("button, .co-sort-header")) return;
    const header = event.currentTarget;
    const index = Array.from(header.children).findIndex((child) => child.contains(event.target as Node));
    const columns = viewMode === "flat"
      ? (detailsVisible ? ["nomeContrato", "obra", "empresa", "status", "mestres", "inicio", "dias"] : ["nomeContrato", "obra", "mestres", "inicio"])
      : (detailsVisible ? ["nomeContrato", "empresa", "status", "mestres", "inicio", "dias"] : ["nomeContrato", "mestres", "inicio"]);
    const column = columns[index] as Parameters<typeof changeSort>[0] | undefined;
    if (column) changeSort(column);
  };
  const obraRow = (obra: ObraCronograma, flat = false) => {
    if (notStarted) {
      const contrato = contratos.get(obra.contratoId ?? "");
      const review = obra.targetType === "contrato";
      const status = review ? flat ? displayRawValue(contrato?.status) : "â€”" : <MondaySubitemStatusControl obra={obra} canStart onStatusConfirmed={onStatusConfirmed} />;
      const workName = review && contrato
        ? <ContractAnalysisRequest contrato={contrato} variant="alert" />
        : obra.nomeObra;
      return <div role="button" tabIndex={0} className={`co-grid-row co-grid-row--child ${flat ? "co-grid-row--flat" : ""} ${selectedId === obra.id ? "is-selected" : ""}`} key={obra.id} onClick={() => onSelect(obra)} onKeyDown={(event) => { if (event.currentTarget !== event.target || (event.key !== "Enter" && event.key !== " ")) return; event.preventDefault(); onSelect(obra); }}>
        <div className="co-row-info co-left-row">
          {flat && <span className="co-contract-name-flat" title={contrato?.nome ?? "â€”"}>{contrato?.nome ?? "â€”"}</span>}
          <span className="co-work-name" title={obra.nomeObra}>{workName}</span>
          <span>{obra.empresa || "â€”"}</span><span>{status}</span>
          <span>{displayRawValue(contrato?.ordemInicio)}</span><span>{displayRawValue(contrato?.confirmacaoRecurso)}</span>
          <span>{formatDateShort(obra.inicioPlanejado ?? contrato?.inicio)}</span><span>{obra.tempoPlanejado ?? inclusiveCivilDays(contrato?.inicio, contrato?.fim) ?? "â€”"}</span>
        </div>
        <div className="co-row-timeline"><ObraCells obra={obra} zoom={zoom} years={years} draggingMaster={draggingMaster} display={display} onDropMaster={stableDropMaster} onResizeMaster={stableStartMasterResize} onSelectMaster={stableSelectMaster} /></div>
      </div>;
    }
    const active = mastersWithRealPeriods(obra);
    const recent = recentStartedMaster(obra, todayCivil());
    const visible = viewMode === "flat" && !detailsVisible ? recent ? [recent] : [] : active;
    const contrato = contratos.get(obra.contratoId ?? "");
    return (
      <div
        role="button"
        tabIndex={0}
        className={`co-grid-row co-grid-row--child ${flat ? "co-grid-row--flat" : ""} ${selectedId === obra.id ? "is-selected" : ""}`}
        key={obra.id}
        onClick={() => onSelect(obra)}
        onKeyDown={(event) => {
          if (
            event.currentTarget !== event.target ||
            (event.key !== "Enter" && event.key !== " ")
          )
            return;
          event.preventDefault();
          onSelect(obra);
        }}
      >
        <div className="co-row-info co-left-row">
          {flat && <span className="co-contract-name-flat" title={contrato?.nome ?? "—"}>{contrato?.nome ?? "—"}</span>}
          <span className="co-work-name" title={obra.nomeObra}>
            {obra.nomeObra}
          </span>
          {detailsVisible && <span>{obra.empresa}</span>}
          {detailsVisible && <span><MondaySubitemStatusControl obra={obra} canStart={false} canFinish onStatusConfirmed={onStatusConfirmed} /></span>}
          <span
            className="co-masters-cell"
            onClick={(event) => {
              event.stopPropagation();
              onSelectMasters(obra);
            }}
          >
            {visible.length ? (
              visible.map((group) => (
                <i
                  className="co-master-name-chip"
                  key={group.key}
                  style={colorStyle(group.key)}
                >
                  {group.nome}
                </i>
              ))
            ) : (
              <em>Sem mestre</em>
            )}
          </span>
          {detailsVisible && (
            <>
              <button
                type="button"
                className="co-start-date"
                disabled={!obra.inicioPlanejado}
                onClick={(event) => {
                  event.stopPropagation();
                  if (obra.inicioPlanejado) onFocusDate(obra.inicioPlanejado);
                }}
              >
                {formatDateShort(obra.inicioPlanejado)}
              </button>
              <span>{obra.tempoPlanejado ?? "—"}</span>
            </>
          )}
          {!detailsVisible && <button type="button" className="co-start-date" disabled={!obra.inicioPlanejado} onClick={(event) => { event.stopPropagation(); if (obra.inicioPlanejado) onFocusDate(obra.inicioPlanejado); }}>{formatDateShort(obra.inicioPlanejado)}</button>}
          <span className="co-row-toggle-spacer" aria-hidden="true" />
        </div>
        <div className="co-row-timeline">
          <ObraCells
            obra={obra}
            zoom={zoom}
            years={years}
            draggingMaster={draggingMaster}
            display={display}
            onDropMaster={stableDropMaster}
            onResizeMaster={stableStartMasterResize}
            onSelectMaster={stableSelectMaster}
          />
        </div>
      </div>
    );
  };
  const contractRows = sortedWorkTypeGroups.flatMap((workType) => [
    <div
      className={`co-work-type-divider co-work-type-divider--${workType.kind}`}
      key={`work-type-${workType.kind}`}
    >
      <div className="co-work-type-divider__fixed">
        <span>{workType.label}</span>
      </div>
      <div className="co-work-type-divider__timeline" aria-hidden="true" />
    </div>,
    ...workType.groups.map((group) => {
      const collapsed = collapsedContracts.has(group.id);
      const masters = aggregateMastersWithRealPeriods(group.obras).map(
        (group) => group.periods[0],
      );
      const contrato = contratos.get(group.id);
      const contractDays = inclusiveCivilDays(contrato?.inicio, contrato?.fim);
      return (
        <div className="co-contract-group" key={group.id}>
          <div
            className="co-grid-row co-grid-row--contract"
            role="button"
            tabIndex={0}
            aria-expanded={!collapsed}
            onClick={() =>
              setCollapsedContracts((current) => {
                const next = new Set(current);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
              })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.currentTarget.click();
              }
            }}
          >
            <div className="co-row-info co-left-row">
              {notStarted ? <>
                <span className="co-contract-name"><ContractRowControls collapsed={collapsed} count={group.obras.length} contrato={contrato} showReview={requiresContractReview(contrato)} />{group.name}</span>
                <span>{contrato?.empresa ?? "â€”"}</span><span>{displayRawValue(contrato?.status)}</span><span>{displayRawValue(contrato?.ordemInicio)}</span><span>{displayRawValue(contrato?.confirmacaoRecurso)}</span><span>{formatDateShort(contrato?.inicio)}</span><span>{contractDays ?? "â€”"}</span>
              </> : <>
              <span className="co-contract-name">
                <ContractRowControls collapsed={collapsed} count={group.obras.length} />
                {group.name}
              </span>
              {detailsVisible && <><span>{contrato?.empresa ?? "—"}</span><span><StatusBadge status={contrato?.status ?? "Sem status"} /></span></>}
              <span
                className="co-masters-cell co-contract-masters"
                title={mastersTooltip(masters)}
              >
                {masters.length ? (
                  masters.map((mestre) => (
                    <i
                      className="co-master-name-chip"
                      key={mestre.nome}
                      style={colorStyle(
                        mestre.mestreKey ?? normalizeMestreKey(mestre.nome),
                      )}
                    >
                      {mestre.nome}
                    </i>
                  ))
                ) : (
                  <em>Sem mestre</em>
                )}
              </span>
              <span>{formatDateShort(contrato?.inicio)}</span>
              {detailsVisible && <span>{contractDays ?? "—"}</span>}
              <span className="co-row-toggle-spacer" aria-hidden="true" />
              </>}
            </div>
            <div className="co-row-timeline co-contract-calendar">
              {collapsed && (
                <ContractCells
                  obras={group.obras}
                  zoom={zoom}
                  years={years}
                  display={display}
                />
              )}
            </div>
          </div>
          {!collapsed && group.obras.map((obra) => obraRow(obra))}
        </div>
      );
    }),
  ]);
  const flatRows = sortedFlatWorkTypeGroups.flatMap((workType) => [
    <div
      className={`co-work-type-divider co-work-type-divider--${workType.kind}`}
      key={`work-type-${workType.kind}`}
    >
      <div className="co-work-type-divider__fixed">
        <span>{workType.label}</span>
      </div>
      <div className="co-work-type-divider__timeline" aria-hidden="true" />
    </div>,
    ...workType.obras.map((obra) => obraRow(obra, true)),
  ]);
  return (
    <section
      className={`co-gantt co-gantt--${view} ${notStarted ? "co-gantt--not-started" : ""} ${draggingMaster ? "is-dragging-master" : ""} ${resizingMasterId ? "is-resizing-master" : ""}`}
      aria-label="Cronograma anual"
    >
      <div className="co-gantt-scroll" ref={scrollRef}>
        <div
          className={`co-gantt-grid co-gantt-grid--${zoom}`}
          style={gridStyle}
        >
          <div className="co-gantt-header">
            <div className="co-header-info co-left-header" onClick={sortFromHeaderClick}>{left}</div>
            <div className="co-header-timeline">
              <TimelineHeader zoom={zoom} years={years} />
            </div>
          </div>
          {view === "obras"
            ? viewMode === "flat"
              ? flatRows
              : contractRows
            : workloads.map((workload) => (
                <div
                  className="co-grid-row co-grid-row--resource"
                  key={workload.mestre}
                >
                  <div className="co-row-info co-left-row">
                    <span className="co-master-name">
                      <i
                        className="co-master-swatch"
                        style={colorStyle(normalizeMestreKey(workload.mestre))}
                      />
                      {workload.mestre}
                    </span>
                    <span>{workload.obras.length}</span>
                    <span>{workload.diasProgramados}</span>
                    <span>{workload.freeDays} dias</span>
                    <span
                      className={
                        workload.conflictDays ? "co-invalid-value" : ""
                      }
                    >
                      {workload.conflictDays}
                    </span>
                  </div>
                  <div className="co-row-timeline">
                    <MasterCells workload={workload} zoom={zoom} years={years} />
                  </div>
                </div>
              ))}
        </div>
      </div>
      {!rows && (
        <div className="co-empty">
          Nenhum resultado para os filtros selecionados.
        </div>
      )}
    </section>
  );
});
