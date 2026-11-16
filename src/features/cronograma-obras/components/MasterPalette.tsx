import PersonOutlineRounded from "@mui/icons-material/PersonOutlineRounded";
import { type DragEvent } from "react";
import { getMestreColor, normalizeMestreKey } from "../domain/mestres";
import { NT_ARRASTE } from "../domain/naoTrabalhados";

type MasterPaletteProps = {
  masters: string[];
  draggingMaster: string | null;
  disabled?: boolean;
  /** Área Engenharia em "ver": sem arrastar e sem "+". */
  somenteLeitura?: boolean;
  showViewMasters?: boolean;
  /** Escala Dias e quem edita: mostra o "NT" para arrastar até um dia do período de um mestre. */
  ntArrastavel?: boolean;
  onDragStart: (master: string) => void;
  onDragEnd: () => void;
  onAdd?: () => void;
  onViewMasters: () => void;
};

export function MasterPalette({ masters, draggingMaster, disabled, somenteLeitura = false, showViewMasters = false, ntArrastavel = false, onDragStart, onDragEnd, onAdd, onViewMasters }: MasterPaletteProps) {
  return <section className={`co-master-palette ${disabled ? "is-readonly" : ""}`} aria-label="Mestres disponíveis para planejamento">
    {showViewMasters ? <button type="button" className="co-master-view" title="Visualizar Mestres" aria-label="Visualizar Mestres" onClick={onViewMasters}><PersonOutlineRounded fontSize="small" /><span>Mestres</span></button> : <div className="co-master-palette-title"><strong>Mestres</strong></div>}
    <div className="co-master-palette-scroll">{masters.map((master) => {
      const color = getMestreColor(normalizeMestreKey(master));
      return <button type="button" draggable={!disabled} key={master} className={`co-master-chip ${draggingMaster === master ? "is-dragging" : ""}`} title={somenteLeitura ? master : disabled ? `${master} · modo Ano somente visual` : `Arraste ${master} para um período planejado`} style={{ "--co-master-color": color.background, "--co-master-text": color.text } as React.CSSProperties} onDragStart={(event: DragEvent<HTMLButtonElement>) => {
        if (disabled) { event.preventDefault(); return; }
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setDragImage(event.currentTarget, 18, 16);
        onDragStart(master);
      }} onDragEnd={onDragEnd}><PersonOutlineRounded fontSize="inherit" />{master}</button>;
    })}{ntArrastavel && <button type="button" draggable className={`co-master-chip co-master-chip--nt ${draggingMaster === NT_ARRASTE ? "is-dragging" : ""}`} title="Arraste o NT até um dia dentro do período de um mestre (dia não trabalhado); depois estique pelas pontas" aria-label="NT: dia não trabalhado" onDragStart={(event: DragEvent<HTMLButtonElement>) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setDragImage(event.currentTarget, 12, 16);
        onDragStart(NT_ARRASTE);
      }} onDragEnd={onDragEnd}>NT</button>}{onAdd && <button type="button" className="co-master-chip co-master-add" title="Adicionar mestre" aria-label="Adicionar mestre" onClick={onAdd}>+</button>}</div>
    <small>{somenteLeitura ? "Somente leitura" : disabled ? "Visão anual somente visual" : "Arraste para um trecho planejado da obra"}</small>
  </section>;
}
