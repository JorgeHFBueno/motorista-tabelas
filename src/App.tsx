import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import './App.css';
import Header from './components/Header';
import PrivateRoute from './components/PrivateRoute';
import { temCredencial } from './services/credenciais';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import PwaUpdateBanner from './components/PwaUpdateBanner';
import PwaUpdateOverlay from './components/PwaUpdateOverlay';

import { CircularProgress, Stack, Typography } from '@mui/material';

const TabelaCombustivel = lazy(() => import('./components/TabelaCombustivel'));
const CombustivelNovoPage = lazy(() => import('./pages/CombustivelNovoPage'));
const PortifolioPage = lazy(() => import('./components/PortifolioPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const CadastrosPage = lazy(() => import('./pages/CadastrosPage'));
const CadastroUsuarioNovoPage = lazy(() => import('./pages/CadastroUsuarioNovoPage'));
const KioskCredentialsPage = lazy(() => import('./pages/KioskCredentialsPage'));
const CadastrosEditarPage = lazy(() => import('./pages/CadastrosEditarPage'));
const RegistrosPage = lazy(() => import('./pages/RegistrosPage'));
const ChecklistLegadoRedirect = lazy(() => import('./pages/ChecklistLegadoRedirect'));
const ChecklistsPage = lazy(() => import('./pages/ChecklistsPage'));
const ChecklistDetalhePage = lazy(() => import('./pages/ChecklistDetalhePage'));
const FrotaVeiculosPage = lazy(() => import('./pages/FrotaVeiculosPage'));
const FrotaVeiculoDetalhesPage = lazy(() => import('./pages/FrotaVeiculoDetalhesPage'));
const FrotaAnalyticsPage = lazy(() => import('./pages/FrotaAnalyticsPage'));
const HomeDashboard = lazy(() => import('./pages/HomeDashboard'));
const BombasPage = lazy(() => import('./pages/BombasPage'));
const AccessDeniedPage = lazy(() => import('./pages/AccessDeniedPage'));
const CronogramaObrasPage = lazy(() => import('./features/cronograma-obras/CronogramaObrasPage'));
const PrazosContratuaisPage = lazy(() => import('./features/prazos-contratuais/PrazosContratuaisPage'));
const EngenhariaObrasPage = lazy(() => import('./pages/EngenhariaObrasPage'));
const TheManuscriptPage = lazy(() => import('./pages/TheManuscriptPage'));
const MeuPerfilPage = lazy(() => import('./pages/MeuPerfilPage'));
const FridayApp = lazy(() => import('./features/friday-gestao-interna/App'));

function LoadingFallback({ label }: { label?: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" p={3}>
      <CircularProgress size={22} />
      <Typography variant="body2">{label ?? 'Carregando...'}</Typography>
    </Stack>
  );
}

console.log('[build]', import.meta.env.MODE, '__BUILD__', '1122');

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
          {/* Cadastro aberto retirado (2026-10-22): usuários nascem só em Cadastros. Endereço antigo leva ao login. */}
          <Route path="signup" element={<Navigate to="/login" replace />} />
          <Route path="acesso-negado" element={<AccessDeniedPage />} />
          {/* Credenciais (The Manuscript, funcionarios.md): qualquer credencial entra na Home reduzida e no Meu perfil;
              cada área confere a sua; o resto é só adm2. */}
          <Route element={<PrivateRoute permite={() => true} />}>
            <Route index element={<HomeDashboard />} />
            <Route path="perfil" element={<MeuPerfilPage />} />
          </Route>
          <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'escritorio')} />}>
            <Route path="friday/*" element={<FridayApp />} />
          </Route>
          <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'engenharia')} />}>
            <Route path="engenharia/cronograma" element={<CronogramaObrasPage />} />
            <Route path="engenharia/obras" element={<EngenhariaObrasPage />} />
            <Route path="engenharia/prazos" element={<PrazosContratuaisPage />} />
          </Route>
          <Route element={<PrivateRoute />}>
            <Route path="the-manuscript/*" element={<TheManuscriptPage />} />
            <Route path="combustivel" element={<TabelaCombustivel />} />
            <Route path="combustivel/novo" element={<CombustivelNovoPage />} />
            <Route path="combustivel/*" element={<Navigate to="/combustivel" replace />} />
            <Route path="cadastros" element={<CadastrosPage />} />
            <Route path="cadastros/usuarios/novo" element={<CadastroUsuarioNovoPage />} />
            {/* Conciliação com motoristas retirada (credenciais, 2026-10-23); contas sem funcionário ficam em Usuários. */}
            <Route path="cadastros/usuarios/conciliacao" element={<Navigate to="/cadastros/editar/usuarios" replace />} />
            <Route path="cadastros/usuarios/kiosk" element={<KioskCredentialsPage />} />
            <Route path="cadastros/editar/:tipo" element={<CadastrosEditarPage />} />
            <Route path="registros" element={<RegistrosPage />} />
            <Route path="registros/:atividadeId/checklist" element={<ChecklistLegadoRedirect />} />
            <Route path="checklists" element={<ChecklistsPage />} />
            <Route path="checklists/:id" element={<ChecklistDetalhePage />} />
            <Route path="frota" element={<FrotaVeiculosPage />} />
            <Route path="frota/analytics" element={<FrotaAnalyticsPage />} />
            <Route path="frota/:id" element={<FrotaVeiculoDetalhesPage />} />
            <Route path="bombas" element={<BombasPage />} />
            <Route path="portfolio" element={<PortifolioPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
