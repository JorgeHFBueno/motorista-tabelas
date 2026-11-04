import { useAuth } from "@/contexts/AuthContext";
import { useObra } from "@/contexts/ObraContext";

// Active contract of the client (chosen in the header; the first one by default).
export const useActiveObraId = () => {
  const { loading, authReady, userDocReady } = useAuth();
  const { obraAtiva, isLoading } = useObra();

  const isResolvingAuth = loading || !authReady;
  const isResolvingUserDoc = !userDocReady;
  const isResolvingClientObra = isLoading;

  return {
    activeObraId: obraAtiva?.id ?? null,
    activeObra: obraAtiva,
    hasClientObra: Boolean(obraAtiva),
    isResolvingAuth,
    isResolvingUserDoc,
    isResolvingClientObra,
    isReady: !isResolvingAuth && !isResolvingUserDoc && !isResolvingClientObra,
  };
};
