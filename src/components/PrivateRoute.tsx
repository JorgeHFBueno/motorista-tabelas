import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function PrivateRoute() {
  const { currentUser, loading } = useAuth();
  if (loading) return null; // pode trocar por spinner
  return currentUser ? <Outlet /> : <Navigate to="/login" replace />;
}