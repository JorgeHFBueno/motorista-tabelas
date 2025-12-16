import { motion } from "framer-motion";
import { Wallet, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FinancialSummaryCardProps {
  totalPaid: number;
  totalValue: number;
  nextPayment: {
    value: number;
    dueDate: string;
    isOverdue?: boolean;
  };
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

const FinancialSummaryCard = ({ totalPaid, totalValue, nextPayment }: FinancialSummaryCardProps) => {
  const progressPercentage = (totalPaid / totalValue) * 100;
  const remaining = totalValue - totalPaid;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-card rounded-2xl p-5 shadow-card"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-secondary rounded-lg">
          <Wallet className="w-5 h-5 text-primary" />
        </div>
        <h3 className="font-semibold text-foreground">Financeiro</h3>
      </div>

      {/* Next Payment Alert */}
      <div className={`flex items-center justify-between p-3 rounded-xl mb-4 ${
        nextPayment.isOverdue ? 'bg-destructive/10' : 'bg-secondary'
      }`}>
        <div className="flex items-center gap-3">
          {nextPayment.isOverdue && <AlertCircle className="w-5 h-5 text-destructive" />}
          <div>
            <p className="text-xs text-muted-foreground">
              {nextPayment.isOverdue ? 'Parcela vencida' : 'Próxima parcela'}
            </p>
            <p className="font-bold text-lg text-foreground">{formatCurrency(nextPayment.value)}</p>
            <p className="text-xs text-muted-foreground">{nextPayment.dueDate}</p>
          </div>
        </div>
        <Button variant="accent" size="sm" className="font-semibold">
          PAGAR
        </Button>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">Total pago</span>
          <span className="font-semibold text-foreground">{formatCurrency(totalPaid)}</span>
        </div>
        <div className="h-2 bg-progress-bg rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-progress-fill rounded-full"
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

      <button className="flex items-center justify-center gap-1 text-sm text-primary font-medium w-full mt-2 hover:text-primary/80 transition-colors">
        Ver detalhes <ArrowRight className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

export default FinancialSummaryCard;
