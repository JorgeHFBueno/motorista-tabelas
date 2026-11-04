import type {
  ObraStatusControlMode,
  ObraStatusData,
  ObraStatusEtapa,
  ObraStatusItem,
  ObraStatusProgressLabel,
} from "@/types/obraStatus";

export const clampProgress = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, Math.round(numeric)));
};

export const deriveProgressStatus = (
  progresso: number,
): ObraStatusProgressLabel => {
  if (progresso <= 0) return "pendente";
  if (progresso >= 100) return "completo";
  if (progresso >= 91) return "finalizando";
  return "em_andamento";
};

export const getProgressStatusLabel = (status: ObraStatusProgressLabel) => {
  switch (status) {
    case "completo":
      return "Completo";
    case "finalizando":
      return "Finalizando";
    case "em_andamento":
      return "Em andamento";
    default:
      return "Pendente";
  }
};

export const getProgressStatusBadgeVariant = (
  status: ObraStatusProgressLabel,
) => {
  switch (status) {
    case "completo":
      return "default" as const;
    case "finalizando":
      return "secondary" as const;
    case "em_andamento":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
};

export const getProgressStatusTone = (status: ObraStatusProgressLabel) => {
  switch (status) {
    case "completo":
      return {
        containerClass: "bg-success/10",
        textClass: "text-success",
        indicatorClass: "bg-success",
      };
    case "finalizando":
      return {
        containerClass: "bg-secondary/15",
        textClass: "text-secondary-foreground",
        indicatorClass: "bg-secondary",
      };
    case "em_andamento":
      return {
        containerClass: "bg-progress-fill/10",
        textClass: "text-progress-fill",
        indicatorClass: "bg-progress-fill",
      };
    default:
      return {
        containerClass: "bg-muted",
        textClass: "text-muted-foreground",
        indicatorClass: "bg-muted",
      };
  }
};

const averageProgress = (values: number[]) => {
  if (values.length === 0) return 0;
  return Math.round(
    values.reduce((acc, current) => acc + clampProgress(current), 0) /
      values.length,
  );
};

const getDefaultControlModeForEtapa = ({
  id,
  nome,
}: {
  id?: string | null;
  nome?: string | null;
}): ObraStatusControlMode => {
  const normalizedId = id?.trim().toLowerCase() ?? "";
  const normalizedName = nome?.trim().toLowerCase() ?? "";
  const searchable = `${normalizedId} ${normalizedName}`;

  if (
    searchable.includes("producao") ||
    searchable.includes("produção") ||
    searchable.includes("execucao") ||
    searchable.includes("execução") ||
    searchable.includes("montagem")
  ) {
    return "percentual";
  }

  return "checklist";
};

const normalizeControlMode = (
  rawMode: unknown,
  etapa: { id?: string | null; nome?: string | null },
): ObraStatusControlMode =>
  rawMode === "percentual" || rawMode === "checklist"
    ? rawMode
    : getDefaultControlModeForEtapa(etapa);

const normalizeItem = (
  rawItem: unknown,
  index: number,
  fallbackEtapaId: string,
): ObraStatusItem => {
  const item = (rawItem ?? {}) as Record<string, unknown>;
  const progresso = clampProgress(
    item.progresso ??
      (item.done === true ? 100 : item.done === false ? 0 : undefined),
  );

  return {
    id:
      (typeof item.id === "string" && item.id.trim()) ||
      `${fallbackEtapaId}_item_${index + 1}`,
    nome:
      (typeof item.nome === "string" && item.nome.trim()) ||
      (typeof item.label === "string" && item.label.trim()) ||
      `Item ${index + 1}`,
    ordem:
      typeof item.ordem === "number" && Number.isFinite(item.ordem)
        ? item.ordem
        : index + 1,
    progresso,
    status: deriveProgressStatus(progresso),
  };
};

const normalizeEtapa = (rawEtapa: unknown, index: number): ObraStatusEtapa => {
  const etapa = (rawEtapa ?? {}) as Record<string, unknown>;
  const etapaId =
    (typeof etapa.id === "string" && etapa.id.trim()) || `etapa_${index + 1}`;
  const itens = Array.isArray(etapa.itens)
    ? etapa.itens
        .map((item, itemIndex) => normalizeItem(item, itemIndex, etapaId))
        .sort((a, b) => a.ordem - b.ordem)
    : [];

  const modoControle = normalizeControlMode(etapa.modoControle, {
    id: etapaId,
    nome:
      typeof etapa.nome === "string"
        ? etapa.nome
        : typeof etapa.titulo === "string"
          ? etapa.titulo
          : null,
  });
  const progresso =
    modoControle === "checklist"
      ? averageProgress(itens.map((item) => (item.progresso >= 100 ? 100 : 0)))
      : averageProgress(itens.map((item) => item.progresso));

  return {
    id: etapaId,
    nome:
      (typeof etapa.nome === "string" && etapa.nome.trim()) ||
      (typeof etapa.titulo === "string" && etapa.titulo.trim()) ||
      `Etapa ${index + 1}`,
    ordem:
      typeof etapa.ordem === "number" && Number.isFinite(etapa.ordem)
        ? etapa.ordem
        : index + 1,
    modoControle,
    progresso,
    status: deriveProgressStatus(progresso),
    itens:
      modoControle === "checklist"
        ? itens.map((item) => {
            const progressoItem = item.progresso >= 100 ? 100 : 0;
            return {
              ...item,
              progresso: progressoItem,
              status: deriveProgressStatus(progressoItem),
            };
          })
        : itens,
  };
};

const recomputeObraStatus = (
  rawStatus: Partial<ObraStatusData> | null | undefined,
): ObraStatusData => {
  const etapas = Array.isArray(rawStatus?.etapas)
    ? rawStatus.etapas
        .map((etapa, index) => normalizeEtapa(etapa, index))
        .sort((a, b) => a.ordem - b.ordem)
    : [];

  return {
    etapas,
    progressoGeral: averageProgress(etapas.map((etapa) => etapa.progresso)),
    atualizadoEm: rawStatus?.atualizadoEm,
    atualizadoPor: rawStatus?.atualizadoPor ?? null,
  };
};

export const normalizeObraStatusData = (
  rawStatus: unknown,
): ObraStatusData | null => {
  if (!rawStatus || typeof rawStatus !== "object") return null;
  return recomputeObraStatus(rawStatus as Partial<ObraStatusData>);
};

export const deriveDashboardStatus = (
  explicitStatus: string | null | undefined,
  progress: number,
  inProgressStages: number,
) => {
  const normalized = explicitStatus?.trim().toLowerCase();

  if (normalized === "concluida" || progress === 100) {
    return { variant: "ahead" as const, label: "Completo" };
  }

  if (normalized === "em andamento" || inProgressStages > 0 || progress > 0) {
    return { variant: "on-track" as const, label: "Em andamento" };
  }

  return { variant: "on-track" as const, label: "Pendente" };
};

export const deriveOverallProgress = (statusData: ObraStatusData | null) => {
  const etapas = statusData?.etapas ?? [];
  const totalItens = etapas.reduce(
    (acc, etapa) => acc + (etapa.itens?.length ?? 0),
    0,
  );
  const itensCompletos = etapas.reduce(
    (acc, etapa) =>
      acc + etapa.itens.filter((item) => item.status === "completo").length,
    0,
  );
  const completedStages = etapas.filter((etapa) => etapa.status === "completo").length;
  const inProgressStages = etapas.filter(
    (etapa) => etapa.status === "em_andamento" || etapa.status === "finalizando",
  ).length;

  return {
    progress: statusData?.progressoGeral ?? 0,
    completedStages,
    inProgressStages,
    totalStages: etapas.length,
    totalItens,
    itensConcluidos: itensCompletos,
  };
};

export const deriveFaseProgress = (fase: ObraStatusEtapa) => ({
  total: fase.itens.length,
  doneCount: fase.itens.filter((item) => item.status === "completo").length,
  progress: fase.progresso,
  status:
    fase.status === "completo"
      ? "completed"
      : fase.status === "pendente"
        ? "pending"
        : "in-progress",
});

export const deriveDashboardSummary = ({
  progress,
  completedStages,
  totalStages,
  totalItens,
  itensConcluidos,
}: {
  progress: number;
  completedStages: number;
  totalStages: number;
  totalItens: number;
  itensConcluidos: number;
}) => {
  if (totalStages === 0) return "O cronograma da obra ainda não foi iniciado.";
  if (progress === 100)
    return `Todas as ${totalStages} etapas da obra foram concluídas.`;
  if (progress === 0)
    return "A obra ainda não possui avanços registrados nas etapas.";

  return `${completedStages}/${totalStages} etapas completas e ${itensConcluidos}/${totalItens} itens concluídos até agora.`;
};

export const deriveDeliveryLabel = (statusData: ObraStatusData | null) => {
  if (!statusData || statusData.etapas.length === 0) {
    return "Cronograma em atualização";
  }

  const finalizando = statusData.etapas.filter(
    (etapa) => etapa.status === "finalizando",
  ).length;

  if (statusData.progressoGeral === 100) return "Entrega concluída";
  if (finalizando > 0) return `${finalizando} etapa(s) finalizando`;
  return `${statusData.progressoGeral}% concluído`;
};
