import type { SvgIconComponent } from '@mui/icons-material';
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined';
import AreaChartOutlined from '@mui/icons-material/AreaChartOutlined';
import AssessmentOutlined from '@mui/icons-material/AssessmentOutlined';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import AttachMoneyOutlined from '@mui/icons-material/AttachMoneyOutlined';
import BadgeOutlined from '@mui/icons-material/BadgeOutlined';
import BalanceOutlined from '@mui/icons-material/BalanceOutlined';
import BusinessOutlined from '@mui/icons-material/BusinessOutlined';
import CalculateOutlined from '@mui/icons-material/CalculateOutlined';
import ChatOutlined from '@mui/icons-material/ChatOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import FactoryOutlined from '@mui/icons-material/FactoryOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import MonetizationOnOutlined from '@mui/icons-material/MonetizationOnOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import PeopleOutline from '@mui/icons-material/PeopleOutline';
import PersonOutline from '@mui/icons-material/PersonOutline';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import RadioButtonCheckedOutlined from '@mui/icons-material/RadioButtonCheckedOutlined';
import ReceiptOutlined from '@mui/icons-material/ReceiptOutlined';
import SwapHorizOutlined from '@mui/icons-material/SwapHorizOutlined';
import TrendingUpOutlined from '@mui/icons-material/TrendingUpOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';

// Menu lateral do ERP (2026-11-25, pedido do responsável): a mesma árvore do menu do Elevor como o ERP do Samuel a montou
// (web/src/layout/menu.ts: grupos, ordem, nomes e ícones do Elevor, só com o que o ERP dele tem). Saíram as Configurações
// do ERP dele (usuários, perfis, auditoria e importação: no painel isso é dos Cadastros) e o "Kardex (consulta)", que
// aqui é o próprio Kardex. Item com `para` abre a tela; sem `para` aparece "em breve".
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export type ItemMenuErp = { rotulo: string; para?: string; icone?: SvgIconComponent; filhos?: ItemMenuErp[] };
export type ModuloErp = { rotulo: string; icone: SvgIconComponent; filhos: ItemMenuErp[] };

const em = (...rotulos: string[]): ItemMenuErp[] => rotulos.map((rotulo) => ({ rotulo }));

export const MENU_ERP: ModuloErp[] = [
  {
    rotulo: 'Cadastros', icone: BadgeOutlined, filhos: [
      { rotulo: 'Clientes', icone: PersonOutline, filhos: [
        { rotulo: 'Consulta de Clientes e Fornecedores', para: '/erp/pessoas' },
        { rotulo: 'Cadastro de Clientes e Fornecedores', para: '/erp/pessoas/novo' },
        { rotulo: 'Vendedores', para: '/erp/vendedores' },
      ] },
      { rotulo: 'Produtos', icone: Inventory2Outlined, filhos: [
        { rotulo: 'Consulta de Produtos', para: '/erp/produtos' },
        { rotulo: 'Cadastro de Produtos', para: '/erp/produtos/novo' },
        ...em('Grupos de Produtos', 'Cadastro de Embalagens', 'Unidades'),
      ] },
      { rotulo: 'Fiscal', icone: AccountBalanceOutlined, filhos: em('Naturezas de Operação', 'Aliquotas Interestaduais') },
      { rotulo: 'Financeiro', icone: PaymentsOutlined, filhos: em('Bancos/Caixa', 'Plano de Contas', 'Tipos de Documentos', 'Situações de Títulos',
        'Condições de Pagamento', 'Meios de Pagamento', 'Bandeiras de Cartão', 'Centros de Custo', 'Sub Centros de Custo', 'Históricos') },
      { rotulo: 'Empresas', icone: BusinessOutlined },
      { rotulo: 'Cidades', icone: PlaceOutlined },
      { rotulo: 'Obras', icone: ApartmentOutlined, filhos: em('Consulta de Obras', 'Cadastro de Obras', 'Fases da Obra') },
      { rotulo: 'Produção', icone: FactoryOutlined, filhos: em('Máquinas') },
      { rotulo: 'Motivos', icone: LocalOfferOutlined },
      { rotulo: 'Mensagens', icone: ChatOutlined },
    ],
  },
  {
    rotulo: 'Comercial', icone: HandshakeOutlined, filhos: [
      { rotulo: 'Notas', icone: DescriptionOutlined, filhos: [
        { rotulo: 'Emissão de Nota Fiscal' },
        { rotulo: 'Entrada de Fornecedor', para: '/erp/notas/entrada' },
        { rotulo: 'Consulta de Notas', para: '/erp/notas' },
        ...em('Controle de Entregas', 'Notas em Trânsito', 'Relação de Canhotos'),
      ] },
      { rotulo: 'Pedidos', icone: AssignmentOutlined, filhos: em('Novo Pedido', 'Consulta de Pedidos', 'Relatórios de Pedidos', 'Painel de Pedidos',
        'Configurador de Status', 'Carteira a Entregar') },
      { rotulo: 'Preços', icone: AttachMoneyOutlined, filhos: em('Tabelas de Preços') },
      { rotulo: 'Comissões', icone: PeopleOutline, filhos: em('Relatório de Comissões', 'Vendedores (percentual)') },
      { rotulo: 'Expedição', icone: LocalShippingOutlined, filhos: em('Expedições', 'Nova Expedição', 'Relatório de Expedições') },
    ],
  },
  {
    rotulo: 'Estoques', icone: Inventory2Outlined, filhos: [
      { rotulo: 'Relatórios', icone: AssignmentOutlined, filhos: [
        { rotulo: 'Relação de Notas', para: '/erp/estoques/relatorios/notas' },
        { rotulo: 'Conferência de Estoques', para: '/erp/estoques' },
        { rotulo: 'Posição de Estoque (valor)', para: '/erp/estoques/relatorios/posicao' },
        { rotulo: 'Kardex', para: '/erp/estoques/kardex' },
        { rotulo: 'Curva ABC', para: '/erp/estoques/relatorios/curva-abc' },
        { rotulo: 'Giro de Estoque', para: '/erp/estoques/relatorios/giro' },
        { rotulo: 'Relatório de Produtos sem Giro', para: '/erp/estoques/relatorios/sem-giro' },
        { rotulo: 'Relação de Acertos', para: '/erp/estoques/relatorios/acertos' },
      ] },
      { rotulo: 'Contagem', icone: RadioButtonCheckedOutlined, filhos: [
        { rotulo: 'Consulta Contagem de Produtos/Volumes', para: '/erp/estoques/contagens' },
        { rotulo: 'Nova Contagem Produtos/Volumes', para: '/erp/estoques/contagens/nova' },
      ] },
      { rotulo: 'Acerto de Estoque', para: '/erp/estoques/acerto', icone: TuneOutlined },
    ],
  },
  {
    rotulo: 'Financeiro', icone: PaymentsOutlined, filhos: [
      { rotulo: 'Contas a Pagar/Receber', icone: AttachMoneyOutlined, filhos: [
        { rotulo: 'Consulta Títulos', para: '/erp/titulos' },
        { rotulo: 'Lançamento de Títulos', para: '/erp/titulos/novo' },
        { rotulo: 'Baixa de Títulos', para: '/erp/baixa' },
        { rotulo: 'Relatórios de Contas a Pagar/Receber', para: '/erp/financeiro/relatorios/contas-pagar-receber' },
        { rotulo: 'Pagamentos e Recebimentos', para: '/erp/financeiro/relatorios/pagamentos-recebimentos' },
        ...em('Exclusão de Baixas'),
      ] },
      { rotulo: 'Bancos/Caixa', icone: MonetizationOnOutlined, filhos: [
        { rotulo: 'Bancos/Caixa', para: '/erp/bancos' },
        { rotulo: 'Conciliação Bancária', para: '/erp/financeiro/conciliacao' },
        { rotulo: 'Regras de Lançamento Automático', para: '/erp/financeiro/conciliacao?aba=config' },
        { rotulo: 'Saldos', para: '/erp/bancos?aba=saldos' },
        { rotulo: 'Pendências de Conciliação', para: '/erp/financeiro/conciliacao?aba=resumida' },
      ] },
      { rotulo: 'Cheques', icone: AccountBalanceWalletOutlined, filhos: [
        { rotulo: 'Inclusão Cheques', para: '/erp/cheques/novo' },
        { rotulo: 'Consulta de Cheques', para: '/erp/cheques' },
        { rotulo: 'Status de Cheques', para: '/erp/cheques/status' },
      ] },
      { rotulo: 'Fluxo Caixa', icone: TrendingUpOutlined, filhos: [
        { rotulo: 'Projeções', para: '/erp/financeiro/projecoes' },
        { rotulo: 'Relatório', para: '/erp/financeiro/relatorios/fluxo-caixa' },
      ] },
      { rotulo: 'Adiantamentos/ Empréstimos', icone: SwapHorizOutlined, filhos: [{ rotulo: 'Adiantamentos/ Empréstimos', para: '/erp/adiantamentos' }] },
      { rotulo: 'Recibos', icone: ReceiptOutlined, filhos: [{ rotulo: 'Consulta de Recibos', para: '/erp/recibos' }] },
      { rotulo: 'Orçamento', icone: CalculateOutlined },
      { rotulo: 'Orçado × Realizado', icone: BalanceOutlined },
    ],
  },
  {
    rotulo: 'Produção', icone: FactoryOutlined, filhos: [
      { rotulo: 'Produção (MRP)', icone: FactoryOutlined, filhos: em('Lançamento de Produção', 'Consulta de Produções', 'Painel de Produções',
        'Relatório de Produções', 'Relatório de Produtos/Componentes', 'Configurador de Status', 'Consumo Previsto × Real') },
    ],
  },
  {
    rotulo: 'Gerencial', icone: TrendingUpOutlined, filhos: [
      { rotulo: 'Painéis', icone: AreaChartOutlined, filhos: em('Painel Gerencial') },
      { rotulo: 'Relatórios', icone: AssignmentOutlined, filhos: em('Análise de Despesas e Receitas') },
      { rotulo: 'DRE Financeiro', icone: AssessmentOutlined },
    ],
  },
];

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const combinaBusca = (rotulo: string, busca: string) => semAcento(rotulo).includes(semAcento(busca.trim()));

/** Caminho (rótulos, do módulo até o item) da tela atual, para o menu abrir já nele; vazio se a tela não está no menu. */
export function caminhoDaTela(pathname: string): string[] {
  // A ficha (/erp/pessoas/1021) fica sob a consulta; "novo"/"nova" têm item próprio.
  const casa = (para: string) => pathname === para || (!/\/(novo|nova)$/.test(para) && pathname.startsWith(`${para}/`) && !/\/(novo|nova)$/.test(pathname));
  let melhor: string[] = [];
  let tamanho = 0;
  const achar = (itens: ItemMenuErp[], pai: string[]) => {
    for (const i of itens) {
      const caminho = [...pai, i.rotulo];
      if (i.para && casa(i.para) && i.para.length > tamanho) { melhor = caminho; tamanho = i.para.length; }
      if (i.filhos) achar(i.filhos, caminho);
    }
  };
  for (const m of MENU_ERP) achar(m.filhos, [m.rotulo]);
  return melhor;
}
