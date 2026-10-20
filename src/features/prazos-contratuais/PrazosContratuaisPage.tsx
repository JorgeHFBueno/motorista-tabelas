import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Alert, Button, Checkbox, CircularProgress, FormControlLabel, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import TodayIcon from '@mui/icons-material/Today';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  CORES_SITUACAO, LIMITES_PADRAO, ROTULO_SITUACAO, SITUACOES_PRAZO, colunasTempo, formatDate, gruposCabecalho, hojeBrasilia,
  montarPrazos, posicaoHoje, trechosBarra, type Escala, type LinhaPrazo, type Limites, type ObraPrazo, type SituacaoPrazo,
} from './domain/prazos';
import { carregarPrazos } from './data/prazosDataSource';
import { MONDAY_BOARD_ID } from './data/mondayPrazosSchema';
import './styles/prazos-contratuais.css';

const COLUNAS_FIXAS = [
  { key: 'n', titulo: 'Nº', largura: 40 },
  { key: 'obra', titulo: 'Obra', largura: 260 },
  { key: 'empresa', titulo: 'Empresa', largura: 80 },
  { key: 'inicio', titulo: 'Início', largura: 80 },
  { key: 'fim', titulo: 'Fim', largura: 80 },
  { key: 'duracao', titulo: 'Duração (dias)', largura: 70 },
  { key: 'restantes', titulo: 'Dias restantes', largura: 70 },
  { key: 'pct', titulo: '% prazo decorrido', largura: 70 },
  { key: 'situacao', titulo: 'Situação do prazo', largura: 90 },
  { key: 'obs', titulo: 'Lotes / observações', largura: 320 },
] as const;
const COLUNAS_CONGELADAS = COLUNAS_FIXAS.slice(0, 2); // Nº e Obra continuam visíveis mesmo em telas estreitas
const COLUNAS_DADOS = COLUNAS_FIXAS.slice(2);
const soma = (colunas: ReadonlyArray<{ largura: number }>) => colunas.reduce((total, c) => total + c.largura, 0);
const grade = (colunas: ReadonlyArray<{ largura: number }>) => colunas.map((c) => `${c.largura}px`).join(' ');
const LARGURA_FIXA = soma(COLUNAS_FIXAS);
const LARGURA_CONGELADA = soma(COLUNAS_CONGELADAS);
/** Abaixo disso, congelar todas as colunas esconderia a linha do tempo. */
const LARGURA_MINIMA_TIMELINE = 360;
const LARGURA_COLUNA: Record<Escala, number> = { semana: 22, mes: 44 };
const COLUNAS_ANTES_DE_HOJE: Record<Escala, number> = { semana: 6, mes: 2 };
const EMPRESAS = ['LEDUR', 'ARTEBASE'];

function DicaBarra({ linha }: { linha: LinhaPrazo }) {
  const { obra } = linha;
  return (
    <div className="pz-tip">
      <strong>{obra.nome}</strong>
      <dl>
        <dt>Início</dt><dd>{formatDate(obra.inicio, true)}</dd>
        <dt>Fim</dt><dd>{formatDate(obra.fim, true)}</dd>
        <dt>Duração</dt><dd>{linha.duracao} dias</dd>
        <dt>Dias restantes</dt><dd>{linha.diasRestantes}</dd>
        <dt>% decorrido</dt><dd>{Math.round(linha.pctDecorrido ?? 0)}%</dd>
      </dl>
      {obra.lotes.length ? <ul>{obra.lotes.map((l) => <li key={l.id}>{l.nome} — <em>{l.status}</em></li>)}</ul> : <p>Sem lotes cadastrados</p>}
    </div>
  );
}

export default function PrazosContratuaisPage() {
  const [obras, setObras] = useState<ObraPrazo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [hoje, setHoje] = useState(() => hojeBrasilia());
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [situacoes, setSituacoes] = useState<SituacaoPrazo[]>([]);
  const [incluirPrivadas, setIncluirPrivadas] = useState(false);
  const [escala, setEscala] = useState<Escala>('semana');
  const [limites, setLimites] = useState<Limites>(LIMITES_PADRAO);
  const [compacto, setCompacto] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try { setObras(await carregarPrazos()); setHoje(hojeBrasilia()); }
    catch (cause) { setErro(cause instanceof Error ? cause.message : String(cause)); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const { linhas, contagem, conferir } = useMemo(
    () => montarPrazos(obras, hoje, { empresas, situacoes, incluirPrivadas }, limites),
    [obras, hoje, empresas, situacoes, incluirPrivadas, limites],
  );
  const colunas = useMemo(() => colunasTempo(linhas, escala, hoje), [linhas, escala, hoje]);
  const grupos = useMemo(() => gruposCabecalho(colunas), [colunas]);
  const largura = LARGURA_COLUNA[escala];
  const hojePos = posicaoHoje(colunas, hoje);
  const hojeCol = hojePos === null ? -1 : Math.floor(hojePos);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const medir = () => setCompacto(el.clientWidth < LARGURA_FIXA + LARGURA_MINIMA_TIMELINE);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const irParaHoje = useCallback(() => {
    // Em modo compacto as colunas de dados rolam junto; a linha do tempo começa depois delas.
    const deslocamento = compacto ? LARGURA_FIXA - LARGURA_CONGELADA : 0;
    if (scrollRef.current && hojePos !== null) scrollRef.current.scrollLeft = Math.max(0, deslocamento + (hojeCol - COLUNAS_ANTES_DE_HOJE[escala]) * largura);
  }, [hojePos, hojeCol, escala, largura, compacto]);
  useLayoutEffect(() => { if (!carregando) irParaHoje(); }, [carregando, escala, compacto]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternarSituacao = (s: SituacaoPrazo) => setSituacoes((atual) => (atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s]));
  const cssVars = {
    '--pz-col': `${largura}px`, '--pz-fixo': `${LARGURA_FIXA}px`, '--pz-congelada': `${LARGURA_CONGELADA}px`, '--pz-dados': `${LARGURA_FIXA - LARGURA_CONGELADA}px`,
    '--pz-grid-congelada': grade(COLUNAS_CONGELADAS), '--pz-grid-dados': grade(COLUNAS_DADOS), '--pz-timeline': `${colunas.length * largura}px`,
  } as CSSProperties;

  return (
    <div className={`pz-page${compacto ? ' is-compacto' : ''}`} style={cssVars}>
      <header className="pz-header">
        <div>
          <h1>Cronograma de prazos contratuais — Obras públicas</h1>
          <p className="pz-sub">Ordem: menor prazo até o vencimento primeiro · <span className="pz-ref">Data de referência: {formatDate(hoje, true)}</span></p>
        </div>
        <div className="pz-header-actions">
          <span className="pz-fonte pz-fonte--firestore" title="Coleção monday-obras do Firestore">Firestore · monday-obras</span>
          <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={() => void carregar()} disabled={carregando}>Recarregar</Button>
        </div>
      </header>

      <section className="pz-contadores" aria-label="Obras por situação do prazo">
        {SITUACOES_PRAZO.map((s) => (
          <button key={s} type="button" aria-pressed={situacoes.includes(s)} className={`pz-contador${situacoes.includes(s) ? ' is-ativo' : ''}${situacoes.length && !situacoes.includes(s) ? ' is-apagado' : ''}`}
            style={{ '--pz-fundo': CORES_SITUACAO[s].fundo, '--pz-texto': CORES_SITUACAO[s].texto } as CSSProperties} onClick={() => alternarSituacao(s)}>
            <strong>{contagem[s]}</strong><span>{ROTULO_SITUACAO[s]}</span>
          </button>
        ))}
        {situacoes.length > 0 && <Button size="small" onClick={() => setSituacoes([])}>Limpar filtro</Button>}
      </section>

      <section className="pz-toolbar">
        <ToggleButtonGroup size="small" value={empresas} onChange={(_, v: string[]) => setEmpresas(v)} aria-label="Empresa">
          {EMPRESAS.map((e) => <ToggleButton key={e} value={e}>{e}</ToggleButton>)}
        </ToggleButtonGroup>
        <FormControlLabel control={<Checkbox size="small" checked={incluirPrivadas} onChange={(e) => setIncluirPrivadas(e.target.checked)} />} label="Incluir obras privadas" />
        <span className="pz-sep" />
        <ToggleButtonGroup size="small" exclusive value={escala} onChange={(_, v: Escala | null) => v && setEscala(v)} aria-label="Escala">
          <ToggleButton value="semana">Semana</ToggleButton>
          <ToggleButton value="mes">Mês</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" startIcon={<TodayIcon />} onClick={irParaHoje} disabled={hojePos === null}>Hoje</Button>
        <span className="pz-sep" />
        <TextField size="small" type="number" label="Crítico até (dias)" value={limites.critico} sx={{ width: 130 }}
          onChange={(e) => setLimites((l) => ({ ...l, critico: Math.max(0, Number(e.target.value) || 0) }))} />
        <TextField size="small" type="number" label="Atenção até (dias)" value={limites.atencao} sx={{ width: 130 }}
          onChange={(e) => setLimites((l) => ({ ...l, atencao: Math.max(l.critico, Number(e.target.value) || 0) }))} />
      </section>

      {conferir.length > 0 && (
        <Alert severity="warning" className="pz-conferir">
          <strong>Conferir no Monday</strong> (fora da tela por estarem encerradas):{' '}
          {conferir.map(({ obra, motivo }, i) => <span key={obra.id}>{i > 0 && ' · '}<a href={obra.url} target="_blank" rel="noreferrer">{obra.nome}</a> — {motivo}</span>)}
        </Alert>
      )}
      {erro && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void carregar()}>Tentar de novo</Button>}>Não foi possível carregar as obras: {erro}</Alert>}

      <div className="pz-scroll" ref={scrollRef}>
        {carregando && <div className="pz-loading"><CircularProgress size={22} /> Carregando obras do Monday…</div>}
        <div className="pz-grade">
          <div className="pz-row pz-row--head">
            <div className="pz-fixo pz-fixo--head">{COLUNAS_CONGELADAS.map((c) => <div key={c.key} className={`pz-th pz-th--${c.key}`}>{c.titulo}</div>)}</div>
            <div className="pz-fixo pz-fixo--dados pz-fixo--head">{COLUNAS_DADOS.map((c) => <div key={c.key} className={`pz-th pz-th--${c.key}`}>{c.titulo}</div>)}</div>
            <div className="pz-tl-head">
              <div className="pz-tl-meses">{grupos.map((g, i) => <div key={`${g.rotulo}-${i}`} style={{ width: g.span * largura }} className={i % 2 ? 'is-b' : 'is-a'}>{g.span * largura >= 34 ? g.rotulo : ''}</div>)}</div>
              <div className={`pz-tl-dias pz-tl-dias--${escala}`}>{colunas.map((c, i) => <div key={c.inicio} className={i === hojeCol ? 'is-hoje' : undefined}><span>{c.rotulo}</span></div>)}</div>
            </div>
          </div>

          {linhas.map((linha) => {
            const cor = CORES_SITUACAO[linha.situacaoPrazo];
            return (
              <div key={linha.obra.id} className="pz-row">
                <div className="pz-fixo">
                  <div className="pz-td pz-td--n">{linha.posicao}</div>
                  <div className="pz-td pz-td--obra">
                    <a href={linha.obra.url} target="_blank" rel="noreferrer" title="Abrir no Monday">{linha.obra.nome}<OpenInNewIcon /></a>
                    {linha.alertas.length > 0 && <Tooltip title={linha.alertas.join(' ')}><WarningAmberRoundedIcon className="pz-alerta" aria-label={linha.alertas.join(' ')} /></Tooltip>}
                  </div>
                </div>
                <div className="pz-fixo pz-fixo--dados">
                  <div className="pz-td pz-td--c">{linha.obra.empresa}</div>
                  <div className="pz-td pz-td--c">{formatDate(linha.obra.inicio)}</div>
                  <div className="pz-td pz-td--c">{formatDate(linha.obra.fim)}</div>
                  <div className="pz-td pz-td--c">{linha.duracao ?? ''}</div>
                  <div className={`pz-td pz-td--c${(linha.diasRestantes ?? 0) < 0 ? ' is-negativo' : ''}`}>{linha.diasRestantes ?? ''}</div>
                  <div className="pz-td pz-td--c">{linha.pctDecorrido === null ? '' : `${Math.round(linha.pctDecorrido)}%`}</div>
                  <div className="pz-td pz-td--c"><span className="pz-etiqueta" style={{ background: cor.fundo, color: cor.texto }}>{ROTULO_SITUACAO[linha.situacaoPrazo]}</span></div>
                  <div className="pz-td pz-td--obs">{linha.observacao}</div>
                </div>
                <div className="pz-tl">
                  {trechosBarra(linha, colunas, hoje).length > 0 && (
                    <Tooltip followCursor title={<DicaBarra linha={linha} />} slotProps={{ tooltip: { className: 'pz-tip-box' } }}>
                      <div className="pz-barra">
                        {trechosBarra(linha, colunas, hoje).map((t) => (
                          <span key={t.de} style={{ left: t.de * largura, width: (t.ate - t.de + 1) * largura, background: t.decorrido ? cor.forte : cor.clara }} />
                        ))}
                      </div>
                    </Tooltip>
                  )}
                </div>
              </div>
            );
          })}

          {!carregando && !linhas.length && <div className="pz-vazio">Nenhuma obra para os filtros selecionados.</div>}
          {hojePos !== null && linhas.length > 0 && (
            <>
              <div className="pz-hoje-semana" style={{ left: LARGURA_FIXA + hojeCol * largura, width: largura }} aria-hidden />
              <div className="pz-hoje-linha" style={{ left: LARGURA_FIXA + hojePos * largura }} title={`Hoje: ${formatDate(hoje, true)}`} />
            </>
          )}
        </div>
      </div>

      <footer className="pz-legenda">
        <h2>Legenda</h2>
        <ul>
          <li><i style={{ background: CORES_SITUACAO.vencido.forte }} />Vencido (prazo esgotado)</li>
          {(['critico', 'atencao', 'folgado'] as const).map((s) => {
            const faixa = s === 'critico' ? `0–${limites.critico} dias` : s === 'atencao' ? `${limites.critico + 1}–${limites.atencao} dias` : `> ${limites.atencao} dias`;
            return [
              <li key={`${s}-f`}><i style={{ background: CORES_SITUACAO[s].forte }} />{ROTULO_SITUACAO[s]} ({faixa}) — decorrido</li>,
              <li key={`${s}-c`}><i style={{ background: CORES_SITUACAO[s].clara }} />{ROTULO_SITUACAO[s]} — a decorrer</li>,
            ];
          })}
        </ul>
        <p>A coluna com borda preta marca a semana atual; a linha vermelha marca o dia de hoje. Dias calculados no fuso de Brasília a partir de Início e Fim.</p>
        <p>Fonte: Monday, quadro GESTÃO DE OBRAS ({MONDAY_BOARD_ID}), obras com Tipo de Obra Pública — sem obras com Status Solicitar termo Definitivo (entregue) ou Obra Finalizada.</p>
      </footer>
    </div>
  );
}
