import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { salvarConfirmacaoExecucaoEquipe } from "@/services/obras/execucaoEquipeService";
import type {
  ExecucaoEquipeConfirmacao,
  ExecucaoEquipeConfirmacoes,
  ExecucaoEquipeTipo,
} from "@/types/rbac";

interface ExecucaoEquipeCardProps {
  mode: "admin" | "client";
  obraId?: string;
  confirmacoes?: ExecucaoEquipeConfirmacoes | null;
  actor?: {
    uid: string;
    nome: string;
  };
}

const formatDateTime = (value?: { toDate?: () => Date; seconds?: number } | null) => {
  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  return "Ainda nao confirmado";
};

const toInputDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const toInputTime = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const getSavedDate = (confirmacao?: ExecucaoEquipeConfirmacao | null) => {
  if (typeof confirmacao?.dataHora?.toDate === "function") {
    return confirmacao.dataHora.toDate();
  }
  const seconds = (confirmacao?.dataHora as unknown as { seconds?: number })?.seconds;
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
};

const buildDateTime = (dateValue: string, timeValue: string) => {
  if (!dateValue || !timeValue) return null;
  const nextDate = new Date(`${dateValue}T${timeValue}:00`);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
};

const ConfirmationBox = ({
  tipo,
  title,
  confirmacao,
  mode,
  obraId,
  actor,
}: {
  tipo: ExecucaoEquipeTipo;
  title: string;
  confirmacao?: ExecucaoEquipeConfirmacao | null;
  mode: "admin" | "client";
  obraId?: string;
  actor?: { uid: string; nome: string };
}) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const savedDate = useMemo(() => getSavedDate(confirmacao), [confirmacao]);
  const isConfirmed = Boolean(confirmacao?.confirmado && savedDate);
  const [dateValue, setDateValue] = useState("");
  const [timeValue, setTimeValue] = useState("");

  useEffect(() => {
    const baseDate = savedDate ?? new Date();
    setDateValue(toInputDate(baseDate));
    setTimeValue(toInputTime(baseDate));
  }, [savedDate]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!obraId || !actor) throw new Error("Dados da obra indisponiveis.");
      const dataHora = buildDateTime(dateValue, timeValue);
      if (!dataHora) throw new Error("Informe uma data e hora validas.");
      await salvarConfirmacaoExecucaoEquipe({ obraId, tipo, dataHora, actor });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["obra", obraId] });
      toast({
        title: isConfirmed ? "Confirmacao atualizada" : "Confirmacao registrada",
        description:
          tipo === "saida"
            ? "Saida da equipe salva com sucesso."
            : "Chegada da equipe salva com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Falha ao salvar confirmacao",
        description:
          error instanceof Error ? error.message : "Nao foi possivel salvar agora.",
        variant: "destructive",
      });
    },
  });

  const useCurrentDateTime = () => {
    const now = new Date();
    setDateValue(toInputDate(now));
    setTimeValue(toInputTime(now));
  };

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-4",
        isConfirmed ? "bg-card" : "bg-muted/25",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {isConfirmed ? formatDateTime(confirmacao?.dataHora) : "Pendente de confirmacao"}
          </p>
        </div>
        <Badge variant={isConfirmed ? "default" : "outline"} className="gap-1">
          {isConfirmed ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {isConfirmed ? "Confirmado" : "Pendente"}
        </Badge>
      </div>

      {isConfirmed ? (
        <div className="rounded-lg border bg-background/60 p-3 text-xs text-muted-foreground">
          Registrado por {confirmacao?.confirmadoPorNome || "Equipe"}.
          {mode === "admin" ? " Salvar novamente sobrescreve esta informacao." : ""}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-background/60 p-3 text-xs text-muted-foreground">
          Ainda nao ha data e hora confirmadas.
        </div>
      )}

      {mode === "admin" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`execucao-${tipo}-data`}>Data</Label>
              <Input
                id={`execucao-${tipo}-data`}
                type="date"
                value={dateValue}
                onChange={(event) => setDateValue(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`execucao-${tipo}-hora`}>Hora</Label>
              <Input
                id={`execucao-${tipo}-hora`}
                type="time"
                value={timeValue}
                onChange={(event) => setTimeValue(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={useCurrentDateTime}>
              <Clock className="mr-2 h-4 w-4" /> Usar agora
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isConfirmed ? "Atualizar confirmacao" : "Confirmar"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const ExecucaoEquipeCard = ({
  mode,
  obraId,
  confirmacoes,
  actor,
}: ExecucaoEquipeCardProps) => {
  const labels =
    mode === "admin"
      ? { saida: "Saida da equipe", chegada: "Chegada da equipe" }
      : {
          saida: "Saida da equipe para a Obra",
          chegada: "Chegada da equipe na Obra",
        };

  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Confirmacao de time de execucao
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "admin"
            ? "Registre a saida e a chegada da equipe de execucao."
            : "Acompanhe os registros confirmados pela equipe administrativa."}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ConfirmationBox
          tipo="saida"
          title={labels.saida}
          confirmacao={confirmacoes?.saida}
          mode={mode}
          obraId={obraId}
          actor={actor}
        />
        <ConfirmationBox
          tipo="chegada"
          title={labels.chegada}
          confirmacao={confirmacoes?.chegada}
          mode={mode}
          obraId={obraId}
          actor={actor}
        />
      </div>
    </section>
  );
};

export default ExecucaoEquipeCard;
