import { MONTHS } from '../domain/models';

export function TimelineHeader() {
  return (
    <div className="co-timeline-header">
      <div className="co-months">{MONTHS.map((month) => <div key={month}>{month}</div>)}</div>
      <div className="co-weeks">{Array.from({ length: 48 }, (_, index) => <div key={index}>S{(index % 4) + 1}</div>)}</div>
    </div>
  );
}

