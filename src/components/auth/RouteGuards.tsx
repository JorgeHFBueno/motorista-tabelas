import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEnsureUserDoc } from "@/hooks/useAppQueries";

const CenterLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const CenterError = ({ message }: { message: string }) => (
  <div className="flex min-h-screen items-center justify-center bg-background px-4">
    <div className="max-w-lg rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-lg font-semibold">Erro ao carregar acesso</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  </div>
);

export const ProtectedRoute = ({ children }: { children?: ReactNode }) => {
  const { user, userDoc, loading, authReady, userDocReady, refreshUserDoc, error } = useAuth();
  const location = useLocation();
const ensureUserDoc = useEnsureUserDoc({
    user,
    userDoc,
    onEnsured: refreshUserDoc,
    enabled: !error,
  });

  if (loading || !authReady || !userDocReady || ensureUserDoc.isPending) {
    return <CenterLoader />;
  }

  if (error) {
    return <CenterError message={error} />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!userDoc) {
    return <Navigate to="/aguardando-liberacao" replace />;
  }

  if (!userDoc.ativo) {
    return <Navigate to="/conta-desativada" replace />;
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
    return <Navigate to={userDoc.obras.length === 0 ? "/cliente/sem-obra" : "/cliente/obra"} replace />;
  }

  return <Navigate to="/painel/obras" replace />;
};

export const ClientRoute = ({ children }: { children?: ReactNode }) => {
  const { userDoc } = useAuth();
  const location = useLocation();

  if (!userDoc) {
    return null;
  }

  if (userDoc.role !== "cliente") {
    return <Navigate to="/painel/obras" replace />;
  }

  if (userDoc.obras.length === 0 && location.pathname !== "/cliente/sem-obra") {
    return <Navigate to="/cliente/sem-obra" replace />;
  }

  if (userDoc.obras.length > 0 && location.pathname === "/cliente/sem-obra") {
    return <Navigate to="/cliente/obra" replace />;
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