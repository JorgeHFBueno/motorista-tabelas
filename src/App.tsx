import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import './App.css';
import Header from './components/Header';
import { CabecalhoPaginaProvider } from './components/cabecalhoPagina';
import PrivateRoute from './components/PrivateRoute';
import { editaArea, temCredencial, veArea } from './services/credenciais';
import { entraNoFriday } from './features/friday-gestao-interna/acesso';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import PwaUpdateBanner from './components/PwaUpdateBanner';
import PwaUpdateOverlay from './components/PwaUpdateOverlay';
import ManifestoDaRota from './features/saida-chegada/ManifestoDaRota';
import AvisoInstalar from './features/saida-chegada/components/AvisoInstalar';
import RegistroDeUso from './features/uso-web/RegistroDeUso';

import LoadingFallback from './components/LoadingFallback';

const TabelaCombustivel = lazy(() => import('./components/TabelaCombustivel'));
const CombustivelNovoPage = lazy(() => import('./pages/CombustivelNovoPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const CadastroUsuarioNovoPage = lazy(() => import('./pages/CadastroUsuarioNovoPage'));
const CadastroUsuariosEditarPage = lazy(() => import('./pages/CadastroUsuariosEditarPage'));
const CadastroApisPage = lazy(() => import('./pages/CadastroApisPage'));
const UsoDoSistemaPage = lazy(() => import('./features/uso-web/UsoDoSistemaPage'));
const RegistrosPage = lazy(() => import('./pages/RegistrosPage'));
const ChecklistsPage = lazy(() => import('./pages/ChecklistsPage'));
const RevisoesPage = lazy(() => import('./pages/RevisoesPage'));
const RevisaoDetalheMecanicaPage = lazy(() => import('./pages/RevisaoDetalheMecanicaPage'));
const ChecklistDetalhePage = lazy(() => import('./pages/ChecklistDetalhePage'));
const FrotaVeiculosPage = lazy(() => import('./pages/FrotaVeiculosPage'));
const FrotaVeiculoDetalhesPage = lazy(() => import('./pages/FrotaVeiculoDetalhesPage'));
const FrotaAnalyticsPage = lazy(() => import('./pages/FrotaAnalyticsPage'));
const HomeDashboard = lazy(() => import('./pages/HomeDashboard'));
const BombasPage = lazy(() => import('./pages/BombasPage'));
const PrivacidadePage = lazy(() => import('./pages/PrivacidadePage'));
const CronogramaObrasPage = lazy(() => import('./features/cronograma-obras/CronogramaObrasPage'));
const LogisticaCronogramaPage = lazy(() => import('./features/cronograma-logistica/LogisticaCronogramaPage'));
const ClientesPortalPage = lazy(() => import('./features/portal-cliente/ClientesPortalPage'));
const ContratosPortalPage = lazy(() => import('./features/portal-cliente/ContratosPortalPage'));
const ContratoPortalPage = lazy(() => import('./features/portal-cliente/ContratoPortalPage'));
const AtendimentoPortalPage = lazy(() => import('./features/portal-cliente/AtendimentoPortalPage'));
const NoticiasPortalPage = lazy(() => import('./features/portal-cliente/NoticiasPortalPage'));
const ObrasPage = lazy(() => import('./features/obras/ObrasPage'));
const ComercialPainelPage = lazy(() => import('./features/comercial/ComercialPainelPage'));
const NegociosPage = lazy(() => import('./features/comercial/NegociosPage'));
const ContatosPage = lazy(() => import('./features/comercial/ContatosPage'));
const ObraDetalhesPage = lazy(() => import('./features/obras/ObraDetalhesPage'));
const ErpLayout = lazy(() => import('./features/erp/ErpLayout'));
const ErpInicioPage = lazy(() => import('./features/erp/ErpInicioPage'));
const ErpPessoasPage = lazy(() => import('./features/erp/pessoas/ErpPessoasPage'));
const ErpPessoaFichaPage = lazy(() => import('./features/erp/pessoas/ErpPessoaFichaPage'));
const ErpVendedoresPage = lazy(() => import('./features/erp/pessoas/ErpVendedoresPage'));
const ErpConferenciaEstoquesPage = lazy(() => import('./features/erp/estoques/ErpConferenciaEstoquesPage'));
const ErpKardexPage = lazy(() => import('./features/erp/estoques/ErpKardexPage'));
const ErpContagensPage = lazy(() => import('./features/erp/estoques/ErpContagensPage'));
const ErpContagemFichaPage = lazy(() => import('./features/erp/estoques/ErpContagemFichaPage'));
const ErpAcertoEstoquePage = lazy(() => import('./features/erp/estoques/ErpAcertoEstoquePage'));
const ErpRelatorioEstoquePage = lazy(() => import('./features/erp/estoques/ErpRelatorioEstoquePage'));
const ErpProdutosPage = lazy(() => import('./features/erp/produtos/ErpProdutosPage'));
const ErpProdutoFichaPage = lazy(() => import('./features/erp/produtos/ErpProdutoFichaPage'));
const ErpNotasPage = lazy(() => import('./features/erp/notas/ErpNotasPage'));
const ErpNotaPage = lazy(() => import('./features/erp/notas/ErpNotaPage'));
const ErpEntradaFornecedorPage = lazy(() => import('./features/erp/notas/ErpEntradaFornecedorPage'));
const ErpTitulosPage = lazy(() => import('./features/erp/financeiro/ErpTitulosPage'));
const ErpTituloPage = lazy(() => import('./features/erp/financeiro/ErpTituloPage'));
const ErpBaixaPage = lazy(() => import('./features/erp/financeiro/ErpBaixaPage'));
const ErpProjecoesPage = lazy(() => import('./features/erp/financeiro/ErpProjecoesPage'));
const ErpBancosPage = lazy(() => import('./features/erp/financeiro/ErpBancosPage'));
const ErpConciliacaoPage = lazy(() => import('./features/erp/financeiro/ErpConciliacaoPage'));
const TheManuscriptPage = lazy(() => import('./pages/TheManuscriptPage'));
const ManuscriptMapaPage = lazy(() => import('./pages/ManuscriptMapaPage'));
const MeuPerfilPage = lazy(() => import('./pages/MeuPerfilPage'));
const FridayApp = lazy(() => import('./features/friday-gestao-interna/App'));
const DevToysPage = lazy(() => import('./features/dev-toys/DevToysPage'));
const TesteMkiPage = lazy(() => import('./features/testes/mki/TesteMkiPage'));
const TesteMkiiPage = lazy(() => import('./features/testes/mkii/TesteMkiiPage'));
const SaidaChegadaPage = lazy(() => import('./features/saida-chegada/SaidaChegadaPage'));
const HistoricoMotoristaPage = lazy(() => import('./features/saida-chegada/HistoricoMotoristaPage'));
const ComoUsarPage = lazy(() => import('./features/saida-chegada/ComoUsarPage'));
const MotoristaPage = lazy(() => import('./features/saida-chegada/MotoristaPage'));
const ChecklistInicioPage = lazy(() => import('./features/checklist-mecanico/ChecklistInicioPage'));
const ChecklistItensPage = lazy(() => import('./features/checklist-mecanico/ChecklistItensPage'));
const ChecklistHistoricoPage = lazy(() => import('./features/checklist-mecanico/ChecklistHistoricoPage'));
const RevisaoInicioPage = lazy(() => import('./features/revisao/RevisaoInicioPage'));
const RevisaoRegistroPage = lazy(() => import('./features/revisao/RevisaoRegistroPage'));
const RevisaoHistoricoPage = lazy(() => import('./features/revisao/RevisaoHistoricoPage'));
const RevisaoDetalhePage = lazy(() => import('./features/revisao/RevisaoDetalhePage'));
const PaginaNaoEncontradaPage = lazy(() => import('./pages/PaginaNaoEncontradaPage'));

console.log('[build]', import.meta.env.MODE, '__BUILD__', '1122');

export default function App() {
  return (
    <BrowserRouter>
      <ManifestoDaRota />
      <RegistroDeUso />
      <NetworkStatusBanner />
      <PwaUpdateOverlay />
      <PwaUpdateBanner />
      <CabecalhoPaginaProvider>
        <Header />
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route path="privacidade" element={<PrivacidadePage />} />
            {/* Acesso (The Manuscript, funcionarios.md): qualquer credencial ou área entra na Home e no Meu perfil; cada
                área da WEB pede ao menos "ver" (o "editar" é conferido nas telas, nas Rules e nas Functions); o adm2 entra
                em todas, salvo na DEV. */}
            <Route element={<PrivateRoute permite={() => true} />}>
              <Route index element={<HomeDashboard />} />
              <Route path="perfil" element={<MeuPerfilPage />} />
              {/* Endereço que não existe: a página do corvo (antes, tela em branco). */}
              <Route path="*" element={<PaginaNaoEncontradaPage />} />
            </Route>
            {/* /motorista (2026-11-18): Saída e Chegada (src/features/saida-chegada; credencial motorista) e, desde 2026-11-19,
                o Checklist e a Revisão do mecânico (src/features/checklist-mecanico e src/features/revisao; credencial
                mecanico), com fila offline no aparelho. O Meu histórico é dos dois.
                O adm2 entra em tudo. The Manuscript, 03_APLICACAO_WEB/06_REGISTROS_E_CHECKLISTS.md. */}
            {/* Sem login, o próprio /motorista mostra o formulário (o app Motorista instalado não sai de /motorista). */}
            <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'motorista', 'mecanico')} semSessao={<LoginPage destino="/motorista" aviso={<AvisoInstalar antesDoLogin />} />} />}>
              <Route path="motorista" element={<MotoristaPage />} />
              <Route path="motorista/como-usar" element={<ComoUsarPage />} />
              <Route path="motorista/historico" element={<HistoricoMotoristaPage />} />
              <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'motorista')} />}>
                <Route path="motorista/saida" element={<SaidaChegadaPage key="saida" tipo="saida" />} />
                <Route path="motorista/chegada" element={<SaidaChegadaPage key="chegada" tipo="chegada" />} />
              </Route>
              <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'mecanico')} />}>
                <Route path="motorista/checklist" element={<ChecklistInicioPage />} />
                <Route path="motorista/checklist/itens" element={<ChecklistItensPage />} />
                <Route path="motorista/checklist/historico" element={<ChecklistHistoricoPage />} />
                <Route path="motorista/checklist/historico/:id" element={<ChecklistDetalhePage />} />
                <Route path="motorista/revisao" element={<RevisaoInicioPage />} />
                <Route path="motorista/revisao/historico" element={<RevisaoHistoricoPage />} />
                <Route path="motorista/revisao/historico/:id" element={<RevisaoDetalhePage />} />
                <Route path="motorista/revisao/:id" element={<RevisaoRegistroPage />} />
              </Route>
            </Route>
            <Route element={<PrivateRoute permite={entraNoFriday} />}>
              <Route path="friday/*" element={<FridayApp />} />
            </Route>
            <Route element={<PrivateRoute permite={(p) => veArea(p, 'engenharia')} />}>
              <Route path="engenharia/cronograma" element={<CronogramaObrasPage />} />
              <Route path="engenharia/obras" element={<ObrasPage />} />
              <Route path="engenharia/obras/:id" element={<ObraDetalhesPage />} />
            </Route>
            {/* Comercial (CRM da WEB, 2026-11-23): The Manuscript, 17_COMERCIAL.md. Quem tem 'ver' abre tudo só para leitura. */}
            <Route element={<PrivateRoute permite={(p) => veArea(p, 'comercial')} />}>
              <Route path="comercial" element={<ComercialPainelPage />} />
              <Route path="comercial/negocios" element={<NegociosPage />} />
              <Route path="comercial/contatos" element={<ContatosPage />} />
            </Route>
            {/* /testes: provas de conceito e de interface com dados fictícios (nada grava no Firestore). O MKIII foi para a
                produção (/engenharia/cronograma) em 2026-11-17. O MKI é o mock do detalhe da obra com os LOTEs em lista
                (2026-11-19). O MKII (2026-11-26) testa os serviços como modelo para várias obras. Aberto a quem vê a Engenharia. */}
            <Route element={<PrivateRoute permite={(p) => veArea(p, 'engenharia')} />}>
              <Route path="testes/mki" element={<TesteMkiPage />} />
              <Route path="testes/mkii" element={<TesteMkiiPage />} />
            </Route>
            {/* Área DEV: só a credencial retr0, nem o adm2 entra sem ela. */}
            <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'retr0')} />}>
              <Route path="dev" element={<DevToysPage />} />
            </Route>
            <Route element={<PrivateRoute permite={(p) => veArea(p, 'manuscript')} />}>
              <Route path="the-manuscript/mapa" element={<ManuscriptMapaPage />} />
              <Route path="the-manuscript/*" element={<TheManuscriptPage />} />
            </Route>
            <Route element={<PrivateRoute permite={(p) => veArea(p, 'cadastros')} />}>
              <Route path="cadastros/editar/usuarios" element={<CadastroUsuariosEditarPage />} />
            </Route>
            <Route element={<PrivateRoute permite={(p) => editaArea(p, 'cadastros')} />}>
              <Route path="cadastros/usuarios/novo" element={<CadastroUsuarioNovoPage />} />
            </Route>
            {/* APIs por área e as chaves delas: só o adm2, como as Rules de friday-chaves-api e cronoobra-chaves-api.
                Uso do sistema: só o adm2, como as Rules de uso-web. */}
            <Route element={<PrivateRoute permite={(p) => temCredencial(p, 'adm2')} />}>
              <Route path="cadastros/apis" element={<CadastroApisPage />} />
              <Route path="cadastros/uso" element={<UsoDoSistemaPage />} />
            </Route>
            {/* ERP próprio (2026-11-24): o início com o mosaico, Clientes e Fornecedores, Produtos, Estoques, Notas e Contas a Pagar/Receber em demonstração
                (sem gravação), com o menu lateral do ERP (ErpLayout); área ERP (o adm2 sempre). The Manuscript, 01_ROTAS_E_NAVEGACAO.md#erp. */}
            <Route element={<PrivateRoute permite={(p) => veArea(p, 'erp')} />}>
              <Route element={<ErpLayout />}>
                <Route path="erp" element={<ErpInicioPage />} />
                <Route path="erp/pessoas" element={<ErpPessoasPage />} />
                <Route path="erp/pessoas/:codigo" element={<ErpPessoaFichaPage />} />
                <Route path="erp/vendedores" element={<ErpVendedoresPage />} />
                <Route path="erp/produtos" element={<ErpProdutosPage />} />
                <Route path="erp/produtos/:codigo" element={<ErpProdutoFichaPage />} />
                <Route path="erp/estoques" element={<ErpConferenciaEstoquesPage />} />
                <Route path="erp/estoques/kardex" element={<ErpKardexPage />} />
                <Route path="erp/estoques/contagens" element={<ErpContagensPage />} />
                <Route path="erp/estoques/contagens/:codigo" element={<ErpContagemFichaPage />} />
                <Route path="erp/estoques/acerto" element={<ErpAcertoEstoquePage />} />
                <Route path="erp/estoques/relatorios/:relatorio" element={<ErpRelatorioEstoquePage />} />
                <Route path="erp/notas" element={<ErpNotasPage />} />
                <Route path="erp/notas/entrada" element={<ErpEntradaFornecedorPage />} />
                <Route path="erp/notas/:numero" element={<ErpNotaPage />} />
                <Route path="erp/titulos" element={<ErpTitulosPage />} />
                <Route path="erp/titulos/:id" element={<ErpTituloPage />} />
                <Route path="erp/baixa" element={<ErpBaixaPage />} />
                <Route path="erp/financeiro/relatorios/:relatorio" element={<ErpRelatorioEstoquePage modulo="financeiro" />} />
                <Route path="erp/financeiro/projecoes" element={<ErpProjecoesPage />} />
                <Route path="erp/bancos" element={<ErpBancosPage />} />
                <Route path="erp/financeiro/conciliacao" element={<ErpConciliacaoPage />} />
              </Route>
            </Route>
            {/* Mecânica e Logística são grupos, como Engenharia: /mecanica e /logistica não têm página própria (2026-11-19:
                Frota virou Mecânica; Combustível e o KPI entraram na Logística). */}
            <Route element={<PrivateRoute permite={(p) => veArea(p, 'mecanica')} />}>
              <Route path="mecanica/veiculos" element={<FrotaVeiculosPage />} />
              <Route path="mecanica/veiculos/:id" element={<FrotaVeiculoDetalhesPage />} />
              <Route path="mecanica/registros" element={<RegistrosPage />} />
              <Route path="mecanica/checklists" element={<ChecklistsPage />} />
              <Route path="mecanica/checklists/:id" element={<ChecklistDetalhePage />} />
              <Route path="mecanica/revisoes" element={<RevisoesPage />} />
              <Route path="mecanica/revisoes/:id" element={<RevisaoDetalheMecanicaPage />} />
            </Route>
            <Route element={<PrivateRoute permite={(p) => veArea(p, 'logistica')} />}>
              <Route path="logistica/kpi" element={<FrotaAnalyticsPage />} />
              <Route path="logistica/combustivel/registros" element={<TabelaCombustivel />} />
              <Route path="logistica/combustivel/bombas" element={<BombasPage />} />
              <Route path="logistica/cronograma" element={<LogisticaCronogramaPage />} />
            </Route>
            <Route element={<PrivateRoute permite={(p) => editaArea(p, 'logistica')} />}>
              <Route path="logistica/combustivel/registros/novo" element={<CombustivelNovoPage />} />
            </Route>
            {/* Portal do cliente, lado da equipe: The Manuscript, 16_PORTAL_DO_CLIENTE.md. */}
            <Route element={<PrivateRoute permite={(p) => veArea(p, 'portal')} />}>
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
