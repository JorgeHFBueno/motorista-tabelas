export type CronogramaPerfMode =
  | "obras"
  | "mestres"
  | "contratos"
  | "lista"
  | "dias"
  | "semanas";

type DomCounts = Record<string, number>;
type ProfilerEntry = {
  actualDuration: number;
  baseDuration: number;
  commitTime: number;
  phase: string;
  startTime: number;
};
export type CronogramaPerfResult = {
  id: number;
  from: CronogramaPerfMode;
  to: CronogramaPerfMode;
  timings: Record<string, number>;
  renders: Record<string, number>;
  profiler: Record<string, ProfilerEntry[]>;
  compute: Record<string, number>;
  dom: DomCounts;
  longTasks: number[];
  longTaskSupport: "supported" | "unsupported";
};

const enabled = import.meta.env.DEV;
let nextId = 0;
let active: CronogramaPerfResult | null = null;
let observer: PerformanceObserver | null = null;

const now = () => performance.now();
const publicWindow = () => window as Window & {
  __CRONO_PERF_LAST__?: CronogramaPerfResult;
  __CRONO_PERF_HISTORY__?: CronogramaPerfResult[];
  __CRONO_PERF_PRINT__?: () => void;
};

function printHistory() {
  if (!enabled) return;
  console.table(
    (publicWindow().__CRONO_PERF_HISTORY__ ?? []).map((item) => ({
      from: item.from,
      to: item.to,
      total: Math.round(item.timings.total ?? 0),
      gantt: Math.round(
        (item.profiler.GanttGrid ?? []).reduce(
          (sum, entry) => sum + entry.actualDuration,
          0,
        ),
      ),
      dom: item.dom.totalElements,
      dayCells: item.dom.dayCells,
      weekCells: item.dom.weekCells,
      weekCellsBody: item.dom.weekCellsBody,
      weekCellsHeader: item.dom.weekCellsHeader,
    })),
  );
}

function installWindowApi() {
  if (!enabled || typeof window === "undefined") return;
  publicWindow().__CRONO_PERF_HISTORY__ ??= [];
  publicWindow().__CRONO_PERF_PRINT__ = printHistory;
}

export function beginCronogramaPerf(from: CronogramaPerfMode, to: CronogramaPerfMode) {
  if (!enabled) return;
  installWindowApi();
  observer?.disconnect();
  active = {
    id: ++nextId,
    from,
    to,
    timings: { click: now() },
    renders: {},
    profiler: {},
    compute: {},
    dom: {},
    longTasks: [],
    longTaskSupport: "unsupported",
  };
  performance.mark(`crono-perf-${active.id}-click`);
  if (typeof PerformanceObserver !== "undefined") {
    try {
      observer = new PerformanceObserver((entries) => {
        entries.getEntries().forEach((entry) => {
          if (entry.duration > 50) active?.longTasks.push(entry.duration);
        });
      });
      observer.observe({ entryTypes: ["longtask"] });
      active.longTaskSupport = "supported";
    } catch {
      observer = null;
    }
  }
}

export function markCronogramaPerf(name: string) {
  if (!enabled || !active) return;
  active.timings[name] = now() - active.timings.click;
  performance.mark(`crono-perf-${active.id}-${name}`);
}

export function countCronogramaRender(name: string) {
  if (!enabled || !active) return;
  active.renders[name] = (active.renders[name] ?? 0) + 1;
}

export function measureCronogramaCompute<T>(name: string, calculate: () => T): T {
  if (!enabled || !active) return calculate();
  const start = now();
  const result = calculate();
  active.compute[name] = (active.compute[name] ?? 0) + now() - start;
  return result;
}

export function recordCronogramaProfiler(
  id: string,
  phase: string,
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number,
) {
  if (!enabled || !active) return;
  (active.profiler[id] ??= []).push({
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
  });
}

export function collectCronogramaDom(container: HTMLElement | null) {
  if (!enabled || !active || !container) return;
  const count = (selector: string) => container.querySelectorAll(selector).length;
  active.dom = {
    totalElements: container.querySelectorAll("*").length,
    rows: count(".co-grid-row"),
    childRows: count(".co-grid-row--child"),
    dayCells: count(".co-day-cell"),
    weekCells: count(".co-week-cell"),
    weekCellsBody: count(".co-row-timeline .co-week-cell"),
    weekCellsHeader: count(".co-weeks > div"),
    rowTimelines: count(".co-row-timeline"),
    allocations: count(".co-allocation, .co-work-allocation"),
    masterStrips: count(".co-master-strip, .co-week-masters i"),
    resizeHandles: count(".co-master-resize-handle"),
    dropZones: count(".co-calendar-cell"),
  };
}

export function finishCronogramaPerf() {
  if (!enabled || !active) return;
  markCronogramaPerf("overlayRemoved");
  active.timings.total = now() - active.timings.click;
  try {
    performance.measure(
      `crono-perf-${active.id}-total`,
      `crono-perf-${active.id}-click`,
      `crono-perf-${active.id}-overlayRemoved`,
    );
  } catch {
    // Mark/measure support is diagnostic-only and must never affect the view.
  }
  observer?.disconnect();
  observer = null;
  const result = active;
  const gantt = (result.profiler.GanttGrid ?? []).reduce(
    (sum, entry) => sum + entry.actualDuration,
    0,
  );
  console.groupCollapsed(
    `[CRONO-PERF #${result.id}] ${result.from} → ${result.to} | ${Math.round(result.timings.total)} ms`,
  );
  console.log("TIMING", result.timings);
  console.log("RENDERS (includes expected DEV/StrictMode extra renders)", result.renders);
  console.log("REACT PROFILER", result.profiler);
  console.log("DOM", result.dom);
  console.log("COMPUTE", result.compute);
  console.log("LONG TASKS", {
    count: result.longTasks.length,
    longest: Math.round(Math.max(0, ...result.longTasks)),
    support: result.longTaskSupport,
    reactGantt: Math.round(gantt),
  });
  console.groupEnd();
  installWindowApi();
  const history = publicWindow().__CRONO_PERF_HISTORY__!;
  history.push(result);
  if (history.length > 20) history.splice(0, history.length - 20);
  publicWindow().__CRONO_PERF_LAST__ = result;
  active = null;
}
