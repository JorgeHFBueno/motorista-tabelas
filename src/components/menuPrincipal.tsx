import type { ReactNode } from 'react';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ListAltIcon from '@mui/icons-material/ListAlt';
import DirectionsCarFilledIcon from '@mui/icons-material/DirectionsCarFilled';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import OilBarrelOutlinedIcon from '@mui/icons-material/OilBarrelOutlined';
import EngineeringIcon from '@mui/icons-material/Engineering';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ConstructionIcon from '@mui/icons-material/Construction';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import NewspaperOutlinedIcon from '@mui/icons-material/NewspaperOutlined';
import AirportShuttleOutlinedIcon from '@mui/icons-material/AirportShuttleOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import ContactsOutlinedIcon from '@mui/icons-material/ContactsOutlined';
import IconeDev from '../features/dev-toys/IconeDev';
import IconeFriday from '../features/friday-gestao-interna/IconeFriday';
import type { AuthorizationProfile } from '../services/authorizationProfile';
import { editaArea, temAlgumaCredencial, temCredencial, veArea, type Credencial } from '../services/credenciais';
import type { Area } from '../services/areasWeb';

// 'qualquer': qualquer credencial ou área; 'retr0': só a credencial retr0 (DEV); { editar }: editar uma das áreas;
// { credencial }: uma das credenciais do app (o adm2 entra); senão, ver uma das áreas.
type Acesso = 'qualquer' | 'retr0' | Area[] | { editar: Area[] } | { credencial: Credencial[] };

// Áreas do sistema: cards da Home e menu lateral aberto pelo cabeçalho nas demais páginas.
export type MenuPrincipalItem = {
  label: string;
  icon: ReactNode;
  color: string;
  accent: string;
  to?: string;
  // Quem vê: 'qualquer', 'retr0' ou quem vê uma das áreas (o adm2 vê tudo, salvo a DEV).
  acesso: Acesso;
  // Subitens do grupo: o card da Home mostra a descrição. Sem acesso próprio, vale o do grupo; o grupo aparece se algum subitem aparecer.
  children?: Array<{ label: string; to: string; icon: ReactNode; descricao: string; acesso?: Acesso }>;
  // Item desenhado como telinha CRT, só com o ícone (área DEV): card escuro na Home, sem texto no menu lateral.
  crt?: true;
  // Só aparece no celular ou tablet (tela de toque); a rota continua aberta pelo endereço.
  soCelular?: true;
};

export const menuPrincipal: MenuPrincipalItem[] = [
  {
    // Saída e Chegada (2026-11-18, credencial motorista) e Checklist (2026-11-19, credencial mecanico) no WEB; o adm2 entra.
    // Não é uma área. Os botões ficam na página /motorista, que é também o início do app Motorista instalado.
    // 2026-11-19: o cartão só aparece no celular, onde o motorista e o mecânico usam.
    label: 'Motorista',
    icon: <AirportShuttleOutlinedIcon fontSize="large" />,
    // Azul-marinho da Ledur, como o app Flutter.
    color: '#EEF2F6',
    accent: '#12293B',
    to: '/motorista',
    acesso: { credencial: ['motorista', 'mecanico'] },
    soCelular: true,
  },
  {
    label: 'The Manuscript',
    icon: <MenuBookRoundedIcon fontSize="large" />,
    color: '#EDF3F7',
    accent: '#174F76',
    to: '/the-manuscript/mapa',
    acesso: ['manuscript'],
  },
  {
    label: 'Friday',
    icon: <IconeFriday fontSize="large" />,
    color: '#EAF4FF',
    accent: '#1F4E8C',
    to: '/friday',
    acesso: ['friday'],
  },
  {
    label: 'Cadastros',
    icon: <AssignmentIndIcon fontSize="large" />,
    color: '#EAF2F8',
    accent: '#2F6B98',
    acesso: ['cadastros'],
    children: [
      { label: 'Usuários', to: '/cadastros/editar/usuarios', icon: <PeopleAltOutlinedIcon />, descricao: 'Contas do sistema, credenciais e o QR/PIN do Kiosk' },
      { label: 'Novo usuário', to: '/cadastros/usuarios/novo', icon: <PersonAddAltOutlinedIcon />, descricao: 'Cadastrar um funcionário com login', acesso: { editar: ['cadastros'] } },
      { label: 'APIs', to: '/cadastros/apis', icon: <KeyOutlinedIcon />, descricao: 'Chaves das APIs de cada área para robôs, planilhas e o Claude', acesso: { credencial: ['adm2'] } },
      { label: 'Uso do sistema', to: '/cadastros/uso', icon: <QueryStatsOutlinedIcon />, descricao: 'Quais telas da WEB são abertas, por quem e quando', acesso: { credencial: ['adm2'] } },
      // Meu perfil é de qualquer credencial ou área: quem não vê Cadastros vê o grupo só com ele.
      { label: 'Meu perfil', to: '/perfil', icon: <PersonOutlineRoundedIcon />, descricao: 'Seus dados, login e senha', acesso: 'qualquer' },
    ],
  },
  {
    label: 'Mecânica',
    icon: <DirectionsCarFilledIcon fontSize="large" />,
    color: '#EEF5F1',
    accent: '#2E9D6F',
    acesso: ['mecanica'],
    // Ordem em grade de duas colunas: Veículos | Registros, Checklists | Revisões (2026-11-22).
    children: [
      { label: 'Veículos', to: '/mecanica/veiculos', icon: <LocalShippingOutlinedIcon />, descricao: 'Frota, manutenções e custos de cada veículo' },
      { label: 'Registros', to: '/mecanica/registros', icon: <ListAltIcon />, descricao: 'Saídas e chegadas registradas no app' },
      { label: 'Checklists', to: '/mecanica/checklists', icon: <FactCheckOutlinedIcon />, descricao: 'Checklists de veículos e máquinas' },
      { label: 'Revisões', to: '/mecanica/revisoes', icon: <BuildOutlinedIcon />, descricao: 'Idas ao mecânico: o que foi trocado, consertado ou revisado' },
    ],
  },
  {
    label: 'Engenharia',
    icon: <EngineeringIcon fontSize="large" />,
    color: '#F2F0FA',
    accent: '#6B5CA5',
    acesso: ['engenharia'],
    children: [
      { label: 'Cronograma', to: '/engenharia/cronograma', icon: <CalendarMonthIcon />, descricao: 'Andamento das obras, mestres e prazos contratuais' },
      { label: 'Obras', to: '/engenharia/obras', icon: <ConstructionIcon />, descricao: 'Lista das obras e o detalhe de cada uma' },
    ],
  },
  {
    // CRM da WEB (2026-11-23; The Manuscript, 17_COMERCIAL.md): veio da pasta CRM LEDUR do Friday.
    label: 'Comercial',
    icon: <TrendingUpOutlinedIcon fontSize="large" />,
    color: '#FBF3E8',
    accent: '#B86E1C',
    acesso: ['comercial'],
    children: [
      { label: 'Painel', to: '/comercial', icon: <InsightsOutlinedIcon />, descricao: 'Funil, conversão, ganhos e perdas por origem e responsável' },
      { label: 'Negócios', to: '/comercial/negocios', icon: <ViewKanbanOutlinedIcon />, descricao: 'Funil de vendas privado e público, com proposta, arquivos e histórico' },
      { label: 'Contatos', to: '/comercial/contatos', icon: <ContactsOutlinedIcon />, descricao: 'Clientes, leads, parceiros e fornecedores' },
    ],
  },
  {
    label: 'Logística',
    icon: <LocalShippingOutlinedIcon fontSize="large" />,
    color: '#EEF3FA',
    accent: '#3A6EA5',
    acesso: ['logistica'],
    // Ordem em grade de duas colunas: KPI | Comb. Registros, Comb. Bombas | Cronograma.
    children: [
      { label: 'KPI', to: '/logistica/kpi', icon: <InsightsOutlinedIcon />, descricao: 'Indicadores da frota desde 01/01/2025' },
      { label: 'Comb. Registros', to: '/logistica/combustivel/registros', icon: <ReceiptLongOutlinedIcon />, descricao: 'Histórico e lançamento de abastecimentos' },
      { label: 'Comb. Bombas', to: '/logistica/combustivel/bombas', icon: <OilBarrelOutlinedIcon />, descricao: 'Estoque, montante e entradas de diesel' },
      { label: 'Cronograma', to: '/logistica/cronograma', icon: <CalendarMonthIcon />, descricao: 'Quem sai, para qual obra, com qual veículo e por quê' },
    ],
  },
  {
    // Lado da equipe do portal do cliente (The Manuscript, 16_PORTAL_DO_CLIENTE.md).
    label: 'Portal do cliente',
    icon: <HandshakeOutlinedIcon fontSize="large" />,
    color: '#EAF2F8',
    accent: '#2F6B98',
    acesso: ['portal'],
    children: [
      { label: 'Clientes', to: '/portal-cliente/clientes', icon: <PeopleAltOutlinedIcon />, descricao: 'Logins dos clientes e os CNPJ/CPF de cada um' },
      { label: 'Contratos', to: '/portal-cliente/contratos', icon: <DescriptionOutlinedIcon />, descricao: 'Contratos publicados para os clientes' },
      { label: 'Atendimento', to: '/portal-cliente/atendimento', icon: <SupportAgentOutlinedIcon />, descricao: 'Chamados abertos pelos clientes' },
      { label: 'Notícias', to: '/portal-cliente/noticias', icon: <NewspaperOutlinedIcon />, descricao: 'Notícias mostradas aos clientes' },
    ],
  },
  {
    label: 'DEV',
    icon: <IconeDev fontSize="large" />,
    color: '#080603',
    accent: '#FFB000',
    to: '/dev',
    acesso: 'retr0',
    crt: true,
  },
];

const temAcesso = (profile: AuthorizationProfile | null, acesso: Acesso) =>
  acesso === 'qualquer' ? temAlgumaCredencial(profile)
    : acesso === 'retr0' ? temCredencial(profile, 'retr0')
      : Array.isArray(acesso) ? veArea(profile, ...acesso)
        : 'credencial' in acesso ? temCredencial(profile, ...acesso.credencial) : editaArea(profile, ...acesso.editar);

// Cada área aparece para quem a vê (areas); o adm2 vê tudo, salvo a DEV (retr0). Um grupo mostra só os subitens
// que a pessoa pode abrir e some sem nenhum. Quem só tem credenciais do app vê Cadastros com o Meu perfil; o motorista
// e o mecânico, no celular, também o cartão Motorista.
export const ehCelular = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function filtrarMenuPrincipal(profile: AuthorizationProfile | null, celular = ehCelular()): MenuPrincipalItem[] {
  return menuPrincipal.flatMap((item) => {
    if (item.soCelular && !celular) return [];
    if (!item.children) return temAcesso(profile, item.acesso) ? [item] : [];
    const children = item.children.filter((child) => temAcesso(profile, child.acesso ?? item.acesso));
    return children.length ? [{ ...item, children }] : [];
  });
}
