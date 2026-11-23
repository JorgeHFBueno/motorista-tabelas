import type { CSSProperties } from "react";
import type { GanttGridProps } from "../components/GanttGrid";
import { masterSelectionForPeriod } from "../domain/masterPlanningDetails";
import { getMestreColor, normalizeMestreKey } from "../domain/mestres";
import type { MestrePlanejado, MestreWorkload, ObraCronograma } from "../domain/models";
import { diasNT, rotuloDias, segmentosNT } from "../domain/naoTrabalhados";
import { addDays, formatDateShort } from "../domain/temporal";
import { layoutMasterAllocationLanes } from "../domain/timelineAggregation";
import { CabecalhoCalendario, useCalendario, type Geometria } from "./calendario";

/**
 * CronoObra: aba Mestres. Uma linha por mestre (Mestre, Obras, Dias, Não trabalhado, Conflitos) e, no calendário,
 * uma barra por período em cada obra; períodos que se sobrepõem ficam em faixas diferentes, então a linha cresce e
 * mostra todas as obras do mestre no mesmo dia. Dias em conflito ficam em vermelho. Clique na barra: detalhes.
 */
const ALTURA_FAIXA = 24;
const COLUNAS = [
  { rotulo: "Mestre", largura: 190 },
  { rotulo: "Obras", largura: 76 },
  { rotulo: "Dias", largura: 76 },
  { rotulo: "Não trabalhado", largura: 150 },
  { rotulo: "Conflitos", largura: 96 },
] as const;

type Periodo = { obra: ObraCronograma; mestre: MestrePlanejado };

/** The mestre's periods in each work (a work may have more than one period of the same mestre). */
const periodosDo = (workload: MestreWorkload): Periodo[] =>
  workload.obras.flatMap((obra) => obra.mestresPlanejados.filter((mestre) => mestre.nome === workload.mestre && mestre.tempoPlanejado > 0).map((mestre) => ({ obra, mestre })));

export function QuadroMestres({ workloads, obras, contratos, zoom, centerRequest, onSelectMaster }: GanttGridProps) {
  const { zoom: zoomCal, hoje, dias, dw, geo, rolagem, fundo, largura } = useCalendario(zoom, centerRequest);
  const larguraEsq = COLUNAS.reduce((total, coluna) => total + coluna.largura, 0);
  const estilo = { "--qg-esq": `${larguraEsq}px`, "--qg-esq-colunas": COLUNAS.map((coluna) => `${coluna.largura}px`).join(" "), "--qg-total": `${larguraEsq + largura}px` } as CSSProperties;

  const linha = (workload: MestreWorkload) => {
    // Apoios ("ajuda por fora") of this mestre: dashed bars on their own lanes; they count neither days nor conflicts.
    const apoios = obras.flatMap((obra) => obra.mestresPlanejados.filter((mestre) => mestre.apoio && mestre.nome === workload.mestre && mestre.tempoPlanejado > 0).map((mestre) => ({ obra, mestre })));
    const periodos = [...periodosDo(workload), ...apoios];
    const lanes = layoutMasterAllocationLanes(periodos.map((item) => item.mestre));
    const nFaixas = Math.max(1, ...[...lanes.values()].map((lane) => lane.count));
    const altura = Math.max(48, 8 + nFaixas * ALTURA_FAIXA + 6);
    const nt = periodos.reduce((total, item) => total + (item.mestre.apoio ? 0 : diasNT(item.mestre).size), 0);
    const conflitos = new Set(workload.daily.filter((dia) => dia.conflict).map((dia) => dia.date));
    // Conflict days as stretches (consecutive days together).
    const trechos = dias.reduce<Array<{ esq: number; dias: number }>>((lista, dia, i) => {
      if (!conflitos.has(dia)) return lista;
      const ultimo = lista[lista.length - 1];
      if (ultimo && ultimo.esq + ultimo.dias === i) ultimo.dias += 1; else lista.push({ esq: i, dias: 1 });
      return lista;
    }, []);
    const cor = getMestreColor(normalizeMestreKey(workload.mestre));
    return (
      <div key={workload.mestre} className="qg-linha" style={{ minHeight: altura }}>
        <div className="qg-esq qg-esq--mestre">
          <span className="qm-nome"><i style={{ background: cor.background }} />{workload.mestre}</span>
          <span className="qg-numero">{workload.obras.length}</span>
          <span className="qg-numero">{workload.diasProgramados}</span>
          <span className="qg-numero">{nt ? `${nt} ${nt === 1 ? "dia" : "dias"}` : "—"}</span>
          <span className={`qg-numero ${workload.conflictDays ? "qm-conflito-total" : ""}`}>{workload.conflictDays}</span>
        </div>
        <div className="qg-trilho" style={{ width: largura, ...fundo, minHeight: altura }}>
          {trechos.map((trecho) => <span key={trecho.esq} className="qm-conflito" style={{ left: trecho.esq * dw, width: trecho.dias * dw }} title={`Conflito: ${formatDateShort(dias[trecho.esq])} → ${formatDateShort(dias[trecho.esq + trecho.dias - 1])}`} />)}
          {periodos.map(({ obra, mestre }) => (
            <BarraObra key={mestre.localId} obra={obra} mestre={mestre} numero={contratos.get(obra.contratoId ?? "")?.numeroContrato} geo={geo} topo={8 + (lanes.get(mestre)?.index ?? 0) * ALTURA_FAIXA}
              onDetalhes={() => onSelectMaster(masterSelectionForPeriod(obra, mestre))} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className={`qg qg--${zoom} qm`} aria-label="Cronograma dos mestres" style={estilo}>
      <div className="qg-rolagem" ref={rolagem}>
        <div className="qg-cab">
          <div className="qg-esq qg-esq--cab">{COLUNAS.map((coluna) => <span key={coluna.rotulo}>{coluna.rotulo}</span>)}</div>
          <CabecalhoCalendario geo={geo} zoom={zoomCal} hoje={hoje} />
        </div>
        {workloads.length ? workloads.map(linha) : <p className="qg-vazio">Nenhum mestre planejado com estes filtros.</p>}
      </div>
    </section>
  );
}

/** One period of the mestre in one work, labelled with the work (LOTE) and the contract number. */
function BarraObra({ obra, mestre, numero, geo, topo, onDetalhes }: {
  obra: ObraCronograma; mestre: MestrePlanejado; numero?: string | null; geo: Geometria; topo: number; onDetalhes: () => void;
}) {
  const ini = geo.indice(mestre.inicio);
  const esq = Math.max(0, ini);
  const fim = Math.min(geo.dias.length, ini + mestre.tempoPlanejado);
  if (fim <= esq) return null;
  const cor = getMestreColor(mestre.mestreKey ?? normalizeMestreKey(mestre.nome));
  const largura = (fim - esq) * geo.dw;
  const rotulo = [numero, obra.nomeObra].filter(Boolean).join(" · ");
  return (
    <div
      className={`qg-barra qm-barra ${mestre.apoio ? "qg-barra--apoio" : ""}`}
      role="button"
      tabIndex={0}
      title={`${rotulo}\n${formatDateShort(mestre.inicio)} → ${formatDateShort(addDays(mestre.inicio, mestre.tempoPlanejado - 1))}\n${mestre.apoio ? "Apoio (não conta dias nem conflito)" : rotuloDias(mestre)}\nClique: detalhes`}
      style={(mestre.apoio ? { left: esq * geo.dw, width: largura, top: topo + 2, "--qg-cor-apoio": cor.background } : { left: esq * geo.dw, width: largura, top: topo, background: cor.background, color: cor.text }) as CSSProperties}
      onClick={onDetalhes}
      onContextMenu={(e) => { e.preventDefault(); onDetalhes(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDetalhes(); } }}
    >
      {segmentosNT(mestre, geo.dias[esq], fim - esq).map((nt) => <span key={nt.offset} className="qg-nt" style={{ left: nt.offset * geo.dw, width: nt.days * geo.dw }}>{nt.days * geo.dw >= 18 ? "NT" : ""}</span>)}
      {largura >= 44 && <span className="qg-barra-nome">{rotulo}</span>}
    </div>
  );
}
