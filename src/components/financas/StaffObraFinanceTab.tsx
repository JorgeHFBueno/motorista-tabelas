import { useEffect, useMemo, useRef, useState } from "react";
import { Timestamp } from "firebase/firestore";
import {
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useObra } from "@/hooks/useAppQueries";
import {
  financasKeys,
  useFinancialInstallmentsList,
  useFinancialOverview,
} from "@/lib/financas/financas.queries";
import {
  createFinancialInstallment,
  deleteFinancialInstallment,
  updateFinancialContractValue,
  updateFinancialInstallment,
  uploadFinancialBoletoFile,
} from "@/lib/financas/financas.service";
import {
  FINANCIAL_INSTALLMENT_STATUSES,
  type FinancialInstallment,
  type FinancialInstallmentStatus,
} from "@/lib/financas/financas.types";
import { cn } from "@/lib/utils";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const formatDate = (value?: Timestamp) => {
  if (!value) return "Sem vencimento";
  return value.toDate().toLocaleDateString("pt-BR");
};

const toDateInput = (value?: Timestamp) => {
  if (!value) return "";
  return value.toDate().toISOString().slice(0, 10);
};

const toTimestampFromDateInput = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return null;
  return Timestamp.fromDate(new Date(`${normalized}T12:00:00`));
};

const parseCurrencyInput = (value: string) => {
  const normalized = value
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Erro inesperado.";

const statusMeta: Record<
  FinancialInstallmentStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  pendente: { label: "Pendente", variant: "secondary" },
  comprovante_enviado: { label: "Comprovante enviado", variant: "outline" },
  pago: { label: "Pago", variant: "default" },
  rejeitado: { label: "Rejeitado", variant: "destructive" },
};

interface InstallmentFormState {
  numero: string;
  descricao: string;
  valor: string;
  vencimento: string;
  status: FinancialInstallmentStatus;
  observacaoAdmin: string;
}

const EMPTY_FORM: InstallmentFormState = {
  numero: "",
  descricao: "",
  valor: "",
  vencimento: "",
  status: "pendente",
  observacaoAdmin: "",
};

interface StaffObraFinanceTabProps {
  obraId: string;
}

const StaffObraFinanceTab = ({ obraId }: StaffObraFinanceTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const boletoInputRef = useRef<HTMLInputElement>(null);
  const { data: obra } = useObra(obraId);
  const {
    data: overview,
    isLoading: isLoadingOverview,
    isError: isOverviewError,
  } = useFinancialOverview(obraId);
  const {
    data: parcelas = [],
    isLoading: isLoadingParcelas,
    isError: isParcelasError,
  } = useFinancialInstallmentsList(obraId);

  const [contractValueInput, setContractValueInput] = useState("");
  const [editingParcelaId, setEditingParcelaId] = useState<string | null>(null);
  const [form, setForm] = useState<InstallmentFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedBoletoParcelaId, setSelectedBoletoParcelaId] = useState<
    string | null
  >(null);
  const [isSavingContract, setIsSavingContract] = useState(false);
  const [isSavingInstallment, setIsSavingInstallment] = useState(false);
  const [deletingParcelaId, setDeletingParcelaId] = useState<string | null>(
    null,
  );
  const [uploadingParcelaId, setUploadingParcelaId] = useState<string | null>(
    null,
  );

  const valorTotalContratoAtual = useMemo(() => {
    const obraValue =
      typeof obra?.valorTotalContrato === "number" &&
      Number.isFinite(obra.valorTotalContrato)
        ? obra.valorTotalContrato
        : null;
    return obraValue ?? overview?.valorTotalContrato ?? 0;
  }, [obra?.valorTotalContrato, overview?.valorTotalContrato]);

  useEffect(() => {
    setContractValueInput(String(valorTotalContratoAtual ?? ""));
  }, [valorTotalContratoAtual]);

  const resetForm = () => {
    setEditingParcelaId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const startEditing = (parcela: FinancialInstallment) => {
    setEditingParcelaId(parcela.id);
    setForm({
      numero: String(parcela.numero || ""),
      descricao: parcela.descricao || "",
      valor: String(parcela.valor || ""),
      vencimento: toDateInput(parcela.vencimento),
      status: parcela.status,
      observacaoAdmin: parcela.observacaoAdmin || "",
    });
    setFormError(null);
  };

  const refreshFinancas = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: financasKeys.list(obraId) }),
      queryClient.invalidateQueries({
        queryKey: financasKeys.overview(obraId),
      }),
      queryClient.invalidateQueries({ queryKey: ["obra", obraId] }),
    ]);
  };

  const validateForm = () => {
    const numero = Number(form.numero);
    const valor = parseCurrencyInput(form.valor);

    if (!Number.isInteger(numero) || numero <= 0)
      return "Informe um número de parcela válido.";
    if (!form.descricao.trim()) return "Informe a descrição da parcela.";
    if (!Number.isFinite(valor) || valor <= 0)
      return "Informe um valor válido para a parcela.";
    if (!form.vencimento.trim()) return "Informe a data de vencimento.";
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      toast({
        title: "Formulário inválido",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    setFormError(null);
    setIsSavingInstallment(true);
    try {
      const payload = {
        numero: Number(form.numero),
        descricao: form.descricao.trim(),
        valor: parseCurrencyInput(form.valor),
        vencimento: toTimestampFromDateInput(form.vencimento),
        status: form.status,
        observacaoAdmin: form.observacaoAdmin.trim() || null,
      };

      if (editingParcelaId) {
        await updateFinancialInstallment(editingParcelaId, payload);
        toast({ title: "Parcela atualizada" });
      } else {
        await createFinancialInstallment({ obraId, ...payload });
        toast({ title: "Parcela criada" });
      }

      await refreshFinancas();
      resetForm();
    } catch (error) {
      toast({
        title: "Erro ao salvar parcela",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSavingInstallment(false);
    }
  };

  const handleDelete = async (parcelaId: string) => {
    const confirmed = window.confirm(
      "Excluir esta parcela financeira? Esta ação removerá o registro e o boleto vinculado continuará no Storage até limpeza manual.",
    );
    if (!confirmed) return;

    setDeletingParcelaId(parcelaId);
    try {
      await deleteFinancialInstallment(parcelaId);
      await refreshFinancas();
      if (editingParcelaId === parcelaId) resetForm();
      toast({ title: "Parcela excluída" });
    } catch (error) {
      toast({
        title: "Erro ao excluir parcela",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setDeletingParcelaId(null);
    }
  };

  const handleContractSave = async () => {
    const parsed = parseCurrencyInput(contractValueInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast({
        title: "Valor inválido",
        description: "Informe um valor total de contrato válido.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingContract(true);
    try {
      await updateFinancialContractValue(obraId, parsed);
      await refreshFinancas();
      toast({ title: "Contrato atualizado" });
    } catch (error) {
      toast({
        title: "Erro ao atualizar contrato",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSavingContract(false);
    }
  };

  const openBoletoPicker = (parcelaId: string) => {
    setSelectedBoletoParcelaId(parcelaId);
    boletoInputRef.current?.click();
  };

  const handleBoletoFile = async (file?: File) => {
    if (!file || !selectedBoletoParcelaId) return;

    const parcela = parcelas.find(
      (item) => item.id === selectedBoletoParcelaId,
    );
    if (!parcela) {
      toast({ title: "Parcela não encontrada", variant: "destructive" });
      return;
    }

    setUploadingParcelaId(parcela.id);
    try {
      await uploadFinancialBoletoFile({ obraId, parcelaId: parcela.id, file });
      await refreshFinancas();
      toast({
        title: "Boleto vinculado",
        description: "O arquivo foi enviado e associado à parcela.",
      });
    } catch (error) {
      toast({
        title: "Erro ao enviar boleto",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setUploadingParcelaId(null);
      setSelectedBoletoParcelaId(null);
      if (boletoInputRef.current) boletoInputRef.current.value = "";
    }
  };

  const cards = [
    {
      label: "Contrato",
      value: formatCurrency(
        overview?.valorTotalContrato ?? valorTotalContratoAtual,
      ),
      helper: "Valor total da obra",
    },
    {
      label: "Pago",
      value: formatCurrency(overview?.valorPago ?? 0),
      helper: `${overview?.quantidadePagas ?? 0} parcelas pagas`,
    },
    {
      label: "Em aberto",
      value: formatCurrency(overview?.valorEmAberto ?? 0),
      helper: `${overview?.quantidadePendentes ?? 0} parcelas pendentes`,
    },
    {
      label: "Parcelas",
      value: String(overview?.quantidadeParcelas ?? parcelas.length),
      helper: "Cadastros financeiros vinculados",
    },
  ];

  return (
    <div className="space-y-4">
      <input
        ref={boletoInputRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        onChange={(event) => void handleBoletoFile(event.target.files?.[0])}
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>Overview financeiro</CardTitle>
            <CardDescription>
              Resumo calculado pela camada financeira da obra selecionada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingOverview || isLoadingParcelas ? (
              <p className="text-sm text-muted-foreground">
                Carregando resumo financeiro...
              </p>
            ) : null}
            {isOverviewError || isParcelasError ? (
              <p className="text-sm text-destructive">
                Não foi possível carregar os dados financeiros.
              </p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              {cards.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border bg-muted/30 p-4"
                >
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {item.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.helper}
                  </p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-dashed p-4 text-sm">
              <p className="font-medium">Próxima parcela</p>
              {overview?.proximaParcela ? (
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <p>
                    {overview.proximaParcela.numero}.{" "}
                    {overview.proximaParcela.descricao}
                  </p>
                  <p>
                    {formatCurrency(overview.proximaParcela.valor)} • vence em{" "}
                    {formatDate(overview.proximaParcela.vencimento)}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-muted-foreground">
                  Não há parcelas pendentes no momento.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>Contrato da obra</CardTitle>
            <CardDescription>
              Edite o valor total do contrato diretamente no documento da obra.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="valor-total-contrato">
                Valor total do contrato
              </Label>
              <Input
                id="valor-total-contrato"
                inputMode="decimal"
                value={contractValueInput}
                onChange={(event) => setContractValueInput(event.target.value)}
                placeholder="Ex.: 150000,00"
              />
            </div>
            <Button
              onClick={() => void handleContractSave()}
              disabled={isSavingContract}
            >
              {isSavingContract && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar valor do contrato
            </Button>
            <p className="text-xs text-muted-foreground">
              Quando este campo não estiver preenchido, o overview usa a soma
              das parcelas como fallback.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>
              {editingParcelaId ? "Editar parcela" : "Nova parcela"}
            </CardTitle>
            <CardDescription>
              O obraId é resolvido pelo contexto da obra atual:{" "}
              <span className="font-mono">{obraId}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="parcela-numero">Número</Label>
                <Input
                  id="parcela-numero"
                  type="number"
                  min="1"
                  value={form.numero}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      numero: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parcela-vencimento">Vencimento</Label>
                <Input
                  id="parcela-vencimento"
                  type="date"
                  value={form.vencimento}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      vencimento: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="parcela-descricao">Descrição</Label>
              <Input
                id="parcela-descricao"
                value={form.descricao}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    descricao: event.target.value,
                  }))
                }
                placeholder="Ex.: Entrada, parcela intermediária, medição final"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="parcela-valor">Valor</Label>
                <Input
                  id="parcela-valor"
                  inputMode="decimal"
                  value={form.valor}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      valor: event.target.value,
                    }))
                  }
                  placeholder="Ex.: 25000,00"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      status: value as FinancialInstallmentStatus,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    {FINANCIAL_INSTALLMENT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusMeta[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="parcela-observacao-admin">
                Observação administrativa
              </Label>
              <Textarea
                id="parcela-observacao-admin"
                value={form.observacaoAdmin}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    observacaoAdmin: event.target.value,
                  }))
                }
                placeholder="Detalhes internos da cobrança, instruções ou histórico."
                rows={5}
              />
            </div>
            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handleSubmit()}
                disabled={isSavingInstallment}
              >
                {isSavingInstallment ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : editingParcelaId ? (
                  <Save className="mr-2 h-4 w-4" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                {editingParcelaId ? "Salvar alterações" : "Cadastrar parcela"}
              </Button>
              {editingParcelaId ? (
                <Button
                  variant="outline"
                  onClick={resetForm}
                  disabled={isSavingInstallment}
                >
                  Cancelar edição
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>Parcelas cadastradas</CardTitle>
            <CardDescription>
              Lista administrativa com manutenção de boleto por parcela.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingParcelas ? (
              <p className="text-sm text-muted-foreground">
                Carregando parcelas...
              </p>
            ) : null}
            {!isLoadingParcelas && parcelas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma parcela cadastrada para esta obra.
              </p>
            ) : null}
            {parcelas.map((parcela) => {
              const boletoDisponivel = parcela.boletoUrl || parcela.boleto?.url;
              const isEditingCurrent = editingParcelaId === parcela.id;
              const isDeletingCurrent = deletingParcelaId === parcela.id;
              const isUploadingCurrent = uploadingParcelaId === parcela.id;

              return (
                <div
                  key={parcela.id}
                  className={cn(
                    "rounded-xl border p-4",
                    isEditingCurrent && "border-primary bg-primary/5",
                  )}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">
                          Parcela {parcela.numero} • {parcela.descricao}
                        </p>
                        <Badge variant={statusMeta[parcela.status].variant}>
                          {statusMeta[parcela.status].label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(parcela.valor)} • Vencimento:{" "}
                        {formatDate(parcela.vencimento)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        obraId: {parcela.obraId}
                      </p>
                      {parcela.observacaoAdmin ? (
                        <p className="text-sm text-muted-foreground">
                          {parcela.observacaoAdmin}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditing(parcela)}
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openBoletoPicker(parcela.id)}
                          disabled={isUploadingCurrent}
                        >
                          {isUploadingCurrent ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <UploadCloud className="mr-2 h-4 w-4" />
                          )}
                          {boletoDisponivel
                            ? "Substituir boleto"
                            : "Anexar boleto"}
                        </Button>
                        {boletoDisponivel ? (
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={String(boletoDisponivel)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ExternalLink className="mr-2 h-4 w-4" /> Abrir
                              boleto
                            </a>
                          </Button>
                        ) : null}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void handleDelete(parcela.id)}
                          disabled={isDeletingCurrent}
                        >
                          {isDeletingCurrent ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Excluir
                        </Button>
                      </div>
                    </div>

                    <div className="min-w-[200px] rounded-lg border bg-muted/20 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <FileText className="h-4 w-4" /> Boleto
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        {boletoDisponivel
                          ? "Arquivo vinculado à parcela."
                          : "Nenhum boleto enviado ainda."}
                      </p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {parcela.boletoPath ||
                          parcela.boleto?.path ||
                          "Sem path registrado."}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StaffObraFinanceTab;