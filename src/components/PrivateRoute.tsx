import { Navigate, Outlet } from 'react-router-dom';
import { CircularProgress, Stack, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import type { AuthorizationProfile } from '../services/authorizationProfile';
import { temAlgumaCredencial, temCredencial } from '../services/credenciais';

function RouteGuardLoading() {
  return (
    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" p={3}>
      <CircularProgress size={22} />
      <Typography variant="body2">Validando acesso...</Typography>
    </Stack>
  );
}

// Entrada na WEB: funcionário ativo com ao menos uma credencial. Cada área diz quem entra em `permite`
// (padrão: só adm2). Ocultar menus não basta: as Rules e as Functions conferem a mesma credencial.
export default function PrivateRoute({ permite = (p) => temCredencial(p) }: { permite?: (profile: AuthorizationProfile) => boolean }) {
  const { currentUser, loading: authLoading } = useAuth();
  const { loading: authorizationLoading, profile, error } = useAuthorizationProfile();

  if (authLoading) return <RouteGuardLoading />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (authorizationLoading) return <RouteGuardLoading />;
  if (error) return <Navigate to="/acesso-negado" replace state={{ reason: 'firestore-error' }} />;
  if (profile === null || !profile.exists) return <Navigate to="/acesso-negado" replace state={{ reason: 'missing-funcionario' }} />;
  if (profile.ativo !== true) return <Navigate to="/acesso-negado" replace state={{ reason: 'inactive' }} />;
  if (!temAlgumaCredencial(profile)) return <Navigate to="/acesso-negado" replace state={{ reason: 'sem-credencial' }} />;
  if (!permite(profile)) return <Navigate to="/acesso-negado" replace state={{ reason: 'sem-acesso-area' }} />;

  return <Outlet />;
}
