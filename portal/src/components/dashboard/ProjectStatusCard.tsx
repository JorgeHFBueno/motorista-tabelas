import { motion } from "framer-motion";
import { ArrowRight, Calendar, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProjectStatusCardProps {
  progress: number;
  deliveryDate: string;
  status: "on-track" | "delayed" | "ahead";
  statusLabel?: string;
  title?: string;
  summary?: string;
  trendLabel?: string;
  ctaTo?: string;
  ctaLabel?: string;
  disabled?: boolean;
}

const statusConfig = {
  "on-track": { label: "No prazo", color: "text-success" },
  "delayed": { label: "Atrasado", color: "text-destructive" },
  "ahead": { label: "Adiantado", color: "text-secondary" },
};

const ProjectStatusCard = ({
  progress,
  deliveryDate,
  status,
  statusLabel,
  title = "Progresso da Obra",
  summary = "Acompanhe o andamento da sua obra em tempo real.",
  trendLabel = "Cronograma atualizado com os dados mais recentes.",
  ctaTo,
  ctaLabel = "Ver detalhes da obra",
  disabled = false,
}: ProjectStatusCardProps) => {
  const badgeLabel = statusLabel ?? statusConfig[status].label;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="card-institutional p-5 lg:p-6"
    >
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h3 className="text-muted-foreground text-sm font-medium">{title}</h3>
          <p className={cn("text-sm font-semibold", statusConfig[status].color)}>{badgeLabel}</p>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground text-xs text-right">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>{deliveryDate}</span>
        </div>
      </div>

      <div className="flex items-center gap-5 lg:gap-8">
        <div className="relative w-20 h-20 lg:w-24 lg:h-24 shrink-0">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="50%" cy="50%" r="42%" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
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

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp className="w-4 h-4 text-success shrink-0" />
            <span className="text-sm font-medium text-foreground">Resumo atual</span>
          </div>
          <p className="text-muted-foreground text-sm font-medium">{summary}</p>
          <p className="text-xs text-muted-foreground mt-1.5">{trendLabel}</p>

          {ctaTo ? (
            <Button asChild className="mt-4 w-full sm:w-auto font-semibold bg-secondary hover:bg-secondary/90 text-secondary-foreground">
              <Link to={ctaTo}>
                {ctaLabel}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          ) : (
            <Button disabled={disabled} className="mt-4 w-full sm:w-auto font-semibold" variant="secondary">
              {ctaLabel}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ProjectStatusCard;
