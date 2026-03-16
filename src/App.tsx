import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import './App.css';
import Header from './components/Header';
import PrivateRoute from './components/PrivateRoute';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import PwaUpdateBanner from './components/PwaUpdateBanner';
import PwaUpdateOverlay from './components/PwaUpdateOverlay';

import { CircularProgress, Stack, Typography } from '@mui/material';

const TabelaCombustivel = lazy(() => import('./components/TabelaCombustivel'));
const CombustivelNovoPage = lazy(() => import('./pages/CombustivelNovoPage'));
const PortifolioPage = lazy(() => import('./components/PortifolioPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const CadastrosPage = lazy(() => import('./pages/CadastrosPage'));
const CadastrosEditarPage = lazy(() => import('./pages/CadastrosEditarPage'));
const RegistrosPage = lazy(() => import('./pages/RegistrosPage'));
const FrotaVeiculosPage = lazy(() => import('./pages/FrotaVeiculosPage'));
const FrotaVeiculoDetalhesPage = lazy(() => import('./pages/FrotaVeiculoDetalhesPage'));
const HomeDashboard = lazy(() => import('./pages/HomeDashboard'));
const BombasPage = lazy(() => import('./pages/BombasPage'));
const AccessDeniedPage = lazy(() => import('./pages/AccessDeniedPage'));

function LoadingFallback({ label }: { label?: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" p={3}>
      <CircularProgress size={22} />
      <Typography variant="body2">{label ?? 'Carregando...'}</Typography>
    </Stack>
  );
}

console.log("[build]", import.meta.env.MODE, "__BUILD__", "1060");

export default function App() {
  return (
   <BrowserRouter>
   <NetworkStatusBanner />
   <PwaUpdateOverlay />
      <PwaUpdateBanner />
      <Header />
       <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignupPage />} />
          <Route path="acesso-negado" element={<AccessDeniedPage />} />
          <Route element={<PrivateRoute />}>
          <Route index element={<HomeDashboard />} />
            <Route path="combustivel" element={<TabelaCombustivel />} />
            <Route path="combustivel/novo" element={<CombustivelNovoPage />} />
            <Route path="cadastros" element={<CadastrosPage />} />
            <Route path="cadastros/editar/:tipo" element={<CadastrosEditarPage />} />
            <Route path="registros" element={<RegistrosPage />} />
            <Route path="frota" element={<FrotaVeiculosPage />} />
            <Route path="frota/:placa" element={<FrotaVeiculoDetalhesPage />} />
            <Route path="bombas" element={<BombasPage />} />
            <Route path="portfolio" element={<PortifolioPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}