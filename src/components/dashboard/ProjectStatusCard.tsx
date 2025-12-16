import { motion } from "framer-motion";
import { TrendingUp, Calendar } from "lucide-react";

interface ProjectStatusCardProps {
  progress: number;
  deliveryDate: string;
  status: "on-track" | "delayed" | "ahead";
}

const ProjectStatusCard = ({ progress, deliveryDate, status }: ProjectStatusCardProps) => {
  const statusConfig = {
    "on-track": { label: "No prazo", color: "text-success" },
    "delayed": { label: "Atrasado", color: "text-destructive" },
    "ahead": { label: "Adiantado", color: "text-accent" },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-card rounded-2xl p-5 shadow-card"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-muted-foreground text-sm font-medium">Progresso da Obra</h3>
          <p className={`text-sm font-semibold ${statusConfig[status].color}`}>
            {statusConfig[status].label}
          </p>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground text-sm">
          <Calendar className="w-4 h-4" />
          <span>{deliveryDate}</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Circular Progress */}
        <div className="relative w-24 h-24">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke="hsl(var(--progress-bg))"
              strokeWidth="8"
            />
            <motion.circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke="hsl(var(--progress-fill))"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={251.2}
              initial={{ strokeDashoffset: 251.2 }}
              animate={{ strokeDashoffset: 251.2 - (251.2 * progress) / 100 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{progress}%</span>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-sm font-medium text-foreground">Evolução mensal</span>
          </div>
          <p className="text-muted-foreground text-sm">
            +8% este mês
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Previsão de entrega mantida
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default ProjectStatusCard;
