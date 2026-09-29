import type { CronogramaStatus } from '../domain/models';

export function StatusBadge({ status }: { status: CronogramaStatus }) {
  return <span className={`co-status co-status--${status.toLowerCase().replaceAll(' ', '-').replace('finalizado', 'finalizada')}`}>{status === 'FINALIZADO' ? 'FINALIZADA' : status}</span>;
}

