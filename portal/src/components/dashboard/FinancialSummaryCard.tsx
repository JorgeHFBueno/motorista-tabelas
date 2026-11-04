import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import type { Timestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFinancialOverview } from "@/lib/financas/financas.queries";
import type { FinancialInstallmentStatus } from "@/lib/financas/financas.types";
import { cn } from "@/lib/utils";

interface FinancialSummaryCardProps {
  obraId?: string;
  hasActiveObra?: boolean;
}

const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(value);

const formatDate = (value?: Timestamp) => {
  if (!value) return "Sem vencimento informado";
  return value.toDate().toLocaleDateString("pt-BR");
};

const statusConfig: Record<FinancialInstallmentStatus, { label: string; tone: string }> = {
  pendente: {
    label: "Pendente",
    tone: "bg-secondary/15 text-secondary-foreground",
  },
  comprovante_enviado: {
    label: "Em análise",
    tone: "bg-primary/10 text-primary",
  },
  pago: {
    label: "Pago",
    tone: "bg-success/15 text-success",
  },
  rejeitado: {
    label: "Rejeitada",
    tone: "bg-destructive/10 text-destructive",
  },
};

const FinancialSummaryCard = ({ obraId, hasActiveObra = false }: FinancialSummaryCardProps) => {
  const overviewQuery = useFinancialOverview(obraId);
  const overview = overviewQuery.data;
  const isLoading = hasActiveObra && overviewQuery.isLoading;
  const isError = hasActiveObra && overviewQuery.isError;
  const isEmpty = hasActiveObra && !isLoading && !isError && overview?.quantidadeParcelas === 0;
  const progressPercentage = overview?.valorTotalContrato
    ? Math.min((overview.valorPago / overview.valorTotalContrato) * 100, 100)
    : 0;
  const nextInstallment = overview?.proximaParcela;
  const nextInstallmentStatus = nextInstallment ? statusConfig[nextInstallment.status] : null;
  const isOverdue = Boolean(
    nextInstallment?.vencimento &&
    nextInstallment.status !== "pago" &&
    nextInstallment.vencimento.toDate().getTime() < Date.now(),
  );

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
        <div>
          <h3 className="font-semibold text-primary">Financeiro</h3>
          <p className="text-xs text-muted-foreground">Resumo da obra ativa</p>
        </div>
      </div>

      {!hasActiveObra ? (
        <div className="rounded-xl border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
          O financeiro será exibido automaticamente assim que houver uma obra ativa vinculada ao seu acesso.
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
          <Skeleton className="h-2.5 w-full rounded-full" />
          <Skeleton className="h-10 w-full sm:w-40" />
        </div>
      ) : isError ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-foreground">Não foi possível carregar o resumo financeiro.</p>
                <p>Tente novamente em instantes ou abra o financeiro completo.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => void overviewQuery.refetch()}>
              Tentar novamente
            </Button>
            <Button asChild className="font-semibold bg-secondary hover:bg-secondary/90 text-secondary-foreground">
              <Link to="/financas">
                Abrir financeiro
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      ) : isEmpty || !overview ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed bg-muted/30 p-4">
            <p className="font-medium text-foreground">Nenhuma parcela disponível no momento.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Assim que o financeiro da obra ativa tiver parcelas cadastradas, o resumo aparecerá aqui.
            </p>
          </div>
          <Button asChild className="w-full sm:w-auto font-semibold bg-secondary hover:bg-secondary/90 text-secondary-foreground">
            <Link to="/financas">
              Ver detalhes
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={cn(
            "flex items-center justify-between gap-3 rounded-lg p-3 lg:p-4",
            isOverdue ? "bg-destructive/10 border border-destructive/20" : "bg-muted",
          )}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {isOverdue ? <AlertCircle className="h-4 w-4 text-destructive" /> : <Clock3 className="h-4 w-4" />}
                <span>{isOverdue ? "Parcela vencida" : "Próxima parcela"}</span>
              </div>
              {nextInstallment ? (
                <>
                  <p className="mt-1 font-bold text-lg lg:text-xl text-foreground">{formatCurrency(nextInstallment.valor)}</p>
                  <p className="text-xs text-muted-foreground">Vencimento em {formatDate(nextInstallment.vencimento)}</p>
                </>
              ) : (
                <>
                  <p className="mt-1 font-bold text-lg lg:text-xl text-foreground">Sem parcelas pendentes</p>
                  <p className="text-xs text-muted-foreground">Todos os lançamentos atuais estão quitados.</p>
                </>
              )}
            </div>
            {nextInstallmentStatus ? (
              <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-semibold", nextInstallmentStatus.tone)}>
                {nextInstallmentStatus.label}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Em dia
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Valor total do contrato</p>
              <p className="mt-1 text-base font-semibold text-foreground">{formatCurrency(overview.valorTotalContrato)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Valor pago</p>
              <p className="mt-1 text-base font-semibold text-success">{formatCurrency(overview.valorPago)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Em aberto</p>
              <p className="mt-1 text-base font-semibold text-foreground">{formatCurrency(overview.valorEmAberto)}</p>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Execução financeira</span>
              <span className="font-semibold text-foreground">{Math.round(progressPercentage)}%</span>
            </div>
            <div className="h-2 lg:h-2.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-secondary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercentage}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Parcelas pagas</p>
                <p className="font-semibold text-foreground">{overview.quantidadePagas}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Parcelas pendentes</p>
                <p className="font-semibold text-foreground">{overview.quantidadePendentes}</p>
              </div>
            </div>
          </div>
          <Button asChild className="w-full sm:w-auto font-semibold bg-secondary hover:bg-secondary/90 text-secondary-foreground">
            <Link to="/financas">
              Ver detalhes
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      )}
    </motion.div>
  );
};

export default FinancialSummaryCard;
