import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import './App.css';
import Header from './components/Header';
import { CabecalhoPaginaProvider } from './components/cabecalhoPagina';
import PrivateRoute from './components/PrivateRoute';
import { temCredencial } from './services/credenciais';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import PwaUpdateBanner from './components/PwaUpdateBanner';
import PwaUpdateOverlay from './components/PwaUpdateOverlay';

import { CircularProgress, Stack, Typography } from '@mui/material';

const TabelaCombustivel = lazy(() => import('./components/TabelaCombustivel'));
const CombustivelNovoPage = lazy(() => import('./pages/CombustivelNovoPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const CadastrosPage = lazy(() => import('./pages/CadastrosPage'));
const CadastroUsuarioNovoPage = lazy(() => import('./pages/CadastroUsuarioNovoPage'));
const KioskCredentialsPage = lazy(() => import('./pages/KioskCredentialsPage'));
const CadastroUsuariosEditarPage = lazy(() => import('./pages/CadastroUsuariosEditarPage'));
const RegistrosPage = lazy(() => import('./pages/RegistrosPage'));
const ChecklistsPage = lazy(() => import('./pages/ChecklistsPage'));
const ChecklistDetalhePage = lazy(() => import('./pages/ChecklistDetalhePage'));
const FrotaVeiculosPage = lazy(() => import('./pages/FrotaVeiculosPage'));
const FrotaVeiculoDetalhesPage = lazy(() => import('./pages/FrotaVeiculoDetalhesPage'));
const FrotaAnalyticsPage = lazy(() => import('./pages/FrotaAnalyticsPage'));
const HomeDashboard = lazy(() => import('./pages/HomeDashboard'));
const BombasPage = lazy(() => import('./pages/BombasPage'));
const AccessDeniedPage = lazy(() => import('./pages/AccessDeniedPage'));
const CronogramaObrasPage = lazy(() => import('./features/cronograma-obras/CronogramaObrasPage'));
const LogisticaCronogramaPage = lazy(() => import('./features/cronograma-logistica/LogisticaCronogramaPage'));
const ClientesPortalPage = lazy(() => import('./features/portal-cliente/ClientesPortalPage'));
const ContratosPortalPage = lazy(() => import('./features/portal-cliente/ContratosPortalPage'));
const ContratoPortalPage = lazy(() => import('./features/portal-cliente/ContratoPortalPage'));
const AtendimentoPortalPage = lazy(() => import('./features/portal-cliente/AtendimentoPortalPage'));
const NoticiasPortalPage = lazy(() => import('./features/portal-cliente/NoticiasPortalPage'));
const PrazosContratuaisPage = lazy(() => import('./features/prazos-contratuais/PrazosContratuaisPage'));
const ObrasPage = lazy(() => import('./features/obras/ObrasPage'));
const ObraDetalhesPage = lazy(() => import('./features/obras/ObraDetalhesPage'));
const TheManuscriptPage = lazy(() => import('./pages/TheManuscriptPage'));
const ManuscriptMapaPage = lazy(() => import('./pages/ManuscriptMapaPage'));
const MeuPerfilPage = lazy(() => import('./pages/MeuPerfilPage'));
const FridayApp = lazy(() => import('./features/friday-gestao-interna/App'));
const DevToysPage = lazy(() => import('./features/dev-toys/DevToysPage'));
const ChecklistInicioPage = lazy(() => import('./features/checklist-mecanico/ChecklistInicioPage'));
const ChecklistItensPage = lazy(() => import('./features/checklist-mecanico/ChecklistItensPage'));
const ChecklistHistoricoPage = lazy(() => import('./features/checklist-mecanico/ChecklistHistoricoPage'));

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
      <CabecalhoPaginaProvider>
        <Header />
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route path="acesso-negado" element={<AccessDeniedPage />} />
            {/* Credenciais (The Manuscript, funcionarios.md): qualquer credencial entra na Home reduzida e no Meu perfil;
                cada área confere a sua e o adm2 entra em todas, salvo na DEV. */}
            <Route element={<PrivateRoute permite={() => true} />}>
              <Route index element={<HomeDashboard />} />
              <Route path="perfil" element={<MeuPerfilPage />} />
            </Route>
            <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'escritorio')} />}>
              <Route path="friday/*" element={<FridayApp />} />
            </Route>
            <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'engenharia')} />}>
              <Route path="engenharia/cronograma" element={<CronogramaObrasPage />} />
              <Route path="engenharia/prazos" element={<PrazosContratuaisPage />} />
              <Route path="engenharia/obras" element={<ObrasPage />} />
              <Route path="engenharia/obras/:id" element={<ObraDetalhesPage />} />
            </Route>
            {/* Checklist do mecânico para celular (iPhone), mesmo contrato checklists-v2 do app. */}
            <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'mecanico')} />}>
              <Route path="checklist" element={<ChecklistInicioPage />} />
              <Route path="checklist/itens" element={<ChecklistItensPage />} />
              <Route path="checklist/historico" element={<ChecklistHistoricoPage />} />
              <Route path="checklist/historico/:id" element={<ChecklistDetalhePage />} />
            </Route>
            {/* Área DEV: só a credencial retr0, nem o adm2 entra sem ela. */}
            <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'retr0')} />}>
              <Route path="dev" element={<DevToysPage />} />
            </Route>
            <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'autor')} />}>
              <Route path="the-manuscript/mapa" element={<ManuscriptMapaPage />} />
              <Route path="the-manuscript/*" element={<TheManuscriptPage />} />
            </Route>
            <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'escritorio')} />}>
              <Route path="cadastros" element={<CadastrosPage />} />
              <Route path="cadastros/usuarios/novo" element={<CadastroUsuarioNovoPage />} />
              <Route path="cadastros/usuarios/kiosk" element={<KioskCredentialsPage />} />
              <Route path="cadastros/editar/usuarios" element={<CadastroUsuariosEditarPage />} />
            </Route>
            {/* Frota é um grupo, como Engenharia: /frota não tem página própria. */}
            <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'mecanico', 'logistica')} />}>
              <Route path="frota/veiculos" element={<FrotaVeiculosPage />} />
              <Route path="frota/veiculos/:id" element={<FrotaVeiculoDetalhesPage />} />
              <Route path="frota/registros" element={<RegistrosPage />} />
              <Route path="frota/checklists" element={<ChecklistsPage />} />
              <Route path="frota/checklists/:id" element={<ChecklistDetalhePage />} />
              <Route path="frota/analytics" element={<FrotaAnalyticsPage />} />
              <Route path="bombas" element={<BombasPage />} />
              <Route path="logistica/cronograma" element={<LogisticaCronogramaPage />} />
            </Route>
            <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'logistica')} />}>
              <Route path="combustivel" element={<TabelaCombustivel />} />
              <Route path="combustivel/novo" element={<CombustivelNovoPage />} />
            </Route>
            {/* Portal do cliente, lado da equipe: The Manuscript, 16_PORTAL_DO_CLIENTE.md. */}
            <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'engenharia', 'escritorio')} />}>
              <Route path="portal-cliente/clientes" element={<ClientesPortalPage />} />
              <Route path="portal-cliente/contratos" element={<ContratosPortalPage />} />
              <Route path="portal-cliente/contratos/:id" element={<ContratoPortalPage />} />
              <Route path="portal-cliente/atendimento" element={<AtendimentoPortalPage />} />
              <Route path="portal-cliente/noticias" element={<NoticiasPortalPage />} />
            </Route>
          </Routes>
        </Suspense>
      </CabecalhoPaginaProvider>
    </BrowserRouter>
  );
}
