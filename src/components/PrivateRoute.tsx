import { Navigate, Outlet } from 'react-router-dom';
import { CircularProgress, Stack, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useAdm2Authorization } from '../hooks/useAdm2Authorization';

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
  const { loading: authorizationLoading, authorized, error } = useAdm2Authorization(currentUser, authLoading);

  if (authLoading) {
    return <RouteGuardLoading />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (authorizationLoading || authorized === null) {
    return <RouteGuardLoading />;
  }

  if (!currentUser.email?.trim()) {
    return <Navigate to="/acesso-negado" replace state={{ reason: 'missing-email' }} />;
  }

  if (authorized === false) {
    return (
      <Navigate
        to="/acesso-negado"
        replace
        state={{ reason: error ? 'firestore-error' : 'missing-adm2' }}
      />
    );
  }

  return <Outlet />;
}