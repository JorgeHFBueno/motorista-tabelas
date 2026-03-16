import { Navigate, Outlet } from 'react-router-dom';
import { CircularProgress, Stack, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';

function RouteGuardLoading() {
  return (
    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" p={3}>
      <CircularProgress size={22} />
      <Typography variant="body2">Validando acesso administrativo...</Typography>
    </Stack>
  );
}

export default function PrivateRoute() {
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

  return <Outlet />;
}