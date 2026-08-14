import { CircularProgress, Stack, Typography } from '@mui/material';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import { isCombustivelAdm1Restricted } from '../services/combustivelAuthorization';

function CombustivelRouteGuardLoading() {
  return (
    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" p={3}>
      <CircularProgress size={22} />
      <Typography variant="body2">Validando autorização do módulo combustível...</Typography>
    </Stack>
  );
}

export default function CombustivelRouteGuard() {
  const location = useLocation();
  const { currentUser, loading: authLoading } = useAuth();
  const { loading: authorizationLoading, profile, error } = useAuthorizationProfile(currentUser, authLoading);

  if (authLoading || authorizationLoading) {
    return <CombustivelRouteGuardLoading />;
  }

  if (error || profile === null) {
    return <Navigate to="/acesso-negado" replace state={{ reason: 'firestore-error' }} />;
  }

  const isAdm1 = profile.adm1 === true;
  const shouldRedirect = isCombustivelAdm1Restricted(location.pathname, isAdm1);

  if (import.meta.env.DEV) {
    console.info('[combustivel-auth] perfil detectado', {
      pathname: location.pathname,
      adm1: profile.adm1,
      adm2: profile.adm2,
      shouldRedirect,
    });
  }

  if (shouldRedirect) {
    if (import.meta.env.DEV) {
      console.info(`[combustivel-auth] adm1 blocked route: ${location.pathname} -> /combustivel/novo`);
    }

    return <Navigate to="/combustivel/novo" replace />;
  }

  return <Outlet />;
}
