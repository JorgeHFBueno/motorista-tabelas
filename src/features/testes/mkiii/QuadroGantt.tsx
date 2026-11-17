import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent, type ReactNode } from "react";
import type { GanttGridProps } from "../../cronograma-obras/components/GanttGrid";
import { LoteStatusControl } from "../../cronograma-obras/components/LoteStatusControl";
import { buildStartedFlatWorkStages, groupContractGroupsByWorkType, groupObrasByContract, type ContractGroup } from "../../cronograma-obras/domain/contractGroups";
import { masterSelectionForPeriod, recentStartedMaster } from "../../cronograma-obras/domain/masterPlanningDetails";
import { isEditableTarget } from "../../cronograma-obras/domain/undoStack";
import { resizeMasterPlanning, type MasterResizeEdge } from "../../cronograma-obras/domain/masterResize";
import { getMestreColor, normalizeMestreKey } from "../../cronograma-obras/domain/mestres";
import type { ContratoCronograma, MestrePlanejado, ObraCronograma } from "../../cronograma-obras/domain/models";
import { NT_ARRASTE, redimensionarNaoTrabalhado, rotuloDias, segmentosNT, type NaoTrabalhado } from "../../cronograma-obras/domain/naoTrabalhados";
import { clampColumnWidth } from "../../cronograma-obras/domain/obraGridColumns";
import { nextTableSort, sortContractGroups, sortObras, type ColumnId, type TableSort } from "../../cronograma-obras/domain/tableSort";
import { getBucketTimelineAggregate, layoutMasterAllocationLanes } from "../../cronograma-obras/domain/timelineAggregation";
import { addDays, formatDateShort, inclusiveCivilDays } from "../../cronograma-obras/domain/temporal";
import { CabecalhoCalendario, useCalendario, type Geometria } from "./calendario";
import { useColunasOcultas } from "./colunasVisiveis";

/**
 * /testes/mkiii: grade nova de "Obra iniciada", feita para o CronoObra (não é o GanttGrid). Uma linha por LOTE (ou por
 * contrato, na visão Contratos), com as colunas à esquerda (Obra com o LOTE e o contrato, Emp., Status, Mestres, Início,
 * Dias; ordenáveis, de largura ajustável e com "›" para encolher) e o calendário do ano à direita, no mesmo rolar. Recebe
 * as mesmas props do GanttGrid, então gravar, desfazer, NT, prioridade e Linha de Base continuam os da página.
 */
const ALTURA_FAIXA = 24;
/** Linha de Base: faixa no alto da linha; as barras descem para não cobri-la. */
const ALTURA_BASE = 8;

/** A selected period (whole allocation) or one NT stretch inside it. */
type ItemSelecionado = { tipo: "periodo"; localId: string } | { tipo: "nt"; localId: string; trecho: NaoTrabalhado };
const chaveDe = (item: ItemSelecionado) => (item.tipo === "periodo" ? item.localId : `nt|${item.localId}|${item.trecho.inicio}`);
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
  const { obras, contratos, zoom, viewMode = "flat", draggingMaster, selectedId, centerRequest, display, onSelect, onSelectMasters, onSelectMaster, onOpenContract, onDropMaster, onResizeMasterPreview, onResizeMasterCommit, onResizeMasterCancel, onStatusConfirmed, onMovePrioridade, onApagarSelecao } = props;
  const { zoom: zoomCal, hoje, dias, dw, geo, rolagem, fundo, largura: larguraCalendario } = useCalendario(zoom, centerRequest);
  const [sort, setSort] = useState<TableSort>({ column: null, direction: null });
  const [completo, setCompleto] = useState(true);
  const [larguras, setLarguras] = useState<Partial<Record<Coluna["id"], number>>>({});
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  /**
   * Selection in the calendar: whole periods (click on the bar, or the lasso) and NT stretches (click on the NT).
   * Ctrl/⌘ + click adds or removes; Del deletes the selection as one action; Esc clears.
   */
  const [selecao, setSelecao] = useState<Map<string, ItemSelecionado>>(() => new Map());
  const selecionar = (item: ItemSelecionado, varios: boolean) => setSelecao((atual) => {
    const chave = chaveDe(item);
    if (!varios) return atual.size === 1 && atual.has(chave) ? new Map() : new Map([[chave, item]]);
    const proximo = new Map(atual);
    if (proximo.has(chave)) proximo.delete(chave); else proximo.set(chave, item);
    return proximo;
  });
  const limparSelecao = () => setSelecao(new Map());
  const existentes = useMemo(() => new Set(obras.flatMap((obra) => obra.mestresPlanejados.map((mestre) => mestre.localId))), [obras]);
  const atalho = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    atalho.current = (event) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "Escape") { limparSelecao(); return; }
      // With a panel open, Del belongs to the page (the period shown in the panel).
      if (event.key !== "Delete" || !onApagarSelecao || document.querySelector(".co-drawer")) return;
      const itens = [...selecao.values()].filter((item) => existentes.has(item.localId));
      if (!itens.length) return;
      event.preventDefault();
      onApagarSelecao({
        periodos: itens.flatMap((item) => (item.tipo === "periodo" ? [item.localId] : [])),
        nts: itens.flatMap((item) => (item.tipo === "nt" ? [{ localId: item.localId, trecho: item.trecho }] : [])),
      });
      limparSelecao();
    };
  });
  useEffect(() => {
    const ouvir = (event: KeyboardEvent) => atalho.current(event);
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, []);

  // Lasso: hold the left button on an empty part of the calendar and drag; every bar it touches is selected.
  const [laco, setLaco] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const houveLaco = useRef(false);
  const secao = useRef<HTMLElement>(null);
  const iniciarLaco = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || draggingMaster || (event.target as HTMLElement).closest(".qg-barra")) return;
    const x0 = event.clientX;
    const y0 = event.clientY;
    const varios = event.ctrlKey || event.metaKey;
    const base = varios ? new Map(selecao) : new Map<string, ItemSelecionado>();
    houveLaco.current = false;
    const mover = (e: globalThis.PointerEvent) => {
      const caixa = { x: Math.min(x0, e.clientX), y: Math.min(y0, e.clientY), w: Math.abs(e.clientX - x0), h: Math.abs(e.clientY - y0) };
      if (!houveLaco.current && caixa.w < 5 && caixa.h < 5) return;
      houveLaco.current = true;
      e.preventDefault();
      setLaco(caixa);
      const proximo = new Map(base);
      secao.current?.querySelectorAll<HTMLElement>(".qg-trilho .qg-barra[data-alocacao-id]").forEach((barra) => {
        const r = barra.getBoundingClientRect();
        if (r.right >= caixa.x && r.left <= caixa.x + caixa.w && r.bottom >= caixa.y && r.top <= caixa.y + caixa.h) {
          const item: ItemSelecionado = { tipo: "periodo", localId: barra.dataset.alocacaoId! };
          proximo.set(chaveDe(item), item);
        }
      });
      setSelecao(proximo);
    };
    const soltar = () => {
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerup", soltar);
      document.body.classList.remove("qg-laceando");
      setLaco(null);
    };
    document.body.classList.add("qg-laceando");
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", soltar);
  };
  const ocultas = useColunasOcultas();
  const escolhidas = COLUNAS.filter((coluna) => !ocultas.has(coluna.id));
  // "‹" hides the complementary columns, unless they are the only ones chosen in "Colunas".
  const encolhidas = escolhidas.filter((coluna) => !coluna.complementar);
  const colunas = (completo || !encolhidas.length ? escolhidas : encolhidas).map((coluna) => ({ ...coluna, largura: larguras[coluna.id] ?? coluna.largura }));
  const larguraEsq = colunas.reduce((total, coluna) => total + coluna.largura, 0);
  const gradeEsq = colunas.map((coluna) => `${coluna.largura}px`).join(" ");
  const comBase = display.liveAlerts;

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
      onPointerDown={recebe ? iniciarLaco : undefined}
      onClick={(event) => { if (houveLaco.current) { houveLaco.current = false; return; } if (!(event.target as HTMLElement).closest(".qg-barra")) limparSelecao(); }}
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
      case "mestres": {
        // As in production: with the columns collapsed (list view), only the mestre who started most recently.
        const recente = viewMode === "flat" && !completo ? recentStartedMaster(obra, hoje) : null;
        const lista = viewMode === "flat" && !completo ? (recente ? recente.periods.slice(0, 1) : []) : obra.mestresPlanejados;
        return <button key="mestres" type="button" className="qg-mestres" title="Mestres desta obra" onClick={(e) => { e.stopPropagation(); onSelectMasters(obra); }}>{chipsMestres(lista)}</button>;
      }
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
              focada={selecao.has(mestre.localId)} ntsFocados={new Set([...selecao.values()].flatMap((item) => (item.tipo === "nt" && item.localId === mestre.localId ? [item.trecho.inicio] : [])))}
              onFocar={(varios) => selecionar({ tipo: "periodo", localId: mestre.localId }, varios)}
              onFocarNT={(trecho, varios) => selecionar({ tipo: "nt", localId: mestre.localId, trecho }, varios)}
              onDetalhes={() => { limparSelecao(); onSelectMaster(masterSelectionForPeriod(obra, mestre)); }}
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
    <section ref={secao} className={`qg qg--${zoom} ${comBase ? "qg--base" : ""}`} aria-label="Cronograma de obras iniciadas" style={estiloGrade}>
      {laco && <div className="qg-laco" style={{ left: laco.x, top: laco.y, width: laco.w, height: laco.h }} aria-hidden="true" />}
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
          <CabecalhoCalendario geo={geo} zoom={zoomCal} hoje={hoje} />
        </div>
        {linhas.length ? linhas : <p className="qg-vazio">Nenhuma obra iniciada com estes filtros.</p>}
      </div>
    </section>
  );
}

function Barra({ obra, mestre, geo, topo, mostrarNome, podeNT, focada, ntsFocados, onFocar, onFocarNT, onDetalhes, onPreview, onCommit, onCancel }: {
  obra: ObraCronograma; mestre: MestrePlanejado; geo: Geometria; topo: number; mostrarNome: boolean; podeNT: boolean;
  focada: boolean; ntsFocados: ReadonlySet<string>; onFocar: (varios: boolean) => void; onFocarNT: (trecho: NaoTrabalhado, varios: boolean) => void; onDetalhes: () => void; onPreview: (m: MestrePlanejado) => void; onCommit: (m: MestrePlanejado) => void; onCancel: () => void;
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
      className={`qg-barra ${focada ? "is-focada" : ""}`}
      role="button"
      aria-pressed={focada}
      tabIndex={0}
      data-alocacao-id={mestre.localId}
      title={`${mestre.nome}\n${formatDateShort(mestre.inicio)} → ${formatDateShort(addDays(mestre.inicio, mestre.tempoPlanejado - 1))}\n${rotuloDias(mestre)}\nClique: selecionar (no NT, só o NT) · Ctrl+clique ou arrastar no calendário: vários · Botão direito: detalhes · Del: apagar`}
      style={{ left: esq * geo.dw, width: largura, top: topo, background: cor.background, color: cor.text } as CSSProperties}
      onClick={(e) => { e.stopPropagation(); onFocar(e.ctrlKey || e.metaKey); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onDetalhes(); }}
    >
      <button type="button" className="qg-borda is-ini" aria-label={`Ajustar início de ${mestre.nome}`} onPointerDown={arrastar("start")} onClick={(e) => e.stopPropagation()} />
      {nts.map((nt) => {
        const trecho = { inicio: addDays(geo.dias[esq], nt.offset), dias: nt.days };
        return (
          <span key={nt.offset} className={`qg-nt ${ntsFocados.has(trecho.inicio) ? "is-focada" : ""}`} onClick={(e) => { e.stopPropagation(); onFocarNT(trecho, e.ctrlKey || e.metaKey); }} style={{ left: nt.offset * geo.dw, width: nt.days * geo.dw }} title={`NT · ${formatDateShort(trecho.inicio)} → ${formatDateShort(addDays(trecho.inicio, trecho.dias - 1))}`}>
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
