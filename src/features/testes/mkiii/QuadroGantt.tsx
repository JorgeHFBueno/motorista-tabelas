import { useEffect, useMemo, useRef, type CSSProperties, type DragEvent, type PointerEvent } from "react";
import type { GanttGridProps } from "../../cronograma-obras/components/GanttGrid";
import { LoteStatusControl } from "../../cronograma-obras/components/LoteStatusControl";
import { buildStartedFlatWorkStages } from "../../cronograma-obras/domain/contractGroups";
import { masterSelectionForPeriod } from "../../cronograma-obras/domain/masterPlanningDetails";
import { resizeMasterPlanning, type MasterResizeEdge } from "../../cronograma-obras/domain/masterResize";
import { getMestreColor, normalizeMestreKey } from "../../cronograma-obras/domain/mestres";
import { MONTHS, type MestrePlanejado, type ObraCronograma } from "../../cronograma-obras/domain/models";
import { NT_ARRASTE, redimensionarNaoTrabalhado, rotuloDias, segmentosNT, type NaoTrabalhado } from "../../cronograma-obras/domain/naoTrabalhados";
import { layoutMasterAllocationLanes } from "../../cronograma-obras/domain/timelineAggregation";
import { addDays, formatDateShort, todayCivil, yearDays } from "../../cronograma-obras/domain/temporal";
import { feriadoEm, fimDeSemana } from "../../cronograma-logistica/domain/feriados";

/**
 * /testes/mkiii: grade nova de "Obra iniciada", feita para o CronoObra (não é o GanttGrid). Uma linha por LOTE, com
 * as colunas fixas à esquerda (Obra em duas linhas, Status, Mestres, Início) e o calendário do ano à direita, no mesmo
 * rolar. Recebe as mesmas props do GanttGrid, então gravar, desfazer, NT e prioridade continuam os da página.
 */
const LARGURA_DIA = { day: 30, week: 12 } as const;
const DOW = ["D", "S", "T", "Q", "Q", "S", "S"];
const diaNum = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 864e5;
const semanaIso = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
};
const ALTURA_FAIXA = 24;

type Geometria = { inicio: string; dias: string[]; dw: number; indice: (d: string) => number };

export function QuadroGantt(props: GanttGridProps) {
  const { obras, contratos, zoom, draggingMaster, selectedId, centerRequest, display, onSelect, onSelectMasters, onSelectMaster, onOpenContract, onDropMaster, onResizeMasterPreview, onResizeMasterCommit, onResizeMasterCancel, onStatusConfirmed, onMovePrioridade } = props;
  const hoje = todayCivil();
  const ano = Number(hoje.slice(0, 4));
  const dias = useMemo(() => yearDays(ano), [ano]);
  const dw = zoom === "day" ? LARGURA_DIA.day : LARGURA_DIA.week;
  const geo: Geometria = useMemo(() => ({ inicio: dias[0], dias, dw, indice: (d: string) => diaNum(d) - diaNum(dias[0]) }), [dias, dw]);
  const stages = useMemo(() => buildStartedFlatWorkStages(obras, contratos), [obras, contratos]);
  const rolagem = useRef<HTMLDivElement>(null);

  // Opens with today near the start of the calendar (and again on Dias/Semanas or "hoje").
  useEffect(() => {
    const el = rolagem.current;
    if (el) el.scrollLeft = Math.max(0, (geo.indice(hoje) - (zoom === "day" ? 7 : 21)) * dw);
  }, [zoom, centerRequest, dw, geo, hoje]);

  const meses = useMemo(() => MONTHS.map((nome, m) => {
    const doMes = dias.filter((d) => Number(d.slice(5, 7)) === m + 1);
    return { nome, inicio: geo.indice(doMes[0]), dias: doMes.length };
  }), [dias, geo]);
  const segundas = useMemo(() => dias.map((d, i) => ({ d, i })).filter(({ d }) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1), [dias]);
  const fundo = useMemo(() => fundoDoCalendario(dias, dw, zoom === "day", hoje), [dias, dw, zoom, hoje]);
  const larguraCalendario = dias.length * dw;

  // Priority drag ("Próxima a iniciar"), with refs: hovering does not re-render the grid.
  const prioridade = useRef<{ id: string; grupo: string } | null>(null);
  const alvoPrioridade = useRef<HTMLElement | null>(null);
  const limparAlvo = () => { alvoPrioridade.current?.classList.remove("is-alvo-antes", "is-alvo-depois"); alvoPrioridade.current = null; };

  const linhas = stages.flatMap((stage) => [
    ...(stage.label ? [<div key={`etapa-${stage.kind}`} className={`qg-grupo qg-grupo--etapa qg-grupo--${stage.kind}`}><span>{stage.label === "PRÓXIMA A INICIAR" ? "Próxima a iniciar" : stage.label}</span></div>] : []),
    ...stage.workTypes.flatMap((tipo) => [
      <div key={`tipo-${stage.kind}-${tipo.kind}`} className="qg-grupo qg-grupo--tipo"><span>{tipo.label === "OBRAS PÚBLICAS" ? "Obras públicas" : tipo.label === "OBRAS PRIVADAS" ? "Obras privadas" : tipo.label}</span></div>,
      ...tipo.obras.map((obra) => {
        const grupo = `${stage.kind}-${tipo.kind}`;
        const comPrioridade = stage.kind === "proxima-a-iniciar" && Boolean(onMovePrioridade);
        const contrato = contratos.get(obra.contratoId ?? "");
        const lanes = layoutMasterAllocationLanes(obra.mestresPlanejados);
        const nFaixas = Math.max(1, ...[...lanes.values()].map((lane) => lane.count));
        const nomes = [...new Map(obra.mestresPlanejados.map((m) => [m.mestreKey ?? normalizeMestreKey(m.nome), m.nome])).entries()];
        const dataDoPonteiro = (clientX: number, el: HTMLElement) => dias[Math.min(dias.length - 1, Math.max(0, Math.floor((clientX - el.getBoundingClientRect().left) / dw)))];
        const eventosPrioridade = comPrioridade ? {
          onDragOverCapture: (event: DragEvent<HTMLDivElement>) => {
            if (prioridade.current?.grupo !== grupo) return;
            event.preventDefault(); event.stopPropagation();
            const r = event.currentTarget.getBoundingClientRect();
            const depois = event.clientY > r.top + r.height / 2;
            if (alvoPrioridade.current !== event.currentTarget) limparAlvo();
            event.currentTarget.classList.toggle("is-alvo-depois", depois);
            event.currentTarget.classList.toggle("is-alvo-antes", !depois);
            alvoPrioridade.current = event.currentTarget;
          },
          onDropCapture: (event: DragEvent<HTMLDivElement>) => {
            const arrastado = prioridade.current;
            if (arrastado?.grupo !== grupo) return;
            event.preventDefault(); event.stopPropagation();
            const r = event.currentTarget.getBoundingClientRect();
            const depois = event.clientY > r.top + r.height / 2;
            limparAlvo(); prioridade.current = null;
            const de = tipo.obras.findIndex((o) => o.id === arrastado.id);
            let para = tipo.obras.findIndex((o) => o.id === obra.id) + (depois ? 1 : 0);
            if (de < para) para -= 1;
            onMovePrioridade?.(tipo.obras, arrastado.id, para);
          },
        } : {};
        return (
          <div key={obra.id} className={`qg-linha ${selectedId === obra.id ? "is-selecionada" : ""}`} style={{ "--qg-altura": `${Math.max(46, nFaixas * ALTURA_FAIXA + 14)}px` } as CSSProperties} {...eventosPrioridade}>
            <div className="qg-esq" onClick={() => onSelect(obra)}>
              <div className="qg-obra">
                {comPrioridade && <span className="qg-alca" draggable title="Arraste para mudar a prioridade" onClick={(e) => e.stopPropagation()} onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", obra.id); prioridade.current = { id: obra.id, grupo }; }} onDragEnd={() => { prioridade.current = null; limparAlvo(); }}>⋮⋮</span>}
                <div className="qg-obra-textos">
                  <button type="button" className="qg-contrato" title={contrato?.nome} onClick={(e) => { e.stopPropagation(); if (contrato) onOpenContract(contrato); }}>{contrato?.nome ?? "—"}</button>
                  <span className="qg-lote" title={obra.nomeObra}>{obra.nomeObra}</span>
                </div>
              </div>
              <div className="qg-status" onClick={(e) => e.stopPropagation()}><LoteStatusControl obra={obra} canStart={false} canFinish onStatusConfirmed={onStatusConfirmed} /></div>
              <button type="button" className="qg-mestres" title="Mestres desta obra" onClick={(e) => { e.stopPropagation(); onSelectMasters(obra); }}>
                {nomes.length ? nomes.map(([chave, nome]) => { const cor = getMestreColor(chave); return <span key={chave} className="qg-mestre" style={{ background: cor.background, color: cor.text }}>{nome}</span>; }) : <span className="qg-sem-mestre">Sem mestre</span>}
              </button>
              <span className="qg-inicio">{formatDateShort(obra.inicioPlanejado ?? contrato?.inicio)}</span>
            </div>
            <div
              className={`qg-trilho ${draggingMaster ? "is-recebendo" : ""}`}
              style={{ width: larguraCalendario, ...fundo }}
              onDragOver={(event) => {
                if (!draggingMaster) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                const alvo = geo.indice(dataDoPonteiro(event.clientX, event.currentTarget));
                const semana = draggingMaster === NT_ARRASTE ? alvo : alvo - ((new Date(`${dias[alvo]}T00:00:00Z`).getUTCDay() + 6) % 7);
                event.currentTarget.style.setProperty("--qg-alvo-esq", `${semana * dw}px`);
                event.currentTarget.style.setProperty("--qg-alvo-larg", `${(draggingMaster === NT_ARRASTE ? 1 : 7) * dw}px`);
              }}
              onDragLeave={(event) => event.currentTarget.style.removeProperty("--qg-alvo-esq")}
              onDrop={(event) => {
                event.preventDefault();
                event.currentTarget.style.removeProperty("--qg-alvo-esq");
                if (!draggingMaster) return;
                const sob = (event.target as HTMLElement).closest<HTMLElement>("[data-alocacao-id]")?.dataset.alocacaoId;
                onDropMaster(obra, draggingMaster, dataDoPonteiro(event.clientX, event.currentTarget), sob);
              }}
            >
              {obra.mestresPlanejados.map((mestre) => (
                <Barra key={mestre.localId} obra={obra} mestre={mestre} geo={geo} lane={lanes.get(mestre)} mostrarNome={display.masterNames} podeNT={zoom === "day"}
                  onSelecionar={() => onSelectMaster(masterSelectionForPeriod(obra, mestre))}
                  onPreview={onResizeMasterPreview} onCommit={(draft) => onResizeMasterCommit(obra.id, draft)} onCancel={() => onResizeMasterCancel(mestre.localId)} />
              ))}
            </div>
          </div>
        );
      }),
    ]),
  ]);

  return (
    <section className={`qg qg--${zoom}`} aria-label="Cronograma de obras iniciadas" style={{ "--qg-total": `calc(var(--qg-esq) + ${larguraCalendario}px)` } as CSSProperties}>
      <div className="qg-rolagem" ref={rolagem}>
        <div className="qg-cab">
          <div className="qg-esq qg-esq--cab">
            <span>Obra</span><span>Status</span><span>Mestres</span><span>Início</span>
          </div>
          <div className="qg-cab-cal" style={{ width: larguraCalendario }}>
            <div className="qg-meses">{meses.map((mes) => <div key={mes.nome} style={{ left: mes.inicio * dw, width: mes.dias * dw }}>{mes.nome}</div>)}</div>
            {zoom === "day" ? (
              <div className="qg-dias">{dias.map((d, i) => { const feriado = feriadoEm(d); return <div key={d} title={feriado ?? undefined} className={`${d === hoje ? "is-hoje " : ""}${feriado ? "is-feriado " : ""}${fimDeSemana(d) ? "is-fds " : ""}${new Date(`${d}T00:00:00Z`).getUTCDay() === 1 ? "is-segunda" : ""}`} style={{ left: i * dw, width: dw }}><b>{d.slice(8)}</b><small>{DOW[new Date(`${d}T00:00:00Z`).getUTCDay()]}</small></div>; })}</div>
            ) : (
              <div className="qg-semanas">{segundas.map(({ d, i }) => <div key={d} className={geo.indice(hoje) >= i && geo.indice(hoje) < i + 7 ? "is-atual" : ""} style={{ left: i * dw, width: 7 * dw }} title={`Semana de ${formatDateShort(d)}`}>S{semanaIso(d)}</div>)}</div>
            )}
          </div>
        </div>
        {linhas.length ? linhas : <p className="qg-vazio">Nenhuma obra iniciada com estes filtros.</p>}
      </div>
    </section>
  );
}

/** Calendar paint for the rows: alternating weeks, week and month lines, weekends, holidays and today. */
function fundoDoCalendario(dias: string[], dw: number, porDia: boolean, hoje: string): CSSProperties {
  const coluna = (i: number, largura: number, cor: string) => `linear-gradient(${cor}, ${cor}) ${i * dw}px 0 / ${largura}px 100% no-repeat`;
  const primeiraSegunda = dias.findIndex((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1);
  const camadas: string[] = [];
  const iHoje = dias.indexOf(hoje);
  if (iHoje >= 0) camadas.push(coluna(iHoje, dw, "var(--qg-hoje)"), coluna(iHoje, 2, "var(--qg-hoje-linha)"));
  dias.forEach((d, i) => { if (d.slice(8) === "01") camadas.push(coluna(i, 2, "var(--qg-linha-mes)")); });
  if (porDia) {
    dias.forEach((d, i) => { if (feriadoEm(d)) camadas.push(coluna(i, dw, "var(--qg-feriado)")); else if (fimDeSemana(d)) camadas.push(coluna(i, dw, "var(--qg-fds)")); });
    camadas.push(`repeating-linear-gradient(to right, transparent 0 ${dw - 1}px, var(--qg-linha-dia) ${dw - 1}px ${dw}px)`);
  }
  camadas.push(`repeating-linear-gradient(to right, var(--qg-linha-semana) 0 1px, transparent 1px ${7 * dw}px) ${primeiraSegunda * dw}px 0 / 100% 100% no-repeat`);
  camadas.push(`repeating-linear-gradient(to right, var(--qg-banda) 0 ${7 * dw}px, transparent ${7 * dw}px ${14 * dw}px) ${primeiraSegunda * dw}px 0 / 100% 100% no-repeat`);
  return { background: camadas.join(", "), backgroundColor: "var(--qg-calendario)" };
}

function Barra({ obra, mestre, geo, lane, mostrarNome, podeNT, onSelecionar, onPreview, onCommit, onCancel }: {
  obra: ObraCronograma; mestre: MestrePlanejado; geo: Geometria; lane?: { index: number; count: number }; mostrarNome: boolean; podeNT: boolean;
  onSelecionar: () => void; onPreview: (m: MestrePlanejado) => void; onCommit: (m: MestrePlanejado) => void; onCancel: () => void;
}) {
  const ini = geo.indice(mestre.inicio);
  const esq = Math.max(0, ini);
  const fim = Math.min(geo.dias.length, ini + mestre.tempoPlanejado);
  if (fim <= 0 || esq >= geo.dias.length) return null;
  const cor = getMestreColor(mestre.mestreKey ?? normalizeMestreKey(mestre.nome));
  const largura = (fim - esq) * geo.dw;
  const nts = segmentosNT(mestre, geo.dias[esq], fim - esq);

  const arrastar = (edge: MasterResizeEdge, trecho?: NaoTrabalhado) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation();
    const alca = event.currentTarget;
    const trilho = alca.closest<HTMLElement>(".qg-trilho");
    if (!trilho) return;
    alca.setPointerCapture(event.pointerId);
    let draft = mestre;
    const mover = (e: globalThis.PointerEvent) => {
      const i = Math.min(geo.dias.length - 1, Math.max(0, Math.floor((e.clientX - trilho.getBoundingClientRect().left) / geo.dw)));
      const data = geo.dias[i];
      draft = trecho ? { ...mestre, naoTrabalhados: redimensionarNaoTrabalhado(mestre, trecho, edge, data) } : resizeMasterPlanning(obra, mestre, edge, data);
      onPreview(draft);
    };
    const soltar = (e: globalThis.PointerEvent) => {
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerup", soltar);
      document.removeEventListener("pointercancel", soltar);
      document.body.classList.remove("co-is-resizing");
      if (e.type === "pointercancel") onCancel(); else onCommit(draft);
    };
    document.body.classList.add("co-is-resizing");
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", soltar);
    document.addEventListener("pointercancel", soltar);
  };

  return (
    <div
      className="qg-barra"
      role="button"
      tabIndex={0}
      data-alocacao-id={mestre.localId}
      title={`${mestre.nome}\n${formatDateShort(mestre.inicio)} → ${formatDateShort(addDays(mestre.inicio, mestre.tempoPlanejado - 1))}\n${rotuloDias(mestre)}`}
      style={{ left: esq * geo.dw, width: largura, top: 7 + (lane?.index ?? 0) * ALTURA_FAIXA, background: cor.background, color: cor.text } as CSSProperties}
      onClick={(e) => { e.stopPropagation(); onSelecionar(); }}
    >
      <button type="button" className="qg-borda is-ini" aria-label={`Ajustar início de ${mestre.nome}`} onPointerDown={arrastar("start")} onClick={(e) => e.stopPropagation()} />
      {nts.map((nt) => {
        const trecho = { inicio: addDays(geo.dias[esq], nt.offset), dias: nt.days };
        return (
          <span key={nt.offset} className="qg-nt" style={{ left: nt.offset * geo.dw, width: nt.days * geo.dw }} title={`NT · ${formatDateShort(trecho.inicio)} → ${formatDateShort(addDays(trecho.inicio, trecho.dias - 1))}`}>
            {podeNT && <><button type="button" className="qg-nt-borda is-ini" aria-label="Ajustar início do NT" onPointerDown={arrastar("start", trecho)} onClick={(e) => e.stopPropagation()} /><button type="button" className="qg-nt-borda is-fim" aria-label="Ajustar fim do NT" onPointerDown={arrastar("end", trecho)} onClick={(e) => e.stopPropagation()} /></>}
            {nt.days * geo.dw >= 18 ? "NT" : ""}
          </span>
        );
      })}
      {mostrarNome && largura >= 44 && <span className="qg-barra-nome">{mestre.nome}</span>}
      <button type="button" className="qg-borda is-fim" aria-label={`Ajustar fim de ${mestre.nome}`} onPointerDown={arrastar("end")} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
