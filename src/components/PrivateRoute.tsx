import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { CircularProgress, Stack, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import { isAdm1RouteRestricted } from '../services/adm1RouteAuthorization';
import { isAdm1Only, isWebAdminAuthorized } from '../services/webAuthorization';

function RouteGuardLoading() {
  return (
    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" p={3}>
      <CircularProgress size={22} />
      <Typography variant="body2">Validando acesso administrativo...</Typography>
    </Stack>
  );
}

export default function PrivateRoute() {
  const location = useLocation();
  const { currentUser, loading: authLoading } = useAuth();
  const { loading: authorizationLoading, profile, error } = useAuthorizationProfile();

  if (authLoading) {
    return <RouteGuardLoading />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (authorizationLoading) {
    return <RouteGuardLoading />;
  }

  if (error) {
    return <Navigate to="/acesso-negado" replace state={{ reason: 'firestore-error' }} />;
  }

  if (profile === null || !profile.exists) {
    return <Navigate to="/acesso-negado" replace state={{ reason: 'missing-funcionario' }} />;
  }

  if (profile.ativo !== true) {
    return <Navigate to="/acesso-negado" replace state={{ reason: 'inactive' }} />;
  }

  if (!isWebAdminAuthorized(profile)) {
    return (
      <Navigate
        to="/acesso-negado"
        replace
        state={{ reason: 'missing-admin' }}
        />
    );
  }

  const shouldRestrictByAdm1 = isAdm1RouteRestricted(location.pathname, isAdm1Only(profile));

  if (shouldRestrictByAdm1) {
    if (import.meta.env.DEV) {
      console.info(`[authz] adm1 blocked route: ${location.pathname} -> /`);
    }

    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
