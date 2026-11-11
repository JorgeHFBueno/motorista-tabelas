import type { ReactNode } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

// One card of the Início: an area of the portal with a summary; the whole card opens that screen.
export type TomCartao = "azul" | "laranja" | "marinho" | "verde" | "roxo" | "cinza";

const TONS: Record<TomCartao, { borda: string; icone: string }> = {
  azul: { borda: "border-t-secondary", icone: "bg-secondary/10 text-secondary" },
  laranja: { borda: "border-t-orange-500", icone: "bg-orange-500/10 text-orange-600" },
  marinho: { borda: "border-t-primary", icone: "bg-primary/10 text-primary" },
  verde: { borda: "border-t-success", icone: "bg-success/10 text-success" },
  roxo: { borda: "border-t-violet-500", icone: "bg-violet-500/10 text-violet-600" },
  cinza: { borda: "border-t-slate-500", icone: "bg-slate-500/10 text-slate-600" },
};

export type TomEtiqueta = "laranja" | "azul" | "verde" | "vermelho";

const ETIQUETAS: Record<TomEtiqueta, string> = {
  laranja: "bg-orange-50 text-orange-700",
  azul: "bg-secondary/10 text-secondary",
  verde: "bg-success/10 text-success",
  vermelho: "bg-destructive/10 text-destructive",
};

export const Etiqueta = ({ tom, children }: { tom: TomEtiqueta; children: ReactNode }) => (
  <span className={cn("ml-auto shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", ETIQUETAS[tom])}>{children}</span>
);

interface CartaoInicioProps {
  para: string;
  tom: TomCartao;
  icone: LucideIcon;
  titulo: string;
  subtitulo?: ReactNode;
  etiqueta?: ReactNode;
  rodape: string;
  className?: string;
  children: ReactNode;
}

const CartaoInicio = ({ para, tom, icone: Icone, titulo, subtitulo, etiqueta, rodape, className, children }: CartaoInicioProps) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(para)}
      className={cn(
        "flex h-full w-full flex-col gap-3 rounded-2xl border border-t-4 bg-card p-4 text-left transition-all hover:-translate-y-px hover:shadow-lg lg:p-5",
        TONS[tom].borda,
        className,
      )}
    >
      <div className="flex w-full items-center gap-3">
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", TONS[tom].icone)}>
          <Icone className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-primary">{titulo}</h3>
          {subtitulo ? <p className="truncate text-xs text-muted-foreground">{subtitulo}</p> : null}
        </div>
        {etiqueta}
      </div>
      <div className="w-full flex-1 space-y-3">{children}</div>
      <div className="flex w-full items-center justify-between border-t pt-3 text-sm font-semibold text-secondary">
        <span>{rodape}</span>
        <ArrowRight className="h-4 w-4" />
      </div>
    </button>
  );
};

export default CartaoInicio;
