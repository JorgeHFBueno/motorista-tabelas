// tests/cronograma-obras.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// src/features/cronograma-obras/domain/mestres.ts
var PALETTE = [
  { background: "#376f55", text: "#ffffff" },
  { background: "#245f61", text: "#ffffff" },
  { background: "#654084", text: "#ffffff" },
  { background: "#743f78", text: "#ffffff" },
  { background: "#4d548b", text: "#ffffff" },
  { background: "#a0522d", text: "#ffffff" },
  { background: "#70483a", text: "#ffffff" },
  { background: "#46515b", text: "#ffffff" },
  { background: "#3b6f4e", text: "#ffffff" },
  { background: "#6a5136", text: "#ffffff" }
];
function normalizeMestreKey(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, "-");
}
function getMestreKey(mestre) {
  return mestre.uid || normalizeMestreKey(mestre.nome);
}
var activeKeys = [];
var persistedColors = /* @__PURE__ */ new Map();
function getMestreColor(mestreKey, currentKeys = activeKeys) {
  const key = normalizeMestreKey(mestreKey);
  const persisted = persistedColors.get(key);
  if (persisted) return persisted;
  const keys = [.../* @__PURE__ */ new Set([...currentKeys.map(normalizeMestreKey), key])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const index = keys.indexOf(key);
  if (index < PALETTE.length) return PALETTE[index];
  const hue = (index * 137.508 + 112) % 360;
  return { background: `hsl(${hue.toFixed(1)} 42% 34%)`, text: "#ffffff" };
}
function mestreColorRegistry(keys) {
  const normalized = [...new Set(keys.map(normalizeMestreKey))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return new Map(normalized.map((key) => [key, getMestreColor(key, normalized)]));
}

// src/features/cronograma-obras/application/localPlanner.ts
function updateObraLocal(obras2, obra) {
  return obras2.map((item) => item.id === obra.id ? obra : item);
}
function addMestrePlanejadoLocal(obras2, obraId, mestre) {
  return obras2.map((obra) => {
    if (obra.id !== obraId || obra.mestresPlanejados.some((item) => (item.mestreKey ?? normalizeMestreKey(item.nome)) === (mestre.mestreKey ?? normalizeMestreKey(mestre.nome)) && item.inicio === mestre.inicio && item.tempoPlanejado === mestre.tempoPlanejado)) return obra;
    return { ...obra, mestresPlanejados: [...obra.mestresPlanejados, mestre] };
  });
}

// src/features/cronograma-obras/domain/models.ts
var MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

// src/features/cronograma-obras/domain/temporal.ts
var parse = (value) => /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
var format = (value) => value.toISOString().slice(0, 10);
function isValidCivilDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parse(value);
  return Number.isFinite(date.getTime()) && format(date) === value;
}
function addDays(inicio, days) {
  const date = parse(inicio);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}
function calculatedEnd(inicio, tempoPlanejado) {
  return addDays(inicio, Math.max(tempoPlanejado, 1) - 1);
}
function tryCalculatedEnd(inicio, tempoPlanejado) {
  return isValidCivilDate(inicio) && Number.isFinite(tempoPlanejado) && tempoPlanejado > 0 ? calculatedEnd(inicio, tempoPlanejado) : null;
}
function eachDay(inicio, tempoPlanejado) {
  return Array.from({ length: Math.max(0, tempoPlanejado) }, (_, index) => addDays(inicio, index));
}
function intersectsRange(inicio, tempo, rangeInicio, rangeTempo) {
  return inicio <= calculatedEnd(rangeInicio, rangeTempo) && calculatedEnd(inicio, tempo) >= rangeInicio;
}
function weekStart(value) {
  const date = parse(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return format(date);
}
function monthDays(value) {
  const date = parse(`${value.slice(0, 7)}-01`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}
function countIntersection(inicio, tempo, bucketInicio, bucketTempo) {
  return eachDay(inicio, tempo).filter((day) => intersectsRange(bucketInicio, bucketTempo, day, 1)).length;
}
function daysInWeek(inicio, tempo, week) {
  return countIntersection(inicio, tempo, weekStart(week), 7);
}
function weeklyAllocation(inicio, tempo, week) {
  const start = weekStart(week);
  const occupied = eachDay(inicio, tempo).filter((day) => day >= start && day <= addDays(start, 6));
  return { days: occupied.length, offset: occupied.length ? eachDay(start, 7).indexOf(occupied[0]) : 0 };
}
function daysInMonth(inicio, tempo, month) {
  const start = `${month.slice(0, 7)}-01`;
  return countIntersection(inicio, tempo, start, monthDays(start));
}
function yearDays(year) {
  return eachDay(`${year}-01-01`, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365);
}
function weeklyHeader(year) {
  const first = weekStart(`${year}-01-01`);
  const last = `${year}-12-31`;
  const result = [];
  for (let date = first; date <= last; date = addDays(date, 7)) result.push(date);
  return result;
}
function weeklyMonthGroups(year) {
  return weeklyHeader(year).reduce((groups, start) => {
    const label = MONTHS[Number(start.slice(5, 7)) - 1];
    const current = groups.at(-1);
    if (current?.label === label) current.weeks += 1;
    else groups.push({ label, start, weeks: 1 });
    return groups;
  }, []);
}
function todayCivil() {
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function formatDateShort(date) {
  return date ? `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(2, 4)}` : "\u2014";
}

// src/features/cronograma-obras/domain/cronograma.ts
function filterObras(obras2, filters) {
  const term = filters.search.trim().toLocaleLowerCase("pt-BR");
  return obras2.filter((obra) => {
    const text = [obra.codObra, obra.siglaObra, obra.nomeObra, obra.local, obra.empresa, obra.mestreInicial, ...obra.mestresPlanejados.map((mestre) => mestre.nome), obra.descricao].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    const [periodStart2, periodTempo] = filters.period === "year" ? ["2026-01-01", 365] : [filters.period.split("/")[0], Number(filters.period.split("/")[1])];
    return (!term || text.includes(term)) && (!filters.status || obra.status === filters.status) && (!filters.empresa || obra.empresa === filters.empresa) && (!filters.mestre || obra.mestresPlanejados.some((mestre) => mestre.nome === filters.mestre)) && intersectsRange(obra.inicioPlanejado, obra.tempoPlanejado, periodStart2, periodTempo);
  });
}
function buildWorkloads(obras2, year = 2026) {
  const byMaster = /* @__PURE__ */ new Map();
  obras2.forEach((obra) => obra.mestresPlanejados.forEach((item) => {
    if (item.nome && item.tempoPlanejado > 0) byMaster.set(item.nome, [...byMaster.get(item.nome) ?? [], obra]);
  }));
  return [...byMaster.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([mestre, works]) => {
    const daily = yearDays(year).map((date) => {
      const active = [...new Map(obras2.filter((obra) => obra.mestresPlanejados.some((item) => item.nome === mestre && intersectsRange(item.inicio, item.tempoPlanejado, date, 1))).map((obra) => [obra.id, obra])).values()];
      return { date, obras: active, conflict: active.length > 1 };
    });
    const weekly = weeklyHeader(year).map((start) => {
      const days = daily.filter((day) => day.date >= start && day.date <= addDays(start, 6));
      const active = [...new Map(days.flatMap((day) => day.obras).map((obra) => [obra.id, obra])).values()];
      return { start, days: days.filter((day) => day.obras.length).length, obras: active, conflict: days.some((day) => day.conflict) };
    });
    return { mestre, obras: [...new Map(works.map((obra) => [obra.id, obra])).values()], diasProgramados: daily.filter((day) => day.obras.length).length, freeDays: daily.filter((day) => !day.obras.length).length, conflictDays: daily.filter((day) => day.conflict).length, daily, weekly };
  });
}
function calculateIndicators(obras2) {
  const workloads = buildWorkloads(obras2);
  return { running: obras2.filter((obra) => obra.status === "EM ANDAMENTO").length, waiting: obras2.filter((obra) => obra.status === "AGUARDANDO RECURSO").length, allocated: workloads.length, unassigned: obras2.filter((obra) => obra.mestresPlanejados.length === 0).length, conflicts: workloads.reduce((sum, item) => sum + item.conflictDays, 0) };
}

// src/features/cronograma-obras/domain/obraTemporal.ts
function isFinalizedStatus(status) {
  const value = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  return value === "FINALIZADA" || value === "FINALIZADO";
}
function getObraEndDate(obra) {
  return calculatedEnd(obra.inicioPlanejado, obra.tempoPlanejado);
}
function isObraOverdue(obra, hoje = todayCivil()) {
  return !isFinalizedStatus(obra.status) && hoje > getObraEndDate(obra);
}
function getMastersForDate(mestres, dia) {
  return (mestres ?? []).filter((mestre) => dia >= mestre.inicio && dia <= calculatedEnd(mestre.inicio, mestre.tempoPlanejado));
}
function getTemporalStateForDate(obra, dia, hoje = todayCivil()) {
  if (getMastersForDate(obra.mestresPlanejados, dia).length) return "mastered";
  const fim = getObraEndDate(obra);
  if (dia >= obra.inicioPlanejado && dia <= fim) return "planned";
  if (!isFinalizedStatus(obra.status) && dia > fim) return dia <= hoje ? "overdue" : dia <= addDays(hoje, 14) ? "attention" : null;
  return null;
}
function getObraTemporalSegments(obra, hoje = obra.hoje ?? todayCivil()) {
  const end = isFinalizedStatus(obra.status) ? getObraEndDate(obra) : addDays(hoje, 14);
  const result = [];
  for (let dia = obra.inicioPlanejado; dia <= end; dia = addDays(dia, 1)) {
    const type = getTemporalStateForDate(obra, dia, hoje);
    const previous = result.at(-1);
    if (type && previous?.type === type && addDays(previous.fim, 1) === dia) previous.fim = dia;
    else if (type) result.push({ type, inicio: dia, fim: dia });
  }
  return result;
}
function getTemporalSegmentsInBucket(segments, bucketInicio, bucketDays) {
  const bucketFim = addDays(bucketInicio, bucketDays - 1);
  return segments.flatMap((segment) => {
    const inicio = segment.inicio > bucketInicio ? segment.inicio : bucketInicio;
    const fim = segment.fim < bucketFim ? segment.fim : bucketFim;
    return inicio <= fim ? [{ ...segment, inicio, fim }] : [];
  });
}

// src/features/cronograma-obras/domain/dropPlanning.ts
function getMasterPlanningEnd(inicio, tempoPlanejado) {
  return calculatedEnd(inicio, tempoPlanejado);
}
function getPlanningOverrunDays(obra, inicio, dias) {
  const fim = getMasterPlanningEnd(inicio, dias);
  const previsto = getObraEndDate(obra);
  return fim > previsto ? Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${previsto}T00:00:00Z`)) / 864e5) : 0;
}
function isValidMasterDropStart(obra, inicio, hoje) {
  return !isFinalizedStatus(obra.status) && (isObraOverdue(obra, hoje) || inicio <= getObraEndDate(obra));
}
function getDropPlanningStart({ obra, zoom, targetDateOrPeriod, hoje }) {
  if (zoom === "year") return null;
  const bucketStart = zoom === "week" ? weekStart(targetDateOrPeriod) : zoom === "month" ? `${targetDateOrPeriod.slice(0, 7)}-01` : targetDateOrPeriod;
  const bucketDays = zoom === "week" ? 7 : zoom === "month" ? monthDays(bucketStart) : 1;
  const start = bucketStart;
  return start <= addDays(bucketStart, bucketDays - 1) && isValidMasterDropStart(obra, start, hoje) ? start : null;
}
function getDirectMasterDropInterval({ obra, targetDate, hoje }) {
  const week = weekStart(targetDate);
  if (isFinalizedStatus(obra.status)) return null;
  return { inicio: week, tempoPlanejado: 7 };
}
function getDropPlanningInterval({ obra, zoom, targetDateOrPeriod }) {
  if (zoom === "year" || isFinalizedStatus(obra.status)) return null;
  const inicio = zoom === "week" ? weekStart(targetDateOrPeriod) : zoom === "month" ? `${targetDateOrPeriod.slice(0, 7)}-01` : targetDateOrPeriod;
  const tempoPlanejado = zoom === "week" ? 7 : zoom === "month" ? monthDays(inicio) : 1;
  return { inicio, tempoPlanejado };
}

// src/features/cronograma-obras/domain/masterPlanningDetails.ts
var periodStart = (item) => item.inicio;
function masterPeriodsForObra(obra) {
  const groups = /* @__PURE__ */ new Map();
  obra.mestresPlanejados.forEach((item) => {
    const key = item.mestreKey ?? getMestreKey(item);
    const group = groups.get(key) ?? { key, nome: item.nome, periods: [] };
    group.periods.push(item);
    groups.set(key, group);
  });
  return [...groups.values()].map((group) => ({ ...group, periods: [...group.periods].sort((a, b) => periodStart(a).localeCompare(periodStart(b))) })).sort((a, b) => a.periods[0].inicio.localeCompare(b.periods[0].inicio) || a.nome.localeCompare(b.nome, "pt-BR"));
}
function masterSelectionForPeriod(obra, mestre) {
  const mestreKey = mestre.mestreKey ?? getMestreKey(mestre);
  return { obraId: obra.id, mestreKey, periods: masterPeriodsForObra(obra).find((group) => group.key === mestreKey)?.periods ?? [] };
}
function startedMasterPeriods(obra, today) {
  return masterPeriodsForObra(obra).filter((group) => group.periods.some((item) => item.inicio <= today));
}
function recentStartedMaster(obra, today) {
  return startedMasterPeriods(obra, today).sort((a, b) => b.periods.filter((p) => p.inicio <= today).at(-1).inicio.localeCompare(a.periods.filter((p) => p.inicio <= today).at(-1).inicio))[0] ?? null;
}
function allocationWarnings(obra, item) {
  const end = calculatedEnd(item.inicio, item.tempoPlanejado);
  const obraEnd = calculatedEnd(obra.inicioPlanejado, obra.tempoPlanejado);
  return { beforeDays: item.inicio < obra.inicioPlanejado ? Math.round((Date.parse(`${obra.inicioPlanejado}T00:00:00Z`) - Date.parse(`${item.inicio}T00:00:00Z`)) / 864e5) : 0, afterDays: end > obraEnd ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${obraEnd}T00:00:00Z`)) / 864e5) : 0, end };
}
function masterOtherObras(obras2, obraId, key) {
  return obras2.filter((obra) => obra.id !== obraId).map((obra) => ({ obra, periods: obra.mestresPlanejados.filter((item) => (item.mestreKey ?? getMestreKey(item)) === key).sort((a, b) => a.inicio.localeCompare(b.inicio)) })).filter((item) => item.periods.length).sort((a, b) => a.periods[0].inicio.localeCompare(b.periods[0].inicio));
}

// src/features/cronograma-obras/domain/masterResize.ts
function resizeMasterPlanning(_obra, mestre, edge, targetDate) {
  const end = calculatedEnd(mestre.inicio, mestre.tempoPlanejado);
  if (edge === "start") {
    const finalStart = targetDate > end ? end : targetDate;
    return { ...mestre, inicio: finalStart, tempoPlanejado: Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${finalStart}T00:00:00Z`)) / 864e5) + 1) };
  }
  const finalEnd = targetDate < mestre.inicio ? mestre.inicio : targetDate;
  return { ...mestre, tempoPlanejado: Math.max(1, Math.round((Date.parse(`${finalEnd}T00:00:00Z`) - Date.parse(`${mestre.inicio}T00:00:00Z`)) / 864e5) + 1) };
}

// src/features/cronograma-obras/data/cronograma2026.raw.ts
var CRONOGRAMA_2026_RAW = [
  { sourceRow: 4, local: "FONTOURA XAVIER 96m", status: "EM ANDAMENTO", contrato: "122/2024", empresa: "ARTEBASE", mestre: "DINE", prev: "240", dias: "77", progresso: "32.08%", descricao: "INFRA, MESO E SUPER", allocations: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [24, 7], [25, 7], [26, 7], [29, 7], [30, 7], [31, 7]] },
  { sourceRow: 5, local: "FONTOURA XAVIER 98m", status: "EM ANDAMENTO", contrato: "122/2024", empresa: "ARTEBASE", mestre: "DILAMAR", prev: "240", dias: "77", progresso: "32.08%", descricao: "INFRA, MESO E SUPER", allocations: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 3], [7, 7], [8, 7], [21, 7], [22, 7], [23, 7], [27, 4], [28, 7]] },
  { sourceRow: 6, local: "S\xC3O VENDELINO", status: "FINALIZADA", contrato: "076/2024", empresa: "ARTEBASE", mestre: null, prev: "238", dias: "0", progresso: "0.00%", descricao: "INFRA, MESO E SUPER", allocations: [] },
  { sourceRow: 7, local: "SINIMBU 50M", status: "AGUARDANDO RECURSO", contrato: "029/2025", empresa: "ARTEBASE", mestre: "DINE", prev: "175", dias: "91", progresso: "76.47%", descricao: "INFRA, MESO E SUPER", allocations: [[7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [12, 7], [13, 7], [14, 7], [15, 7], [16, 7], [17, 7], [19, 7], [20, 7]] },
  { sourceRow: 8, local: "SINIMBU 40M", status: "AGUARDANDO RECURSO", contrato: "029/2025", empresa: "ARTEBASE", mestre: "DILAMAR", prev: "175", dias: "14", progresso: "3.89%", descricao: "INFRA, MESO E SUPER", allocations: [[7, 7], [20, 7]] },
  { sourceRow: 9, local: "SINIMBU II", status: "AGUARDANDO RECURSO", contrato: "080/2025", empresa: "ARTEBASE", mestre: null, prev: "175", dias: "0", progresso: "0.00%", descricao: "INFRA, MESO E SUPER", allocations: [] },
  { sourceRow: 10, local: "ACIEPP", status: "FINALIZADA", contrato: "-", empresa: "LEDUR", mestre: "VANDERLEI", prev: "30", dias: "14", progresso: "5.83%", descricao: "INFRA, MESO E SUPER", allocations: [[1, 7], [2, 7]] },
  { sourceRow: 11, local: "RESTINGA SECA", status: "FINALIZADA", contrato: "028/2025", empresa: "ARTEBASE", mestre: "EVERALDO", prev: "119", dias: "41", progresso: "17.08%", descricao: "INFRA, MESO E SUPER", allocations: [[1, 7], [3, 7], [4, 7], [7, 7], [8, 3], [9, 7], [10, 3]] },
  { sourceRow: 12, local: "SOBRADINHO I", status: "FINALIZADA", contrato: "01/2025", empresa: "ARTEBASE", mestre: "RUDI", prev: "360", dias: "49", progresso: "13.61%", descricao: "INFRA, MESO E SUPER", allocations: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7]] },
  { sourceRow: 13, local: "ARROIO DO TIGRE I", status: "FINALIZADA", contrato: "214/2024", empresa: "ARTEBASE", mestre: "JEFE", prev: "240", dias: "44", progresso: "24.44%", descricao: "INFRA, MESO E SUPER", allocations: [[10, 7], [11, 7], [12, 7], [17, 7], [18, 7], [19, 7], [20, 2]] },
  { sourceRow: 14, local: "ARROIO DO TIGRE II", status: "EM ANDAMENTO", contrato: "45/2025", empresa: "ARTEBASE", mestre: "AMILTON", prev: "360", dias: "210", progresso: "58.33%", descricao: "INFRA, MESO E SUPER", allocations: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [13, 7], [14, 7], [15, 7], [16, 7], [17, 7], [18, 7], [19, 7], [20, 7], [21, 7], [22, 7], [23, 7], [24, 7], [25, 7], [26, 7], [27, 7], [28, 7], [29, 7], [30, 7], [31, 7], [32, 7], [33, 7], [34, 7], [35, 7], [36, 7]] },
  { sourceRow: 15, local: "ARROIO DO TIGRE III", status: "EM ANDAMENTO", contrato: "034/2026", empresa: "ARTEBASE", mestre: "DILAMAR", prev: "360", dias: "35", progresso: "9.72%", descricao: "INFRA, MESO E SUPER", allocations: [[15, 7], [16, 7], [21, 7], [22, 7], [23, 7], [33, 7], [34, 7]] },
  { sourceRow: 16, local: "PASSA SETE", status: "FINALIZADA", contrato: "37/2025", empresa: "ARTEBASE", mestre: "EVERALDO", prev: "180", dias: "42", progresso: "23.33%", descricao: "INFRA, MESO E SUPER", allocations: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]] },
  { sourceRow: 17, local: "PASSA SETE", status: "EM ANDAMENTO", contrato: "059/2025", empresa: "ARTEBASE", mestre: "EVERALDO", prev: "90", dias: "77", progresso: "32.08%", descricao: "INFRA, MESO E SUPER", allocations: [[17, 7], [18, 7], [19, 7], [20, 7], [21, 7], [22, 7], [23, 7], [24, 7], [25, 7], [26, 7], [27, 7]] },
  { sourceRow: 18, local: "PASSA SETE", status: "EM ANDAMENTO", contrato: "059/2025", empresa: "ARTEBASE", mestre: "VANDERLEI", prev: "90", dias: "67", progresso: null, descricao: "INFRA, MESO E SUPER", allocations: [[20, 7], [21, 7], [22, 7], [23, 7], [24, 7], [25, 7], [26, 7], [27, 7], [28, 7], [29, 4]] },
  { sourceRow: 19, local: "TUNAS", status: "FINALIZADA", contrato: "135/2025", empresa: "ARTEBASE", mestre: "VANDERLEI", prev: "180", dias: "42", progresso: "23.33%", descricao: "INFRA, MESO E SUPER", allocations: [[6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7]] },
  { sourceRow: 20, local: "IBARAMA", status: "EM ANDAMENTO", contrato: "048/2025", empresa: "ARTEBASE", mestre: null, prev: "240", dias: "14", progresso: "5.83%", descricao: "INFRA, MESO E SUPER", allocations: [[13, 7], [14, 7]] },
  { sourceRow: 21, local: "IBARAMA", status: "EM ANDAMENTO", contrato: "048/2025", empresa: "ARTEBASE", mestre: "DILAMAR", prev: "240", dias: "73", progresso: "30.42%", descricao: "INFRA, MESO E SUPER", allocations: [[5, 3], [6, 7], [7, 7], [8, 7], [12, 7], [13, 7], [14, 7], [15, 7], [16, 7], [30, 7], [31, 7], [32, 7], [33, 7], [34, 7], [35, 7]] },
  { sourceRow: 22, local: "PALMARES DO SUL", status: "EM ANDAMENTO", contrato: null, empresa: "LEDUR", mestre: "JEFE", prev: "60", dias: "0", progresso: "0.00%", descricao: "INFRA, MESO E SUPER", allocations: [[33, 7], [34, 7], [35, 7]] },
  { sourceRow: 23, local: "PAIM FILHO", status: "EM ANDAMENTO", contrato: null, empresa: "LEDUR", mestre: "EVERALDO", prev: "30", dias: null, progresso: "0.00%", descricao: "INFRA, MESO E SUPER", allocations: [[30, 7], [31, 7], [36, 7], [37, 7]] },
  { sourceRow: 24, local: "CARLOS GOMES", status: "EM ANDAMENTO", contrato: null, empresa: "LEDUR", mestre: "RUDI", prev: null, dias: null, progresso: null, descricao: "INFRA, MESO E SUPER", allocations: [[31, 7]] },
  { sourceRow: 25, local: "DOIS IRM\xC3OS DAS MISS\xD5ES", status: "EM ANDAMENTO", contrato: null, empresa: "LEDUR", mestre: "VANDERLEI", prev: null, dias: null, progresso: null, descricao: "INFRA, MESO E SUPER", allocations: [[35, 7], [36, 7], [37, 7]] },
  { sourceRow: 26, local: "IBIRAPUIT\xC3", status: "AGUARDANDO RECURSO", contrato: null, empresa: "LEDUR", mestre: null, prev: null, dias: null, progresso: null, descricao: "INFRA, MESO E SUPER", allocations: [] },
  { sourceRow: 27, local: "SANTO AUGUSTO", status: "EM ANDAMENTO", contrato: "043/2026", empresa: "LEDUR", mestre: "VANDERLEI", prev: null, dias: "14", progresso: "#DIV/0!", descricao: "INFRA, MESO E SUPER", allocations: [[13, 7], [14, 7]] },
  { sourceRow: 28, local: "LAGOA BONITA DO SUL", status: "EM ANDAMENTO", contrato: null, empresa: "LEDUR", mestre: "VANDERLEI", prev: "60", dias: "14", progresso: "23.33%", descricao: "INFRA, MESO E SUPER", allocations: [[30, 7], [31, 7], [32, 7], [33, 7], [34, 7]] },
  { sourceRow: 29, local: "COQUEIROS DO SUL", status: "AGUARDANDO RECURSO", contrato: null, empresa: "LEDUR", mestre: null, prev: null, dias: null, progresso: null, descricao: "INFRA, MESO E SUPER", allocations: [] },
  { sourceRow: 30, local: "IBIRUB\xC1", status: "EM ANDAMENTO", contrato: null, empresa: "LEDUR", mestre: null, prev: null, dias: null, progresso: null, descricao: "INFRA, MESO E SUPER", allocations: [[32, 7]] },
  { sourceRow: 41, local: "FREE SHOP", status: "EM ANDAMENTO", contrato: null, empresa: "LEDUR", mestre: "ANT\xD4NIO", prev: null, dias: null, progresso: null, descricao: "INFRA, MESO E SUPER", allocations: [[31, 7], [32, 7], [33, 7], [34, 7]] },
  { sourceRow: 42, local: "GRILO", status: "EM ANDAMENTO", contrato: null, empresa: "LEDUR", mestre: "TIAGO", prev: null, dias: null, progresso: null, descricao: "INFRA, MESO E SUPER", allocations: [[31, 7], [32, 7], [33, 7], [34, 7]] },
  { sourceRow: 43, local: "CORPO E ALMA", status: "EM ANDAMENTO", contrato: null, empresa: "LEDUR", mestre: "RODRIGO", prev: "180", dias: "189", progresso: "105.00%", descricao: "INFRA, MESO E SUPER", allocations: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [13, 7], [14, 7], [15, 7], [16, 7], [17, 7], [18, 7], [20, 7], [21, 7], [22, 7], [23, 7], [24, 7], [25, 7], [26, 7], [27, 7], [28, 7], [29, 7]] },
  { sourceRow: 44, local: "ZIG", status: "FINALIZADA", contrato: null, empresa: "LEDUR", mestre: "TIAGO", prev: null, dias: "14", progresso: "12.50%", descricao: "INFRA, MESO E SUPER", allocations: [[1, 7], [2, 7]] },
  { sourceRow: 45, local: "BETO SPANEVELLO", status: "EM ANDAMENTO", contrato: null, empresa: "LEDUR", mestre: null, prev: "112", dias: "0", progresso: "0.00%", descricao: "INFRA, MESO E SUPER", allocations: [] },
  { sourceRow: 46, local: "MENEGAZZO", status: "EM ANDAMENTO", contrato: null, empresa: "LEDUR", mestre: "ANTONIO", prev: "112", dias: "77", progresso: "10.72%", descricao: "INFRA, MESO E SUPER", allocations: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7]] },
  { sourceRow: 47, local: "SARAH SIQUEIRA", status: "EM ANDAMENTO", contrato: null, empresa: "LEDUR", mestre: "ANTONIO", prev: "84", dias: "70", progresso: "291.67%", descricao: "INFRA, MESO E SUPER", allocations: [[8, 7], [9, 7], [10, 7], [11, 7], [12, 7], [13, 7], [15, 7], [16, 7], [17, 7], [18, 7]] },
  { sourceRow: 48, local: "CCL - SICREDI", status: "FINALIZADO", contrato: null, empresa: "LEDUR", mestre: "ANTONIO", prev: "45", dias: "28", progresso: "4.96%", descricao: "MONTAGEM", allocations: [[22, 7], [23, 7], [24, 7], [25, 7]] }
];
var QUINZENAS_2026_MESTRES = ["DINE", "DILAMAR", "JEFE", "VANDERLEI", "RUDIMAR", "EVERALDO", "AMILTON", "FIRMINO"];

// src/features/cronograma-obras/data/fixtures/fixtureCronogramaDataSource.ts
function catalogFromRaw() {
  return CRONOGRAMA_2026_RAW.map((raw) => ({ id: `obra-${raw.sourceRow}`, sourceRow: raw.sourceRow, codObra: `OB-${String(raw.sourceRow).padStart(3, "0")}`, siglaObra: raw.local.split(" ")[0], nomeObra: raw.local, local: raw.local, status: raw.status, empresa: raw.empresa, mestreInicial: raw.mestre, descricao: raw.descricao }));
}
var catalog = catalogFromRaw();
var byRow = (row) => catalog.find((item) => item.sourceRow === row);
var plan = (row, inicioPlanejado, tempoPlanejado, mestresPlanejados) => ({ ...byRow(row), inicioPlanejado, tempoPlanejado, mestresPlanejados });
var initial = [plan(5, "2026-01-05", 45, [{ localId: "m-5a", nome: "DILAMAR", inicio: "2026-01-05", tempoPlanejado: 21 }, { localId: "m-5b", nome: "EVERALDO", inicio: "2026-02-01", tempoPlanejado: 17 }]), plan(7, "2026-02-16", 30, [{ localId: "m-7a", nome: "DINE", inicio: "2026-02-16", tempoPlanejado: 30 }]), plan(6, "2026-01-12", 7, []), plan(14, "2026-04-01", 90, [{ localId: "m-14a", nome: "AMILTON", inicio: "2026-04-01", tempoPlanejado: 90 }]), plan(17, "2026-05-04", 42, [{ localId: "m-17a", nome: "EVERALDO", inicio: "2026-05-04", tempoPlanejado: 42 }]), plan(11, "2026-02-08", 20, [{ localId: "m-11a", nome: "EVERALDO", inicio: "2026-02-08", tempoPlanejado: 20 }])];
var FixtureCronogramaDataSource = class {
  listarItensCronograma() {
    return initial.map((obra) => ({ ...obra, mestresPlanejados: obra.mestresPlanejados.map((mestre) => ({ ...mestre })) }));
  }
  listarMestres() {
    return [.../* @__PURE__ */ new Set([...QUINZENAS_2026_MESTRES, ...catalog.flatMap((obra) => obra.mestreInicial ? [obra.mestreInicial] : [])])].sort();
  }
};

// src/features/cronograma-obras/domain/calendarDisplay.ts
var DEFAULT_CALENDAR_DISPLAY = { liveAlerts: true, masterNames: true };
function visibleTemporalState(state, liveAlerts) {
  return liveAlerts ? state : null;
}
var LABEL_HORIZONTAL_PADDING = 5;
var ESTIMATED_CHARACTER_WIDTH = 5;
function masterNameContent(name, showNames, availableWidth = Number.POSITIVE_INFINITY, masterCount = 1, zoom = "day") {
  if (!showNames || masterCount !== 1 || zoom === "year") return null;
  const fullWidth = name.length * ESTIMATED_CHARACTER_WIDTH + LABEL_HORIZONTAL_PADDING;
  if (availableWidth >= fullWidth) return name;
  const short = name.slice(0, 3).toLocaleUpperCase("pt-BR");
  return availableWidth >= short.length * ESTIMATED_CHARACTER_WIDTH + LABEL_HORIZONTAL_PADDING ? short : null;
}
function mastersTooltip(masters) {
  const names = [...new Set(masters.map((mestre) => mestre.nome).filter(Boolean))];
  return names.length ? `Mestres:
${names.map((name) => `- ${name}`).join("\n")}` : void 0;
}

// src/features/cronograma-obras/domain/timelineAggregation.ts
function layoutOverlapLanes(segments) {
  const overlaps = (a, b) => a.offset < b.offset + b.days && a.offset + a.days > b.offset;
  return segments.map((_, target) => {
    const component = /* @__PURE__ */ new Set([target]);
    let changed = true;
    while (changed) {
      changed = false;
      segments.forEach((segment, index) => {
        if (!component.has(index) && [...component].some((member) => overlaps(segment, segments[member]))) {
          component.add(index);
          changed = true;
        }
      });
    }
    const laneEnds = [];
    const assignments = /* @__PURE__ */ new Map();
    [...component].sort((a, b) => segments[a].offset - segments[b].offset).forEach((index) => {
      const segment = segments[index];
      let lane = laneEnds.findIndex((end) => end <= segment.offset);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = segment.offset + segment.days;
      assignments.set(index, lane);
    });
    return { index: assignments.get(target) ?? 0, count: laneEnds.length || 1 };
  });
}
function getDailyTimeline(obra, start, days, hoje, liveAlerts = true) {
  return eachDay(start, days).map((date) => {
    const state = getTemporalStateForDate(obra, date, hoje ?? obra.hoje);
    return { date, state: visibleTemporalState(state, liveAlerts), masters: getMastersForDate(obra.mestresPlanejados, date) };
  });
}
function aggregateConsecutiveStates(days) {
  const result = [];
  days.forEach((day, offset) => {
    const previous = result.at(-1);
    if (day.state && previous?.type === day.state) previous.days += 1;
    else if (day.state) result.push({ type: day.state, offset, days: 1 });
  });
  return result;
}
function getMasterSegmentsInBucket(masters, start, days) {
  const end = addDays(start, days - 1);
  return masters.flatMap((mestre) => {
    const inicio = mestre.inicio > start ? mestre.inicio : start;
    const fimMestre = calculatedEnd(mestre.inicio, mestre.tempoPlanejado);
    const fim = fimMestre < end ? fimMestre : end;
    if (inicio > fim) return [];
    return [{ mestre, offset: eachDay(start, days).indexOf(inicio), days: countIntersection(mestre.inicio, mestre.tempoPlanejado, start, days) }];
  });
}
function getBucketTimelineAggregate(obra, start, days, hoje, liveAlerts = true) {
  const daily = getDailyTimeline(obra, start, days, hoje, liveAlerts);
  return { days, plannedDays: countIntersection(obra.inicioPlanejado, obra.tempoPlanejado, start, days), states: aggregateConsecutiveStates(daily), masters: getMasterSegmentsInBucket(obra.mestresPlanejados, start, days) };
}
function getWeeklyTimeline(obra, weekStart2, hoje, liveAlerts = true) {
  const aggregate = getBucketTimelineAggregate(obra, weekStart2, 7, hoje, liveAlerts);
  return { plannedDays: aggregate.plannedDays, states: aggregate.states.map((segment) => ({ type: segment.type, startDayIndex: segment.offset, dayCount: segment.days })), masters: aggregate.masters.map((segment) => ({ mestre: segment.mestre, startDayIndex: segment.offset, dayCount: segment.days })) };
}

// src/features/cronograma-obras/domain/calendarYears.ts
function intervalYears(start, days) {
  const first = Number(start.slice(0, 4));
  const last = Number(calculatedEnd(start, days).slice(0, 4));
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
function planningYears(obras2, currentYear) {
  const relevant = /* @__PURE__ */ new Set([currentYear]);
  obras2.forEach((obra) => {
    intervalYears(obra.inicioPlanejado, obra.tempoPlanejado).forEach((year) => relevant.add(year));
    obra.mestresPlanejados.forEach((mestre) => intervalYears(mestre.inicio, mestre.tempoPlanejado).forEach((year) => relevant.add(year)));
  });
  const ordered = [...relevant].sort((a, b) => a - b);
  if (ordered.length === 1) return [ordered[0] - 1, ordered[0], ordered[0] + 1];
  return Array.from({ length: ordered.at(-1) - ordered[0] + 1 }, (_, index) => ordered[0] + index);
}
function yearBucket(year) {
  return { start: `${year}-01-01`, days: yearDays(year).length };
}
function plannedDaysInYear(obra, year) {
  const bucket = yearBucket(year);
  return countIntersection(obra.inicioPlanejado, obra.tempoPlanejado, bucket.start, bucket.days);
}

// src/features/cronograma-obras/domain/timelineScroll.ts
function calculateCenteredScrollLeft(todayX, viewportWidth, scrollWidth) {
  return Math.max(0, Math.min(todayX - viewportWidth / 2, Math.max(0, scrollWidth - viewportWidth)));
}
function calculateTimelineCenteredScrollLeft(targetX, usefulViewportWidth, scrollWidth, clientWidth) {
  return Math.max(0, Math.min(targetX - usefulViewportWidth / 2, Math.max(0, scrollWidth - clientWidth)));
}
function calculateTimelineContextScrollLeft(zoom, todayX, timelineWidth, usefulViewportWidth, scrollWidth, clientWidth, year = 2026, pastContextDays = 15) {
  if (zoom === "month") return calculateTimelineCenteredScrollLeft(todayX, usefulViewportWidth, scrollWidth, clientWidth);
  if (zoom === "week") return clampTimelineScrollLeft(todayX, scrollWidth, clientWidth);
  const timelineDays = yearDays(year).length;
  const contextWidth = timelineWidth / timelineDays * pastContextDays;
  return clampTimelineScrollLeft(todayX - contextWidth, scrollWidth, clientWidth);
}
function clampTimelineScrollLeft(scrollLeft, scrollWidth, clientWidth) {
  return Math.max(0, Math.min(scrollLeft, Math.max(0, scrollWidth - clientWidth)));
}
function weeklyContextStart(today, pastContextDays = 15) {
  return addDays(today, -pastContextDays);
}
function weeklyContextWeekStart(today, pastContextDays = 15) {
  return weekStart(weeklyContextStart(today, pastContextDays));
}
function weeklyContextWeekIndex(today, year = 2026, pastContextDays = 15) {
  const index = weeklyHeader(year).indexOf(weeklyContextWeekStart(today, pastContextDays));
  return index < 0 ? null : index;
}
function weeklyContextScrollLeft(today, timelineWidth, scrollWidth, clientWidth, year = 2026, pastContextDays = 15) {
  const contextWeekIndex = weeklyContextWeekIndex(today, year, pastContextDays);
  return contextWeekIndex === null ? null : clampTimelineScrollLeft(timelineWidth * contextWeekIndex / weeklyHeader(year).length, scrollWidth, clientWidth);
}
function timelineDateRatio(zoom, date, year = 2026) {
  if (!date.startsWith(`${year}-`)) return null;
  if (zoom === "week") {
    const weeks = weeklyHeader(year);
    const index2 = weeks.findIndex((start, position) => date >= start && (position === weeks.length - 1 || date < weeks[position + 1]));
    return index2 < 0 ? null : (index2 + 0.5) / weeks.length;
  }
  const days = yearDays(year);
  const index = days.indexOf(date);
  return index < 0 ? null : (index + 0.5) / days.length;
}

// src/features/cronograma-obras/domain/obraGridColumns.ts
var OBRA_COLUMN_WIDTH = { default: 220, min: 140, max: 360 };
var OTHER_OBRA_COLUMN_WIDTHS = [168, 112, 122, 76, 112, 70];
var CORE_OBRA_COLUMN_WIDTHS = OTHER_OBRA_COLUMN_WIDTHS.slice(0, 3);
function clampObraColumnWidth(width) {
  return Math.min(OBRA_COLUMN_WIDTH.max, Math.max(OBRA_COLUMN_WIDTH.min, width));
}
function obraGridColumns(obraWidth, detailsVisible = true) {
  const widths = detailsVisible ? OTHER_OBRA_COLUMN_WIDTHS : CORE_OBRA_COLUMN_WIDTHS;
  return `${clampObraColumnWidth(obraWidth)}px ${widths.map((width) => `${width}px`).join(" ")} 22px`;
}
function obraGridWidth(obraWidth, detailsVisible = true) {
  const widths = detailsVisible ? OTHER_OBRA_COLUMN_WIDTHS : CORE_OBRA_COLUMN_WIDTHS;
  return clampObraColumnWidth(obraWidth) + widths.reduce((total, width) => total + width, 0) + 22;
}

// tests/cronograma-obras.test.ts
var source = new FixtureCronogramaDataSource();
var obras = source.listarItensCronograma();
var fixtureObra = (id) => ({ ...obras[0], id, mestreInicial: null, mestresPlanejados: [] });
test("calcula fim inclusivo e dura\xE7\xE3o de um dia", () => {
  assert.equal(calculatedEnd("2026-10-05", 14), "2026-10-18");
  assert.equal(calculatedEnd("2026-10-05", 1), "2026-10-05");
});
test("data manual incompleta ou inv\xE1lida permanece em estado seguro", () => {
  assert.equal(isValidCivilDate("2026-02-29"), false);
  assert.equal(isValidCivilDate("2026-10-"), false);
  assert.equal(tryCalculatedEnd("", 14), null);
  assert.equal(tryCalculatedEnd("2026-10-", 14), null);
  assert.equal(tryCalculatedEnd("2026-10-05", 14), "2026-10-18");
});
test("agrega ocupa\xE7\xE3o semanal completa e parcial", () => {
  assert.equal(daysInWeek("2026-10-05", 7, "2026-10-05"), 7);
  assert.equal(daysInWeek("2026-10-05", 3, "2026-10-05"), 3);
});
test("barra semanal parcial preserva quantidade e posi\xE7\xE3o real dos dias", () => {
  assert.deepEqual(weeklyAllocation("2026-09-30", 14, "2026-09-28"), { offset: 2, days: 5 });
  assert.deepEqual(weeklyAllocation("2026-10-05", 3, "2026-10-05"), { offset: 0, days: 3 });
  assert.deepEqual(weeklyAllocation("2026-10-11", 1, "2026-10-05"), { offset: 6, days: 1 });
});
test("agrega m\xEAs, cruza meses e ano", () => {
  assert.equal(daysInMonth("2026-10-18", 14, "2026-10-01"), 14);
  assert.equal(daysInMonth("2026-12-28", 10, "2027-01-01"), 6);
  assert.equal(calculatedEnd("2026-12-28", 10), "2027-01-06");
});
test("detecta conflito por mestre e per\xEDodos adjacentes n\xE3o conflitam", () => {
  const workloads = buildWorkloads(obras);
  assert.ok(workloads.find((item) => item.mestre === "EVERALDO").conflictDays > 0);
  const adjacent = obras.map((obra) => ({ ...obra, mestresPlanejados: obra.mestresPlanejados.map((item) => ({ ...item })) }));
  adjacent[5].mestresPlanejados[0].inicio = "2026-02-18";
  assert.equal(buildWorkloads(adjacent).find((item) => item.mestre === "EVERALDO").conflictDays, 0);
});
test("mestreInicial sem planejamento n\xE3o ocupa mestre, n\xE3o cria conflito nem workload", () => {
  const semPlanejamento = { ...fixtureObra("sem-planejamento"), mestreInicial: "DINE", inicioPlanejado: "2026-10-05", tempoPlanejado: 14 };
  const only = [semPlanejamento];
  assert.equal(buildWorkloads(only).length, 0);
  assert.equal(calculateIndicators(only).allocated, 0);
  assert.equal(calculateIndicators(only).conflicts, 0);
  assert.equal(calculateIndicators(only).unassigned, 1);
});
test("dois mestres em uma obra s\xE3o considerados", () => {
  assert.equal(obras[0].mestresPlanejados.length, 2);
  assert.ok(buildWorkloads(obras).some((item) => item.mestre === "DILAMAR"));
});
test("edita e remove mestre no estado local", () => {
  const local = fixtureObra("editavel");
  const edited = updateObraLocal([local], { ...local, mestreInicial: "DINE", mestresPlanejados: [{ localId: "x", nome: "DINE", inicio: "2026-10-05", tempoPlanejado: 14 }] });
  assert.equal(edited[0].mestresPlanejados.length, 1);
  assert.equal(updateObraLocal(edited, { ...edited[0], mestresPlanejados: [] })[0].mestresPlanejados.length, 0);
});
test("filtros seguem encontrando planejamento e ignoram mestreInicial no filtro de mestre", () => {
  const onlyInitial = { ...fixtureObra("inicial"), mestreInicial: "NOVO", inicioPlanejado: "2026-10-05", tempoPlanejado: 14 };
  const planned = { ...onlyInitial, id: "planejada", mestresPlanejados: [{ localId: "novo", nome: "NOVO", inicio: "2026-10-05", tempoPlanejado: 14 }] };
  const filters = { search: "", status: "", empresa: "", mestre: "NOVO", period: "year" };
  assert.deepEqual(filterObras([onlyInitial, planned], filters).map((obra) => obra.id), ["planejada"]);
});
test("drop aceita datas fora do prazo sem alterar a obra", () => {
  const obra = { ...obras[0], inicioPlanejado: "2026-10-05", tempoPlanejado: 7 };
  assert.deepEqual(getDropPlanningInterval({ obra, zoom: "day", targetDateOrPeriod: "2026-10-12" }), { inicio: "2026-10-12", tempoPlanejado: 1 });
  assert.equal(obra.inicioPlanejado, "2026-10-05");
  assert.equal(obra.tempoPlanejado, 7);
});
test("drop semanal preserva segunda a domingo sem recorte", () => {
  const obra = { ...obras[0], inicioPlanejado: "2026-09-23", tempoPlanejado: 3 };
  assert.deepEqual(getDropPlanningInterval({ obra, zoom: "week", targetDateOrPeriod: "2026-09-24" }), { inicio: "2026-09-21", tempoPlanejado: 7 });
});
test("drop mensal mant\xE9m o bucket visual inteiro", () => {
  const obra = { ...obras[0], inicioPlanejado: "2026-09-20", tempoPlanejado: 25 };
  assert.deepEqual(getDropPlanningInterval({ obra, zoom: "month", targetDateOrPeriod: "2026-10-01" }), { inicio: "2026-10-01", tempoPlanejado: 31 });
});
test("drop local cria mestrePlanejado, mant\xE9m mestreInicial e evita duplicata exata", () => {
  const obra = { ...obras[0], mestreInicial: "AMILTON", mestresPlanejados: [] };
  const item = { localId: "drop-1", mestreKey: normalizeMestreKey("DILAMAR"), nome: "DILAMAR", inicio: "2026-10-05", tempoPlanejado: 7 };
  const added = addMestrePlanejadoLocal([obra], obra.id, item);
  assert.equal(added[0].mestreInicial, "AMILTON");
  assert.deepEqual(added[0].mestresPlanejados, [item]);
  assert.equal(addMestrePlanejadoLocal(added, obra.id, { ...item, localId: "drop-2" })[0].mestresPlanejados.length, 1);
});
test("conflito n\xE3o bloqueia cria\xE7\xE3o e indicadores s\xE3o recalculados", () => {
  const first = { ...obras[0], id: "a", mestresPlanejados: [] };
  const second = { ...obras[0], id: "b", mestresPlanejados: [] };
  const item = { localId: "a1", mestreKey: "dilamar", nome: "DILAMAR", inicio: "2026-10-05", tempoPlanejado: 7 };
  const once = addMestrePlanejadoLocal([first, second], "a", item);
  const twice = addMestrePlanejadoLocal(once, "b", { ...item, localId: "b1" });
  assert.equal(twice[1].mestresPlanejados.length, 1);
  assert.ok(calculateIndicators(twice).conflicts > 0);
});
test("cor de mestre \xE9 determin\xEDstica e pertence \xE0 paleta", () => {
  const color = getMestreColor("uid-dilamar");
  assert.deepEqual(color, getMestreColor("uid-dilamar"));
  assert.ok(PALETTE.includes(color));
});
test("obra dentro do prazo nunca fica vermelha e s\xF3 abre aten\xE7\xE3o depois de vencer", () => {
  assert.deepEqual(getObraTemporalSegments({ ...fixtureObra("no-prazo"), inicioPlanejado: "2026-10-01", tempoPlanejado: 10, status: "EM ANDAMENTO", mestresPlanejados: [], hoje: "2026-10-10" }), [{ type: "planned", inicio: "2026-10-01", fim: "2026-10-10" }, { type: "attention", inicio: "2026-10-11", fim: "2026-10-24" }]);
});
test("obra vencida preserva prazo azul, depois mostra vermelho e amarelo", () => {
  assert.deepEqual(getObraTemporalSegments({ ...fixtureObra("vencida"), inicioPlanejado: "2026-10-01", tempoPlanejado: 9, status: "EM ANDAMENTO", mestresPlanejados: [], hoje: "2026-10-10" }), [{ type: "planned", inicio: "2026-10-01", fim: "2026-10-09" }, { type: "overdue", inicio: "2026-10-10", fim: "2026-10-10" }, { type: "attention", inicio: "2026-10-11", fim: "2026-10-24" }]);
});
test("obra finalizada n\xE3o recebe extens\xE3o de aten\xE7\xE3o", () => {
  assert.deepEqual(getObraTemporalSegments({ inicioPlanejado: "2026-10-01", tempoPlanejado: 2, status: "FINALIZADO", hoje: "2026-10-10" }), [{ type: "planned", inicio: "2026-10-01", fim: "2026-10-02" }]);
});
test("extens\xE3o visual n\xE3o altera a dura\xE7\xE3o planejada da obra", () => {
  const obra = { ...obras[0], inicioPlanejado: "2026-10-01", tempoPlanejado: 2, status: "EM ANDAMENTO" };
  const segments = getObraTemporalSegments({ ...obra, hoje: "2026-10-10" });
  assert.equal(obra.tempoPlanejado, 2);
  assert.equal(segments.some((item) => item.type === "overdue"), true);
});
test("bucket semanal mant\xE9m transi\xE7\xE3o proporcional de vermelho para amarelo", () => {
  const segments = getObraTemporalSegments({ inicioPlanejado: "2026-10-01", tempoPlanejado: 1, status: "EM ANDAMENTO", hoje: "2026-10-07" });
  assert.deepEqual(getTemporalSegmentsInBucket(segments, "2026-10-05", 7), [{ type: "overdue", inicio: "2026-10-05", fim: "2026-10-07" }, { type: "attention", inicio: "2026-10-08", fim: "2026-10-11" }]);
});
test("bucket mensal preserva dias planejados e mostra aten\xE7\xE3o apenas como visual", () => {
  const obra = { ...obras[0], inicioPlanejado: "2026-10-01", tempoPlanejado: 2, status: "EM ANDAMENTO" };
  assert.equal(daysInMonth(obra.inicioPlanejado, obra.tempoPlanejado, "2026-10-01"), 2);
  assert.equal(getTemporalSegmentsInBucket(getObraTemporalSegments({ ...obra, hoje: "2026-10-10" }), "2026-10-01", 31).find((item) => item.type === "attention").inicio, "2026-10-11");
});
test("cores de mestre n\xE3o usam as cores claras reservadas da obra", () => {
  const reserved = /* @__PURE__ */ new Set(["#d7eafa", "#f8d9d5", "#fff0c9"]);
  PALETTE.forEach((color) => assert.equal(reserved.has(color.background), false));
});
test("registro de cores \xE9 injetivo, determin\xEDstico e evita reservadas", () => {
  const keys = ["rudi", "dilamar", "everaldo", ...Array.from({ length: 12 }, (_, i) => `mestre-${i}`)];
  const first = mestreColorRegistry(keys);
  const second = mestreColorRegistry([...keys].reverse());
  assert.equal(new Set([...first.values()].map((color) => color.background)).size, keys.length);
  assert.deepEqual([...first], [...second]);
  ["#d7eafa", "#f8d9d5", "#fff0c9"].forEach((reserved) => first.forEach((color) => assert.notEqual(color.background, reserved)));
});
test("drop em obra em dia exige in\xEDcio no prazo; obra atrasada aceita extens\xE3o; finalizada recusa", () => {
  const base = { ...obras[0], inicioPlanejado: "2026-10-01", tempoPlanejado: 2, mestresPlanejados: [] };
  assert.equal(isValidMasterDropStart(base, "2026-10-04", "2026-10-02"), false);
  assert.equal(isValidMasterDropStart(base, "2026-10-04", "2026-10-05"), true);
  assert.equal(isValidMasterDropStart({ ...base, status: "FINALIZADA" }, "2026-10-02", "2026-10-05"), false);
  assert.equal(getDropPlanningStart({ obra: base, zoom: "day", targetDateOrPeriod: "2026-10-04", hoje: "2026-10-05" }), "2026-10-04");
});
test("dura\xE7\xE3o confirmada calcula fim e aviso sem alterar a obra", () => {
  const obra = { ...obras[0], inicioPlanejado: "2026-10-01", tempoPlanejado: 20 };
  assert.equal(getMasterPlanningEnd("2026-10-18", 7), "2026-10-24");
  assert.equal(getPlanningOverrunDays(obra, "2026-10-18", 7), 4);
  assert.equal(obra.tempoPlanejado, 20);
});
test("agrega estados semanais consecutivos", () => {
  const obra = { ...obras[0], inicioPlanejado: "2026-10-05", tempoPlanejado: 1, status: "EM ANDAMENTO", mestresPlanejados: [{ localId: "m", nome: "DILAMAR", inicio: "2026-10-06", tempoPlanejado: 2 }], hoje: "2026-10-09" };
  const aggregate = getBucketTimelineAggregate(obra, "2026-10-05", 7);
  assert.deepEqual(aggregate.states, [{ type: "planned", offset: 0, days: 1 }, { type: "mastered", offset: 1, days: 2 }, { type: "overdue", offset: 3, days: 2 }, { type: "attention", offset: 5, days: 2 }]);
});
test("agrega mestre semanal com offset", () => {
  const masters = [{ localId: "m", nome: "DILAMAR", inicio: "2026-10-09", tempoPlanejado: 3 }];
  assert.deepEqual(getMasterSegmentsInBucket(masters, "2026-10-05", 7).map(({ offset, days }) => ({ offset, days })), [{ offset: 4, days: 3 }]);
});
test("agrega m\xEAs sem incluir extens\xE3o visual", () => {
  const obra = { ...obras[0], inicioPlanejado: "2026-10-30", tempoPlanejado: 4, status: "EM ANDAMENTO", mestresPlanejados: [], hoje: "2026-11-10" };
  assert.equal(getBucketTimelineAggregate(obra, "2026-10-01", 31).plannedDays, 2);
  assert.equal(getBucketTimelineAggregate(obra, "2026-11-01", 30).plannedDays, 2);
});
test("agrega mestre mensal como presen\xE7a cont\xEDnua", () => {
  const masters = [{ localId: "m", nome: "DILAMAR", inicio: "2026-10-29", tempoPlanejado: 5 }];
  assert.deepEqual(getMasterSegmentsInBucket(masters, "2026-10-01", 31).map(({ offset, days }) => ({ offset, days })), [{ offset: 28, days: 3 }]);
  assert.deepEqual(getMasterSegmentsInBucket(masters, "2026-11-01", 30).map(({ offset, days }) => ({ offset, days })), [{ offset: 0, days: 2 }]);
});
test("geometria semanal usa a escala fixa dos sete dias", () => {
  const base = { ...obras[0], inicioPlanejado: "2026-10-05", tempoPlanejado: 7, status: "FINALIZADA", mestresPlanejados: [] };
  assert.deepEqual(getWeeklyTimeline(base, "2026-10-05").states, [{ type: "planned", startDayIndex: 0, dayCount: 7 }]);
  const cases = [["2026-10-05", 3, 0, 3], ["2026-10-09", 3, 4, 3], ["2026-10-11", 1, 6, 1], ["2026-10-07", 3, 2, 3]];
  cases.forEach(([inicioPlanejado, tempoPlanejado, startDayIndex, dayCount]) => {
    const weekly = getWeeklyTimeline({ ...base, inicioPlanejado, tempoPlanejado }, "2026-10-05");
    assert.deepEqual(weekly.states, [{ type: "planned", startDayIndex, dayCount }]);
  });
});
test("mestres semanais preservam geometria horizontal individual", () => {
  const obra = { ...obras[0], inicioPlanejado: "2026-10-05", tempoPlanejado: 7, status: "FINALIZADA", mestresPlanejados: [{ localId: "a", nome: "DILAMAR", inicio: "2026-10-05", tempoPlanejado: 7 }, { localId: "b", nome: "EVERALDO", inicio: "2026-10-09", tempoPlanejado: 3 }] };
  assert.deepEqual(getWeeklyTimeline(obra, "2026-10-05").masters.map(({ startDayIndex, dayCount }) => ({ startDayIndex, dayCount })), [{ startDayIndex: 0, dayCount: 7 }, { startDayIndex: 4, dayCount: 3 }]);
});
test("clique semanal usa obra, chave est\xE1vel e per\xEDodos do mestre selecionado", () => {
  const obra = { ...fixtureObra("obra-semanal"), mestresPlanejados: [{ localId: "d1", mestreKey: "dilamar-id", nome: "DILAMAR", inicio: "2026-10-05", tempoPlanejado: 2 }, { localId: "d2", mestreKey: "dilamar-id", nome: "DILAMAR", inicio: "2026-10-10", tempoPlanejado: 2 }, { localId: "e1", mestreKey: "everaldo-id", nome: "EVERALDO", inicio: "2026-10-09", tempoPlanejado: 3 }] };
  const segments = getWeeklyTimeline(obra, "2026-10-05").masters;
  const selections = segments.map((segment) => masterSelectionForPeriod(obra, segment.mestre));
  assert.deepEqual(selections.map(({ obraId, mestreKey, periods }) => ({ obraId, mestreKey, periods: periods.map((period) => period.localId) })), [{ obraId: "obra-semanal", mestreKey: "dilamar-id", periods: ["d1", "d2"] }, { obraId: "obra-semanal", mestreKey: "dilamar-id", periods: ["d1", "d2"] }, { obraId: "obra-semanal", mestreKey: "everaldo-id", periods: ["e1"] }]);
});
test("fluxo Adicionar Obra e seu componente foram removidos", () => {
  const root = process.cwd();
  const page = readFileSync(resolve(root, "src/features/cronograma-obras/CronogramaObrasPage.tsx"), "utf8");
  const planner = readFileSync(resolve(root, "src/features/cronograma-obras/application/localPlanner.ts"), "utf8");
  assert.equal(existsSync(resolve(root, "src/features/cronograma-obras/components/AddObraDrawer.tsx")), false);
  assert.equal(/Adicionar Obra|AddObra|setAdding|addObraLocal/.test(`${page}
${planner}`), false);
});
test("toggles visuais iniciam ligados e alerta vivo controla toda a camada temporal", () => {
  assert.deepEqual(DEFAULT_CALENDAR_DISPLAY, { liveAlerts: true, masterNames: true });
  ["planned", "mastered", "overdue", "attention"].forEach((state) => {
    assert.equal(visibleTemporalState(state, true), state);
    assert.equal(visibleTemporalState(state, false), null);
  });
});
test("nome de mestre usa completo, trigrama ou oculta conforme o segmento", () => {
  assert.equal(masterNameContent("DILAMAR", true, 60, 1, "day"), "DILAMAR");
  assert.equal(masterNameContent("DILAMAR", true, 24, 1, "day"), "DIL");
  assert.equal(masterNameContent("DILAMAR", true, 16, 1, "week"), null);
  assert.equal(masterNameContent("DILAMAR", false, 60, 1, "month"), null);
});
test("nomes inline somem com dois mestres e sempre somem no Ano", () => {
  assert.equal(masterNameContent("DILAMAR", true, 80, 2, "month"), null);
  assert.equal(masterNameContent("DILAMAR", true, 200, 1, "year"), null);
});
test("hover agrega todos os mestres mesmo com nomes inline desligados", () => {
  const list = [{ localId: "a", nome: "DILAMAR", inicio: "2026-01-01", tempoPlanejado: 1 }, { localId: "b", nome: "EVERALDO", inicio: "2026-01-01", tempoPlanejado: 1 }];
  assert.equal(mastersTooltip(list), "Mestres:\n- DILAMAR\n- EVERALDO");
});
test("alerta desligado zera estados temporais e preserva a camada de mestre", () => {
  const obra = { ...obras[0], inicioPlanejado: "2026-10-01", tempoPlanejado: 2, status: "EM ANDAMENTO", mestresPlanejados: [{ localId: "m", nome: "DILAMAR", inicio: "2026-10-01", tempoPlanejado: 2 }], hoje: "2026-10-10" };
  const on = getBucketTimelineAggregate(obra, "2026-10-01", 31, void 0, true);
  const off = getBucketTimelineAggregate(obra, "2026-10-01", 31, void 0, false);
  assert.ok(on.states.length > 0);
  assert.deepEqual(off.states, []);
  assert.equal(off.masters.length, 1);
  assert.equal(off.plannedDays, 2);
  assert.equal(obra.tempoPlanejado, 2);
});
test("Carga dos Mestres \xE9 montada somente na aba Mestres", () => {
  const page = readFileSync(resolve(process.cwd(), "src/features/cronograma-obras/CronogramaObrasPage.tsx"), "utf8");
  assert.match(page, /view === 'mestres' && <WorkloadPanel/);
  assert.equal((page.match(/<WorkloadPanel/g) ?? []).length, 1);
});
test("zoom Ano adiciona contexto quando somente 2026 \xE9 relevante", () => {
  const only = [{ ...fixtureObra("2026"), inicioPlanejado: "2026-03-01", tempoPlanejado: 2 }];
  assert.deepEqual(planningYears(only, 2026), [2025, 2026, 2027]);
});
test("zoom Ano usa intervalo 2025-2026 sem contexto artificial", () => {
  const data = [{ ...fixtureObra("2025"), inicioPlanejado: "2025-12-01", tempoPlanejado: 2 }, { ...fixtureObra("2026"), inicioPlanejado: "2026-01-01", tempoPlanejado: 2 }];
  assert.deepEqual(planningYears(data, 2026), [2025, 2026]);
});
test("zoom Ano sempre inclui o ano atual", () => {
  const future = [{ ...fixtureObra("2027"), inicioPlanejado: "2027-01-01", tempoPlanejado: 2 }];
  assert.deepEqual(planningYears(future, 2026), [2026, 2027]);
});
test("zoom Ano segmenta obra atravessando anos com geometria proporcional", () => {
  const obra = { ...fixtureObra("travessia"), inicioPlanejado: "2025-11-01", tempoPlanejado: 120, status: "FINALIZADA" };
  const first = yearBucket(2025);
  const second = yearBucket(2026);
  const in2025 = getBucketTimelineAggregate(obra, first.start, first.days);
  const in2026 = getBucketTimelineAggregate(obra, second.start, second.days);
  assert.equal(in2025.states[0].offset, 304);
  assert.equal(in2025.states[0].days, 61);
  assert.equal(in2026.states[0].offset, 0);
  assert.equal(in2026.states[0].days, 59);
});
test("zoom Ano \xE9 somente visual e n\xE3o resolve alvos de drop", () => {
  assert.equal(getDropPlanningStart({ obra: obras[0], zoom: "year", targetDateOrPeriod: "2026-02-01" }), null);
  assert.equal(getDropPlanningInterval({ obra: obras[0], zoom: "year", targetDateOrPeriod: "2026-02-01" }), null);
});
test("centraliza\xE7\xE3o de Hoje calcula Dias, Semana e preserva Meses", () => {
  assert.equal(timelineDateRatio("day", "2026-01-01"), 0.5 / 365);
  assert.equal(timelineDateRatio("week", "2026-01-01"), 0.5 / weeklyHeader(2026).length);
  assert.equal(timelineDateRatio("week", "2026-01-04"), 0.5 / weeklyHeader(2026).length);
  assert.equal(timelineDateRatio("month", "2026-07-02"), timelineDateRatio("day", "2026-07-02"));
  assert.equal(timelineDateRatio("day", "2027-01-01"), null);
});
test("centraliza\xE7\xE3o aplica clamp no in\xEDcio e no fim da timeline \xFAtil", () => {
  assert.equal(calculateCenteredScrollLeft(500, 200, 1200), 400);
  assert.equal(calculateTimelineCenteredScrollLeft(30, 740, 3092, 1500), 0);
  assert.equal(calculateTimelineCenteredScrollLeft(2300, 740, 3092, 1500), 1592);
  assert.equal(calculateTimelineCenteredScrollLeft(900, 740, 3092, 1500), 530);
});
test("troca de zoom e bot\xE3o Hoje usam o mesmo helper sem reagir ao scroll manual", () => {
  const page = readFileSync(resolve(process.cwd(), "src/features/cronograma-obras/CronogramaObrasPage.tsx"), "utf8");
  const gantt = readFileSync(resolve(process.cwd(), "src/features/cronograma-obras/components/GanttGrid.tsx"), "utf8");
  assert.match(page, /const setZoom = .*setCenterRequest/);
  assert.match(page, /const goToday = .*setCenterRequest/);
  assert.match(gantt, /scrollTimelineToToday\(container, \{ mode: zoom, today: todayCivil\(\), pastContextDays: 15 \}\)/);
  assert.match(gantt, /\[centerRequest, zoom\]/);
  assert.equal(/onScroll=.*setCenterRequest/.test(gantt), false);
});
test("Ano usa colunas anuais, ignora nomes inline e n\xE3o registra DnD", () => {
  const header = readFileSync(resolve(process.cwd(), "src/features/cronograma-obras/components/TimelineHeader.tsx"), "utf8");
  const gantt = readFileSync(resolve(process.cwd(), "src/features/cronograma-obras/components/GanttGrid.tsx"), "utf8");
  assert.match(header, /co-years/);
  assert.doesNotMatch(header, /zoom === 'year'.*monthlyHeader/);
  assert.match(gantt, /showNames=\{false\} zoom="year"/);
  assert.match(gantt, /zoom !== 'year'/);
});
test("Meses renderiza faixas posicionais, n\xE3o pontos, e respeita nomes", () => {
  const full = getMasterSegmentsInBucket([{ localId: "m", nome: "DILAMAR", inicio: "2026-05-01", tempoPlanejado: 31 }], "2026-05-01", 31)[0];
  const half = getMasterSegmentsInBucket([{ localId: "m", nome: "DILAMAR", inicio: "2026-05-15", tempoPlanejado: 17 }], "2026-05-01", 31)[0];
  const short = getMasterSegmentsInBucket([{ localId: "m", nome: "DILAMAR", inicio: "2026-05-01", tempoPlanejado: 7 }], "2026-05-01", 31)[0];
  assert.deepEqual([full.offset, full.days], [0, 31]);
  assert.deepEqual([half.offset, half.days], [14, 17]);
  assert.deepEqual([short.offset, short.days], [0, 7]);
  assert.equal(masterNameContent("DILAMAR", true, 88, 1, "month"), "DILAMAR");
  assert.equal(masterNameContent("DILAMAR", false, 88, 1, "month"), null);
});
test("Meses preserva posi\xE7\xE3o de m\xFAltiplos mestres", () => {
  const segments = getMasterSegmentsInBucket([{ localId: "a", nome: "DILAMAR", inicio: "2026-05-01", tempoPlanejado: 7 }, { localId: "b", nome: "EVERALDO", inicio: "2026-05-20", tempoPlanejado: 12 }], "2026-05-01", 31);
  assert.deepEqual(segments.map(({ offset, days }) => ({ offset, days })), [{ offset: 0, days: 7 }, { offset: 19, days: 12 }]);
});
test("Meses divide verticalmente apenas mestres simult\xE2neos", () => {
  assert.deepEqual(layoutOverlapLanes([{ offset: 0, days: 10 }, { offset: 5, days: 10 }, { offset: 20, days: 5 }]), [{ index: 0, count: 2 }, { index: 1, count: 2 }, { index: 0, count: 1 }]);
});
test("Dias posiciona Hoje com quinze dias de contexto anterior", () => {
  assert.equal(calculateTimelineContextScrollLeft("day", 2400, 8760, 900, 9472, 1612, 2026, 15), 2040);
});
test("contexto anterior aplica clamp quando Hoje est\xE1 perto do in\xEDcio", () => {
  assert.equal(calculateTimelineContextScrollLeft("day", 30, 8760, 900, 9472, 1612, 2026, 15), 0);
});
test("Semanas calcula hoje menos quinze dias e localiza a semana visual real", () => {
  assert.equal(weeklyContextStart("2026-09-24", 15), "2026-09-09");
  assert.equal(weeklyContextWeekStart("2026-09-24", 15), "2026-09-07");
  assert.equal(weeklyContextWeekIndex("2026-09-24", 2026, 15), weeklyHeader(2026).indexOf("2026-09-07"));
});
test("Semanas aceita semana parcial como in\xEDcio visual e aplica clamp no come\xE7o", () => {
  assert.equal(weeklyContextScrollLeft("2026-09-24", weeklyHeader(2026).length * 44, 3092, 1500, 2026, 15), weeklyHeader(2026).indexOf("2026-09-07") * 44);
  assert.equal(clampTimelineScrollLeft(-44, 3092, 1500), 0);
});
test("troca para Semanas e bot\xE3o Hoje solicitam a posi\xE7\xE3o semanal por data real", () => {
  const gantt = readFileSync(resolve(process.cwd(), "src/features/cronograma-obras/components/GanttGrid.tsx"), "utf8");
  const scroll = readFileSync(resolve(process.cwd(), "src/features/cronograma-obras/domain/timelineScroll.ts"), "utf8");
  assert.match(gantt, /scrollTimelineToToday\(container, \{ mode: zoom, today: todayCivil\(\), pastContextDays: 15 \}\)/);
  assert.match(scroll, /weeklyContextScrollLeft/);
});
test("largura da coluna Obra respeita m\xEDnimo, m\xE1ximo, valor v\xE1lido e total din\xE2mico", () => {
  assert.equal(clampObraColumnWidth(100), OBRA_COLUMN_WIDTH.min);
  assert.equal(clampObraColumnWidth(400), OBRA_COLUMN_WIDTH.max);
  assert.equal(clampObraColumnWidth(260), 260);
  assert.equal(obraGridWidth(220), 902);
  assert.equal(obraGridColumns(220), "220px 168px 112px 122px 76px 112px 70px 22px");
  assert.equal(obraGridWidth(260, false), 684);
  assert.equal(obraGridColumns(260, false), "260px 168px 112px 122px 22px");
});
test("zoom Ano conta uma obra inteira pelo planejamento real", () => {
  assert.equal(plannedDaysInYear({ inicioPlanejado: "2026-01-01", tempoPlanejado: 45 }, 2026), 45);
});
test("zoom Ano divide os dias inclusivos na travessia de ano", () => {
  const obra = { inicioPlanejado: "2025-12-20", tempoPlanejado: 22 };
  assert.equal(plannedDaysInYear(obra, 2025), 12);
  assert.equal(plannedDaysInYear(obra, 2026), 10);
});
test("dias anuais n\xE3o contam a extens\xE3o visual de alerta", () => {
  const obra = { ...fixtureObra("alerta-anual"), inicioPlanejado: "2026-12-30", tempoPlanejado: 2, status: "EM ANDAMENTO", hoje: "2027-01-10" };
  assert.equal(getObraTemporalSegments(obra).some((segment) => segment.type === "attention"), true);
  assert.equal(plannedDaysInYear(obra, 2026), 2);
  assert.equal(plannedDaysInYear(obra, 2027), 0);
});
test("header semanal agrupa pelo m\xEAs da segunda-feira", () => {
  const groups = weeklyMonthGroups(2026);
  const monthFor = (week) => groups.find((group, index) => week >= group.start && week < (groups[index + 1]?.start ?? "9999-01-01")).label;
  assert.equal(monthFor("2026-09-07"), "SET");
  assert.equal(monthFor("2026-09-14"), "SET");
  assert.equal(monthFor("2026-09-21"), "SET");
  assert.equal(monthFor("2026-09-28"), "SET");
  assert.equal(monthFor("2026-10-05"), "OUT");
});
test("drop direto cria a semana civil, permite extrapola\xE7\xE3o e bloqueia finalizada", () => {
  const base = { ...obras[0], inicioPlanejado: "2026-09-23", tempoPlanejado: 3, mestresPlanejados: [] };
  assert.deepEqual(getDirectMasterDropInterval({ obra: base, targetDate: "2026-09-24", hoje: "2026-09-24" }), { inicio: "2026-09-21", tempoPlanejado: 7 });
  assert.equal(getDirectMasterDropInterval({ obra: { ...base, status: "FINALIZADO" }, targetDate: "2026-09-24", hoje: "2026-09-24" }), null);
});
test("resize esquerdo ultrapassa in\xEDcio da obra sem alterar seus dados", () => {
  const obra = { ...obras[0], inicioPlanejado: "2026-09-21", tempoPlanejado: 3 };
  const mestre = { localId: "m", nome: "DILAMAR", inicio: "2026-09-21", tempoPlanejado: 7 };
  assert.deepEqual(resizeMasterPlanning(obra, mestre, "start", "2026-09-01"), { ...mestre, inicio: "2026-09-01", tempoPlanejado: 27 });
  assert.equal(obra.inicioPlanejado, "2026-09-21");
  assert.equal(obra.tempoPlanejado, 3);
});
test("detalhes agrupam per\xEDodos, avisos e outras obras sem mudar datas ISO", () => {
  const a = { ...fixtureObra("a"), inicioPlanejado: "2026-01-10", tempoPlanejado: 10, mestresPlanejados: [{ localId: "a1", nome: "DILAMAR", inicio: "2026-01-05", tempoPlanejado: 8 }, { localId: "a2", nome: "DILAMAR", inicio: "2026-01-20", tempoPlanejado: 2 }] };
  const b = { ...fixtureObra("b"), mestresPlanejados: [{ localId: "b1", nome: "DILAMAR", inicio: "2026-02-01", tempoPlanejado: 2 }] };
  assert.equal(masterPeriodsForObra(a)[0].periods.length, 2);
  assert.equal(startedMasterPeriods(a, "2026-01-15")[0].nome, "DILAMAR");
  assert.equal(recentStartedMaster(a, "2026-01-25").nome, "DILAMAR");
  assert.equal(masterOtherObras([a, b], "a", "dilamar")[0].obra.id, "b");
  assert.deepEqual(allocationWarnings(a, a.mestresPlanejados[0]), { beforeDays: 5, afterDays: 0, end: "2026-01-12" });
  assert.equal(formatDateShort("2026-12-31"), "31/12/26");
});
test("fluxo de DnD n\xE3o mant\xE9m modal de planejamento", () => {
  const root = process.cwd();
  const page = readFileSync(resolve(root, "src/features/cronograma-obras/CronogramaObrasPage.tsx"), "utf8");
  assert.equal(existsSync(resolve(root, "src/features/cronograma-obras/components/MasterPlanningDialog.tsx")), false);
  assert.equal(/MasterPlanningDialog|setPending|Planejar mestre/.test(page), false);
});
