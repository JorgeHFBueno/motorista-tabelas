import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent, type ReactNode } from "react";
import type { GanttGridProps } from "../../cronograma-obras/components/GanttGrid";
import { LoteStatusControl } from "../../cronograma-obras/components/LoteStatusControl";
import { buildStartedFlatWorkStages, groupContractGroupsByWorkType, groupObrasByContract, type ContractGroup } from "../../cronograma-obras/domain/contractGroups";
import { masterSelectionForPeriod } from "../../cronograma-obras/domain/masterPlanningDetails";
import { resizeMasterPlanning, type MasterResizeEdge } from "../../cronograma-obras/domain/masterResize";
import { getMestreColor, normalizeMestreKey } from "../../cronograma-obras/domain/mestres";
import { MONTHS, type ContratoCronograma, type MestrePlanejado, type ObraCronograma } from "../../cronograma-obras/domain/models";
import { NT_ARRASTE, redimensionarNaoTrabalhado, rotuloDias, segmentosNT, type NaoTrabalhado } from "../../cronograma-obras/domain/naoTrabalhados";
import { clampColumnWidth } from "../../cronograma-obras/domain/obraGridColumns";
import { nextTableSort, sortContractGroups, sortObras, type ColumnId, type TableSort } from "../../cronograma-obras/domain/tableSort";
import { getBucketTimelineAggregate, layoutMasterAllocationLanes } from "../../cronograma-obras/domain/timelineAggregation";
import { addDays, formatDateShort, inclusiveCivilDays, todayCivil, yearDays } from "../../cronograma-obras/domain/temporal";
import { feriadoEm, fimDeSemana } from "../../cronograma-logistica/domain/feriados";

/**
 * /testes/mkiii: grade nova de "Obra iniciada", feita para o CronoObra (não é o GanttGrid). Uma linha por LOTE (ou por
 * contrato, na visão Contratos), com as colunas à esquerda (Obra com o LOTE e o contrato, Emp., Status, Mestres, Início,
 * Dias; ordenáveis, de largura ajustável e com "›" para encolher) e o calendário do ano à direita, no mesmo rolar. Recebe
 * as mesmas props do GanttGrid, então gravar, desfazer, NT, prioridade e Linha de Base continuam os da página.
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
/** Linha de Base: faixa no alto da linha; as barras descem para não cobri-la. */
const ALTURA_BASE = 8;

type Geometria = { inicio: string; dias: string[]; dw: number; indice: (d: string) => number };
type Coluna = { id: "obra" | "empresa" | "status" | "mestres" | "inicio" | "dias"; rotulo: string; largura: number; complementar?: boolean };
const COLUNAS: readonly Coluna[] = [
  { id: "obra", rotulo: "Obra", largura: 280 },
  { id: "empresa", rotulo: "Emp.", largura: 78, complementar: true },
  { id: "status", rotulo: "Status", largura: 138, complementar: true },
  { id: "mestres", rotulo: "Mestres", largura: 116 },
  { id: "inicio", rotulo: "Início", largura: 84 },
  { id: "dias", rotulo: "Dias", largura: 76, complementar: true },
];
const GRUPO_NOME: Record<string, string> = { "OBRAS PÚBLICAS": "Obras públicas", "OBRAS PRIVADAS": "Obras privadas", "PRÓXIMA A INICIAR": "Próxima a iniciar" };

export function QuadroGantt(props: GanttGridProps) {
  const { obras, contratos, zoom, viewMode = "flat", draggingMaster, selectedId, centerRequest, display, onSelect, onSelectMasters, onSelectMaster, onOpenContract, onDropMaster, onResizeMasterPreview, onResizeMasterCommit, onResizeMasterCancel, onStatusConfirmed, onMovePrioridade } = props;
  const hoje = todayCivil();
  const ano = Number(hoje.slice(0, 4));
  const dias = useMemo(() => yearDays(ano), [ano]);
  const dw = zoom === "day" ? LARGURA_DIA.day : LARGURA_DIA.week;
  const geo: Geometria = useMemo(() => ({ inicio: dias[0], dias, dw, indice: (d: string) => diaNum(d) - diaNum(dias[0]) }), [dias, dw]);
  const rolagem = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<TableSort>({ column: null, direction: null });
  const [completo, setCompleto] = useState(true);
  const [larguras, setLarguras] = useState<Partial<Record<Coluna["id"], number>>>({});
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  const colunas = COLUNAS.filter((coluna) => completo || !coluna.complementar).map((coluna) => ({ ...coluna, largura: larguras[coluna.id] ?? coluna.largura }));
  const larguraEsq = colunas.reduce((total, coluna) => total + coluna.largura, 0);
  const gradeEsq = colunas.map((coluna) => `${coluna.largura}px`).join(" ");
  const comBase = display.liveAlerts;

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
  const estiloGrade = { "--qg-esq": `${larguraEsq}px`, "--qg-esq-colunas": gradeEsq, "--qg-total": `${larguraEsq + larguraCalendario}px` } as CSSProperties;

  // Priority drag ("Próxima a iniciar"), with refs: hovering does not re-render the grid.
  const prioridade = useRef<{ id: string; grupo: string } | null>(null);
  const alvoPrioridade = useRef<HTMLElement | null>(null);
  const limparAlvo = () => { alvoPrioridade.current?.classList.remove("is-alvo-antes", "is-alvo-depois"); alvoPrioridade.current = null; };

  const ajustarLargura = (coluna: Coluna) => (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault(); event.stopPropagation();
    const x0 = event.clientX;
    const w0 = coluna.largura;
    const mover = (e: globalThis.PointerEvent) => setLarguras((atual) => ({ ...atual, [coluna.id]: clampColumnWidth(coluna.id, w0 + e.clientX - x0) }));
    const soltar = () => { document.removeEventListener("pointermove", mover); document.removeEventListener("pointerup", soltar); document.body.classList.remove("co-is-resizing"); };
    document.body.classList.add("co-is-resizing");
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", soltar);
  };

  const trilho = (obra: ObraCronograma, conteudo: ReactNode, alturaBarras: number, recebe = true) => (
    <div
      className={`qg-trilho ${recebe && draggingMaster ? "is-recebendo" : ""}`}
      style={{ width: larguraCalendario, ...fundo, minHeight: alturaBarras }}
      {...(recebe ? {
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          if (!draggingMaster) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          const alvo = geo.indice(dataDoPonteiro(event.clientX, event.currentTarget));
          const semana = draggingMaster === NT_ARRASTE ? alvo : alvo - ((new Date(`${dias[alvo]}T00:00:00Z`).getUTCDay() + 6) % 7);
          event.currentTarget.style.setProperty("--qg-alvo-esq", `${semana * dw}px`);
          event.currentTarget.style.setProperty("--qg-alvo-larg", `${(draggingMaster === NT_ARRASTE ? 1 : 7) * dw}px`);
        },
        onDragLeave: (event: DragEvent<HTMLDivElement>) => event.currentTarget.style.removeProperty("--qg-alvo-esq"),
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.currentTarget.style.removeProperty("--qg-alvo-esq");
          if (!draggingMaster) return;
          const sob = (event.target as HTMLElement).closest<HTMLElement>("[data-alocacao-id]")?.dataset.alocacaoId;
          onDropMaster(obra, draggingMaster, dataDoPonteiro(event.clientX, event.currentTarget), sob);
        },
      } : {})}
    >
      {conteudo}
    </div>
  );
  const dataDoPonteiro = (clientX: number, el: HTMLElement) => dias[Math.min(dias.length - 1, Math.max(0, Math.floor((clientX - el.getBoundingClientRect().left) / dw)))];

  const chipsMestres = (lista: readonly MestrePlanejado[]) => {
    const nomes = [...new Map(lista.map((m) => [m.mestreKey ?? normalizeMestreKey(m.nome), m.nome])).entries()];
    return nomes.length ? nomes.map(([chave, nome]) => { const cor = getMestreColor(chave); return <span key={chave} className="qg-mestre" style={{ background: cor.background, color: cor.text }}>{nome}</span>; }) : <span className="qg-sem-mestre">Sem mestre</span>;
  };

  const celulas = (obra: ObraCronograma, contrato: ContratoCronograma | undefined, alca: ReactNode) => colunas.map((coluna) => {
    switch (coluna.id) {
      case "obra": return (
        <div key="obra" className="qg-obra">
          {alca}
          <div className="qg-obra-textos">
            <span className="qg-lote" title={obra.nomeObra}>{obra.nomeObra}</span>
            <button type="button" className="qg-contrato" title={contrato?.nome} onClick={(e) => { e.stopPropagation(); if (contrato) onOpenContract(contrato); }}>{contrato?.nome ?? "—"}</button>
          </div>
        </div>
      );
      case "empresa": return <span key="empresa" className="qg-texto">{obra.empresa || contrato?.empresa || "—"}</span>;
      case "status": return <div key="status" className="qg-status" onClick={(e) => e.stopPropagation()}><LoteStatusControl obra={obra} canStart={false} canFinish onStatusConfirmed={onStatusConfirmed} /></div>;
      case "mestres": return <button key="mestres" type="button" className="qg-mestres" title="Mestres desta obra" onClick={(e) => { e.stopPropagation(); onSelectMasters(obra); }}>{chipsMestres(obra.mestresPlanejados)}</button>;
      case "inicio": return <span key="inicio" className="qg-numero">{formatDateShort(obra.inicioPlanejado ?? contrato?.inicio)}</span>;
      case "dias": return <span key="dias" className="qg-numero">{obra.tempoPlanejado ?? inclusiveCivilDays(contrato?.inicio, contrato?.fim) ?? "—"}</span>;
    }
  });

  const linhaObra = (obra: ObraCronograma, prioridadeGrupo?: { grupo: string; lista: ObraCronograma[] }, filho = false) => {
    const contrato = contratos.get(obra.contratoId ?? "");
    const lanes = layoutMasterAllocationLanes(obra.mestresPlanejados);
    const nFaixas = Math.max(1, ...[...lanes.values()].map((lane) => lane.count));
    const topo = 7 + (comBase ? ALTURA_BASE + 4 : 0);
    const altura = Math.max(48, topo + nFaixas * ALTURA_FAIXA + 6);
    const eventosPrioridade = prioridadeGrupo ? {
      onDragOverCapture: (event: DragEvent<HTMLDivElement>) => {
        if (prioridade.current?.grupo !== prioridadeGrupo.grupo) return;
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
        if (arrastado?.grupo !== prioridadeGrupo.grupo) return;
        event.preventDefault(); event.stopPropagation();
        const r = event.currentTarget.getBoundingClientRect();
        const depois = event.clientY > r.top + r.height / 2;
        limparAlvo(); prioridade.current = null;
        const de = prioridadeGrupo.lista.findIndex((o) => o.id === arrastado.id);
        let para = prioridadeGrupo.lista.findIndex((o) => o.id === obra.id) + (depois ? 1 : 0);
        if (de < para) para -= 1;
        onMovePrioridade?.(prioridadeGrupo.lista, arrastado.id, para);
      },
    } : {};
    const alca = prioridadeGrupo ? <span className="qg-alca" draggable title="Arraste para mudar a prioridade" onClick={(e) => e.stopPropagation()} onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", obra.id); prioridade.current = { id: obra.id, grupo: prioridadeGrupo.grupo }; }} onDragEnd={() => { prioridade.current = null; limparAlvo(); }}>⋮⋮</span> : null;
    const base = comBase ? getBucketTimelineAggregate({ ...obra, hoje }, dias[0], dias.length, hoje, true).states : [];
    return (
      <div key={obra.id} className={`qg-linha ${filho ? "qg-linha--filho" : ""} ${selectedId === obra.id ? "is-selecionada" : ""}`} style={{ minHeight: altura }} {...eventosPrioridade}>
        <div className="qg-esq" onClick={() => onSelect(obra)}>{celulas(obra, contrato, alca)}</div>
        {trilho(obra, <>
          {comBase && <span className="qg-base" aria-label="Linha de Base">{base.map((s) => <i key={`${s.type}-${s.offset}`} className={`co-temporal-segment is-${s.type}`} style={{ left: s.offset * dw, width: s.days * dw }} />)}</span>}
          {obra.mestresPlanejados.map((mestre) => (
            <Barra key={mestre.localId} obra={obra} mestre={mestre} geo={geo} topo={topo + (lanes.get(mestre)?.index ?? 0) * ALTURA_FAIXA} mostrarNome={display.masterNames} podeNT={zoom === "day"}
              onSelecionar={() => onSelectMaster(masterSelectionForPeriod(obra, mestre))}
              onPreview={onResizeMasterPreview} onCommit={(draft) => onResizeMasterCommit(obra.id, draft)} onCancel={() => onResizeMasterCancel(mestre.localId)} />
          ))}
        </>, altura)}
      </div>
    );
  };

  /** Contract row (Contratos view): summary on the left, the contract period and its LOTEs' bars (read only) on the calendar. */
  const linhaContrato = (grupo: ContractGroup) => {
    const contrato = contratos.get(grupo.id);
    const aberto = abertos.has(grupo.id);
    const todos = grupo.obras.flatMap((obra) => obra.mestresPlanejados);
    const lanes = layoutMasterAllocationLanes(todos);
    const nFaixas = Math.max(1, ...[...lanes.values()].map((lane) => lane.count));
    const altura = Math.max(48, 7 + nFaixas * ALTURA_FAIXA + 10);
    const alternar = () => setAbertos((atual) => { const proximo = new Set(atual); if (proximo.has(grupo.id)) proximo.delete(grupo.id); else proximo.add(grupo.id); return proximo; });
    const periodo = contrato?.inicio && contrato.fim ? { esq: Math.max(0, geo.indice(contrato.inicio)), fim: Math.min(dias.length, geo.indice(contrato.fim) + 1) } : null;
    return [
      <div key={`contrato-${grupo.id}`} className="qg-linha qg-linha--contrato" style={{ minHeight: altura }}>
        <div className="qg-esq" onClick={alternar}>
          {colunas.map((coluna) => {
            switch (coluna.id) {
              case "obra": return (
                <div key="obra" className="qg-obra">
                  <ExpandMoreRounded className={`qg-seta ${aberto ? "" : "is-fechada"}`} fontSize="small" />
                  <div className="qg-obra-textos">
                    <button type="button" className="qg-contrato qg-contrato--titulo" title={contrato?.nome} onClick={(e) => { e.stopPropagation(); if (contrato) onOpenContract(contrato); }}>{contrato?.nome ?? grupo.name}</button>
                    <span className="qg-lote">{grupo.obras.length} {grupo.obras.length === 1 ? "LOTE" : "LOTEs"}</span>
                  </div>
                </div>
              );
              case "empresa": return <span key="empresa" className="qg-texto">{contrato?.empresa || "—"}</span>;
              case "status": return <span key="status" className="qg-texto qg-situacao" title={contrato?.status}>{contrato?.status || "—"}</span>;
              case "mestres": return <button key="mestres" type="button" className="qg-mestres" onClick={(e) => e.stopPropagation()}>{chipsMestres(todos)}</button>;
              case "inicio": return <span key="inicio" className="qg-numero">{formatDateShort(contrato?.inicio)}</span>;
              case "dias": return <span key="dias" className="qg-numero">{inclusiveCivilDays(contrato?.inicio, contrato?.fim) ?? "—"}</span>;
            }
          })}
        </div>
        {trilho(grupo.obras[0], <>
          {periodo && periodo.fim > periodo.esq && <span className="qg-periodo-contrato" style={{ left: periodo.esq * dw, width: (periodo.fim - periodo.esq) * dw }} title={`Contrato: ${formatDateShort(contrato?.inicio)} → ${formatDateShort(contrato?.fim)}`} />}
          {todos.map((mestre) => {
            const ini = Math.max(0, geo.indice(mestre.inicio));
            const fim = Math.min(dias.length, geo.indice(mestre.inicio) + mestre.tempoPlanejado);
            if (fim <= ini) return null;
            const cor = getMestreColor(mestre.mestreKey ?? normalizeMestreKey(mestre.nome));
            return <span key={mestre.localId} className="qg-barra qg-barra--resumo" title={`${mestre.nome}\n${rotuloDias(mestre)}`} style={{ left: ini * dw, width: (fim - ini) * dw, top: 9 + (lanes.get(mestre)?.index ?? 0) * ALTURA_FAIXA, background: cor.background, color: cor.text }}>{display.masterNames && (fim - ini) * dw >= 44 ? <span className="qg-barra-nome">{mestre.nome}</span> : null}</span>;
          })}
        </>, altura, false)}
      </div>,
      ...(aberto ? grupo.obras.map((obra) => linhaObra(obra, undefined, true)) : []),
    ];
  };

  const linhas = viewMode === "contracts"
    ? groupContractGroupsByWorkType(sortContractGroups(groupObrasByContract(obras), contratos, sort), contratos).flatMap((tipo) => [
      <div key={`tipo-${tipo.kind}`} className="qg-grupo qg-grupo--tipo"><span>{GRUPO_NOME[tipo.label] ?? tipo.label}</span></div>,
      ...tipo.groups.flatMap((grupo) => linhaContrato(grupo)),
    ])
    : buildStartedFlatWorkStages(obras, contratos).flatMap((stage) => [
      ...(stage.label ? [<div key={`etapa-${stage.kind}`} className={`qg-grupo qg-grupo--etapa qg-grupo--${stage.kind}`}><span>{GRUPO_NOME[stage.label] ?? stage.label}</span></div>] : []),
      ...stage.workTypes.flatMap((tipo) => {
        const lista = sortObras(tipo.obras, contratos, sort);
        const grupo = `${stage.kind}-${tipo.kind}`;
        // Priority order applies only without a column sort.
        const comPrioridade = stage.kind === "proxima-a-iniciar" && Boolean(onMovePrioridade) && !sort.column;
        return [
          <div key={`tipo-${grupo}`} className="qg-grupo qg-grupo--tipo"><span>{GRUPO_NOME[tipo.label] ?? tipo.label}</span></div>,
          ...lista.map((obra) => linhaObra(obra, comPrioridade ? { grupo, lista } : undefined)),
        ];
      }),
    ]);

  return (
    <section className={`qg qg--${zoom} ${comBase ? "qg--base" : ""}`} aria-label="Cronograma de obras iniciadas" style={estiloGrade}>
      <div className="qg-rolagem" ref={rolagem}>
        <div className="qg-cab">
          <div className="qg-esq qg-esq--cab">
            {colunas.map((coluna) => {
              const id: ColumnId = coluna.id === "obra" ? "obra" : coluna.id;
              const ativo = sort.column === id ? sort.direction : null;
              return (
                <span key={coluna.id} className={`qg-cab-coluna ${ativo ? "is-ordenada" : ""}`} role="button" tabIndex={0} title={`Ordenar por ${coluna.rotulo}`} aria-sort={ativo === "asc" ? "ascending" : ativo === "desc" ? "descending" : "none"}
                  onClick={() => setSort((atual) => nextTableSort(atual, id))}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSort((atual) => nextTableSort(atual, id)); } }}>
                  {coluna.rotulo}{ativo && <b aria-hidden="true">{ativo === "asc" ? "▲" : "▼"}</b>}
                  <span className="qg-redimensionar" title="Arraste para ajustar a largura" onClick={(e) => e.stopPropagation()} onPointerDown={ajustarLargura(coluna)} />
                </span>
              );
            })}
            <button type="button" className="qg-encolher" title={completo ? "Ocultar Emp., Status e Dias" : "Mostrar todas as colunas"} aria-label={completo ? "Ocultar colunas complementares" : "Mostrar colunas complementares"} onClick={() => setCompleto((atual) => !atual)}>
              {completo ? <ChevronLeftRounded fontSize="inherit" /> : <ChevronRightRounded fontSize="inherit" />}
            </button>
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

function Barra({ obra, mestre, geo, topo, mostrarNome, podeNT, onSelecionar, onPreview, onCommit, onCancel }: {
  obra: ObraCronograma; mestre: MestrePlanejado; geo: Geometria; topo: number; mostrarNome: boolean; podeNT: boolean;
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
      style={{ left: esq * geo.dw, width: largura, top: topo, background: cor.background, color: cor.text } as CSSProperties}
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
