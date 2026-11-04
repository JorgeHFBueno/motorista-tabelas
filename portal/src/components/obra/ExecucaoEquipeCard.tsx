import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ExecucaoEquipeConfirmacao, ExecucaoEquipeConfirmacoes } from "@/types/rbac";

// Team departure and arrival, confirmed by Ledur (adm2) in portal-obras.equipe; read-only for the client.
const formatDateTime = (confirmacao?: ExecucaoEquipeConfirmacao | null) => {
  const date = typeof confirmacao?.dataHora?.toDate === "function" ? confirmacao.dataHora.toDate() : null;
  return date ? date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;
};

const ConfirmationBox = ({ title, confirmacao }: { title: string; confirmacao?: ExecucaoEquipeConfirmacao | null }) => {
  const dataHora = formatDateTime(confirmacao);
  const isConfirmed = Boolean(dataHora);

  return (
    <div className={cn("rounded-xl border p-4 space-y-4", isConfirmed ? "bg-card" : "bg-muted/25")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{dataHora ?? "Pendente de confirmação"}</p>
        </div>
        <Badge variant={isConfirmed ? "default" : "outline"} className="gap-1">
          {isConfirmed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {isConfirmed ? "Confirmado" : "Pendente"}
        </Badge>
      </div>

      <div
        className={cn(
          "rounded-lg border bg-background/60 p-3 text-xs text-muted-foreground",
          !isConfirmed && "border-dashed",
        )}
      >
        {isConfirmed
          ? `Registrado por ${confirmacao?.confirmadoPor?.nome || "Equipe"}.`
          : "Ainda não há data e hora confirmadas."}
      </div>
    </div>
  );
};

const ExecucaoEquipeCard = ({ confirmacoes }: { confirmacoes?: ExecucaoEquipeConfirmacoes | null }) => (
  <section className="rounded-xl border bg-card p-4 space-y-4">
    <div>
      <h2 className="text-lg font-semibold text-foreground">Confirmação de time de execução</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Acompanhe os registros confirmados pela equipe administrativa.
      </p>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <ConfirmationBox title="Saída da equipe para a Obra" confirmacao={confirmacoes?.saida} />
      <ConfirmationBox title="Chegada da equipe na Obra" confirmacao={confirmacoes?.chegada} />
    </div>
  </section>
);

export default ExecucaoEquipeCard;
