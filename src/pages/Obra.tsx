import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronDown, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { cn } from "@/lib/utils";
import { useActiveObraId } from "@/hooks/useActiveObraId";
import { useObra } from "@/hooks/useAppQueries";

interface StageDetail {
  id: string;
  name: string;
  progress: number;
  status: "completed" | "in-progress" | "pending";
  startDate?: string;
  endDate?: string;
  tasks: {
    name: string;
    completed: boolean;
  }[];
}

const stages: StageDetail[] = [
  {
    id: "1",
    name: "Preparo do terreno",
    progress: 100,
    status: "completed",
    startDate: "01/08/2024",
    endDate: "15/08/2024",
    tasks: [
      { name: "Limpeza do terreno", completed: true },
      { name: "Nivelamento", completed: true },
      { name: "Demarcação", completed: true },
    ],
  },
  {
    id: "2",
    name: "Fundação",
    progress: 100,
    status: "completed",
    startDate: "16/08/2024",
    endDate: "10/09/2024",
    tasks: [
      { name: "Escavação", completed: true },
      { name: "Armação de ferragem", completed: true },
      { name: "Concretagem", completed: true },
      { name: "Cura do concreto", completed: true },
    ],
  },
  {
    id: "3",
    name: "Estrutura",
    progress: 65,
    status: "in-progress",
    startDate: "11/09/2024",
    tasks: [
      { name: "Pilares", completed: true },
      { name: "Vigas", completed: true },
      { name: "Lajes", completed: false },
      { name: "Escadas", completed: false },
    ],
  },
  {
    id: "4",
    name: "Vedação",
    progress: 0,
    status: "pending",
    tasks: [
      { name: "Alvenaria externa", completed: false },
      { name: "Alvenaria interna", completed: false },
    ],
  },
  {
    id: "5",
    name: "Instalações",
    progress: 0,
    status: "pending",
    tasks: [
      { name: "Elétrica", completed: false },
      { name: "Hidráulica", completed: false },
      { name: "Gás", completed: false },
    ],
  },
];

const StatusBadge = ({ status }: { status: StageDetail["status"] }) => {
  const config = {
    completed: { icon: CheckCircle2, label: "Concluída", className: "bg-success/10 text-success" },
    "in-progress": { icon: Clock, label: "Em andamento", className: "bg-progress-fill/10 text-progress-fill" },
    pending: { icon: AlertTriangle, label: "Pendente", className: "bg-muted text-muted-foreground" },
  };
  const { icon: Icon, label, className } = config[status];

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium", className)}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};

const StageCard = ({ stage }: { stage: StageDetail }) => {
  const [isOpen, setIsOpen] = useState(stage.status === "in-progress");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl shadow-card overflow-hidden"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-foreground">{stage.name}</h3>
            <StatusBadge status={stage.status} />
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    stage.status === "completed" && "bg-success",
                    stage.status === "in-progress" && "bg-progress-fill",
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${stage.progress}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
            </div>
            <span className={cn(
              "text-sm font-bold",
              stage.status === "completed" && "text-success",
              stage.status === "in-progress" && "text-progress-fill",
              stage.status === "pending" && "text-muted-foreground"
            )}>
              {stage.progress}%
            </span>
          </div>
        </div>
        
        <ChevronDown className={cn(
          "w-5 h-5 text-muted-foreground transition-transform ml-2",
          isOpen && "rotate-180"
        )} />
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
            <div className="px-4 pb-4 border-t border-border pt-3">
              {stage.startDate && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{stage.startDate}</span>
                  {stage.endDate && (
                    <>
                      <span>→</span>
                      <span>{stage.endDate}</span>
                    </>
                  )}
                </div>
              )}
              
              <div className="space-y-2">
                {stage.tasks.map((task, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2"
                  >
                    <div className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                      task.completed ? "bg-success" : "border-2 border-muted"
                    )}>
                      {task.completed && <CheckCircle2 className="w-3 h-3 text-success-foreground" />}
                    </div>
                    <span className={cn(
                      "text-sm",
                      task.completed ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {task.name}
                    </span>
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
  const { activeObraId, hasClientObra } = useActiveObraId();
  const { data: obraData } = useObra(activeObraId ?? undefined);
  const completedStages = stages.filter(s => s.status === "completed").length;

  return (
    <ResponsiveLayout headerTitle="Obra" headerSubtitle="Acompanhamento da construção">
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        {!hasClientObra ? "Sem obra vinculada." : obraData ? `Obra ativa: ${obraData.nome}` : "Carregando dados da obra..."}
      </div>
        {/* Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl p-5 lg:p-6 shadow-card"
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg lg:text-xl font-bold text-foreground">Status da Obra</h2>
            <span className="text-sm lg:text-base text-muted-foreground">
              {completedStages}/{stages.length} etapas
            </span>
          </div>
          <p className="text-sm lg:text-base text-muted-foreground">
            Acompanhe o progresso detalhado de cada etapa da sua construção
          </p>
        </motion.div>

        {/* Stages List - Grid on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {stages.map((stage, index) => (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <StageCard stage={stage} />
            </motion.div>
          ))}
        </div>
      </div>
    </ResponsiveLayout>
  );
};

export default Obra;
