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
  const { activeObraId, hasClientObra } = useActiveObraId();
  const obraQuery = useObra(activeObraId ?? undefined);
  const statusQuery = useObraStatus(activeObraId);

  const overview = useMemo(() => {
    const fases = statusQuery.data ?? [];
    const progressData = deriveOverallProgress(fases);
    const status = deriveDashboardStatus(obraQuery.data?.statusResumo, progressData.progress, progressData.inProgressStages);

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
      isLoading: Boolean(activeObraId) && (obraQuery.isLoading || statusQuery.isLoading),
      error: obraQuery.error ?? statusQuery.error ?? null,
      isEmpty: Boolean(activeObraId) && !statusQuery.isLoading && fases.length === 0,
    };
  }, [activeObraId, hasClientObra, obraQuery.data, obraQuery.error, obraQuery.isLoading, statusQuery.data, statusQuery.error, statusQuery.isLoading]);

  return {
    ...overview,
    obraQuery,
    statusQuery,
  };
};