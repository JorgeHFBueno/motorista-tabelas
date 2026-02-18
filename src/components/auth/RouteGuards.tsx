import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const CenterLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const InfoScreen = ({
  title,
  description,
  onLogout,
}: {
  title: string;
  description: string;
  onLogout: () => Promise<void>;
}) => (
  <div className="flex min-h-screen items-center justify-center px-4">
    <div className="max-w-md space-y-4 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
      <button onClick={() => void onLogout()} className="text-primary underline">
        Sair
      </button>
    </div>
  </div>
);

export const ProtectedRoute = ({ children }: { children?: ReactNode }) => {
  const { user, userDoc, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return <CenterLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!userDoc) {
    return (
      <InfoScreen
        title="Aguardando liberação do administrador"
        description="Seu login foi validado, mas ainda não existe um cadastro em users/{uid}."
        onLogout={logout}
      />
    );
  }

  if (!userDoc.ativo) {
    return <InfoScreen title="Conta desativada" description="Entre em contato com o administrador." onLogout={logout} />;
  }

  if (children) {
    return <>{children}</>;
  }

  return <Outlet />;
};

export const RoleHomeRedirect = () => {
  const { userDoc } = useAuth();

  if (!userDoc) {
    return null;
  }

  if (userDoc.role === "cliente") {
    return <Navigate to="/cliente/obra" replace />;
  }

  return <Navigate to="/painel/obras" replace />;
};

export const ClientRoute = ({ children }: { children?: ReactNode }) => {
  const { userDoc } = useAuth();

  if (!userDoc) {
    return null;
  }

  if (userDoc.role !== "cliente") {
    return <Navigate to="/painel/obras" replace />;
  }

  if (children) {
    return <>{children}</>;
  }

  return <Outlet />;
};

export const StaffRoute = ({ children }: { children?: ReactNode }) => {
  const { userDoc } = useAuth();

  if (!userDoc) {
    return null;
  }

  if (userDoc.role === "cliente") {
    return <Navigate to="/cliente/obra" replace />;
  }

  if (children) {
    return <>{children}</>;
  }

  return <Outlet />;
};

export const ObraAccessRoute = ({ children }: { children?: ReactNode }) => {
  const { userDoc } = useAuth();
  const { obraId } = useParams();

  if (!userDoc || !obraId) {
    return <Navigate to="/painel/obras" replace />;
  }

  if (!userDoc.obras.includes(obraId)) {
    return <Navigate to="/painel/obras" replace />;
  }

  if (children) {
    return <>{children}</>;
  }

  return <Outlet />;
};