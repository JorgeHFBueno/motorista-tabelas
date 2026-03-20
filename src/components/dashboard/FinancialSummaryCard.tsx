import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FinancialSummaryCardProps {
  totalPaid?: number;
  totalValue?: number;
  nextPayment?: {
    value?: number;
    dueDate?: string;
    isOverdue?: boolean;
  };
  comingSoon?: boolean;
  comingSoonMessage?: string;
}

const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(value);

const FinancialSummaryCard = ({
  totalPaid = 0,
  totalValue = 0,
  nextPayment = {},
  comingSoon = false,
  comingSoonMessage = "Disponível em 23/03/26",
}: FinancialSummaryCardProps) => {
  const safeTotalValue = totalValue > 0 ? totalValue : 1;
  const progressPercentage = Math.min((totalPaid / safeTotalValue) * 100, 100);
  const remaining = Math.max(totalValue - totalPaid, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="card-institutional p-5 lg:p-6 relative overflow-hidden"
    >
      <div className={cn("transition-opacity", comingSoon && "opacity-45")}>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-muted rounded-lg">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-semibold text-primary">Financeiro</h3>
        </div>
        <div className={cn(
          "flex items-center justify-between p-3 lg:p-4 rounded-lg mb-4",
          nextPayment.isOverdue ? "bg-destructive/10 border border-destructive/20" : "bg-muted",
        )}>
          <div className="flex items-center gap-3">
            {nextPayment.isOverdue && <AlertCircle className="w-5 h-5 text-destructive" />}
            <div>
              <p className="text-xs text-muted-foreground">{nextPayment.isOverdue ? "Parcela vencida" : "Próxima parcela"}</p>
              <p className="font-bold text-lg lg:text-xl text-foreground">{formatCurrency(nextPayment.value ?? 0)}</p>
              <p className="text-xs text-muted-foreground">{nextPayment.dueDate ?? "Sem previsão disponível"}</p>
            </div>
          </div>
          <Button size="sm" disabled className="font-semibold bg-secondary hover:bg-secondary/90 text-secondary-foreground disabled:opacity-60">
            PAGAR
          </Button>
        </div>
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Total pago</span>
            <span className="font-semibold text-foreground">{formatCurrency(totalPaid)}</span>
          </div>
          <div className="h-2 lg:h-2.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-secondary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1.5">
            <span className="text-muted-foreground">Saldo restante</span>
            <span className="text-muted-foreground">{formatCurrency(remaining)}</span>
          </div>
        </div>
        <button disabled className="flex items-center justify-center gap-1 text-sm text-secondary font-medium w-full mt-2 opacity-60 cursor-not-allowed">
          Ver detalhes <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {comingSoon && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/72 backdrop-blur-[1px] px-6 text-center">
          <div className="rounded-2xl border border-dashed border-primary/20 bg-background/90 px-5 py-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">Financeiro</p>
            <p className="text-xl font-bold text-foreground">{comingSoonMessage}</p>
            <p className="mt-2 text-sm text-muted-foreground">Os indicadores visuais já estão reservados para a futura área financeira.</p>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default FinancialSummaryCard;
