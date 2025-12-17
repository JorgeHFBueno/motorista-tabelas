import { motion } from "framer-motion";
import { Mountain, Layers, Building, Grid3X3, Wrench, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stage {
  name: string;
  progress: number;
  status: "completed" | "in-progress" | "pending";
  icon: typeof Mountain;
}

const stages: Stage[] = [
  { name: "Preparo do terreno", progress: 100, status: "completed", icon: Mountain },
  { name: "Fundação", progress: 100, status: "completed", icon: Layers },
  { name: "Estrutura", progress: 65, status: "in-progress", icon: Building },
  { name: "Vedação", progress: 0, status: "pending", icon: Grid3X3 },
  { name: "Instalações", progress: 0, status: "pending", icon: Wrench },
];

const StagesOverview = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-card rounded-2xl p-5 lg:p-6 shadow-card"
    >
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <h3 className="font-semibold text-foreground text-lg">Etapas da Obra</h3>
        <span className="text-xs text-secondary-foreground bg-secondary px-2.5 py-1 rounded-full">
          3/5 concluídas
        </span>
      </div>

      <div className="space-y-3 lg:space-y-4">
        {stages.map((stage, index) => (
          <motion.div
            key={stage.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + index * 0.1 }}
            className="flex items-center gap-3 lg:gap-4"
          >
            <div className={cn(
              "w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center shrink-0",
              stage.status === "completed" && "bg-success/10",
              stage.status === "in-progress" && "bg-progress-fill/10",
              stage.status === "pending" && "bg-muted"
            )}>
              {stage.status === "completed" ? (
                <CheckCircle2 className="w-5 h-5 lg:w-6 lg:h-6 text-success" />
              ) : (
                <stage.icon className={cn(
                  "w-5 h-5 lg:w-6 lg:h-6",
                  stage.status === "in-progress" && "text-progress-fill",
                  stage.status === "pending" && "text-muted-foreground"
                )} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  "text-sm lg:text-base font-medium truncate",
                  stage.status === "pending" ? "text-muted-foreground" : "text-foreground"
                )}>
                  {stage.name}
                </span>
                <span className={cn(
                  "text-sm font-semibold ml-2",
                  stage.status === "completed" && "text-success",
                  stage.status === "in-progress" && "text-progress-fill",
                  stage.status === "pending" && "text-muted-foreground"
                )}>
                  {stage.progress}%
                </span>
              </div>
              <div className="h-1.5 lg:h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    stage.status === "completed" && "bg-success",
                    stage.status === "in-progress" && "bg-progress-fill",
                    stage.status === "pending" && "bg-muted"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${stage.progress}%` }}
                  transition={{ duration: 0.8, delay: 0.5 + index * 0.1 }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

export default StagesOverview;
