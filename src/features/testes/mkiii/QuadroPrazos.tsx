import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CORES_SITUACAO, LIMITES_PADRAO, ROTULO_SITUACAO, SITUACOES_PRAZO, addDays, formatDate, hojeBrasilia, montarPrazos,
  type Limites, type LinhaPrazo, type ObraPrazo, type SituacaoPrazo,
} from "../../prazos-contratuais/domain/prazos";
import { CabecalhoCalendario, useCalendario, type Geometria } from "./calendario";

/**
 * /testes/mkiii: aba Prazos Contratuais refeita na linguagem das outras abas: cartão com os contadores por situação e a
 * barra de filtros como na tela original, seção com título e Semanas/Meses, grade com colunas fixas e o mesmo
 * calendário. As contas (situação, dias restantes, %
 * decorrido, ordem, o que conferir no Friday) são as da tela de produção (`montarPrazos`); muda só a apresentação.
 */
const EMPRESAS = ["LEDUR", "ARTEBASE"];
/** The columns of the original screen; "‹" hides the complementary ones, leaving Obra, Situação do prazo and Lotes. */
type Coluna = { id: "obra" | "empresa" | "inicio" | "fim" | "duracao" | "restam" | "pct" | "situacao" | "obs"; rotulo: string; largura: number; complementar?: boolean };
const COLUNAS: readonly Coluna[] = [
  { id: "obra", rotulo: "Obra", largura: 250 },
  { id: "empresa", rotulo: "Empresa", largura: 90, complementar: true },
  { id: "inicio", rotulo: "Início", largura: 80, complementar: true },
  { id: "fim", rotulo: "Fim", largura: 80, complementar: true },
  { id: "duracao", rotulo: "Duração (dias)", largura: 92, complementar: true },
  { id: "restam", rotulo: "Dias restantes", largura: 92, complementar: true },
  { id: "pct", rotulo: "% prazo decorrido", largura: 100, complementar: true },
  { id: "situacao", rotulo: "Situação do prazo", largura: 122 },
  { id: "obs", rotulo: "Lotes / observações", largura: 280 },
];
const ultimoDoMes = (d: string) => {
  const ano = Number(d.slice(0, 4));
  const mes = Number(d.slice(5, 7));
  return addDays(mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`, -1);
};

export function QuadroPrazos({ carregar }: { carregar: () => Promise<ObraPrazo[]> }) {
  const [obras, setObras] = useState<ObraPrazo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [hoje, setHoje] = useState(() => hojeBrasilia());
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [situacoes, setSituacoes] = useState<SituacaoPrazo[]>([]);
  const [incluirPrivadas, setIncluirPrivadas] = useState(false);
  const [limites, setLimites] = useState<Limites>(LIMITES_PADRAO);
  const [zoom, setZoom] = useState<"week" | "month">("week");
  const [centro, setCentro] = useState(0);
  // On narrower screens it opens with the complementary columns hidden, so the timeline has room ("›" shows them).
  const [completo, setCompleto] = useState(() => window.innerWidth >= 1600);

  const recarregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try { setObras(await carregar()); setHoje(hojeBrasilia()); } catch (causa) { setErro(causa instanceof Error ? causa.message : String(causa)); } finally { setCarregando(false); }
  }, [carregar]);
  useEffect(() => { void recarregar(); }, [recarregar]);

  const { linhas, contagem, conferir } = useMemo(() => montarPrazos(obras, hoje, { empresas, situacoes, incluirPrivadas }, limites), [obras, hoje, empresas, situacoes, incluirPrivadas, limites]);
  // Calendar from the month of the earliest start to the month of the latest end (today always inside).
  const intervalo = useMemo(() => {
    const datas = [hoje, ...linhas.flatMap((l) => (l.obra.inicio && l.obra.fim ? [l.obra.inicio, l.obra.fim] : []))];
    const min = datas.reduce((a, b) => (a < b ? a : b));
    const max = datas.reduce((a, b) => (a > b ? a : b));
    return { inicio: `${min.slice(0, 7)}-01`, fim: ultimoDoMes(max) };
  }, [linhas, hoje]);
  // The calendar scrolls to today when it opens, when the range changes and on "Hoje".
  const cal = useCalendario(zoom, centro, intervalo);
  const colunas = COLUNAS.filter((coluna) => completo || !coluna.complementar);
  const larguraEsq = colunas.reduce((total, coluna) => total + coluna.largura, 0);
  const estilo = { "--qg-esq": `${larguraEsq}px`, "--qg-esq-colunas": colunas.map((c) => `${c.largura}px`).join(" "), "--qg-total": `${larguraEsq + cal.largura}px` } as CSSProperties;
  const alternar = <T,>(lista: T[], item: T) => (lista.includes(item) ? lista.filter((x) => x !== item) : [...lista, item]);

  return (
    <div className="qp">
      <div className="qp-filtros" aria-label="Filtros de Prazos Contratuais">
        <div className="qp-contadores" role="group" aria-label="Obras por situação do prazo (clique para filtrar)">
          {SITUACOES_PRAZO.map((s) => (
            <button key={s} type="button" aria-pressed={situacoes.includes(s)} className={`qp-contador${situacoes.includes(s) ? " is-ativo" : ""}${situacoes.length && !situacoes.includes(s) ? " is-apagado" : ""}`}
              style={{ "--pz-fundo": CORES_SITUACAO[s].fundo, "--pz-texto": CORES_SITUACAO[s].texto } as CSSProperties} onClick={() => setSituacoes((atual) => alternar(atual, s))}>
              <strong>{contagem[s]}</strong><span>{ROTULO_SITUACAO[s]}</span>
            </button>
          ))}
          {situacoes.length > 0 && <button type="button" className="co-button co-button--ghost" onClick={() => setSituacoes([])}><CloseRounded fontSize="small" />Limpar filtro</button>}
        </div>
        <div className="qp-barra-filtros">
          <div className="co-view-switch" role="group" aria-label="Empresa">
            {EMPRESAS.map((e) => <button key={e} type="button" className={empresas.includes(e) ? "is-active" : ""} aria-pressed={empresas.includes(e)} onClick={() => setEmpresas((atual) => alternar(atual, e))}>{e}</button>)}
          </div>
          <label className="qp-checar"><input type="checkbox" checked={incluirPrivadas} onChange={(e) => setIncluirPrivadas(e.target.checked)} />Incluir obras privadas</label>
          <span className="qp-sep" aria-hidden="true" />
          <label className="qp-limite">Crítico até<input type="number" min={0} value={limites.critico} onChange={(e) => setLimites((l) => ({ ...l, critico: Math.max(0, Number(e.target.value) || 0) }))} />dias</label>
          <label className="qp-limite">Atenção até<input type="number" min={0} value={limites.atencao} onChange={(e) => setLimites((l) => ({ ...l, atencao: Math.max(l.critico, Number(e.target.value) || 0) }))} />dias</label>
        </div>
      </div>

      {conferir.length > 0 && (
        <p className="qp-aviso" role="status">
          <WarningAmberRounded fontSize="small" /><strong>Conferir no Friday</strong> (fora da lista por terem Situação preenchida):{" "}
          {conferir.map(({ obra, motivo }, i) => <span key={obra.id}>{i > 0 && " · "}<a href={obra.url} target="_blank" rel="noreferrer">{obra.nome}</a> — {motivo}</span>)}
        </p>
      )}
      {erro && <p className="qp-aviso is-erro" role="alert">Não foi possível carregar as obras: {erro} <button type="button" className="co-button co-button--ghost" onClick={() => void recarregar()}>Tentar de novo</button></p>}

      <div className="co-contract-sections">
        <section>
          <header className="co-section-heading">
            <h2>Prazos contratuais ({linhas.length})</h2>
            <button type="button" className="co-button co-button--secondary qp-hoje" onClick={() => setCentro((n) => n + 1)}>Hoje</button>
            <div className="co-view-switch co-zoom-switch" aria-label="Escala da linha do tempo">
              <button type="button" className={zoom === "week" ? "is-active" : ""} aria-pressed={zoom === "week"} onClick={() => setZoom("week")}>Semanas</button>
              <button type="button" className={zoom === "month" ? "is-active" : ""} aria-pressed={zoom === "month"} onClick={() => setZoom("month")}>Meses</button>
            </div>
          </header>
          <section className={`qg qg--${cal.zoom} qp-grade`} aria-label="Prazos contratuais" style={estilo}>
            <div className="qg-rolagem" ref={cal.rolagem}>
              <div className="qg-cab">
                <div className="qg-esq qg-esq--cab">
                  {colunas.map((coluna) => <span key={coluna.id} className="qg-cab-coluna qp-cab-coluna">{coluna.rotulo}</span>)}
                  <button type="button" className="qg-encolher" title={completo ? "Ocultar Empresa, Início, Fim, Duração, Dias restantes e % decorrido" : "Mostrar todas as colunas"} aria-label={completo ? "Ocultar colunas complementares" : "Mostrar colunas complementares"} onClick={() => setCompleto((atual) => !atual)}>
                    {completo ? <ChevronLeftRounded fontSize="inherit" /> : <ChevronRightRounded fontSize="inherit" />}
                  </button>
                </div>
                <CabecalhoCalendario geo={cal.geo} zoom={cal.zoom} hoje={cal.hoje} />
              </div>
              {carregando ? <p className="qg-vazio">Carregando obras…</p>
                : linhas.length ? linhas.map((linha) => <LinhaContrato key={linha.obra.id} linha={linha} colunas={colunas} geo={cal.geo} hoje={hoje} fundo={cal.fundo} largura={cal.largura} />)
                  : <p className="qg-vazio">Nenhuma obra para os filtros selecionados.</p>}
            </div>
          </section>
          <footer className="qp-legenda">
            {(["vencido", "critico", "atencao", "folgado"] as const).map((s) => <span key={s}><i style={{ background: CORES_SITUACAO[s].forte }} /><i style={{ background: CORES_SITUACAO[s].clara }} />{ROTULO_SITUACAO[s]}{s === "critico" ? ` (até ${limites.critico} dias)` : s === "atencao" ? ` (até ${limites.atencao} dias)` : s === "folgado" ? ` (mais de ${limites.atencao})` : ""}</span>)}
          </footer>
        </section>
      </div>
    </div>
  );
}

function LinhaContrato({ linha, colunas, geo, hoje, fundo, largura }: { linha: LinhaPrazo; colunas: readonly Coluna[]; geo: Geometria; hoje: string; fundo: CSSProperties; largura: number }) {
  const { obra } = linha;
  const cor = CORES_SITUACAO[linha.situacaoPrazo];
  const restam = linha.diasRestantes;
  const celula = (coluna: Coluna) => {
    switch (coluna.id) {
      case "obra": return (
        <div key="obra" className="qg-obra">
          <span className="qp-posicao">{linha.posicao}</span>
          <div className="qg-obra-textos">
            <a className="qg-lote qp-link" href={obra.url} target="_blank" rel="noreferrer" title={`${obra.nome} · abrir no Friday`}>{obra.nome}<OpenInNewIcon /></a>
          </div>
          {linha.alertas.length > 0 && <WarningAmberRounded className="qp-alerta" titleAccess={linha.alertas.join(" ")} />}
        </div>
      );
      case "empresa": return <span key="empresa" className="qg-texto">{obra.empresa}</span>;
      case "inicio": return <span key="inicio" className="qg-numero">{formatDate(obra.inicio) || "—"}</span>;
      case "fim": return <span key="fim" className="qg-numero">{formatDate(obra.fim) || "—"}</span>;
      case "duracao": return <span key="duracao" className="qg-numero">{linha.duracao === null ? "—" : `${linha.duracao} dias`}</span>;
      case "restam": return <span key="restam" className={`qg-numero ${restam !== null && restam < 0 ? "qp-negativo" : ""}`}>{restam ?? "—"}</span>;
      case "pct": return <span key="pct" className="qg-numero">{linha.pctDecorrido === null ? "—" : `${Math.round(linha.pctDecorrido)}%`}</span>;
      case "obs": return <span key="obs" title={linha.observacao}><span className="qp-obs">{linha.observacao || "—"}</span></span>;
      case "situacao": return <span key="situacao" className="qg-status"><span className="qp-etiqueta" style={{ background: cor.fundo, color: cor.texto }}>{ROTULO_SITUACAO[linha.situacaoPrazo]}</span></span>;
    }
  };
  // Bar: from Início to Fim; the part up to today is strong (elapsed), the rest light.
  let barra = null;
  if (obra.inicio && obra.fim) {
    const ini = Math.max(0, geo.indice(obra.inicio));
    const fim = Math.min(geo.dias.length, geo.indice(obra.fim) + 1);
    const corte = Math.min(fim, Math.max(ini, geo.indice(hoje) + 1));
    const rotulo = restam === null ? "" : restam < 0 ? `vencido há ${-restam} ${-restam === 1 ? "dia" : "dias"}` : `faltam ${restam} ${restam === 1 ? "dia" : "dias"}`;
    const dica = `${obra.nome}\n${formatDate(obra.inicio, true)} → ${formatDate(obra.fim, true)} · ${linha.duracao} dias\n${rotulo} · ${Math.round(linha.pctDecorrido ?? 0)}% decorrido${obra.lotes.length ? `\n\n${obra.lotes.map((l) => `${l.nome} — ${l.status}`).join("\n")}` : ""}`;
    if (fim > ini) barra = (
      <div className="qp-barra" title={dica} style={{ left: ini * geo.dw, width: (fim - ini) * geo.dw, background: cor.clara, color: cor.texto }}>
        {corte > ini && <span className="qp-decorrido" style={{ width: (corte - ini) * geo.dw, background: cor.forte }} />}
        {/* Label next to today (where elapsed meets remaining), the part of the bar usually in view. */}
        {(fim - ini) * geo.dw >= 110 && <span className="qp-barra-rotulo" style={{ left: Math.max(0, Math.min((corte - ini) * geo.dw, (fim - ini) * geo.dw - 120)), color: linha.situacaoPrazo === "vencido" ? "#fff" : cor.texto }}>{rotulo}</span>}
      </div>
    );
  }
  return (
    <div className={`qg-linha qp-linha is-${linha.situacaoPrazo}`} style={{ minHeight: 52 }}>
      <div className="qg-esq">{colunas.map(celula)}</div>
      <div className="qg-trilho" style={{ width: largura, ...fundo, minHeight: 52 }}>{barra}</div>
    </div>
  );
}
