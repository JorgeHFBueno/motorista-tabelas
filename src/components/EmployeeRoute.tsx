import { Navigate, Outlet } from 'react-router-dom';
import { CircularProgress, Stack, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

export default function EmployeeRoute() {
  const { currentUser, loading, authorizationLoading, authorizationProfile, authorizationError } = useAuth();
  if (loading || authorizationLoading) return <Stack direction="row" spacing={1} justifyContent="center" p={3}><CircularProgress size={22} /><Typography>Validando acesso...</Typography></Stack>;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (authorizationError || !authorizationProfile?.exists || !authorizationProfile.ativo) return <Navigate to="/acesso-negado" replace />;
  return <Outlet />;
}
