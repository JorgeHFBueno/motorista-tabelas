import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import './App.css';
import Header from './components/Header';
import PrivateRoute from './components/PrivateRoute';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import PwaUpdateBanner from './components/PwaUpdateBanner';

import { CircularProgress, Stack, Typography } from '@mui/material';

const TabelaCombustivel = lazy(() => import('./components/TabelaCombustivel'));
const PortifolioPage = lazy(() => import('./components/PortifolioPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const Frota = lazy(() => import('./pages/Frota'));

function LoadingFallback({ label }: { label?: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" p={3}>
      <CircularProgress size={22} />
      <Typography variant="body2">{label ?? 'Carregando...'}</Typography>
    </Stack>
  );
}
export default function App() {
  return (
   <BrowserRouter>
   <NetworkStatusBanner />
      <PwaUpdateBanner />
      <Header />
       <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<PrivateRoute />}>
            <Route path="/combustivel" element={<TabelaCombustivel />} />
            <Route path="/frota" element={<Frota />} />
            <Route path="/" element={<PortifolioPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}