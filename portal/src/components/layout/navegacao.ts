import { useMemo } from "react";
import { Building2, Camera, FileText, House, LifeBuoy, Newspaper, Wallet, type LucideIcon } from "lucide-react";
import { useObra } from "@/contexts/ObraContext";
import { useNotifications } from "@/hooks/useNotifications";

// The portal screens, in order. One list for the tabs (computer) and the bottom bar (phone and tablet).
export interface TelaPortal {
  path: string;
  label: string;
  // Name in the bottom bar, where there is less room.
  curto: string;
  icon: LucideIcon;
}

export const TELAS_PORTAL: TelaPortal[] = [
  { path: "/", label: "Início", curto: "Início", icon: House },
  { path: "/obra", label: "Obra", curto: "Obra", icon: Building2 },
  { path: "/financas", label: "Finanças", curto: "Finanças", icon: Wallet },
  { path: "/documentos", label: "Documentos", curto: "Docs", icon: FileText },
  { path: "/fotos", label: "Fotos", curto: "Fotos", icon: Camera },
  { path: "/atendimento", label: "Suporte", curto: "Suporte", icon: LifeBuoy },
  { path: "/noticias", label: "Notícias", curto: "Notícias", icon: Newspaper },
];

// Screens with an unread notice of the active contract (the notice's own route), for the orange dot.
export const useTelasComNovidade = (): Set<string> => {
  const { notifications } = useNotifications();
  const { obraAtiva } = useObra();

  return useMemo(
    () =>
      new Set(
        notifications
          .filter((aviso) => !aviso.lida && (!aviso.obraId || aviso.obraId === obraAtiva?.id))
          .map((aviso) => aviso.metadata?.rotaDestino)
          .filter((rota): rota is string => typeof rota === "string" && rota !== "/"),
      ),
    [notifications, obraAtiva?.id],
  );
};
