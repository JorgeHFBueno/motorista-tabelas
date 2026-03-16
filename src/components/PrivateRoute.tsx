import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { CircularProgress, Stack, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import { isAdm1RouteRestricted } from '../services/adm1RouteAuthorization';

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
  const { loading: authorizationLoading, profile, error } = useAuthorizationProfile(currentUser, authLoading);

  if (authLoading) {
    return <RouteGuardLoading />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (authorizationLoading || profile === null) {
        return <RouteGuardLoading />;
  }

  if (!currentUser.email?.trim()) {
    return <Navigate to="/acesso-negado" replace state={{ reason: 'missing-email' }} />;
  }

  const authorized = profile.adm1 || profile.adm2;

  if (!authorized) {
    return (
      <Navigate
        to="/acesso-negado"
        replace
        state={{ reason: error ? 'firestore-error' : 'missing-admin' }}
        />
    );
  }

  const shouldRestrictByAdm1 = isAdm1RouteRestricted(location.pathname, profile.adm1 === true);

  if (shouldRestrictByAdm1) {
    if (import.meta.env.DEV) {
      console.info(`[authz] adm1 blocked route: ${location.pathname} -> /`);
    }

    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}