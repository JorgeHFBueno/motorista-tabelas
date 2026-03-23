import { useMemo } from "react";
import { useActiveObraId } from "@/hooks/useActiveObraId";
import { useObra } from "@/hooks/useAppQueries";
import { useObraStatus } from "@/hooks/useObraStatus";
import {
  deriveDashboardStatus,
  deriveDashboardSummary,
  deriveDeliveryLabel,
  deriveFaseProgress,
  deriveOverallProgress,
} from "@/lib/obraStatus";

export const useClientObraOverview = () => {
  const {
    activeObraId,
    hasClientObra,
    isResolvingAuth,
    isResolvingUserDoc,
    isResolvingClientObra,
    isReady: isActiveObraReady,
  } = useActiveObraId();
  const obraQuery = useObra(activeObraId ?? undefined);
  const statusQuery = useObraStatus(activeObraId);
  const isResolvingDashboardData = Boolean(activeObraId) && (obraQuery.isLoading || statusQuery.isLoading);

  const overview = useMemo(() => {
    const fases = statusQuery.data ?? [];
    const progressData = deriveOverallProgress(fases);
    const status = deriveDashboardStatus(obraQuery.data?.statusResumo, progressData.progress, progressData.inProgressStages);
    const isLoading = isResolvingAuth || isResolvingUserDoc || isResolvingClientObra || isResolvingDashboardData;
    const isEmptyState = isActiveObraReady && !activeObraId && !hasClientObra;

    if (import.meta.env.DEV) {
      console.info("[useClientObraOverview] estado", {
        activeObraId,
        hasClientObra,
        isResolvingAuth,
        isResolvingUserDoc,
        isResolvingClientObra,
        isResolvingDashboardData,
        isActiveObraReady,
        obraLoading: obraQuery.isLoading,
        obraFetched: obraQuery.isFetched,
        statusLoading: statusQuery.isLoading,
        statusFetched: statusQuery.isFetched,
        fasesCount: fases.length,
        isLoading,
        isEmptyState,
        hasError: Boolean(obraQuery.error ?? statusQuery.error),
      });
    }

    return {
      activeObraId,
      hasClientObra,
      obra: obraQuery.data ?? null,
      fases,
      faseSummaries: fases.map((fase) => ({ fase, ...deriveFaseProgress(fase) })),
      progressData,
      status,
      summary: deriveDashboardSummary(progressData),
      deliveryDateLabel: deriveDeliveryLabel(fases),
      isLoading,
      error: obraQuery.error ?? statusQuery.error ?? null,
      isEmpty: Boolean(activeObraId) && !statusQuery.isLoading && fases.length === 0,
      isEmptyState,
      isResolvingAuth,
      isResolvingUserDoc,
      isResolvingClientObra,
      isResolvingDashboardData,
      isActiveObraReady,
    };
  }, [activeObraId, hasClientObra, isActiveObraReady, isResolvingAuth, isResolvingClientObra, isResolvingDashboardData, isResolvingUserDoc, obraQuery.data, obraQuery.error, obraQuery.isFetched, obraQuery.isLoading, statusQuery.data, statusQuery.error, statusQuery.isFetched, statusQuery.isLoading]);

  return {
    ...overview,
    obraQuery,
    statusQuery,
  };
};