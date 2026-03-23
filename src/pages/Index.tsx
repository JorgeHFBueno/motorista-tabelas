import { AlertTriangle, Loader2 } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import ProjectStatusCard from "@/components/dashboard/ProjectStatusCard";
import FinancialSummaryCard from "@/components/dashboard/FinancialSummaryCard";
import StagesOverview from "@/components/dashboard/StagesOverview";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientObraOverview } from "@/hooks/useClientObraOverview";

const DashboardCardSkeleton = () => (
  <div className="card-institutional p-5 lg:p-6 space-y-4">
    <Skeleton className="h-5 w-36" />
    <Skeleton className="h-4 w-24" />
    <div className="flex items-center gap-5">
      <Skeleton className="h-24 w-24 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
        <Skeleton className="h-10 w-40" />
      </div>
    </div>
  </div>
);

const DashboardAlert = ({ message }: { message: string }) => (
  <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground flex items-start gap-3">
    <AlertTriangle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
    <span>{message}</span>
  </div>
);

const Index = () => {
  const {
    activeObraId,
    hasClientObra,
    obra,
    fases,
    progressData,
    status,
    summary,
    deliveryDateLabel,
    isLoading,
    error,
    isEmpty,
    isEmptyState,
    isResolvingAuth,
    isResolvingUserDoc,
    isResolvingClientObra,
    isResolvingDashboardData,
    isActiveObraReady,
  } = useClientObraOverview();

  const hasObraData = Boolean(activeObraId && obra);
  const projectSummary = hasObraData
    ? `${summary}${obra?.nome ? ` Obra ativa: ${obra.nome}.` : ""}`
    : "Assim que uma obra estiver vinculada ao seu acesso, o progresso aparecerá aqui.";

    if (import.meta.env.DEV) {
    console.info("[ClientDashboard] decisão de UI", {
      activeObraId,
      hasClientObra,
      hasObraData,
      isLoading,
      isEmptyState,
      hasError: Boolean(error),
      isResolvingAuth,
      isResolvingUserDoc,
      isResolvingClientObra,
      isResolvingDashboardData,
      isActiveObraReady,
      branch: isLoading
        ? "loading"
        : isEmptyState
          ? "empty"
          : error
            ? "error"
            : "loaded",
    });
  }

  return (
    <ResponsiveLayout headerTitle="Dashboard" headerSubtitle="Visão geral da sua obra">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        {hasObraData && (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            {`Obra ativa: ${obra.nome}`}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {isLoading ? (
            <DashboardCardSkeleton />
          ) : isEmptyState ? (
            <DashboardAlert message="Nenhuma obra ativa foi encontrada para este acesso no momento." />
          ) : error ? (
            <DashboardAlert message="Não foi possível carregar o progresso da obra agora. Tente novamente em instantes." />
          ) : (
            <ProjectStatusCard
              progress={progressData.progress}
              deliveryDate={deliveryDateLabel}
              status={status.variant}
              statusLabel={status.label}
              summary={projectSummary}
              trendLabel={isEmpty ? "O cronograma será exibido assim que as etapas forem cadastradas." : "Dados sincronizados com a página completa da obra."}
              ctaTo="/cliente/obra"
              ctaLabel="Acompanhar obra"
            />
          )}

          <FinancialSummaryCard comingSoon comingSoonMessage="Disponível em 23/03/26" />
        </div>
        
        {isLoading ? (
          <div className="bg-card rounded-2xl p-5 lg:p-6 shadow-card space-y-4">
            <div className="flex items-center gap-3 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando etapas da obra...
            </div>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <DashboardAlert message="Não foi possível carregar as etapas da obra agora. Tente novamente em instantes." />
        ) : (
          <StagesOverview
            fases={fases}
            emptyMessage={isEmptyState ? "Nenhuma obra vinculada para exibir etapas." : "Sua obra ainda não possui etapas cadastradas para exibição no dashboard."}
          />
        )}
      </div>
    </ResponsiveLayout>
  );
};

export default Index;