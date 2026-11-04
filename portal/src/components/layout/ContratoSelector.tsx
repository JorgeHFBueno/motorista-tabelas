import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useObra } from "@/contexts/ObraContext";
import { cn } from "@/lib/utils";

// Active contract of the client. With a single contract it is just a label.
const ContratoSelector = ({ className, nameClassName }: { className?: string; nameClassName?: string }) => {
  const { contratos, obraAtiva, setObraAtivaId } = useObra();
  const nome = obraAtiva?.nome ?? "Nenhuma obra selecionada";

  if (contratos.length <= 1) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className={cn("truncate font-medium text-sm", nameClassName)}>{nome}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn("flex items-center gap-2", className)} aria-label="Trocar de obra">
          <span className={cn("truncate font-medium text-sm", nameClassName)}>{nome}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[320px]">
        <DropdownMenuLabel>Suas obras</DropdownMenuLabel>
        {contratos.map((contrato) => (
          <DropdownMenuItem key={contrato.id} onClick={() => setObraAtivaId(contrato.id)} className="gap-2">
            <Check className={cn("h-4 w-4", contrato.id === obraAtiva?.id ? "opacity-100" : "opacity-0")} />
            <span className="truncate">{contrato.nome}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ContratoSelector;
