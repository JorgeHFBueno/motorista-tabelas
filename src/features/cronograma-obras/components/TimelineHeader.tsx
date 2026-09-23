import { MONTHS, type ZoomCronograma } from '../domain/models';
import { dailyHeader, monthlyHeader, weeklyHeader } from '../domain/temporal';
export function TimelineHeader({ zoom, year = 2026 }: { zoom: ZoomCronograma; year?: number }) {
  if (zoom === 'month') return <div className="co-timeline-header"><div className="co-months co-months--single">{monthlyHeader(year).map((month) => <div key={month.start}>{month.label}</div>)}</div></div>;
  if (zoom === 'week') return <div className="co-timeline-header"><div className="co-months">{MONTHS.map((month) => <div key={month}>{month}</div>)}</div><div className="co-weeks">{weeklyHeader(year).map((week, index) => <div key={week}>S{index + 1}</div>)}</div></div>;
  const days = dailyHeader(year); return <div className="co-timeline-header co-timeline-header--days"><div className="co-months co-months--days">{MONTHS.map((month, index) => <div key={month} style={{ gridColumn: `span ${days.filter((day) => Number(day.date.slice(5, 7)) === index + 1).length}` }}>{month}</div>)}</div><div className="co-days">{days.map((day) => <div key={day.date} className={`${day.isWeekStart ? 'is-week-start ' : ''}${day.date === new Date().toISOString().slice(0, 10) ? 'is-today' : ''}`}>{day.label}</div>)}</div></div>;
}
