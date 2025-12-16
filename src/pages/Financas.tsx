import { motion } from "framer-motion";
import { Wallet, AlertCircle, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import MobileLayout from "@/components/layout/MobileLayout";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

interface Installment {
  id: string;
  number: number;
  value: number;
  dueDate: string;
  status: "paid" | "pending" | "overdue";
  paidDate?: string;
}

const installments: Installment[] = [
  { id: "1", number: 1, value: 14018.75, dueDate: "20/07/2024", status: "paid", paidDate: "18/07/2024" },
  { id: "2", number: 2, value: 14018.75, dueDate: "20/08/2024", status: "paid", paidDate: "20/08/2024" },
  { id: "3", number: 3, value: 14018.75, dueDate: "20/09/2024", status: "paid", paidDate: "19/09/2024" },
  { id: "4", number: 4, value: 14018.75, dueDate: "20/10/2024", status: "paid", paidDate: "20/10/2024" },
  { id: "5", number: 5, value: 14018.75, dueDate: "20/11/2024", status: "paid", paidDate: "18/11/2024" },
  { id: "6", number: 6, value: 14018.75, dueDate: "20/12/2024", status: "pending" },
  { id: "7", number: 7, value: 14018.75, dueDate: "20/01/2025", status: "pending" },
  { id: "8", number: 8, value: 14018.75, dueDate: "20/02/2025", status: "pending" },
];

const financialData = {
  totalValue: 280650.00,
  totalPaid: 70093.75,
  remaining: 210556.25,
  nextPayment: 14018.75,
  nextDueDate: "20/12/2024",
};

const Financas = () => {
  const progressPercentage = (financialData.totalPaid / financialData.totalValue) * 100;
  const paidCount = installments.filter(i => i.status === "paid").length;
  const pendingCount = installments.filter(i => i.status !== "paid").length;

  return (
    <MobileLayout>
      <Header projectName="Residência Silva" />
      
      <div className="px-4 -mt-4 space-y-4">
        {/* Main Financial Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl p-5 shadow-card"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-primary rounded-xl">
              <Wallet className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-foreground">Finanças da Obra</h2>
              <p className="text-xs text-muted-foreground">Valor total do contrato</p>
            </div>
          </div>

          <p className="text-3xl font-bold text-foreground mb-4">
            {formatCurrency(financialData.totalValue)}
          </p>

          {/* Progress Section */}
          <div className="space-y-3 mb-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">Total pago</span>
                <span className="font-semibold text-success">{formatCurrency(financialData.totalPaid)}</span>
              </div>
              <div className="h-3 bg-progress-bg rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-success rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercentage}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
            </div>
            
            <div className="flex justify-between items-center pt-2">
              <span className="text-sm text-muted-foreground">Saldo restante</span>
              <span className="text-lg font-bold text-foreground">{formatCurrency(financialData.remaining)}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-success/10 rounded-xl p-3">
              <div className="flex items-center gap-1 text-success mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium">Pagas</span>
              </div>
              <p className="text-xl font-bold text-success">{paidCount}</p>
            </div>
            <div className="bg-secondary rounded-xl p-3">
              <div className="flex items-center gap-1 text-muted-foreground mb-1">
                <TrendingDown className="w-4 h-4" />
                <span className="text-xs font-medium">Pendentes</span>
              </div>
              <p className="text-xl font-bold text-foreground">{pendingCount}</p>
            </div>
          </div>
        </motion.div>

        {/* Next Payment Alert */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-accent/10 border border-accent/30 rounded-2xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent rounded-xl">
              <AlertCircle className="w-5 h-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Próxima parcela</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(financialData.nextPayment)}</p>
              <p className="text-xs text-muted-foreground">Venc. {financialData.nextDueDate}</p>
            </div>
          </div>
          <Button variant="accent" size="sm">
            PAGAR
          </Button>
        </motion.div>

        {/* Installments List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl shadow-card overflow-hidden"
        >
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Parcelas</h3>
          </div>
          
          <div className="divide-y divide-border">
            {installments.map((installment, index) => (
              <motion.button
                key={installment.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.05 }}
                className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold",
                    installment.status === "paid" && "bg-success/10 text-success",
                    installment.status === "pending" && "bg-secondary text-muted-foreground",
                    installment.status === "overdue" && "bg-destructive/10 text-destructive"
                  )}>
                    {installment.number}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-foreground">{formatCurrency(installment.value)}</p>
                    <p className="text-xs text-muted-foreground">
                      {installment.status === "paid" 
                        ? `Pago em ${installment.paidDate}`
                        : `Venc. ${installment.dueDate}`
                      }
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-xs font-medium px-2 py-1 rounded-full",
                    installment.status === "paid" && "bg-success/10 text-success",
                    installment.status === "pending" && "bg-secondary text-muted-foreground",
                    installment.status === "overdue" && "bg-destructive/10 text-destructive"
                  )}>
                    {installment.status === "paid" ? "Pago" : installment.status === "overdue" ? "Vencido" : "Pendente"}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </MobileLayout>
  );
};

export default Financas;
