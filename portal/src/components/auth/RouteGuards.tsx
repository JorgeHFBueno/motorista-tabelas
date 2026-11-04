import { Loader2 } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import AcessoAviso from "@/components/auth/AcessoAviso";
import { useAuth } from "@/contexts/AuthContext";
import { useObra } from "@/contexts/ObraContext";

const CenterLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Portal client: signed in, with an active users/{uid} and at least one contract of its CNPJ/CPF.
// Logins that are not clients see a notice; nothing is created by the portal itself.
export const ClientRoute = () => {
  const { user, userDoc, loading, authReady, userDocReady, error } = useAuth();
  const { contratos, isLoading: contratosLoading, error: contratosError } = useObra();
  const location = useLocation();

  if (loading || !authReady || !userDocReady) {
    return <CenterLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (error) {
    return <AcessoAviso titulo="Erro ao carregar acesso" descricao={error} />;
  }

  if (!userDoc) {
    return (
      <AcessoAviso
        titulo="Acesso não liberado"
        descricao="Este login ainda não tem acesso ao portal do cliente. Fale com a Ledur para liberar o seu acesso."
      />
    );
  }

  if (!userDoc.ativo) {
    return (
      <AcessoAviso
        titulo="Conta desativada"
        descricao="Seu acesso ao portal está desativado. Fale com a Ledur."
      />
    );
  }

  if (contratosLoading) {
    return <CenterLoader />;
  }

  if (contratosError) {
    return (
      <AcessoAviso
        titulo="Erro ao carregar seus contratos"
        descricao="Não foi possível carregar seus contratos agora. Tente novamente em instantes."
      />
    );
  }

  if (contratos.length === 0) {
    return (
      <AcessoAviso
        titulo="Nenhum contrato publicado"
        descricao="Ainda não há contrato seu publicado no portal. Assim que a Ledur publicar, ele aparece aqui."
      />
    );
  }

  return <Outlet />;
};
