import TuneRounded from '@mui/icons-material/TuneRounded';
import { useEffect, useRef, useState } from 'react';
import type { CalendarDisplayOptions } from '../domain/calendarDisplay';
export type { CalendarDisplayOptions } from '../domain/calendarDisplay';

export function CalendarToggles({ options, onChange }: { options: CalendarDisplayOptions; onChange: (options: CalendarDisplayOptions) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); rootRef.current?.querySelector<HTMLButtonElement>('.co-toggles-trigger')?.focus(); } };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, [open]);
  return <div className="co-toggles" ref={rootRef}>
    <button className={`co-button co-button--secondary co-toggles-trigger ${open ? 'is-active' : ''}`} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}><TuneRounded fontSize="small" />Toggles</button>
    {open && <section className="co-toggles-popover" role="dialog" aria-label="Opções do calendário">
      <strong>Opções do calendário</strong>
      <ToggleRow label="Alerta vivo" enabled={options.liveAlerts} onToggle={() => onChange({ ...options, liveAlerts: !options.liveAlerts })} />
      <ToggleRow label="Nome do mestre" enabled={options.masterNames} onToggle={() => onChange({ ...options, masterNames: !options.masterNames })} />
    </section>}
  </div>;
}

function ToggleRow({ label, enabled, onToggle }: { label: string; enabled: boolean; onToggle: () => void }) {
  return <button className="co-toggle-row" type="button" role="switch" aria-checked={enabled} onClick={onToggle}><span>{label}</span><i className={enabled ? 'is-on' : ''}>{enabled ? 'ON' : 'OFF'}</i></button>;
}
