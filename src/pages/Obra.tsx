import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronDown, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { cn } from "@/lib/utils";
import { useClientObraOverview } from "@/hooks/useClientObraOverview";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import type { ObraStatusFase } from "@/types/obraStatus";
import { deriveFaseProgress, formatPtBrDate } from "@/lib/obraStatus";

const StatusBadge = ({ status }: { status: "pending" | "in-progress" | "completed" }) => {
  const config = {
    completed: { icon: CheckCircle2, label: "Concluída", className: "bg-success/10 text-success" },
    "in-progress": { icon: Clock, label: "Em andamento", className: "bg-progress-fill/10 text-progress-fill" },
    pending: { icon: AlertTriangle, label: "Pendente", className: "bg-muted text-muted-foreground" },
  };
  const { icon: Icon, label, className } = config[status];

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
};

const StageCard = ({
  fase,
  isOpen,
  onToggle,
}: {
  fase: ObraStatusFase;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  const { progress, status, doneCount, total } = deriveFaseProgress(fase);
  const inicio = formatPtBrDate(fase.inicio);
  const fim = formatPtBrDate(fase.fim);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl shadow-card overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full p-4 flex items-center justify-between text-left">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground">{fase.titulo}</h3>
            <StatusBadge status={status} />
          </div>

          <div className="flex items-center gap-3">
            <Progress value={progress} className="h-2" />
            <span className="text-sm font-bold min-w-12 text-right">{progress}%</span>
          </div>
          <p className="text-xs text-muted-foreground">{doneCount}/{total} itens concluídos</p>
        </div>
        <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform ml-2", isOpen && "rotate-180")} />
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
              {(inicio || fim) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <Calendar className="w-3.5 h-3.5" />
                  {inicio && <span>Início: {inicio}</span>}
                  {fim && <span>Fim: {fim}</span>}
                </div>
              )}

              <div className="space-y-2">
                {(fase.itens ?? []).map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                        item.done ? "bg-success" : "border-2 border-muted",
                      )}
                      aria-hidden="true"
                    >
                      {item.done && <CheckCircle2 className="w-3 h-3 text-success-foreground" />}
                    </div>
                    <span className={cn("text-sm", item.done ? "text-foreground" : "text-muted-foreground")}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Obra = () => {
  const { activeObraId, hasClientObra, obra, fases, isLoading, error, progressData } = useClientObraOverview();
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const initializedExpanded = useRef(false);

  useEffect(() => {
    initializedExpanded.current = false;
    setExpandedPhases({});
  }, [activeObraId]);

  useEffect(() => {
    if (initializedExpanded.current || fases.length === 0) return;

    const nextExpanded: Record<string, boolean> = {};
    fases.forEach((fase) => {
      const { status } = deriveFaseProgress(fase);
      if (status === "in-progress") nextExpanded[fase.id] = true;
    });

    setExpandedPhases(nextExpanded);
    initializedExpanded.current = true;
  }, [fases]);

  const completedStages = useMemo(() => progressData.completedStages, [progressData.completedStages]);
  const isPermissionDenied = (error as { code?: string } | null)?.code === "permission-denied";

  useEffect(() => {
    if (import.meta.env.DEV && error) {
      console.error("[CLIENT-STATUS] erro ao carregar status", { activeObraId, error });
    }
  }, [activeObraId, error]);

  return (
    <ResponsiveLayout headerTitle="Obra" headerSubtitle="Acompanhamento da construção">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {!hasClientObra || !activeObraId
            ? "Nenhuma obra selecionada."
            : obra
              ? `Obra ativa: ${obra.nome}`
              : "Carregando dados da obra..."}
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl p-5 lg:p-6 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg lg:text-xl font-bold text-foreground">Status da Obra</h2>
            <span className="text-sm lg:text-base text-muted-foreground">{completedStages}/{fases.length} etapas</span>
          </div>
          <p className="text-sm lg:text-base text-muted-foreground">Acompanhe o progresso detalhado de cada etapa da sua construção.</p>
        </motion.div>

        {!activeObraId ? (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Nenhuma obra selecionada.</div>
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
              ? "Sem permissão para visualizar status desta obra."
              : "Não foi possível carregar o status da obra agora. Tente novamente em instantes."}
          </div>
        ) : fases.length === 0 ? (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Status ainda não foi iniciado.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {fases.map((fase) => (
              <StageCard
                key={fase.id}
                fase={fase}
                isOpen={Boolean(expandedPhases[fase.id])}
                onToggle={() => setExpandedPhases((current) => ({ ...current, [fase.id]: !current[fase.id] }))}
              />
            ))}
          </div>
        )}
      </div>
    </ResponsiveLayout>
  );
};

export default Obra;
