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
      className="card-institutional p-5 lg:p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-muted rounded-lg">
          <Wallet className="w-5 h-5 text-primary" />
        </div>
        <h3 className="font-semibold text-primary">Financeiro</h3>
      </div>

      {/* Next Payment Alert */}
      <div className={`flex items-center justify-between p-3 lg:p-4 rounded-lg mb-4 ${
        nextPayment.isOverdue ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted'
      }`}>
        <div className="flex items-center gap-3">
          {nextPayment.isOverdue && <AlertCircle className="w-5 h-5 text-destructive" />}
          <div>
            <p className="text-xs text-muted-foreground">
              {nextPayment.isOverdue ? 'Parcela vencida' : 'Próxima parcela'}
            </p>
            <p className="font-bold text-lg lg:text-xl text-foreground">{formatCurrency(nextPayment.value)}</p>
            <p className="text-xs text-muted-foreground">{nextPayment.dueDate}</p>
          </div>
        </div>
        <Button size="sm" className="font-semibold bg-secondary hover:bg-secondary/90 text-secondary-foreground">
          PAGAR
        </Button>
      </div>

      {/* Progress Bar */}
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

      <button className="flex items-center justify-center gap-1 text-sm text-secondary font-medium w-full mt-2 hover:text-secondary/80 transition-colors">
        Ver detalhes <ArrowRight className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

export default FinancialSummaryCard;
