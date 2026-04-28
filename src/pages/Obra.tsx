import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientObraOverview } from "@/hooks/useClientObraOverview";
import {
  getProgressStatusBadgeVariant,
  getProgressStatusLabel,
  getProgressStatusTone,
} from "@/lib/obraStatus";
import { cn } from "@/lib/utils";
import type { ObraStatusEtapa } from "@/types/obraStatus";

const StageCard = ({
  fase,
  isOpen,
  onToggle,
}: {
  fase: ObraStatusEtapa;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  const tone = getProgressStatusTone(fase.status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl shadow-card overflow-hidden"
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground">{fase.nome}</h3>
            <Badge variant={getProgressStatusBadgeVariant(fase.status)}>
              {getProgressStatusLabel(fase.status)}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <Progress
              value={fase.progresso}
              className="h-2"
              indicatorClassName={tone.indicatorClass}
            />
            <span className="text-sm font-bold min-w-12 text-right">
              {fase.progresso}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {fase.itens.length} itens nesta etapa
          </p>
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform ml-2",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
              <div className="space-y-3">
                {fase.itens.map((item) => {
                  const itemTone = getProgressStatusTone(item.status);

                  return (
                    <div key={item.id} className="rounded-xl border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {item.nome}
                          </p>
                          <p className={cn("text-xs", itemTone.textClass)}>
                            {getProgressStatusLabel(item.status)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-foreground">
                          {item.progresso}%
                        </span>
                      </div>

                      <Progress
                        value={item.progresso}
                        className="h-2"
                        indicatorClassName={itemTone.indicatorClass}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Obra = () => {
  const { activeObraId, hasClientObra, obra, fases, isLoading, error, progressData } =
    useClientObraOverview();
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>(
    {},
  );
  const initializedExpanded = useRef(false);

  useEffect(() => {
    initializedExpanded.current = false;
    setExpandedPhases({});
  }, [activeObraId]);

  useEffect(() => {
    if (initializedExpanded.current || fases.length === 0) return;

    const nextExpanded: Record<string, boolean> = {};
    fases.forEach((fase) => {
      if (fase.status === "em_andamento" || fase.status === "finalizando") {
        nextExpanded[fase.id] = true;
      }
    });

    setExpandedPhases(nextExpanded);
    initializedExpanded.current = true;
  }, [fases]);

  const completedStages = useMemo(
    () => progressData.completedStages,
    [progressData.completedStages],
  );
  const isPermissionDenied =
    (error as { code?: string } | null)?.code === "permission-denied";

  useEffect(() => {
    if (import.meta.env.DEV && error) {
      console.error("[CLIENT-STATUS] erro ao carregar status", {
        activeObraId,
        error,
      });
    }
  }, [activeObraId, error]);

  return (
    <ResponsiveLayout headerTitle="Obra" headerSubtitle="Acompanhamento da construcao">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {!hasClientObra || !activeObraId
            ? "Nenhuma obra selecionada."
            : obra
              ? `Obra ativa: ${obra.nome}`
              : "Carregando dados da obra..."}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl p-5 lg:p-6 shadow-card"
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg lg:text-xl font-bold text-foreground">
              Status da Obra
            </h2>
            <span className="text-sm lg:text-base text-muted-foreground">
              {completedStages}/{fases.length} etapas
            </span>
          </div>
          <p className="text-sm lg:text-base text-muted-foreground">
            Acompanhe o progresso de cada etapa e de cada item da sua obra.
          </p>
        </motion.div>

        {!activeObraId ? (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            Nenhuma obra selecionada.
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="rounded-2xl border p-4 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            {isPermissionDenied
              ? "Sem permissao para visualizar status desta obra."
              : "Nao foi possivel carregar o status da obra agora. Tente novamente em instantes."}
          </div>
        ) : fases.length === 0 ? (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            Status ainda nao foi iniciado.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {fases.map((fase) => (
              <StageCard
                key={fase.id}
                fase={fase}
                isOpen={Boolean(expandedPhases[fase.id])}
                onToggle={() =>
                  setExpandedPhases((current) => ({
                    ...current,
                    [fase.id]: !current[fase.id],
                  }))
                }
              />
            ))}
          </div>
        )}
      </div>
    </ResponsiveLayout>
  );
};

export default Obra;
