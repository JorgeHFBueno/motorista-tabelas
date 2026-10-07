import EngineeringRounded from "@mui/icons-material/EngineeringRounded";
import FilterListRounded from "@mui/icons-material/FilterListRounded";
import ViewListRounded from "@mui/icons-material/ViewListRounded";
import { Profiler, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarToggles,
  type CalendarDisplayOptions,
} from "./components/CalendarToggles";
import { FiltersBar } from "./components/FiltersBar";
import { GanttGrid } from "./components/GanttGrid";
import { ContractTextTable } from "./components/ContractTextTable";
import { ContractDetailsDrawer } from "./components/ContractDetailsDrawer";
import { MasterPalette } from "./components/MasterPalette";
import { ObraDrawer } from "./components/ObraDrawer";
import { MasterDetailsDrawer } from "./components/MasterDetailsDrawer";
import { WorkloadPanel } from "./components/WorkloadPanel";
import {
  CronogramaFirestoreRepository,
  type AlocacaoFirestore,
} from "./data/cronogramaFirestore";
import {
  FirestoreMestresDataSource,
  nextMestreColor,
  type MestreFirestore,
} from "./data/mestresFirestore";
import {
  applyMondayObrasChanges,
  RawFirestoreCronogramaDataSource,
} from "./data/source/rawFirestoreCronogramaDataSource";
import {
  allMasters,
  buildWorkloads,
  calculateIndicators,
  filterObras,
} from "./domain/cronograma";
import { getDirectMasterDropInterval } from "./domain/dropPlanning";
import { DEFAULT_CALENDAR_DISPLAY } from "./domain/calendarDisplay";
import { planningYears } from "./domain/calendarYears";
import { normalizeMestreKey, setPersistedMestreColors } from "./domain/mestres";
import {
  DEFAULT_WORK_SECTION_VIEWS,
  loadWorkSectionViews,
  persistWorkSectionViews,
  type WorkSectionViews,
} from "./domain/sectionViews";
import type {
  CivilDate,
  ContratoCronograma,
  CronogramaFilters,
  ObraCronograma,
  ZoomCronograma,
} from "./domain/models";
import { contractPlanningRowFor } from "./data/source/rawCronogramaAdapter";
import { updateObraStatusByMondaySubitemId } from "./application/localPlanner";
import { todayCivil } from "./domain/temporal";
import {
  separarObrasPorSituacao,
  statusLoteConhecido,
} from "./domain/contractStatus";
import {
  synchronizeMonday,
  type MondaySyncResult,
} from "../../services/mondaySync";
import { startMondayOAuth } from "../../services/mondayOAuth";
import {
  provisionMondayWebhook,
  type AuditResult,
  type CleanupResult,
  type EnsureResult,
  type RecreateResult,
  MondayWebhookProvisionError,
} from "../../services/mondayWebhookProvisionService";
import { useAdm2Authorization } from "../../hooks/useAdm2Authorization";
import { useAuth } from "../../contexts/AuthContext";
import {
  beginCronogramaPerf,
  collectCronogramaDom,
  countCronogramaRender,
  finishCronogramaPerf,
  markCronogramaPerf,
  measureCronogramaCompute,
  recordCronogramaProfiler,
  type CronogramaPerfMode,
} from "./debug/cronogramaPerf";
import "./styles/cronograma-obras.css";

const source = new RawFirestoreCronogramaDataSource();
const mestresSource = new FirestoreMestresDataSource();
const alocacoesSource = new CronogramaFirestoreRepository();
const INITIAL_FILTERS: CronogramaFilters = {
  search: "",
  status: "",
  empresa: "",
  mestre: "",
  period: "year",
};
type CronogramaViewTransition =
  | "obras"
  | "mestres"
  | "contratos"
  | "lista"
  | "dias"
  | "semanas"
  | null;

const VIEW_TRANSITION_MESSAGES: Record<
  Exclude<CronogramaViewTransition, null>,
  string
> = {
  obras: "Carregando visão de Obras…",
  mestres: "Carregando visão de Mestres…",
  contratos: "Organizando por contratos…",
  lista: "Preparando lista corrida…",
  dias: "Preparando calendário diário…",
  semanas: "Preparando calendário semanal…",
};
function CronogramaProfiler({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  if (!import.meta.env.DEV) return children;
  return (
    <Profiler
      id={id}
      onRender={(profilerId, phase, actualDuration, baseDuration, startTime, commitTime) =>
        recordCronogramaProfiler(
          profilerId,
          phase,
          actualDuration,
          baseDuration,
          startTime,
          commitTime,
        )
      }
    >
      {children}
    </Profiler>
  );
}
let lastHydratedObras: ObraCronograma[] = [];

function sameMasters(
  left: readonly ObraCronograma["mestresPlanejados"][number][],
  right: readonly ObraCronograma["mestresPlanejados"][number][],
) {
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.localId === right[index].localId &&
        item.mestreId === right[index].mestreId &&
        item.mestreKey === right[index].mestreKey &&
        item.nome === right[index].nome &&
        item.inicio === right[index].inicio &&
        item.tempoPlanejado === right[index].tempoPlanejado,
    )
  );
}

function hydrateFirestoreAlocacoes(
  contratos: readonly ContratoCronograma[],
  mestres: readonly MestreFirestore[],
  alocacoes: readonly AlocacaoFirestore[],
  previous: readonly ObraCronograma[] = lastHydratedObras,
): ObraCronograma[] {
  const mestreById = new Map(mestres.map((mestre) => [mestre.id, mestre]));
  const eligible = new Set(contratos.map((contrato) => contrato.id));
  const visible = alocacoes.filter((alocacao) =>
    eligible.has(alocacao.contratoId),
  );
  const directContracts = new Set(
    visible
      .filter((alocacao) => !alocacao.obraId)
      .map((alocacao) => alocacao.contratoId),
  );
  const obras = contratos.flatMap((contrato) =>
    contrato.obras.some((obra) => obra.targetType === "contrato") ||
    !directContracts.has(contrato.id)
      ? contrato.obras
      : [...contrato.obras, contractPlanningRowFor(contrato)],
  );
  const byTarget = new Map<string, AlocacaoFirestore[]>();
  visible.forEach((alocacao) => {
    const target = alocacao.obraId ?? `contrato:${alocacao.contratoId}`;
    byTarget.set(target, [...(byTarget.get(target) ?? []), alocacao]);
  });
  const previousById = new Map(previous.map((obra) => [obra.id, obra]));
  const hydrated = obras.map((obra) => {
    const mestresPlanejados = (byTarget.get(obra.id) ?? []).flatMap(
      (alocacao) => {
        const mestre = mestreById.get(alocacao.mestreId);
        return mestre
          ? [
              {
                localId: alocacao.id,
                mestreId: alocacao.mestreId,
                mestreKey: normalizeMestreKey(mestre.nome),
                nome: mestre.nome,
                inicio: alocacao.inicio,
                tempoPlanejado: alocacao.tempoPlanejado,
              },
            ]
          : [];
      },
    );
    const prior = previousById.get(obra.id);
    return prior && sameMasters(prior.mestresPlanejados, mestresPlanejados)
      ? prior
      : { ...obra, mestresPlanejados };
  });
  lastHydratedObras = hydrated;
  return hydrated;
}

function withResizeDrafts(
  obras: readonly ObraCronograma[],
  drafts: Map<
    string,
    Pick<
      ObraCronograma["mestresPlanejados"][number],
      "inicio" | "tempoPlanejado"
    >
  >,
): ObraCronograma[] {
  return obras.map((obra) => {
    let changed = false;
    const mestresPlanejados = obra.mestresPlanejados.map((mestre) => {
      const draft = drafts.get(mestre.localId);
      if (!draft) return mestre;
      if (
        draft.inicio === mestre.inicio &&
        draft.tempoPlanejado === mestre.tempoPlanejado
      ) {
        drafts.delete(mestre.localId);
        return mestre;
      }
      changed = true;
      return { ...mestre, ...draft };
    });
    return changed ? { ...obra, mestresPlanejados } : obra;
  });
}

function withOptimisticAlocacao(
  obras: readonly ObraCronograma[],
  alocacao: AlocacaoFirestore,
  mestre: MestreFirestore,
): ObraCronograma[] {
  const targetId = alocacao.obraId ?? `contrato:${alocacao.contratoId}`;
  return obras.map((obra) => {
    if (
      obra.id !== targetId ||
      obra.mestresPlanejados.some((item) => item.localId === alocacao.id)
    )
      return obra;
    return {
      ...obra,
      mestresPlanejados: [
        ...obra.mestresPlanejados,
        {
          localId: alocacao.id,
          mestreId: alocacao.mestreId,
          mestreKey: normalizeMestreKey(mestre.nome),
          nome: mestre.nome,
          inicio: alocacao.inicio,
          tempoPlanejado: alocacao.tempoPlanejado,
        },
      ],
    };
  });
}

export default function CronogramaObrasPage() {
  countCronogramaRender("CronogramaObrasPage");
  const { authorized: canSyncMonday } = useAdm2Authorization();
  const { currentUser, authorizationLoading, authorizationProfile } = useAuth();
  const [view, setView] = useState<"obras" | "mestres">("obras");
  const [sectionViews, setSectionViews] = useState<WorkSectionViews>(
    DEFAULT_WORK_SECTION_VIEWS,
  );
  const [sectionViewsOpen, setSectionViewsOpen] = useState(false);
  const sectionViewsRef = useRef<HTMLDivElement>(null);
  const [sectionViewsUid, setSectionViewsUid] = useState<string | null>(null);
  const [sectionTransitionLabel, setSectionTransitionLabel] = useState<string | null>(null);
  const [textSectionsExpanded, setTextSectionsExpanded] = useState({
    notStarted: true,
    finished: true,
  });
  const [zoom, setZoomState] = useState<ZoomCronograma>("week");
  const [viewTransition, setViewTransition] =
    useState<CronogramaViewTransition>(null);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [display, setDisplay] = useState<CalendarDisplayOptions>(
    DEFAULT_CALENDAR_DISPLAY,
  );
  const [centerRequest, setCenterRequest] = useState(1);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [obras, setObras] = useState<ObraCronograma[]>([]);
  const [contratos, setContratos] = useState<ContratoCronograma[]>([]);
  const [contractDetails, setContractDetails] =
    useState<ContratoCronograma | null>(null);
  const confirmedObras = useRef<ObraCronograma[]>([]);
  const contratosRef = useRef<ContratoCronograma[]>([]);
  const mondayObrasParents = useRef(new Map<string, ContratoCronograma>());
  // Kept only until the Firestore projection confirms the status returned by Monday.
  const pendingMondayStatuses = useRef(new Map<string, string>());
  const mestresRef = useRef<MestreFirestore[]>([]);
  const alocacoesRef = useRef<AlocacaoFirestore[]>([]);
  const resizeDrafts = useRef(
    new Map<string, { inicio: string; tempoPlanejado: number }>(),
  );
  const viewTransitionRef = useRef<CronogramaViewTransition>(null);
  const transitionAppliedRef = useRef(false);
  const scheduleContentRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeState, setRealtimeState] = useState<
    "connecting" | "live" | "offline" | "error"
  >("connecting");
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [mestres, setMestres] = useState<MestreFirestore[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mastersPanelId, setMastersPanelId] = useState<string | null>(null);
  const [masterPanel, setMasterPanel] = useState<{
    obraId: string;
    key: string;
  } | null>(null);
  const [draggingMaster, setDraggingMaster] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<MondaySyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [authorizingMonday, setAuthorizingMonday] = useState(false);
  const [provisioningMode, setProvisioningMode] = useState<
    | "AUDIT"
    | "ENSURE_CANARY"
    | "CLEANUP_CANARY_DUPLICATES"
    | "RECREATE_CANARY"
    | null
  >(null);
  const [provisionResult, setProvisionResult] = useState<
    AuditResult | EnsureResult | CleanupResult | RecreateResult | null
  >(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [addingMaster, setMasterDialog] = useState(false);
  const [newMasterName, setNewMasterName] = useState("");
  const [newMasterError, setNewMasterError] = useState<string | null>(null);
  const [savingMaster, setSavingMaster] = useState(false);
  useEffect(() => {
    if (!currentUser?.uid || typeof window === "undefined") {
      setSectionViewsUid(null);
      setSectionViews(DEFAULT_WORK_SECTION_VIEWS);
      return;
    }
    setSectionViews(loadWorkSectionViews(currentUser.uid, window.localStorage));
    setSectionViewsUid(currentUser.uid);
  }, [currentUser?.uid]);
  useEffect(() => {
    if (
      !currentUser?.uid ||
      sectionViewsUid !== currentUser.uid ||
      typeof window === "undefined"
    )
      return;
    persistWorkSectionViews(currentUser.uid, sectionViews, window.localStorage);
  }, [currentUser?.uid, sectionViews, sectionViewsUid]);
  useEffect(() => {
    if (!sectionViewsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!sectionViewsRef.current?.contains(event.target as Node))
        setSectionViewsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSectionViewsOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [sectionViewsOpen]);
  useEffect(() => {
    let alive = true;
    let receivedInitialSnapshot = false;
    const refreshObras = () => {
      confirmedObras.current = hydrateFirestoreAlocacoes(
        contratosRef.current,
        mestresRef.current,
        alocacoesRef.current,
      );
      setObras(withResizeDrafts(confirmedObras.current, resizeDrafts.current));
    };
    const unsubscribeObras = source.subscribe(
      (changes) => {
        if (!alive) return;
        const diagnostics = changes.flatMap((change) => change.diagnostics);
        const guarded = changes.map((change) => {
          if (!change.contrato) return change;
          let contrato = change.contrato;
          pendingMondayStatuses.current.forEach((status, mondaySubitemId) => {
            const projected = contrato.obras.find(
              (obra) => obra.mondaySubitemId === mondaySubitemId,
            );
            if (!projected) return;
            if (projected.status === status)
              pendingMondayStatuses.current.delete(mondaySubitemId);
            else
              contrato = {
                ...contrato,
                obras: updateObraStatusByMondaySubitemId(
                  contrato.obras,
                  mondaySubitemId,
                  status,
                ),
              };
          });
          return { ...change, contrato };
        });
        mondayObrasParents.current = applyMondayObrasChanges(
          mondayObrasParents.current,
          guarded,
        );
        const nextContracts = [...mondayObrasParents.current.values()].sort(
          (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
        );
        contratosRef.current = nextContracts;
        setContratos(nextContracts);
        refreshObras();
        setError(diagnostics.join(" ") || null);
        if (!receivedInitialSnapshot) {
          receivedInitialSnapshot = true;
          setLoading(false);
        }
        setRealtimeState(navigator.onLine ? "live" : "offline");
      },
      (cause) => {
        if (!alive) return;
        console.error("CronoObra realtime listener unavailable.", cause);
        setRealtimeState("error");
        if (!receivedInitialSnapshot) setLoading(false);
      },
    );
    const unsubscribeAlocacoes = alocacoesSource.subscribeAlocacoes(
      (alocacoes) => {
        if (!alive) return;
        alocacoesRef.current = alocacoes;
        refreshObras();
      },
      (cause) => {
        if (alive)
          setWriteError(
            `Falha ao acompanhar alocações no Firestore: ${cause.message}`,
          );
      },
    );
    void mestresSource
      .carregar()
      .then((catalogo) => {
        if (!alive) return;
        mestresRef.current = catalogo.mestres;
        setMestres(catalogo.mestres);
        setPersistedMestreColors(catalogo.mestres);
        refreshObras();
      })
      .catch((cause: unknown) => {
        if (alive)
          setError(
            `Falha ao ler mestres homologados: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
      });
    const offline = () => setRealtimeState("offline");
    const online = () =>
      setRealtimeState(receivedInitialSnapshot ? "live" : "connecting");
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      alive = false;
      unsubscribeObras();
      unsubscribeAlocacoes();
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);
  const contractMap = useMemo(
    () => new Map(contratos.map((contrato) => [contrato.id, contrato])),
    [contratos],
  );
  const masters = useMemo(
    () =>
      allMasters(
        obras,
        mestres.map((mestre) => mestre.nome),
      ),
    [obras, mestres],
  );
  const filtered = useMemo(() => filterObras(obras, filters), [obras, filters]);
  // The administrative index must not hide a contract merely because it has no
  // valid period yet (the synthetic "Analisar Contrato" row is still useful).
  const obrasDasSecoes = useMemo(
    () =>
      filters.search ||
      filters.status ||
      filters.empresa ||
      filters.mestre ||
      filters.period !== "year"
        ? filtered
        : obras,
    [filtered, filters, obras],
  );
  const obrasPorSituacao = useMemo(
    () => measureCronogramaCompute("separarObrasPorSituacao", () => separarObrasPorSituacao(obrasDasSecoes)),
    [obrasDasSecoes],
  );
  const contratosPorSituacao = useMemo(
    () => ({
      iniciada: new Set(
        obrasPorSituacao.iniciada.map((obra) => obra.contratoId),
      ).size,
      "nao-iniciada": new Set(
        obrasPorSituacao["nao-iniciada"].map((obra) => obra.contratoId),
      ).size,
      finalizada: new Set(
        obrasPorSituacao.finalizada.map((obra) => obra.contratoId),
      ).size,
    }),
    [obrasPorSituacao],
  );
  const statusDesconhecidos = useMemo(
    () => [
      ...new Set(
        obrasDasSecoes
          .filter(
            (obra) =>
              obra.targetType === "obra" && !statusLoteConhecido(obra.status),
          )
          .map((obra) => obra.status),
      ),
    ],
    [obrasDasSecoes],
  );
  const workloads = useMemo(() => measureCronogramaCompute("buildWorkloads", () => buildWorkloads(filtered)), [filtered]);
  const indicators = useMemo(() => calculateIndicators(filtered), [filtered]);
  const timelineYears = useRef<number[]>([]);
  const years = useMemo(() => {
    const next = measureCronogramaCompute("planningYears", () => planningYears(obras, Number(todayCivil().slice(0, 4))));
    if (
      timelineYears.current.length === next.length &&
      timelineYears.current.every((year, index) => year === next[index])
    )
      return timelineYears.current;
    timelineYears.current = next;
    return next;
  }, [obras]);
  const selected =
    obras.find((obra) => obra.id === (mastersPanelId ?? selectedId)) ?? null;

  const isViewTransitioning = viewTransition !== null;
  useEffect(() => {
    if (transitionAppliedRef.current) markCronogramaPerf("reactCommit");
  }, [view, sectionViews, zoom]);
  const runViewTransition = (
    kind: Exclude<CronogramaViewTransition, null>,
    from: CronogramaPerfMode,
    apply: () => void,
  ) => {
    if (viewTransitionRef.current) return;
    beginCronogramaPerf(from, kind);
    viewTransitionRef.current = kind;
    setViewTransition(kind);
    markCronogramaPerf("overlayRequested");
    requestAnimationFrame(() => {
      markCronogramaPerf("overlayFrame1");
      requestAnimationFrame(() => {
        markCronogramaPerf("overlayFrame2");
        transitionAppliedRef.current = true;
        apply();
        markCronogramaPerf("stateApplied");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            markCronogramaPerf("nextPaint");
            collectCronogramaDom(scheduleContentRef.current);
            viewTransitionRef.current = null;
            transitionAppliedRef.current = false;
            setSectionTransitionLabel(null);
            setViewTransition(null);
            finishCronogramaPerf();
          });
        });
      });
    });
  };
  const changeZoom = (next: ZoomCronograma) => {
    if (next === zoom) return;
    runViewTransition(next === "day" ? "dias" : "semanas", zoom === "day" ? "dias" : "semanas", () => {
      setZoomState(next);
      setCenterRequest((request) => request + 1);
    });
  };
  const changeView = (next: "obras" | "mestres") => {
    if (next === view) return;
    runViewTransition(next, view, () => setView(next));
  };
  const changeSectionView = (
    section: keyof WorkSectionViews,
    next: WorkSectionViews[keyof WorkSectionViews],
  ) => {
    if (isViewTransitioning || next === sectionViews[section]) return;
    const labels = {
      started: "Obra iniciada",
      notStarted: "Obra não iniciada",
      finished: "Obra finalizada",
    } as const;
    const from = sectionViews[section] === "contracts" ? "contratos" : "lista";
    const to = next === "contracts" ? "contratos" : "lista";
    setSectionTransitionLabel(`Atualizando ${labels[section]}…`);
    runViewTransition(to, from, () =>
      setSectionViews((current) => ({ ...current, [section]: next })),
    );
  };
  const goToday = () => {
    setFilters((current) =>
      current.period === "year" ? current : { ...current, period: "year" },
    );
    setCenterRequest((request) => request + 1);
  };
  const mestreIdFor = (nome: string) =>
    mestres.find((mestre) => mestre.nome === nome)?.id;
  const criadorAtual = () => {
    if (authorizationLoading)
      throw new Error(
        "A identidade do funcionário autenticado ainda está sendo verificada.",
      );
    if (
      !currentUser ||
      !authorizationProfile?.exists ||
      authorizationProfile.id !== currentUser.uid
    )
      throw new Error(
        "Não foi possível identificar um funcionário válido para registrar a autoria da alocação.",
      );
    return authorizationProfile.id;
  };
  const persistObra = async (next: ObraCronograma) => {
    const current = obras.find((obra) => obra.id === next.id);
    if (!current || !next.contratoId) return;
    setWriteError(null);
    try {
      const existing = new Map(
        current.mestresPlanejados.map((item) => [item.localId, item]),
      );
      const nextIds = new Set(
        next.mestresPlanejados.map((item) => item.localId),
      );
      await Promise.all(
        [...existing.keys()]
          .filter((id) => !nextIds.has(id))
          .map((id) => alocacoesSource.deleteAlocacao(id)),
      );
      for (const item of next.mestresPlanejados) {
        const previous = existing.get(item.localId);
        const mestreId = item.mestreId ?? mestreIdFor(item.nome);
        if (!mestreId)
          throw new Error(`Mestre inválido: ${item.nome || "não informado"}.`);
        if (!previous) {
          await alocacoesSource.createAlocacao({
            ...(next.targetType === "obra" ? { obraId: next.id } : {}),
            contratoId: next.contratoId,
            mestreId,
            inicio: item.inicio,
            tempoPlanejado: item.tempoPlanejado,
            criadoPorFuncionarioId: criadorAtual(),
          });
          continue;
        }
        const patch: {
          mestreId?: string;
          inicio?: string;
          tempoPlanejado?: number;
        } = {};
        if (mestreId !== previous.mestreId) patch.mestreId = mestreId;
        if (item.inicio !== previous.inicio) patch.inicio = item.inicio;
        if (item.tempoPlanejado !== previous.tempoPlanejado)
          patch.tempoPlanejado = item.tempoPlanejado;
        if (Object.keys(patch).length)
          await alocacoesSource.updateAlocacao(previous.localId, patch);
      }
    } catch (cause) {
      setWriteError(
        `A alteração não foi salva: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  };
  const save = (next: ObraCronograma) => {
    void persistObra(next);
  };
  const dropMaster = (obra: ObraCronograma, mestre: string, target: string) => {
    if (zoom !== "year") {
      const interval = getDirectMasterDropInterval({
        obra,
        targetDate: target as CivilDate,
        hoje: todayCivil(),
      });
      const mestreRegistro = mestres.find((item) => item.nome === mestre);
      if (!obra.allocationAllowed) {
        setWriteError(
          "Este contrato não possui raw.inicio válido para criar uma alocação temporal.",
        );
        setDraggingMaster(null);
        return;
      }
      if (!interval || !mestreRegistro || !obra.contratoId) {
        setWriteError(
          "Não foi possível determinar o mestre, contrato ou período da alocação.",
        );
        setDraggingMaster(null);
        return;
      }
      try {
        const reference = alocacoesSource.createAlocacaoReference();
        const optimistic: AlocacaoFirestore = {
          id: reference.id,
          ...(obra.targetType === "obra" ? { obraId: obra.id } : {}),
          contratoId: obra.contratoId,
          mestreId: mestreRegistro.id,
          inicio: interval.inicio,
          tempoPlanejado: interval.tempoPlanejado,
          criadoPorFuncionarioId: criadorAtual(),
        };
        confirmedObras.current = withOptimisticAlocacao(
          confirmedObras.current,
          optimistic,
          mestreRegistro,
        );
        lastHydratedObras = confirmedObras.current;
        setObras(
          withResizeDrafts(confirmedObras.current, resizeDrafts.current),
        );
        setDraggingMaster(null);
        void alocacoesSource
          .createAlocacao(optimistic, reference)
          .catch((cause: unknown) => {
            confirmedObras.current = confirmedObras.current.map((item) =>
              item.mestresPlanejados.some(
                (master) => master.localId === optimistic.id,
              )
                ? {
                    ...item,
                    mestresPlanejados: item.mestresPlanejados.filter(
                      (master) => master.localId !== optimistic.id,
                    ),
                  }
                : item,
            );
            lastHydratedObras = confirmedObras.current;
            setObras(
              withResizeDrafts(confirmedObras.current, resizeDrafts.current),
            );
            setWriteError(
              `A alocação não foi salva: ${cause instanceof Error ? cause.message : String(cause)}`,
            );
          });
        return;
      } catch (cause) {
        setWriteError(cause instanceof Error ? cause.message : String(cause));
        setDraggingMaster(null);
        return;
      }
    }
    if (zoom === "year") return;
    const interval = getDirectMasterDropInterval({
      obra,
      targetDate: target as CivilDate,
      hoje: todayCivil(),
    });
    if (!obra.allocationAllowed) {
      setWriteError(
        "Este contrato não possui raw.inicio válido para criar uma alocação temporal.",
      );
    } else if (interval) {
      const mestreId = mestreIdFor(mestre);
      if (!mestreId || !obra.contratoId)
        setWriteError(
          "Não foi possível determinar o mestre ou contrato da alocação.",
        );
      else {
        try {
          void alocacoesSource
            .createAlocacao({
              ...(obra.targetType === "obra" ? { obraId: obra.id } : {}),
              contratoId: obra.contratoId,
              mestreId,
              inicio: interval.inicio,
              tempoPlanejado: interval.tempoPlanejado,
              criadoPorFuncionarioId: criadorAtual(),
            })
            .catch((cause: unknown) =>
              setWriteError(
                `A alocação não foi salva: ${cause instanceof Error ? cause.message : String(cause)}`,
              ),
            );
        } catch (cause) {
          setWriteError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    }
    setDraggingMaster(null);
  };
  const resizeMasterPreview = (next: {
    localId: string;
    inicio: string;
    tempoPlanejado: number;
  }) => {
    resizeDrafts.current.set(next.localId, {
      inicio: next.inicio,
      tempoPlanejado: next.tempoPlanejado,
    });
    setObras(withResizeDrafts(confirmedObras.current, resizeDrafts.current));
  };
  const cancelResizeMaster = (id: string) => {
    resizeDrafts.current.delete(id);
    setObras(withResizeDrafts(confirmedObras.current, resizeDrafts.current));
  };
  const resizeMaster = (
    obraId: string,
    next: { localId: string; inicio: string; tempoPlanejado: number },
  ) => {
    {
      const confirmed = confirmedObras.current
        .find((obra) => obra.id === obraId)
        ?.mestresPlanejados.find((item) => item.localId === next.localId);
      if (!confirmed) return;
      const patch: { inicio?: string; tempoPlanejado?: number } = {};
      if (next.inicio !== confirmed.inicio) patch.inicio = next.inicio;
      if (next.tempoPlanejado !== confirmed.tempoPlanejado)
        patch.tempoPlanejado = next.tempoPlanejado;
      if (!Object.keys(patch).length) {
        cancelResizeMaster(next.localId);
        return;
      }
      setWriteError(null);
      void alocacoesSource
        .updateAlocacao(next.localId, patch)
        .catch((cause: unknown) => {
          cancelResizeMaster(next.localId);
          setWriteError(
            `O redimensionamento não foi salvo: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
        });
      return;
    }
    const previous = confirmedObras.current
      .find((obra) => obra.id === obraId)
      ?.mestresPlanejados.find((item) => item.localId === next.localId);
    if (!previous) return;
    const patch: { inicio?: string; tempoPlanejado?: number } = {};
    if (next.inicio !== previous.inicio) patch.inicio = next.inicio;
    if (next.tempoPlanejado !== previous.tempoPlanejado)
      patch.tempoPlanejado = next.tempoPlanejado;
    if (!Object.keys(patch).length) return cancelResizeMaster(next.localId);
    void alocacoesSource
      .updateAlocacao(next.localId, patch)
      .then(() => resizeDrafts.current.delete(next.localId))
      .catch((cause: unknown) => {
        cancelResizeMaster(next.localId);
        setWriteError(
          `O redimensionamento não foi salvo: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      });
  };
  const createMaster = async () => {
    setNewMasterError(null);
    const cor = nextMestreColor(mestres.map((mestre) => mestre.cor.background));
    try {
      setSavingMaster(true);
      const created = await mestresSource.criar(newMasterName, cor, mestres);
      setMestres((current) =>
        [...current, created].sort((a, b) =>
          a.nome.localeCompare(b.nome, "pt-BR"),
        ),
      );
      setPersistedMestreColors([...mestres, created]);
      setMasterDialog(false);
      setNewMasterName("");
    } catch (cause) {
      setNewMasterError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar o mestre.",
      );
    } finally {
      setSavingMaster(false);
    }
  };
  const runSync = async (mode: "dry-run" | "apply") => {
    try {
      setSyncing(true);
      setSyncError(null);
      setSyncResult(await synchronizeMonday(mode));
    } catch (cause) {
      setSyncError(
        cause instanceof Error ? cause.message : "Falha na sincronização.",
      );
    } finally {
      setSyncing(false);
    }
  };
  const authorizeMonday = async () => {
    if (authorizingMonday) return;
    setAuthorizingMonday(true);
    try {
      await startMondayOAuth({ currentUser });
    } catch (cause) {
      setWriteError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível iniciar a autorização do Monday.",
      );
      setAuthorizingMonday(false);
    }
  };
  const runWebhookProvision = async (
    mode:
      | "AUDIT"
      | "ENSURE_CANARY"
      | "CLEANUP_CANARY_DUPLICATES"
      | "RECREATE_CANARY",
  ) => {
    if (provisioningMode) return;
    if (
      mode === "ENSURE_CANARY" &&
      !window.confirm(
        "Criar/garantir webhook canário change_subitem_column_value?",
      )
    )
      return;
    if (
      mode === "CLEANUP_CANARY_DUPLICATES" &&
      !window.confirm(
        "Remover subscriptions canário duplicadas e preservar somente uma?",
      )
    )
      return;
    if (
      mode === "RECREATE_CANARY" &&
      !window.confirm(
        "Excluir o webhook canário atual e criar uma nova subscription?",
      )
    )
      return;
    setProvisioningMode(mode);
    setProvisionError(null);
    setProvisionResult(null);
    try {
      setProvisionResult(await provisionMondayWebhook(mode, { currentUser }));
    } catch (cause) {
      setProvisionError(
        cause instanceof MondayWebhookProvisionError
          ? cause.message
          : "Não foi possível consultar/criar o webhook.",
      );
    } finally {
      setProvisioningMode(null);
    }
  };
  const applyConfirmedMondayStatus = (
    mondaySubitemId: string,
    status: { label: string },
  ) => {
    // The same state feeds filters and separarObrasPorSituacao; no DOM regrouping is needed.
    confirmedObras.current = updateObraStatusByMondaySubitemId(
      confirmedObras.current,
      mondaySubitemId,
      status.label,
    );
    pendingMondayStatuses.current.set(mondaySubitemId, status.label);
    lastHydratedObras = confirmedObras.current;
    setObras(withResizeDrafts(confirmedObras.current, resizeDrafts.current));
    const nextContratos = contratosRef.current.map((contrato) => ({
      ...contrato,
      obras: updateObraStatusByMondaySubitemId(
        contrato.obras,
        mondaySubitemId,
        status.label,
      ),
    }));
    contratosRef.current = nextContratos;
    mondayObrasParents.current = new Map(
      nextContratos.map((contrato) => [contrato.id, contrato]),
    );
    setContratos(nextContratos);
  };

  if (loading)
    return (
      <main className="co-page">
        <p className="co-empty">Carregando contratos e LOTEs homologados…</p>
      </main>
    );
  if (error)
    return (
      <main className="co-page">
        <p className="co-empty" role="alert">
          {error}
        </p>
      </main>
    );

  const realtimeLabel =
    realtimeState === "connecting"
      ? "Conectando…"
      : realtimeState === "live"
        ? "Ao vivo"
        : realtimeState === "offline"
          ? "Offline"
          : "Atualização indisponível";

  return (
    <main className={`co-page co-zoom--${zoom}`}>
      <header className="co-page-header">
      <div className="co-work-view-control co-controls" aria-label="Controles de visualização">
          <div className="co-section-views" ref={sectionViewsRef}>
            <button
              type="button"
              className={`co-section-views-trigger ${sectionViewsOpen ? "is-active" : ""}`}
              aria-expanded={sectionViewsOpen}
              aria-haspopup="dialog"
              onClick={() => setSectionViewsOpen((open) => !open)}
            >
              <ViewListRounded fontSize="small" />
              Visualização
            </button>
            {sectionViewsOpen && (
              <div className="co-section-views-popover" role="dialog" aria-label="Visualização das tabelas">
                <strong>Visualização das tabelas</strong>
                {([
                  ["started", "Obra iniciada"],
                  ["notStarted", "Obra não iniciada"],
                  ["finished", "Obra finalizada"],
                ] as const).map(([section, label]) => (
                  <div className="co-section-views-row" key={section}>
                    <span>{label}</span>
                    <div className="co-view-switch" aria-label={`Visualização: ${label}`}>
                      <button
                        type="button"
                        aria-pressed={sectionViews[section] === "contracts"}
                        className={sectionViews[section] === "contracts" ? "is-active" : ""}
                        disabled={isViewTransitioning}
                        onClick={() => changeSectionView(section, "contracts")}
                      >
                        Contratos
                      </button>
                      <button
                        type="button"
                        aria-pressed={sectionViews[section] === "flat"}
                        className={sectionViews[section] === "flat" ? "is-active" : ""}
                        disabled={isViewTransitioning}
                        onClick={() => changeSectionView(section, "flat")}
                      >
                        Lista corrida
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="co-view-switch co-header-segmented-control" aria-label="Domínio do cronograma">
            <button type="button" disabled={isViewTransitioning} className={`co-header-segmented-option ${view === "obras" ? "is-active" : ""}`} onClick={() => changeView("obras")}>Obras</button>
            <button type="button" disabled={isViewTransitioning} className={`co-header-segmented-option ${view === "mestres" ? "is-active" : ""}`} onClick={() => changeView("mestres")}>Mestres</button>
          </div>
          <div className="co-view-switch co-zoom-switch co-header-segmented-control" aria-label="Escala do cronograma">
            {([ ["day", "Dias"], ["week", "Semanas"] ] as const).map(([value, label]) => (
              <button type="button" key={value} disabled={isViewTransitioning} className={`co-header-segmented-option ${zoom === value ? "is-active" : ""}`} onClick={() => changeZoom(value)}>{label}</button>
            ))}
          </div>
      </div>
        <div className="co-title">
          <span className="co-title-icon">
            <EngineeringRounded />
          </span>
          <div>
            <div className="co-title-line">
              <h1>Cronograma de Obras</h1>
              <span className="co-prototype">V-1.665 · MK6A</span>
              <span
                className={`co-realtime co-realtime--${realtimeState}`}
                role="status"
              >
                <i />
                {realtimeLabel}
              </span>
            </div>
            <p>Planejamento e alocação de Mestres de Obras</p>
          </div>
        </div>
      </header>
      {/* operational controls are part of the indicators bar below */}
      {false && (provisionResult || provisionError) && (
        <div
          className="co-master-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Provisionamento de webhooks Monday"
        >
          <section>
            <h2>
              {provisionError ? "Falha no provisionamento" : "Webhooks Monday"}
            </h2>
            {provisionError ? (
              <p role="alert">{provisionError}</p>
            ) : (
              provisionResult && (
                <>
                  {"webhooks" in provisionResult && (
                    <>
                      <p>
                        Webhooks encontrados: {provisionResult.webhooks.length}
                      </p>
                      <ul>
                        {provisionResult.webhooks.map((webhook) => (
                          <li
                            key={
                              webhook.id ??
                              `${webhook.event}-${webhook.boardId}`
                            }
                          >
                            {webhook.event} — {webhook.boardId}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {"message" in provisionResult && <p>{provisionResult.message}</p>}
                </>
              )
            )}
            <button type="button" onClick={() => { setProvisionResult(null); setProvisionError(null); }}>
              Fechar
            </button>
          </section>
        </div>
      )}
      {false && filtersOpen && (
        <aside className="co-filters-panel">
          <FiltersBar
            filters={filters}
            statuses={[...new Set(obras.map((obra) => obra.status))]}
            companies={[...new Set(obras.map((obra) => obra.empresa))]}
            masters={masters}
            onChange={setFilters}
            onToday={goToday}
          />
        </aside>
      )}
      <section className="co-indicators-bar">
        <div className="co-indicators-group">
          <div>
            <span>Em andamento</span>
            <strong>{indicators.running}</strong>
          </div>
          <div>
            <span>Aguardando recurso</span>
            <strong>{indicators.waiting}</strong>
          </div>
          <div>
            <span>Mestres alocados</span>
            <strong>{indicators.allocated}</strong>
          </div>
          <div>
            <span>Obras sem mestre planejado</span>
            <strong>{indicators.unassigned}</strong>
          </div>
          <div className={indicators.conflicts ? "has-alert" : ""}>
            <span>Conflitos de alocação</span>
            <strong>{indicators.conflicts}</strong>
          </div>
        </div>
        <div className="co-operational-controls">
          {canSyncMonday && (
            <div className="co-dev-menu">
              <button
                className="co-button co-button--secondary"
                type="button"
                aria-expanded={devOpen}
                aria-haspopup="menu"
                onClick={() => setDevOpen((open) => !open)}
              >
                DEV
              </button>
              {devOpen && (
                <div className="co-dev-popover" role="menu">
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => {
                      setDevOpen(false);
                      void runSync("dry-run");
                    }}
                  >
                    {syncing ? "Consultando Monday…" : "Sincronizar Monday"}
                  </button>
                  <button
                    type="button"
                    disabled={authorizingMonday}
                    onClick={() => {
                      setDevOpen(false);
                      void authorizeMonday();
                    }}
                  >
                    {authorizingMonday
                      ? "Preparando autorização…"
                      : "Autorizar Monday"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(provisioningMode)}
                    onClick={() => {
                      setDevOpen(false);
                      void runWebhookProvision("AUDIT");
                    }}
                  >
                    {provisioningMode === "AUDIT"
                      ? "Auditando…"
                      : "Auditar webhooks"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(provisioningMode)}
                    onClick={() => {
                      setDevOpen(false);
                      void runWebhookProvision("ENSURE_CANARY");
                    }}
                  >
                    {provisioningMode === "ENSURE_CANARY"
                      ? "Criando webhook…"
                      : "Criar webhook canário"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(provisioningMode)}
                    onClick={() => {
                      setDevOpen(false);
                      void runWebhookProvision("CLEANUP_CANARY_DUPLICATES");
                    }}
                  >
                    {provisioningMode === "CLEANUP_CANARY_DUPLICATES"
                      ? "Limpando webhooks…"
                      : "Limpar webhooks duplicados"}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(provisioningMode)}
                    onClick={() => {
                      setDevOpen(false);
                      void runWebhookProvision("RECREATE_CANARY");
                    }}
                  >
                    {provisioningMode === "RECREATE_CANARY"
                      ? "Recriando webhook…"
                      : "Recriar webhook canário"}
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            className={`co-button co-button--secondary co-filter-toggle ${filtersOpen ? "is-active" : ""}`}
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <FilterListRounded fontSize="small" />
            Filtros
          </button>
          <CalendarToggles options={display} onChange={setDisplay} />
        </div>
      </section>
      {(provisionResult || provisionError) && (
        <div
          className="co-master-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Provisionamento de webhooks Monday"
        >
          <section>
            <h2>
              {provisionError ? "Falha no provisionamento" : "Webhooks Monday"}
            </h2>
            {provisionError ? (
              <p role="alert">{provisionError}</p>
            ) : (
              provisionResult && (
                <>
                  {"webhooks" in provisionResult && (
                    <>
                      <p>
                        Webhooks encontrados: {provisionResult.webhooks.length}
                      </p>
                      <ul>
                        {provisionResult.webhooks.map((webhook) => (
                          <li
                            key={
                              webhook.id ??
                              `${webhook.event}-${webhook.boardId}`
                            }
                          >
                            ID {webhook.id ?? "—"} · {webhook.event ?? "—"} ·
                            board {webhook.boardId ?? "—"}
                            {webhook.config.url
                              ? ` · ${webhook.config.url}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {"result" in provisionResult && (
                    <p>
                      Resultado: {provisionResult.result}
                      {"webhookId" in provisionResult &&
                      provisionResult.webhookId
                        ? ` · webhook ID ${provisionResult.webhookId}`
                        : ""}
                      {"keptWebhookId" in provisionResult &&
                      provisionResult.keptWebhookId
                        ? ` · preservado ${provisionResult.keptWebhookId}`
                        : ""}
                      {"deletedWebhookIds" in provisionResult &&
                      provisionResult.deletedWebhookIds?.length
                        ? ` · removidos ${provisionResult.deletedWebhookIds.join(", ")}`
                        : ""}
                      {"remainingCount" in provisionResult
                        ? ` · restantes ${provisionResult.remainingCount}`
                        : ""}
                    </p>
                  )}
                </>
              )
            )}
            <div>
              <button
                type="button"
                onClick={() => {
                  setProvisionResult(null);
                  setProvisionError(null);
                }}
              >
                Fechar
              </button>
            </div>
          </section>
        </div>
      )}
      {(syncResult || syncError) && (
        <div
          className="co-master-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Sincronização Monday"
        >
          <section>
            <h2>
              {syncError
                ? "Falha na sincronização"
                : syncResult?.mode === "apply"
                  ? "Sincronização concluída"
                  : "Sincronização Monday"}
            </h2>
            {syncError ? (
              <p role="alert">{syncError}</p>
            ) : (
              syncResult && (
                <>
                  <p>
                    Itens: {syncResult.itemsMonday} · Novos contratos:{" "}
                    {syncResult.itemsCriar} · Alterados:{" "}
                    {syncResult.itemsAtualizar} · Sem alteração:{" "}
                    {syncResult.itemsSemAlteracao}
                  </p>
                  <p>
                    Novos lotes: {syncResult.subitemsAdicionar} · Lotes
                    alterados: {syncResult.subitemsAtualizar} · Ausentes no
                    Monday: {syncResult.subitemsAusentesMonday} · Obras a
                    finalizar: {syncResult.obrasFinalizar}
                  </p>
                  <details>
                    <summary>
                      Ver detalhes ({syncResult.details.length})
                    </summary>
                    {syncResult.details.map((detail) => (
                      <p key={detail.itemId}>
                        <strong>{detail.nome ?? detail.itemId}</strong>:{" "}
                        {detail.changes
                          ?.map(
                            (change) =>
                              `${change.type}${change.subitemId ? ` (${change.subitemId})` : ""}`,
                          )
                          .join(", ") || "alteração de item"}
                      </p>
                    ))}
                  </details>
                </>
              )
            )}
            <div>
              <button
                type="button"
                disabled={syncing}
                onClick={() => {
                  setSyncResult(null);
                  setSyncError(null);
                }}
              >
                Cancelar
              </button>
              {syncResult?.mode === "dry-run" && !syncResult.erros.length && (
                <button
                  className="co-button co-button--primary"
                  disabled={syncing}
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Aplicar a sincronização recalculada pelo servidor?",
                      )
                    )
                      void runSync("apply");
                  }}
                >
                  Aplicar sincronização
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {filtersOpen && (
        <aside className="co-filters-panel">
          <FiltersBar
            filters={filters}
            statuses={[...new Set(obras.map((obra) => obra.status))]}
            companies={[...new Set(obras.map((obra) => obra.empresa))]}
            masters={masters}
            onChange={setFilters}
            onToday={goToday}
          />
        </aside>
      )}
      {false && <section className="co-indicators">
        <div>
          <span>Em andamento</span>
          <strong>{indicators.running}</strong>
        </div>
        <div>
          <span>Aguardando recurso</span>
          <strong>{indicators.waiting}</strong>
        </div>
        <div>
          <span>Mestres alocados</span>
          <strong>{indicators.allocated}</strong>
        </div>
        <div>
          <span>Obras sem mestre planejado</span>
          <strong>{indicators.unassigned}</strong>
        </div>
        <div className={indicators.conflicts ? "has-alert" : ""}>
          <span>Conflitos de alocação</span>
          <strong>{indicators.conflicts}</strong>
        </div>
      </section>}
      <div
        className="co-schedule-content"
        aria-busy={isViewTransitioning}
        ref={scheduleContentRef}
      >
      <MasterPalette
        masters={masters}
        draggingMaster={draggingMaster}
        disabled={zoom === "year"}
        onDragStart={setDraggingMaster}
        onDragEnd={() => setDraggingMaster(null)}
        onAdd={() => {
          setNewMasterError(null);
          setMasterDialog(true);
        }}
      />
      {addingMaster && (
        <div
          className="co-master-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Adicionar mestre"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createMaster();
            }}
          >
            <h2>Adicionar mestre</h2>
            <label>
              Nome
              <input
                autoFocus
                value={newMasterName}
                onChange={(event) => setNewMasterName(event.target.value)}
              />
            </label>
            {newMasterError && <p role="alert">{newMasterError}</p>}
            <div>
              <button type="button" onClick={() => setMasterDialog(false)}>
                Cancelar
              </button>
              <button
                className="co-button co-button--primary"
                disabled={savingMaster}
                type="submit"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
      {writeError && (
        <p className="co-empty" role="alert">
          {writeError}
        </p>
      )}
      {view === "obras" ? (
        <div className="co-contract-sections">
          <section>
            <header className="co-section-heading">
              <h2>Obra iniciada ({contratosPorSituacao.iniciada})</h2>
            </header>
          <CronogramaProfiler id="GanttGrid"><GanttGrid
            view="obras"
            viewMode={sectionViews.started}
              zoom={zoom}
              years={years}
              obras={obrasPorSituacao.iniciada}
              contratos={contractMap}
              workloads={workloads}
              selectedId={selectedId}
              draggingMaster={draggingMaster}
              display={display}
              centerRequest={centerRequest}
              focusDate={focusDate}
              onFocusDate={setFocusDate}
              onSelect={(obra) => {
                setMasterPanel(null);
                setMastersPanelId(null);
                setSelectedId(obra.id);
              }}
              onSelectMasters={(obra) => {
                setMasterPanel(null);
                setSelectedId(null);
                setMastersPanelId(obra.id);
              }}
              onSelectMaster={({ obraId, mestreKey }) => {
                setSelectedId(null);
                setMastersPanelId(null);
                setMasterPanel({ obraId, key: mestreKey });
              }}
              onOpenContract={setContractDetails}
              onDropMaster={dropMaster}
              onResizeMasterPreview={resizeMasterPreview}
              onResizeMasterCommit={resizeMaster}
              onResizeMasterCancel={cancelResizeMaster}
            /></CronogramaProfiler>
          </section>
          <section>
          <CronogramaProfiler id="ContractTextTable"><ContractTextTable
            viewMode={sectionViews.notStarted}
            variant="not-started"
              sectionTitle="Obra não iniciada"
              sectionCount={contratosPorSituacao["nao-iniciada"]}
              sectionExpanded={textSectionsExpanded.notStarted}
              onToggleSection={() =>
                setTextSectionsExpanded((current) => ({
                  ...current,
                  notStarted: !current.notStarted,
                }))
              }
              obras={obrasPorSituacao["nao-iniciada"]}
              contratos={contractMap}
              onOpenContract={setContractDetails}
              onSelect={(obra) => {
                setMasterPanel(null);
                setMastersPanelId(null);
                setSelectedId(obra.id);
              }}
              onSelectMasters={(obra) => {
                setMasterPanel(null);
                setSelectedId(null);
                setMastersPanelId(null);
              }}
              onStatusConfirmed={applyConfirmedMondayStatus}
            /></CronogramaProfiler>
          </section>
          <section>
          <CronogramaProfiler id="ContractTextTable"><ContractTextTable
            viewMode={sectionViews.finished}
            sectionTitle="Obra finalizada"
              sectionCount={contratosPorSituacao.finalizada}
              sectionExpanded={textSectionsExpanded.finished}
              onToggleSection={() =>
                setTextSectionsExpanded((current) => ({
                  ...current,
                  finished: !current.finished,
                }))
              }
              obras={obrasPorSituacao.finalizada}
              contratos={contractMap}
              onOpenContract={setContractDetails}
              onSelect={(obra) => {
                setMasterPanel(null);
                setMastersPanelId(null);
                setSelectedId(obra.id);
              }}
              onSelectMasters={(obra) => {
                setMasterPanel(null);
                setSelectedId(null);
                setMastersPanelId(obra.id);
              }}
              onStatusConfirmed={applyConfirmedMondayStatus}
            /></CronogramaProfiler>
          </section>
          {statusDesconhecidos.length > 0 && (
            <p className="co-empty" role="status">
              Status não mapeado, exibido em Obra não iniciada:{" "}
              {statusDesconhecidos.join(", ")}.
            </p>
          )}
        </div>
      ) : (
        <CronogramaProfiler id="GanttGrid"><GanttGrid
          view={view}
          zoom={zoom}
          years={years}
          obras={filtered}
          contratos={contractMap}
          workloads={workloads}
          selectedId={selectedId}
          draggingMaster={draggingMaster}
          display={display}
          centerRequest={centerRequest}
          focusDate={focusDate}
          onFocusDate={setFocusDate}
          onSelect={(obra) => {
            setMasterPanel(null);
            setMastersPanelId(null);
            setSelectedId(obra.id);
          }}
          onSelectMasters={(obra) => {
            setMasterPanel(null);
            setSelectedId(null);
            setMastersPanelId(obra.id);
          }}
          onSelectMaster={({ obraId, mestreKey }) => {
            setSelectedId(null);
            setMastersPanelId(null);
            setMasterPanel({ obraId, key: mestreKey });
          }}
          onOpenContract={setContractDetails}
          onDropMaster={dropMaster}
          onResizeMasterPreview={resizeMasterPreview}
          onResizeMasterCommit={resizeMaster}
          onResizeMasterCancel={cancelResizeMaster}
        /></CronogramaProfiler>
      )}
      {view === "mestres" && <WorkloadPanel workloads={workloads} />}
      {viewTransition && (
        <div
          className="co-view-transition-overlay"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="co-view-transition-content">
            <span className="co-view-transition-spinner" aria-hidden="true" />
            <p>{sectionTransitionLabel ?? VIEW_TRANSITION_MESSAGES[viewTransition]}</p>
          </div>
        </div>
      )}
      </div>
      <ObraDrawer
        obra={selected}
        masters={masters}
        mastersOnly={Boolean(mastersPanelId)}
        onClose={() => {
          setSelectedId(null);
          setMastersPanelId(null);
        }}
        onSave={save}
      />
      <MasterDetailsDrawer
        obra={obras.find((obra) => obra.id === masterPanel?.obraId) ?? null}
        obras={obras}
        masterKey={masterPanel?.key ?? null}
        allKeys={masters.map(normalizeMestreKey)}
        onClose={() => setMasterPanel(null)}
      />
      <ContractDetailsDrawer
        contrato={contractDetails}
        onClose={() => setContractDetails(null)}
      />
    </main>
  );
}
