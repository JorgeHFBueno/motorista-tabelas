import type { ObraStatusFase } from "@/types/obraStatus";

export type DashboardFaseStatus = "pending" | "in-progress" | "completed";

export const formatPtBrDate = (value: unknown) => {
  const cast = value as { toDate?: () => Date; seconds?: number };
  if (typeof cast?.toDate === "function") return cast.toDate().toLocaleDateString("pt-BR");
  if (typeof cast?.seconds === "number") return new Date(cast.seconds * 1000).toLocaleDateString("pt-BR");
  return null;
};

export const deriveFaseProgress = (fase: ObraStatusFase) => {
  const total = fase.itens?.length ?? 0;
  const doneCount = (fase.itens ?? []).filter((item) => item.done).length;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;

  let status: DashboardFaseStatus = "pending";
  if (doneCount === total && total > 0) status = "completed";
  else if (doneCount > 0) status = "in-progress";

  return { total, doneCount, progress, status };
};

export const deriveOverallProgress = (fases: ObraStatusFase[]) => {
  const totals = fases.reduce(
    (acc, fase) => {
      const resumo = deriveFaseProgress(fase);
      acc.totalItens += resumo.total;
      acc.itensConcluidos += resumo.doneCount;
      return acc;
    },
    { totalItens: 0, itensConcluidos: 0 },
  );

  const progress = totals.totalItens ? Math.round((totals.itensConcluidos / totals.totalItens) * 100) : 0;
  const completedStages = fases.filter((fase) => deriveFaseProgress(fase).status === "completed").length;
  const inProgressStages = fases.filter((fase) => deriveFaseProgress(fase).status === "in-progress").length;

  return {
    progress,
    completedStages,
    inProgressStages,
    totalStages: fases.length,
    totalItens: totals.totalItens,
    itensConcluidos: totals.itensConcluidos,
  };
};

export const deriveDashboardStatus = (
  explicitStatus: string | null | undefined,
  progress: number,
  inProgressStages: number,
) => {
  const normalized = explicitStatus?.trim().toLowerCase();

  if (normalized === "concluída" || normalized === "concluida" || progress === 100) {
    return { variant: "ahead" as const, label: "Concluída" };
  }

  if (normalized === "em andamento" || inProgressStages > 0 || progress > 0) {
    return { variant: "on-track" as const, label: "Em andamento" };
  }

  return { variant: "on-track" as const, label: "Não iniciada" };
};

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
  if (progress === 100) return `Todas as ${totalStages} etapas da obra foram concluídas.`;
  if (progress === 0) return "A obra ainda não possui avanços registrados nas etapas.";

  return `${completedStages}/${totalStages} etapas concluídas e ${itensConcluidos}/${totalItens} itens finalizados até agora.`;
};

export const deriveDeliveryLabel = (fases: ObraStatusFase[]) => {
  const latestEndDate = fases
    .map((fase) => {
      const value = fase.fim as { toDate?: () => Date; seconds?: number } | null;
      if (typeof value?.toDate === "function") return value.toDate();
      if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
      return null;
    })
    .filter((date): date is Date => date instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (!latestEndDate) return "Cronograma em atualização";

  return latestEndDate.toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
  });
};