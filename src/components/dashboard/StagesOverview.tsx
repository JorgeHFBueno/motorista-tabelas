import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { ObraStatusEtapa } from "@/types/obraStatus";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { deriveFaseProgress } from "@/lib/obraStatus";

interface StagesOverviewProps {
  fases?: ObraStatusEtapa[];
  emptyMessage?: string;
}

const statusMeta = {
  completed: {
    label: "Completo",
    icon: CheckCircle2,
    containerClass: "bg-success/10",
    iconClass: "text-success",
    textClass: "text-success",
    barClass: "bg-success",
  },
  "in-progress": {
    label: "Em andamento",
    icon: Clock,
    containerClass: "bg-progress-fill/10",
    iconClass: "text-progress-fill",
    textClass: "text-progress-fill",
    barClass: "bg-progress-fill",
  },
  pending: {
    label: "Pendente",
    icon: AlertTriangle,
    containerClass: "bg-muted",
    iconClass: "text-muted-foreground",
    textClass: "text-muted-foreground",
    barClass: "bg-muted",
  },
} as const;

const StagesOverview = ({
  fases = [],
  emptyMessage = "As etapas da obra aparecerao aqui assim que o cronograma for iniciado.",
}: StagesOverviewProps) => {
  const completedCount = fases.filter(
    (fase) => deriveFaseProgress(fase).status === "completed",
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-card rounded-2xl p-5 lg:p-6 shadow-card"
    >
      <div className="flex items-center justify-between mb-4 lg:mb-6 gap-3 flex-wrap">
        <h3 className="font-semibold text-foreground text-lg">Etapas da Obra</h3>
        <span className="text-xs text-secondary-foreground bg-secondary px-2.5 py-1 rounded-full">
          {completedCount}/{fases.length} completas
        </span>
      </div>

      {fases.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3 lg:space-y-4">
          {fases.map((fase, index) => {
            const summary = deriveFaseProgress(fase);
            const meta = statusMeta[summary.status];
            const Icon = meta.icon;

            return (
              <motion.div
                key={fase.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.1 }}
                className="flex items-center gap-3 lg:gap-4"
              >
                <div
                  className={cn(
                    "w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center shrink-0",
                    meta.containerClass,
                  )}
                >
                  <Icon className={cn("w-5 h-5 lg:w-6 lg:h-6", meta.iconClass)} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1 gap-3">
                    <div className="min-w-0">
                      <span
                        className={cn(
                          "text-sm lg:text-base font-medium truncate block",
                          summary.status === "pending"
                            ? "text-muted-foreground"
                            : "text-foreground",
                        )}
                      >
                        {fase.nome}
                      </span>
                      <span className={cn("text-xs", meta.textClass)}>
                        {meta.label} • {summary.doneCount}/{summary.total} itens
                      </span>
                    </div>
                    <span className={cn("text-sm font-semibold ml-2 shrink-0", meta.textClass)}>
                      {summary.progress}%
                    </span>
                  </div>

                  <Progress
                    value={summary.progress}
                    className="h-1.5 lg:h-2"
                    indicatorClassName={meta.barClass}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default StagesOverview;
