import { MONTHS, type CivilDate } from './models';
const parse = (value: CivilDate) => new Date(`${value}T00:00:00Z`);
const format = (value: Date): CivilDate => value.toISOString().slice(0, 10);
export function isValidCivilDate(value: string): value is CivilDate { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = parse(value); return Number.isFinite(date.getTime()) && format(date) === value; }
export function addDays(inicio: CivilDate, days: number): CivilDate { const date = parse(inicio); date.setUTCDate(date.getUTCDate() + days); return format(date); }
/** Convenção MK2: dias corridos inclusivos; duração 1 ocupa somente a data inicial. */
export function calculatedEnd(inicio: CivilDate, tempoPlanejado: number): CivilDate { return addDays(inicio, Math.max(tempoPlanejado, 1) - 1); }
/** Mantém a UI estável enquanto uma data ainda está sendo digitada. */
export function tryCalculatedEnd(inicio: string, tempoPlanejado: number): CivilDate | null { return isValidCivilDate(inicio) && Number.isFinite(tempoPlanejado) && tempoPlanejado > 0 ? calculatedEnd(inicio, tempoPlanejado) : null; }
export function eachDay(inicio: CivilDate, tempoPlanejado: number): CivilDate[] { return Array.from({ length: Math.max(0, tempoPlanejado) }, (_, index) => addDays(inicio, index)); }
export function intersectsRange(inicio: CivilDate, tempo: number, rangeInicio: CivilDate, rangeTempo: number): boolean { return inicio <= calculatedEnd(rangeInicio, rangeTempo) && calculatedEnd(inicio, tempo) >= rangeInicio; }
export function weekStart(value: CivilDate): CivilDate { const date = parse(value); const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - day + 1); return format(date); }
export function monthDays(value: CivilDate): number { const date = parse(`${value.slice(0, 7)}-01`); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); }
export function countIntersection(inicio: CivilDate, tempo: number, bucketInicio: CivilDate, bucketTempo: number): number { return eachDay(inicio, tempo).filter((day) => intersectsRange(bucketInicio, bucketTempo, day, 1)).length; }
export function daysInWeek(inicio: CivilDate, tempo: number, week: CivilDate): number { return countIntersection(inicio, tempo, weekStart(week), 7); }
export function weeklyAllocation(inicio: CivilDate, tempo: number, week: CivilDate): { days: number; offset: number } { const start = weekStart(week); const occupied = eachDay(inicio, tempo).filter((day) => day >= start && day <= addDays(start, 6)); return { days: occupied.length, offset: occupied.length ? eachDay(start, 7).indexOf(occupied[0]) : 0 }; }
export function daysInMonth(inicio: CivilDate, tempo: number, month: CivilDate): number { const start = `${month.slice(0, 7)}-01`; return countIntersection(inicio, tempo, start, monthDays(start)); }
export function yearDays(year: number): CivilDate[] { return eachDay(`${year}-01-01`, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365); }
export function dailyHeader(year: number) { return yearDays(year).map((date) => ({ date, label: date.slice(8), month: MONTHS[Number(date.slice(5, 7)) - 1], isWeekStart: weekStart(date) === date })); }
export function weeklyHeader(year: number): CivilDate[] { const first = weekStart(`${year}-01-01`); const last = `${year}-12-31`; const result: CivilDate[] = []; for (let date = first; date <= last; date = addDays(date, 7)) result.push(date); return result; }
export function monthlyHeader(year: number) { return MONTHS.map((label, index) => ({ label, start: `${year}-${String(index + 1).padStart(2, '0')}-01` })); }
/** Calendar date in the browser's local timezone, kept in the YYYY-MM-DD civil contract. */
export function todayCivil(): CivilDate { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
export function dateLabel(date: CivilDate | null | undefined): string { return date ? `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : '—'; }
