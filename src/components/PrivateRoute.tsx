import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import AcessoNegado from './AcessoNegado';
import LoadingFallback from './LoadingFallback';
import { useAuth } from '../contexts/AuthContext';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import type { AuthorizationProfile } from '../services/authorizationProfile';
import { temAlgumaCredencial, temCredencial } from '../services/credenciais';


// Entrada na WEB: funcionário ativo com ao menos uma credencial. Cada área diz quem entra em `permite`
// (padrão: só adm2). Ocultar menus não basta: as Rules e as Functions conferem a mesma credencial.
// `semSessao`: o que mostrar sem login, no lugar de ir para /login (o app Motorista não pode sair de /motorista).
export default function PrivateRoute({ permite = (p) => temCredencial(p), semSessao }: {
  permite?: (profile: AuthorizationProfile) => boolean;
  semSessao?: ReactNode;
}) {
  const { currentUser, loading: authLoading } = useAuth();
  const { loading: authorizationLoading, profile, error } = useAuthorizationProfile();

  if (authLoading) return <LoadingFallback label="Validando acesso..." />;
  if (!currentUser) return semSessao ?? <Navigate to="/login" replace />;
  if (authorizationLoading) return <LoadingFallback label="Validando acesso..." />;
  // The denial is shown at the address itself (no redirect), so a reload checks the access again.
  if (error) return <AcessoNegado motivo="firestore-error" />;
  if (profile === null || !profile.exists) return <AcessoNegado motivo="missing-funcionario" />;
  if (profile.ativo !== true) return <AcessoNegado motivo="inactive" />;
  if (!temAlgumaCredencial(profile)) return <AcessoNegado motivo="sem-credencial" />;
  if (!permite(profile)) return <AcessoNegado motivo="sem-acesso-area" />;

  return <Outlet />;
}
