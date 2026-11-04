import { useEffect, useMemo, useRef, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  FileText,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
  CheckCircle2,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ResponsiveLayout from "@/components/layout/ResponsiveLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveObraId } from "@/hooks/useActiveObraId";
import {
  useFinancialInstallmentsList,
  useFinancialOverview,
  useSubmitFinancialReceiptMutation,
} from "@/lib/financas/financas.queries";
import {
  FINANCIAL_RECEIPT_ACCEPTED_TYPES,
  canClientSubmitReceiptForStatus,
  validateFinancialReceiptFile,
} from "@/lib/financas/financas.service";
import type { FinancialInstallment, FinancialInstallmentStatus } from "@/lib/financas/financas.types";
import { cn } from "@/lib/utils";

const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(value);

const formatDate = (value?: Timestamp) => {
  if (!value) return "Sem vencimento informado";

  return value.toDate().toLocaleDateString("pt-BR");
};

const formatDateTime = (value?: Timestamp) => {
  if (!value) return "Ainda não enviado";
  return value.toDate().toLocaleString("pt-BR");
};

const statusConfig: Record<FinancialInstallmentStatus, {
  label: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
  pillClassName: string;
  icon: typeof TrendingUp;
}> = {
  pendente: {
    label: "Pendente",
    badgeVariant: "secondary",
    pillClassName: "bg-secondary text-secondary-foreground",
    icon: Clock3,
  },
  comprovante_enviado: {
    label: "Comprovante enviado",
    badgeVariant: "outline",
    pillClassName: "border border-primary/20 bg-primary/5 text-primary",
    icon: FileText,
  },
  pago: {
    label: "Pago",
    badgeVariant: "default",
    pillClassName: "bg-success/15 text-success",
    icon: TrendingUp,
  },
  rejeitado: {
    label: "Rejeitado",
    badgeVariant: "destructive",
    pillClassName: "bg-destructive/10 text-destructive",
    icon: AlertCircle,
  },
};

const getInstallmentTitle = (parcela: FinancialInstallment) => {
  const fallback = `Parcela ${parcela.numero}`;
  return parcela.descricao?.trim() ? `${parcela.numero}. ${parcela.descricao}` : fallback;
};

const getReceiptActionLabel = (parcela: FinancialInstallment) =>
  parcela.status === "rejeitado" ? "Reenviar comprovante" : "Enviar comprovante";

const FinancasLoading = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2 rounded-2xl shadow-card">
        <CardContent className="space-y-4 p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-4 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl shadow-card">
        <CardContent className="space-y-4 p-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>

    <Card className="rounded-2xl shadow-card">
      <CardContent className="space-y-4 p-4 lg:p-5">
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-4 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  </div>
);

const FinancasEmptyState = () => (
  <Card className="rounded-2xl border-dashed shadow-none">
    <CardHeader className="items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Wallet className="h-6 w-6 text-muted-foreground" />
      </div>
      <CardTitle>Nenhuma parcela cadastrada</CardTitle>
      <CardDescription>
        Ainda não há parcelas financeiras disponíveis para a obra ativa.
      </CardDescription>
    </CardHeader>
  </Card>
);

const FinancasNoObraState = () => (
  <Card className="rounded-2xl border-dashed shadow-none">
    <CardHeader className="items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <AlertCircle className="h-6 w-6 text-muted-foreground" />
      </div>
      <CardTitle>Nenhuma obra ativa</CardTitle>
      <CardDescription>
        Selecione ou vincule uma obra para visualizar o financeiro correspondente.
      </CardDescription>
    </CardHeader>
  </Card>
);

interface FinancasErrorStateProps {
  onRetry: () => void;
}

const FinancasErrorState = ({ onRetry }: FinancasErrorStateProps) => (
  <Card className="rounded-2xl border-destructive/20 shadow-none">
    <CardHeader className="items-center text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <CardTitle>Não foi possível carregar o financeiro</CardTitle>
      <CardDescription>
        Tente novamente em instantes. Se o problema persistir, confirme se sua obra possui parcelas cadastradas.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex justify-center">
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />
        Tentar novamente
      </Button>
    </CardContent>
  </Card>
);

const Financas = () => {
  const { activeObraId, hasClientObra } = useActiveObraId();
  const { user, userDoc } = useAuth();
  const { toast } = useToast();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string | null>(null);
  const [receiptDraftInstallmentId, setReceiptDraftInstallmentId] = useState<string | null>(null);
  const [receiptObservation, setReceiptObservation] = useState("");
  const [selectedReceiptFile, setSelectedReceiptFile] = useState<File | null>(null);

  const overviewQuery = useFinancialOverview(activeObraId ?? undefined);
  const installmentsQuery = useFinancialInstallmentsList(activeObraId ?? undefined);
  const submitReceiptMutation = useSubmitFinancialReceiptMutation(activeObraId ?? undefined);

  const parcelas = useMemo(() => installmentsQuery.data ?? [], [installmentsQuery.data]);
  const overview = overviewQuery.data;
  const isLoading = overviewQuery.isLoading || installmentsQuery.isLoading;
  const isFetching = overviewQuery.isFetching || installmentsQuery.isFetching;
  const isError = overviewQuery.isError || installmentsQuery.isError;

  const selectedInstallment = useMemo(
    () => parcelas.find((parcela) => parcela.id === selectedInstallmentId) ?? null,
    [parcelas, selectedInstallmentId],
  );

  const nextInstallment = useMemo(() => {
    if (!overview?.proximaParcela) return null;
    return parcelas.find((parcela) => parcela.id === overview.proximaParcela?.id) ?? null;
  }, [overview?.proximaParcela, parcelas]);

  const progressPercentage = useMemo(() => {
    if (!overview?.valorTotalContrato) return 0;
    return Math.min((overview.valorPago / overview.valorTotalContrato) * 100, 100);
  }, [overview?.valorPago, overview?.valorTotalContrato]);

  const selectedInstallmentCanUpload = selectedInstallment
    ? canClientSubmitReceiptForStatus(selectedInstallment.status)
    : false;
  const isUploadingReceipt = submitReceiptMutation.isPending;

  useEffect(() => {
    if (!selectedInstallment) {
      setReceiptDraftInstallmentId(null);
      setReceiptObservation("");
      setSelectedReceiptFile(null);
      if (receiptInputRef.current) receiptInputRef.current.value = "";
      return;
    }

    if (receiptDraftInstallmentId !== selectedInstallment.id) {
      setReceiptDraftInstallmentId(selectedInstallment.id);
      setReceiptObservation(selectedInstallment.status === "rejeitado" ? selectedInstallment.observacaoCliente ?? "" : "");
      setSelectedReceiptFile(null);
      if (receiptInputRef.current) receiptInputRef.current.value = "";
    }
  }, [receiptDraftInstallmentId, selectedInstallment]);

  const handleRetry = () => {
    void Promise.all([overviewQuery.refetch(), installmentsQuery.refetch()]);
  };

  const showNoObra = !hasClientObra || !activeObraId;
  const showEmpty = !isLoading && !isError && parcelas.length === 0;

  const openInstallmentDetail = (parcela: FinancialInstallment) => {
    setSelectedInstallmentId(parcela.id);
  };

  const openReceiptPicker = () => {
    if (!selectedInstallmentCanUpload) return;
    receiptInputRef.current?.click();
  };

  const handleReceiptFileSelection = (file?: File) => {
    if (!file) return;

    try {
      validateFinancialReceiptFile(file);
      setSelectedReceiptFile(file);
    } catch (error) {
      toast({
        title: "Arquivo inválido",
        description: error instanceof Error ? error.message : "Não foi possível validar o arquivo selecionado.",
        variant: "destructive",
      });
      if (receiptInputRef.current) receiptInputRef.current.value = "";
    }
  };

  const handleSubmitReceipt = async () => {
    if (!selectedInstallment || !activeObraId || !user) return;

    if (!selectedInstallmentCanUpload) {
      toast({
        title: "Envio indisponível",
        description: "Esta parcela não pode receber um novo comprovante neste momento.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedReceiptFile) {
      toast({
        title: "Comprovante obrigatório",
        description: "Selecione um arquivo PDF, JPG/JPEG ou PNG antes de enviar.",
        variant: "destructive",
      });
      return;
    }

    try {
      const updatedInstallment = await submitReceiptMutation.mutateAsync({
        parcelaId: selectedInstallment.id,
        file: selectedReceiptFile,
        observacaoCliente: receiptObservation.trim() || undefined,
        enviadoPor: {
          uid: user.uid,
          nome: userDoc?.nome || user.displayName || user.email || "Cliente",
        },
      });

      if (updatedInstallment) {
        setSelectedInstallmentId(updatedInstallment.id);
      }
      setReceiptObservation("");
      setSelectedReceiptFile(null);
      if (receiptInputRef.current) receiptInputRef.current.value = "";
      toast({
        title: "Comprovante enviado",
        description: "Recebemos seu comprovante e a parcela agora aguarda análise administrativa.",
      });
    } catch (error) {
      toast({
        title: "Erro ao enviar comprovante",
        description: error instanceof Error ? error.message : "O upload não pôde ser concluído.",
        variant: "destructive",
      });
    }
  };

  return (
    <ResponsiveLayout headerTitle="Finanças" headerSubtitle="Gestão financeira da obra">
      <div className="space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <input
          ref={receiptInputRef}
          type="file"
          className="hidden"
          accept={FINANCIAL_RECEIPT_ACCEPTED_TYPES.join(",")}
          onChange={(event) => handleReceiptFileSelection(event.target.files?.[0])}
        />

        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {showNoObra
            ? "Nenhuma obra ativa vinculada para consulta financeira."
            : isLoading
              ? "Carregando parcelas e resumo financeiro da obra..."
              : isError
                ? "Ocorreu um erro ao consultar os dados financeiros desta obra."
                : `Resumo atualizado para ${parcelas.length} parcela${parcelas.length === 1 ? "" : "s"}${isFetching ? " • atualizando dados..." : ""}`}
        </div>

        {showNoObra ? (
          <FinancasNoObraState />
        ) : isLoading ? (
          <FinancasLoading />
        ) : isError || !overview ? (
          <FinancasErrorState onRetry={handleRetry} />
        ) : showEmpty ? (
          <FinancasEmptyState />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl bg-card p-5 shadow-card lg:col-span-2 lg:p-6"
              >
                <div className="mb-4 flex items-center gap-2">
                  <div className="rounded-xl bg-primary p-2">
                    <Wallet className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="font-bold text-foreground">Finanças da obra</h2>
                    <p className="text-xs text-muted-foreground">Resumo financeiro real da obra ativa</p>
                  </div>
                </div>

                <p className="mb-4 text-3xl font-bold text-foreground lg:text-4xl">
                  {formatCurrency(overview.valorTotalContrato)}
                </p>

                <div className="mb-5 space-y-3">
                  <div>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="text-muted-foreground">Valor pago</span>
                      <span className="font-semibold text-success">{formatCurrency(overview.valorPago)}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-progress-bg lg:h-4">
                      <motion.div
                        className="h-full rounded-full bg-success"
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercentage}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm text-muted-foreground">Valor em aberto</span>
                    <span className="text-lg font-bold text-foreground">{formatCurrency(overview.valorEmAberto)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <div className="rounded-xl bg-muted p-3 lg:p-4">
                    <div className="mb-1 flex items-center gap-1 text-muted-foreground">
                      <CircleDollarSign className="h-4 w-4" />
                      <span className="text-xs font-medium">Parcelas</span>
                    </div>
                    <p className="text-xl font-bold text-foreground lg:text-2xl">{overview.quantidadeParcelas}</p>
                  </div>
                  <div className="rounded-xl bg-success/10 p-3 lg:p-4">
                    <div className="mb-1 flex items-center gap-1 text-success">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-xs font-medium">Pagas</span>
                    </div>
                    <p className="text-xl font-bold text-success lg:text-2xl">{overview.quantidadePagas}</p>
                  </div>
                  <div className="col-span-2 rounded-xl bg-secondary p-3 lg:col-span-1 lg:p-4">
                    <div className="mb-1 flex items-center gap-1 text-secondary-foreground/80">
                      <TrendingDown className="h-4 w-4" />
                      <span className="text-xs font-medium">Pendentes</span>
                    </div>
                    <p className="text-xl font-bold text-foreground lg:text-2xl">{overview.quantidadePendentes}</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-col rounded-2xl border border-accent/30 bg-accent/10 p-4 lg:justify-between lg:p-5"
              >
                {nextInstallment ? (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-accent p-2">
                        <AlertCircle className="h-5 w-5 text-accent-foreground" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">Próxima parcela</p>
                        <p className="text-lg font-bold text-foreground lg:text-xl">
                          {formatCurrency(nextInstallment.valor)}
                        </p>
                        <p className="text-xs text-muted-foreground">{getInstallmentTitle(nextInstallment)}</p>
                        <p className="text-xs text-muted-foreground">Vencimento em {formatDate(nextInstallment.vencimento)}</p>
                        <Badge variant={statusConfig[nextInstallment.status].badgeVariant} className="w-fit">
                          {statusConfig[nextInstallment.status].label}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                      {nextInstallment.boletoUrl ? (
                        <Button asChild className="w-full">
                          <a href={nextInstallment.boletoUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Ver boleto
                          </a>
                        </Button>
                      ) : (
                        <Button variant="secondary" className="w-full" disabled>
                          Boleto indisponível
                        </Button>
                      )}

                      <Button variant="outline" className="w-full" onClick={() => openInstallmentDetail(nextInstallment)}>
                        Ver detalhes
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="mb-3 rounded-full bg-background/80 p-3">
                      <Wallet className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground">Nenhuma próxima parcela</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Não há parcelas em aberto no momento para esta obra.
                    </p>
                  </div>
                )}
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="overflow-hidden rounded-2xl bg-card shadow-card"
            >
              <div className="border-b border-border p-4 lg:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Parcelas</h3>
                    <p className="text-sm text-muted-foreground">Histórico real das parcelas vinculadas à obra ativa.</p>
                  </div>
                  <Badge variant="outline">{overview.quantidadeParcelas} itens</Badge>
                </div>
              </div>

              <div className="divide-y divide-border">
                {parcelas.map((parcela, index) => {
                  const meta = statusConfig[parcela.status];
                  const StatusIcon = meta.icon;
                  const canUploadReceipt = canClientSubmitReceiptForStatus(parcela.status);

                  return (
                    <motion.button
                      key={parcela.id}
                      type="button"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + index * 0.04 }}
                      className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/50 lg:p-5"
                      onClick={() => openInstallmentDetail(parcela)}
                    >
                      <div className="flex min-w-0 items-center gap-3 lg:gap-4">
                        <div className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold lg:h-12 lg:w-12 lg:text-base",
                          meta.pillClassName,
                        )}>
                          {parcela.numero}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground lg:text-lg">{getInstallmentTitle(parcela)}</p>
                          <p className="text-sm text-muted-foreground">{formatCurrency(parcela.valor)}</p>
                          <p className="text-xs text-muted-foreground">Vencimento: {formatDate(parcela.vencimento)}</p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 lg:gap-3">
                        <div className="hidden items-center gap-2 md:flex">
                          <Badge variant={meta.badgeVariant} className="gap-1">
                            <StatusIcon className="h-3.5 w-3.5" />
                            {meta.label}
                          </Badge>
                          {parcela.boletoUrl ? <Badge variant="outline">Boleto</Badge> : null}
                          {parcela.comprovanteUrl ? <Badge variant="outline">Comprovante</Badge> : null}
                          {canUploadReceipt ? <Badge variant="outline">Enviar comprovante</Badge> : null}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}

        <Dialog open={Boolean(selectedInstallment)} onOpenChange={(open) => !open && setSelectedInstallmentId(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedInstallment ? getInstallmentTitle(selectedInstallment) : "Detalhe da parcela"}</DialogTitle>
            </DialogHeader>

            {selectedInstallment ? (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor</p>
                    <p className="mt-1 font-semibold text-foreground">{formatCurrency(selectedInstallment.valor)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Vencimento</p>
                    <p className="mt-1 font-semibold text-foreground">{formatDate(selectedInstallment.vencimento)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusConfig[selectedInstallment.status].badgeVariant}>
                    {statusConfig[selectedInstallment.status].label}
                  </Badge>
                  {selectedInstallment.comprovanteUrl ? <Badge variant="outline">Comprovante enviado</Badge> : null}
                </div>

                {(selectedInstallment.observacaoAdmin || selectedInstallment.observacaoCliente) && (
                  <div className="space-y-2 rounded-xl border p-3">
                    {selectedInstallment.observacaoAdmin ? (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Observação administrativa</p>
                        <p className="mt-1 text-foreground">{selectedInstallment.observacaoAdmin}</p>
                      </div>
                    ) : null}
                    {selectedInstallment.observacaoCliente ? (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Observação do cliente</p>
                        <p className="mt-1 text-foreground">{selectedInstallment.observacaoCliente}</p>
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-dashed p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Boleto</p>
                    <p className="mt-1 text-muted-foreground">
                      {selectedInstallment.boletoUrl
                        ? "O boleto desta parcela está disponível para consulta."
                        : "Esta parcela ainda não possui boleto anexado."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-dashed p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Comprovante</p>
                    <p className="mt-1 text-muted-foreground">
                      {selectedInstallment.comprovanteUrl
                        ? `Enviado em ${formatDateTime(selectedInstallment.comprovanteEnviadoEm)}.`
                        : "Nenhum comprovante foi enviado ainda para esta parcela."}
                    </p>
                    {selectedInstallment.comprovanteEnviadoPor?.nome ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Por {selectedInstallment.comprovanteEnviadoPor.nome}
                      </p>
                    ) : null}
                  </div>
                </div>

                {selectedInstallment.comprovanteUrl ? (
                  <div className="flex items-center justify-between rounded-xl border bg-primary/5 p-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                      <div>
                        <p className="font-medium text-foreground">Comprovante já enviado</p>
                        <p className="text-xs text-muted-foreground">
                          A parcela permanece em análise até aprovação ou rejeição administrativa.
                        </p>
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <a href={selectedInstallment.comprovanteUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        Abrir comprovante
                      </a>
                    </Button>
                  </div>
                ) : null}

                {selectedInstallmentCanUpload ? (
                  <div className="space-y-3 rounded-xl border p-4">
                    <div>
                      <p className="font-medium text-foreground">{getReceiptActionLabel(selectedInstallment)}</p>
                      <p className="text-xs text-muted-foreground">
                        Envie um arquivo em PDF, JPG/JPEG ou PNG. O status será atualizado para comprovante enviado e continuará pendente de validação administrativa.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="observacao-cliente">Observação do cliente</Label>
                      <Textarea
                        id="observacao-cliente"
                        placeholder="Opcional: informe banco, data do pagamento ou outro contexto relevante."
                        value={receiptObservation}
                        onChange={(event) => setReceiptObservation(event.target.value)}
                        disabled={isUploadingReceipt}
                      />
                    </div>

                    <div className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {selectedReceiptFile ? selectedReceiptFile.name : "Nenhum comprovante selecionado"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Tipos aceitos: PDF, JPG/JPEG e PNG.
                        </p>
                      </div>
                      <Button type="button" variant="outline" onClick={openReceiptPicker} disabled={isUploadingReceipt}>
                        <UploadCloud className="h-4 w-4" />
                        Selecionar arquivo
                      </Button>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button type="button" onClick={() => void handleSubmitReceipt()} disabled={isUploadingReceipt || !selectedReceiptFile}>
                        {isUploadingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                        {isUploadingReceipt ? "Enviando..." : getReceiptActionLabel(selectedInstallment)}
                      </Button>
                    </div>
                  </div>
                ) : selectedInstallment.status === "comprovante_enviado" ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
                    Um comprovante já foi enviado e está aguardando análise administrativa. Nesta etapa, o cliente não pode substituir livremente esse arquivo.
                  </div>
                ) : selectedInstallment.status === "pago" ? (
                  <div className="rounded-xl border border-success/20 bg-success/10 p-4 text-sm text-success">
                    Parcela já confirmada como paga pela administração. Nenhum novo comprovante é necessário.
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  {selectedInstallment.boletoUrl ? (
                    <Button asChild>
                      <a href={selectedInstallment.boletoUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        Abrir boleto
                      </a>
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => setSelectedInstallmentId(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </ResponsiveLayout>
  );
};

export default Financas;
