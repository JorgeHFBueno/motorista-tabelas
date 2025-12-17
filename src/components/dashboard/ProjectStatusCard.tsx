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
    "ahead": { label: "Adiantado", color: "text-secondary" },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="card-institutional p-5 lg:p-6"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-muted-foreground text-sm font-medium">Progresso da Obra</h3>
          <p className={`text-sm font-semibold ${statusConfig[status].color}`}>
            {statusConfig[status].label}
          </p>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground text-xs">
          <Calendar className="w-3.5 h-3.5" />
          <span>{deliveryDate}</span>
        </div>
      </div>

      <div className="flex items-center gap-5 lg:gap-8">
        {/* Circular Progress */}
        <div className="relative w-20 h-20 lg:w-24 lg:h-24">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="50%"
              cy="50%"
              r="42%"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="6"
            />
            <motion.circle
              cx="50%"
              cy="50%"
              r="42%"
              fill="none"
              stroke="hsl(var(--secondary))"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={213.6}
              initial={{ strokeDashoffset: 213.6 }}
              animate={{ strokeDashoffset: 213.6 - (213.6 * progress) / 100 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl lg:text-2xl font-bold text-foreground">{progress}%</span>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-sm font-medium text-foreground">Evolução mensal</span>
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            +8% este mês
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Previsão de entrega mantida
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default ProjectStatusCard;
