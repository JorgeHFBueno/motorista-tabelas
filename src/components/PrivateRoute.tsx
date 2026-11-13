import { Navigate, Outlet } from 'react-router-dom';
import LoadingFallback from './LoadingFallback';
import { useAuth } from '../contexts/AuthContext';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import type { AuthorizationProfile } from '../services/authorizationProfile';
import { temAlgumaCredencial, temCredencial } from '../services/credenciais';


// Entrada na WEB: funcionário ativo com ao menos uma credencial. Cada área diz quem entra em `permite`
// (padrão: só adm2). Ocultar menus não basta: as Rules e as Functions conferem a mesma credencial.
export default function PrivateRoute({ permite = (p) => temCredencial(p) }: { permite?: (profile: AuthorizationProfile) => boolean }) {
  const { currentUser, loading: authLoading } = useAuth();
  const { loading: authorizationLoading, profile, error } = useAuthorizationProfile();

  if (authLoading) return <LoadingFallback label="Validando acesso..." />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (authorizationLoading) return <LoadingFallback label="Validando acesso..." />;
  if (error) return <Navigate to="/acesso-negado" replace state={{ reason: 'firestore-error' }} />;
  if (profile === null || !profile.exists) return <Navigate to="/acesso-negado" replace state={{ reason: 'missing-funcionario' }} />;
  if (profile.ativo !== true) return <Navigate to="/acesso-negado" replace state={{ reason: 'inactive' }} />;
  if (!temAlgumaCredencial(profile)) return <Navigate to="/acesso-negado" replace state={{ reason: 'sem-credencial' }} />;
  if (!permite(profile)) return <Navigate to="/acesso-negado" replace state={{ reason: 'sem-acesso-area' }} />;

  return <Outlet />;
}
