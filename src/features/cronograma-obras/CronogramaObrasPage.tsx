import EngineeringRounded from '@mui/icons-material/EngineeringRounded';
import FilterListRounded from '@mui/icons-material/FilterListRounded';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarToggles, type CalendarDisplayOptions } from './components/CalendarToggles';
import { FiltersBar } from './components/FiltersBar';
import { GanttGrid } from './components/GanttGrid';
import { MasterPalette } from './components/MasterPalette';
import { ObraDrawer } from './components/ObraDrawer';
import { MasterDetailsDrawer } from './components/MasterDetailsDrawer';
import { WorkloadPanel } from './components/WorkloadPanel';
import { CronogramaFirestoreRepository, type AlocacaoFirestore } from './data/cronogramaFirestore';
import { FirestoreMestresDataSource, nextMestreColor, type MestreFirestore } from './data/mestresFirestore';
import { RawFirestoreCronogramaDataSource } from './data/source/rawFirestoreCronogramaDataSource';
import { allMasters, buildWorkloads, calculateIndicators, filterObras } from './domain/cronograma';
import { getDirectMasterDropInterval } from './domain/dropPlanning';
import { DEFAULT_CALENDAR_DISPLAY } from './domain/calendarDisplay';
import { planningYears } from './domain/calendarYears';
import { normalizeMestreKey, setPersistedMestreColors } from './domain/mestres';
import type { CivilDate, ContratoCronograma, CronogramaFilters, ObraCronograma, ZoomCronograma } from './domain/models';
import { contractPlanningRowFor } from './data/source/rawCronogramaAdapter';
import { todayCivil } from './domain/temporal';
import { synchronizeMonday, type MondaySyncResult } from '../../services/mondaySync';
import { useAdm2Authorization } from '../../hooks/useAdm2Authorization';
import { useAuth } from '../../contexts/AuthContext';
import './styles/cronograma-obras.css';

const source = new RawFirestoreCronogramaDataSource();
const mestresSource = new FirestoreMestresDataSource();
const alocacoesSource = new CronogramaFirestoreRepository();
const INITIAL_FILTERS: CronogramaFilters = { search: '', status: '', empresa: '', mestre: '', period: 'year' };

function hydrateFirestoreAlocacoes(contratos: readonly ContratoCronograma[], mestres: readonly MestreFirestore[], alocacoes: readonly AlocacaoFirestore[]): ObraCronograma[] {
  const mestreById = new Map(mestres.map((mestre) => [mestre.id, mestre]));
  const eligible = new Set(contratos.map((contrato) => contrato.id));
  const visible = alocacoes.filter((alocacao) => eligible.has(alocacao.contratoId));
  const directContracts = new Set(visible.filter((alocacao) => !alocacao.obraId).map((alocacao) => alocacao.contratoId));
  const obras = contratos.flatMap((contrato) => contrato.obras.some((obra) => obra.targetType === 'contrato') || !directContracts.has(contrato.id) ? contrato.obras : [...contrato.obras, contractPlanningRowFor(contrato)]);
  const byTarget = new Map<string, AlocacaoFirestore[]>();
  visible.forEach((alocacao) => { const target = alocacao.obraId ?? `contrato:${alocacao.contratoId}`; byTarget.set(target, [...(byTarget.get(target) ?? []), alocacao]); });
  return obras.map((obra) => ({ ...obra, mestresPlanejados: (byTarget.get(obra.id) ?? []).flatMap((alocacao) => {
    const mestre = mestreById.get(alocacao.mestreId);
    return mestre ? [{ localId: alocacao.id, mestreId: alocacao.mestreId, mestreKey: normalizeMestreKey(mestre.nome), nome: mestre.nome, inicio: alocacao.inicio, tempoPlanejado: alocacao.tempoPlanejado }] : [];
  }) }));
}

function withResizeDrafts(obras: readonly ObraCronograma[], drafts: ReadonlyMap<string, Pick<ObraCronograma['mestresPlanejados'][number], 'inicio' | 'tempoPlanejado'>>): ObraCronograma[] {
  return obras.map((obra) => ({ ...obra, mestresPlanejados: obra.mestresPlanejados.map((mestre) => drafts.has(mestre.localId) ? { ...mestre, ...drafts.get(mestre.localId)! } : mestre) }));
}

export default function CronogramaObrasPage() {
  const { authorized: canSyncMonday } = useAdm2Authorization();
  const { currentUser, authorizationLoading, authorizationProfile } = useAuth();
  const [view, setView] = useState<'obras' | 'mestres'>('obras');
  const [zoom, setZoomState] = useState<ZoomCronograma>('week');
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [display, setDisplay] = useState<CalendarDisplayOptions>(DEFAULT_CALENDAR_DISPLAY);
  const [centerRequest, setCenterRequest] = useState(1);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [obras, setObras] = useState<ObraCronograma[]>([]);
  const confirmedObras = useRef<ObraCronograma[]>([]);
  const resizeDrafts = useRef(new Map<string, { inicio: string; tempoPlanejado: number }>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [mestres, setMestres] = useState<MestreFirestore[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mastersPanelId, setMastersPanelId] = useState<string | null>(null);
  const [masterPanel, setMasterPanel] = useState<{ obraId: string; key: string } | null>(null);
  const [draggingMaster, setDraggingMaster] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<MondaySyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [addingMaster, setMasterDialog] = useState(false); const [newMasterName, setNewMasterName] = useState(''); const [newMasterError, setNewMasterError] = useState<string | null>(null); const [savingMaster, setSavingMaster] = useState(false);
  useEffect(() => { let alive = true; let unsubscribe = () => undefined; Promise.all([source.carregar(), mestresSource.carregar()]).then(([cronograma, catalogo]) => { if (!alive) return; setMestres(catalogo.mestres); setPersistedMestreColors(catalogo.mestres); setError([...cronograma.diagnostics, ...catalogo.diagnostics].join(' ') || null); unsubscribe = alocacoesSource.subscribeAlocacoes((alocacoes) => { if (!alive) return; confirmedObras.current = hydrateFirestoreAlocacoes(cronograma.contratos, catalogo.mestres, alocacoes); setObras(withResizeDrafts(confirmedObras.current, resizeDrafts.current)); }, (cause) => { if (alive) setWriteError(`Falha ao acompanhar alocações no Firestore: ${cause.message}`); }); }).catch((cause: unknown) => { if (alive) setError(`Falha ao ler contratos ou mestres homologados: ${cause instanceof Error ? cause.message : String(cause)}`); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; unsubscribe(); }; }, []);
  const masters = useMemo(() => allMasters(obras, mestres.map((mestre) => mestre.nome)), [obras, mestres]);
  const filtered = useMemo(() => filterObras(obras, filters), [obras, filters]);
  const workloads = useMemo(() => buildWorkloads(filtered), [filtered]);
  const indicators = useMemo(() => calculateIndicators(filtered), [filtered]);
  const years = useMemo(() => planningYears(obras, Number(todayCivil().slice(0, 4))), [obras]);
  const selected = obras.find((obra) => obra.id === (mastersPanelId ?? selectedId)) ?? null;

  const setZoom = (next: ZoomCronograma) => { setZoomState(next); setCenterRequest((request) => request + 1); };
  const goToday = () => { setFilters((current) => current.period === 'year' ? current : { ...current, period: 'year' }); setCenterRequest((request) => request + 1); };
  const mestreIdFor = (nome: string) => mestres.find((mestre) => mestre.nome === nome)?.id;
  const criadorAtual = () => {
    if (authorizationLoading) throw new Error('A identidade do funcionário autenticado ainda está sendo verificada.');
    if (!currentUser || !authorizationProfile?.exists || authorizationProfile.id !== currentUser.uid) throw new Error('Não foi possível identificar um funcionário válido para registrar a autoria da alocação.');
    return authorizationProfile.id;
  };
  const persistObra = async (next: ObraCronograma) => {
    const current = obras.find((obra) => obra.id === next.id);
    if (!current || !next.contratoId) return;
    setWriteError(null);
    try {
      const existing = new Map(current.mestresPlanejados.map((item) => [item.localId, item]));
      const nextIds = new Set(next.mestresPlanejados.map((item) => item.localId));
      await Promise.all([...existing.keys()].filter((id) => !nextIds.has(id)).map((id) => alocacoesSource.deleteAlocacao(id)));
      for (const item of next.mestresPlanejados) {
        const previous = existing.get(item.localId); const mestreId = item.mestreId ?? mestreIdFor(item.nome);
        if (!mestreId) throw new Error(`Mestre inválido: ${item.nome || 'não informado'}.`);
        if (!previous) { await alocacoesSource.createAlocacao({ ...(next.targetType === 'obra' ? { obraId: next.id } : {}), contratoId: next.contratoId, mestreId, inicio: item.inicio, tempoPlanejado: item.tempoPlanejado, criadoPorFuncionarioId: criadorAtual() }); continue; }
        const patch: { mestreId?: string; inicio?: string; tempoPlanejado?: number } = {};
        if (mestreId !== previous.mestreId) patch.mestreId = mestreId;
        if (item.inicio !== previous.inicio) patch.inicio = item.inicio;
        if (item.tempoPlanejado !== previous.tempoPlanejado) patch.tempoPlanejado = item.tempoPlanejado;
        if (Object.keys(patch).length) await alocacoesSource.updateAlocacao(previous.localId, patch);
      }
    } catch (cause) { setWriteError(`A alteração não foi salva: ${cause instanceof Error ? cause.message : String(cause)}`); }
  };
  const save = (next: ObraCronograma) => { void persistObra(next); };
  const dropMaster = (obra: ObraCronograma, mestre: string, target: string) => {
    if (zoom === 'year') return;
    const interval = getDirectMasterDropInterval({ obra, targetDate: target as CivilDate, hoje: todayCivil() });
    if (!obra.allocationAllowed) { setWriteError('Este contrato não possui raw.inicio válido para criar uma alocação temporal.'); } else if (interval) { const mestreId = mestreIdFor(mestre); if (!mestreId || !obra.contratoId) setWriteError('Não foi possível determinar o mestre ou contrato da alocação.'); else { try { void alocacoesSource.createAlocacao({ ...(obra.targetType === 'obra' ? { obraId: obra.id } : {}), contratoId: obra.contratoId, mestreId, inicio: interval.inicio, tempoPlanejado: interval.tempoPlanejado, criadoPorFuncionarioId: criadorAtual() }).catch((cause: unknown) => setWriteError(`A alocação não foi salva: ${cause instanceof Error ? cause.message : String(cause)}`)); } catch (cause) { setWriteError(cause instanceof Error ? cause.message : String(cause)); } } }
    setDraggingMaster(null);
  };
  const resizeMasterPreview = (next: { localId: string; inicio: string; tempoPlanejado: number }) => {
    resizeDrafts.current.set(next.localId, { inicio: next.inicio, tempoPlanejado: next.tempoPlanejado });
    setObras(withResizeDrafts(confirmedObras.current, resizeDrafts.current));
  };
  const cancelResizeMaster = (id: string) => { resizeDrafts.current.delete(id); setObras(withResizeDrafts(confirmedObras.current, resizeDrafts.current)); };
  const resizeMaster = async (obraId: string, next: { localId: string; inicio: string; tempoPlanejado: number }) => {
    const previous = confirmedObras.current.find((obra) => obra.id === obraId)?.mestresPlanejados.find((item) => item.localId === next.localId);
    if (!previous) return;
    const patch: { inicio?: string; tempoPlanejado?: number } = {};
    if (next.inicio !== previous.inicio) patch.inicio = next.inicio;
    if (next.tempoPlanejado !== previous.tempoPlanejado) patch.tempoPlanejado = next.tempoPlanejado;
    if (!Object.keys(patch).length) return cancelResizeMaster(next.localId);
    try { await alocacoesSource.updateAlocacao(next.localId, patch); resizeDrafts.current.delete(next.localId); } catch (cause) { cancelResizeMaster(next.localId); setWriteError(`O redimensionamento não foi salvo: ${cause instanceof Error ? cause.message : String(cause)}`); }
  };
  const createMaster = async () => { setNewMasterError(null); const cor = nextMestreColor(mestres.map((mestre) => mestre.cor.background)); try { setSavingMaster(true); const created = await mestresSource.criar(newMasterName, cor, mestres); setMestres((current) => [...current, created].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))); setPersistedMestreColors([...mestres, created]); setMasterDialog(false); setNewMasterName(''); } catch (cause) { setNewMasterError(cause instanceof Error ? cause.message : 'Não foi possível criar o mestre.'); } finally { setSavingMaster(false); } };
  const runSync = async (mode: 'dry-run' | 'apply') => { try { setSyncing(true); setSyncError(null); const result = await synchronizeMonday(mode); setSyncResult(result); if (mode === 'apply') { const cronograma = await source.carregar(); void cronograma; } } catch (cause) { setSyncError(cause instanceof Error ? cause.message : 'Falha na sincronização.'); } finally { setSyncing(false); } };

  if (loading) return <main className="co-page"><p className="co-empty">Carregando contratos e LOTEs homologados…</p></main>;
  if (error) return <main className="co-page"><p className="co-empty" role="alert">{error}</p></main>;

  return <main className={`co-page co-zoom--${zoom}`}>
    <header className="co-page-header"><div className="co-title"><span className="co-title-icon"><EngineeringRounded /></span><div><div className="co-title-line"><h1>Cronograma de Obras</h1><span className="co-prototype">Planejador local · MK2</span></div><p>Planejamento e alocação de Mestres de Obras</p></div></div><div className="co-header-actions">{canSyncMonday && <button className="co-button co-button--primary" disabled={syncing} type="button" onClick={() => void runSync('dry-run')}>{syncing ? 'Consultando Monday…' : 'Sincronizar Monday'}</button>}<button className={`co-button co-button--secondary co-filter-toggle ${filtersOpen ? 'is-active' : ''}`} type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><FilterListRounded fontSize="small" />Filtros</button><div className="co-view-switch"><button type="button" className={view === 'obras' ? 'is-active' : ''} onClick={() => setView('obras')}>Obras</button><button type="button" className={view === 'mestres' ? 'is-active' : ''} onClick={() => setView('mestres')}>Mestres</button></div></div></header>
    {(syncResult || syncError) && <div className="co-master-modal" role="dialog" aria-modal="true" aria-label="Sincronização Monday"><section><h2>{syncError ? 'Falha na sincronização' : syncResult?.mode === 'apply' ? 'Sincronização concluída' : 'Sincronização Monday'}</h2>{syncError ? <p role="alert">{syncError}</p> : syncResult && <><p>Itens: {syncResult.itemsMonday} · Novos contratos: {syncResult.itemsCriar} · Alterados: {syncResult.itemsAtualizar} · Sem alteração: {syncResult.itemsSemAlteracao}</p><p>Novos lotes: {syncResult.subitemsAdicionar} · Lotes alterados: {syncResult.subitemsAtualizar} · Ausentes no Monday: {syncResult.subitemsAusentesMonday} · Obras a finalizar: {syncResult.obrasFinalizar}</p><details><summary>Ver detalhes ({syncResult.details.length})</summary>{syncResult.details.map((detail) => <p key={detail.itemId}><strong>{detail.nome ?? detail.itemId}</strong>: {detail.changes?.map((change) => `${change.type}${change.subitemId ? ` (${change.subitemId})` : ''}`).join(', ') || 'alteração de item'}</p>)}</details></>}<div><button type="button" disabled={syncing} onClick={() => { setSyncResult(null); setSyncError(null); }}>Cancelar</button>{syncResult?.mode === 'dry-run' && !syncResult.erros.length && <button className="co-button co-button--primary" disabled={syncing} type="button" onClick={() => { if (window.confirm('Aplicar a sincronização recalculada pelo servidor?')) void runSync('apply'); }}>Aplicar sincronização</button>}</div></section></div>}
    {filtersOpen && <aside className="co-filters-panel"><FiltersBar filters={filters} statuses={[...new Set(obras.map((obra) => obra.status))]} companies={[...new Set(obras.map((obra) => obra.empresa))]} masters={masters} onChange={setFilters} onToday={goToday} /></aside>}
    <section className="co-indicators"><div><span>Em andamento</span><strong>{indicators.running}</strong></div><div><span>Aguardando recurso</span><strong>{indicators.waiting}</strong></div><div><span>Mestres alocados</span><strong>{indicators.allocated}</strong></div><div><span>Obras sem mestre planejado</span><strong>{indicators.unassigned}</strong></div><div className={indicators.conflicts ? 'has-alert' : ''}><span>Conflitos de alocação</span><strong>{indicators.conflicts}</strong></div><div className="co-zoom"><CalendarToggles options={display} onChange={setDisplay} />{([['day', 'Dias'], ['week', 'Semanas']] as const).map(([value, label]) => <button type="button" key={value} className={zoom === value ? 'is-active' : ''} onClick={() => setZoom(value)}>{label}</button>)}</div></section>
    <MasterPalette masters={masters} draggingMaster={draggingMaster} disabled={zoom === 'year'} onDragStart={setDraggingMaster} onDragEnd={() => setDraggingMaster(null)} onAdd={() => { setNewMasterError(null); setMasterDialog(true); }} />
    {addingMaster && <div className="co-master-modal" role="dialog" aria-modal="true" aria-label="Adicionar mestre"><form onSubmit={(event) => { event.preventDefault(); void createMaster(); }}><h2>Adicionar mestre</h2><label>Nome<input autoFocus value={newMasterName} onChange={(event) => setNewMasterName(event.target.value)} /></label>{newMasterError && <p role="alert">{newMasterError}</p>}<div><button type="button" onClick={() => setMasterDialog(false)}>Cancelar</button><button className="co-button co-button--primary" disabled={savingMaster} type="submit">Salvar</button></div></form></div>}
    {writeError && <p className="co-empty" role="alert">{writeError}</p>}
    <GanttGrid view={view} zoom={zoom} years={years} obras={filtered} workloads={workloads} selectedId={selectedId} draggingMaster={draggingMaster} display={display} centerRequest={centerRequest} focusDate={focusDate} onFocusDate={setFocusDate} onSelect={(obra) => { setMasterPanel(null); setMastersPanelId(null); setSelectedId(obra.id); }} onSelectMasters={(obra) => { setMasterPanel(null); setSelectedId(null); setMastersPanelId(obra.id); }} onSelectMaster={({ obraId, mestreKey }) => { setSelectedId(null); setMastersPanelId(null); setMasterPanel({ obraId, key: mestreKey }); }} onDropMaster={dropMaster} onResizeMasterPreview={resizeMasterPreview} onResizeMasterCommit={resizeMaster} onResizeMasterCancel={cancelResizeMaster} />
    {view === 'mestres' && <WorkloadPanel workloads={workloads} />}
    <ObraDrawer obra={selected} masters={masters} mastersOnly={Boolean(mastersPanelId)} onClose={() => { setSelectedId(null); setMastersPanelId(null); }} onSave={save} />
    <MasterDetailsDrawer obra={obras.find((obra) => obra.id === masterPanel?.obraId) ?? null} obras={obras} masterKey={masterPanel?.key ?? null} allKeys={masters.map(normalizeMestreKey)} onClose={() => setMasterPanel(null)} />
  </main>;
}
