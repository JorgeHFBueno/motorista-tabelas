import { useMemo } from "react";
import { useActiveObraId } from "@/hooks/useActiveObraId";
import {
  deriveDashboardStatus,
  deriveDashboardSummary,
  deriveDeliveryLabel,
  deriveFaseProgress,
  deriveOverallProgress,
  normalizeObraStatusData,
} from "@/lib/obraStatus";

// Progress and team confirmations come from the active contract itself (portal-obras.progresso and .equipe).
export const useClientObraOverview = () => {
  const {
    activeObraId,
    activeObra,
    hasClientObra,
    isResolvingAuth,
    isResolvingUserDoc,
    isResolvingClientObra,
    isReady: isActiveObraReady,
  } = useActiveObraId();

  return useMemo(() => {
    const statusData = normalizeObraStatusData(activeObra?.progresso);
    const fases = statusData?.etapas ?? [];
    const progressData = deriveOverallProgress(statusData);
    const status = deriveDashboardStatus(null, progressData.progress, progressData.inProgressStages);
    const isLoading = isResolvingAuth || isResolvingUserDoc || isResolvingClientObra;

    return {
      activeObraId,
      hasClientObra,
      obra: activeObra,
      statusData,
      fases,
      faseSummaries: fases.map((fase) => ({ fase, ...deriveFaseProgress(fase) })),
      progressData,
      status,
      summary: deriveDashboardSummary(progressData),
      deliveryDateLabel: deriveDeliveryLabel(statusData),
      isLoading,
      error: null as unknown,
      isEmpty: Boolean(activeObraId) && fases.length === 0,
      isEmptyState: isActiveObraReady && !activeObraId,
      isResolvingAuth,
      isResolvingUserDoc,
      isResolvingClientObra,
      isResolvingDashboardData: false,
      isActiveObraReady,
    };
  }, [activeObra, activeObraId, hasClientObra, isActiveObraReady, isResolvingAuth, isResolvingClientObra, isResolvingUserDoc]);
};
