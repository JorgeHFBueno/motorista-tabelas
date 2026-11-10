import type { ReactNode } from 'react';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ListAltIcon from '@mui/icons-material/ListAlt';
import DirectionsCarFilledIcon from '@mui/icons-material/DirectionsCarFilled';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import OilBarrelOutlinedIcon from '@mui/icons-material/OilBarrelOutlined';
import EngineeringIcon from '@mui/icons-material/Engineering';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import ConstructionIcon from '@mui/icons-material/Construction';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import NewspaperOutlinedIcon from '@mui/icons-material/NewspaperOutlined';
import IconeDev from '../features/dev-toys/IconeDev';
import IconeFriday from '../features/friday-gestao-interna/IconeFriday';
import type { AuthorizationProfile } from '../services/authorizationProfile';
import { temAlgumaCredencial, temCredencial, type Credencial } from '../services/credenciais';

type Acesso = 'qualquer' | Exclude<Credencial, 'adm2'>[];

// Áreas do sistema: cards da Home e menu lateral aberto pelo cabeçalho nas demais páginas.
export type MenuPrincipalItem = {
  label: string;
  icon: ReactNode;
  color: string;
  accent: string;
  to?: string;
  // Quem vê: 'qualquer' credencial ou as credenciais da área (o adm2 vê tudo, salvo as exclusivas, como retr0).
  acesso: Acesso;
  // Subitens do grupo: o card da Home mostra a descrição. Sem acesso próprio, vale o do grupo; o grupo aparece se algum subitem aparecer.
  children?: Array<{ label: string; to: string; icon: ReactNode; descricao: string; acesso?: Acesso }>;
  // Item desenhado como telinha CRT, só com o ícone (área DEV): card escuro na Home, sem texto no menu lateral.
  crt?: true;
};

export const menuPrincipal: MenuPrincipalItem[] = [
  {
    label: 'The Manuscript',
    icon: <MenuBookRoundedIcon fontSize="large" />,
    color: '#EDF3F7',
    accent: '#174F76',
    to: '/the-manuscript/mapa',
    acesso: ['autor'],
  },
  {
    label: 'Friday',
    icon: <IconeFriday fontSize="large" />,
    color: '#EAF4FF',
    accent: '#1F4E8C',
    to: '/friday',
    acesso: ['escritorio'],
  },
  {
    label: 'Cadastros',
    icon: <AssignmentIndIcon fontSize="large" />,
    color: '#EAF2F8',
    accent: '#2F6B98',
    acesso: ['escritorio'],
    children: [
      { label: 'Usuários', to: '/cadastros/editar/usuarios', icon: <PeopleAltOutlinedIcon />, descricao: 'Contas do sistema, credenciais e o QR/PIN do Kiosk' },
      { label: 'Novo usuário', to: '/cadastros/usuarios/novo', icon: <PersonAddAltOutlinedIcon />, descricao: 'Cadastrar um funcionário com login' },
      // Meu perfil é de qualquer credencial: quem não tem escritorio vê o grupo só com ele.
      { label: 'Meu perfil', to: '/perfil', icon: <PersonOutlineRoundedIcon />, descricao: 'Seus dados, login e senha', acesso: 'qualquer' },
    ],
  },
  {
    label: 'Frota',
    icon: <DirectionsCarFilledIcon fontSize="large" />,
    color: '#EEF5F1',
    accent: '#2E9D6F',
    acesso: ['mecanico', 'logistica'],
    // Ordem em grade de duas colunas: Veículos | Registros, Checklists | KPI.
    children: [
      { label: 'Veículos', to: '/frota/veiculos', icon: <LocalShippingOutlinedIcon />, descricao: 'Frota, manutenções e custos de cada veículo' },
      { label: 'Registros', to: '/frota/registros', icon: <ListAltIcon />, descricao: 'Saídas e chegadas registradas no app' },
      { label: 'Checklists', to: '/frota/checklists', icon: <FactCheckOutlinedIcon />, descricao: 'Checklists de veículos e máquinas' },
      { label: 'KPI', to: '/frota/analytics', icon: <InsightsOutlinedIcon />, descricao: 'Indicadores da frota desde 01/01/2025' },
    ],
  },
  {
    label: 'Combustível',
    icon: <LocalGasStationIcon fontSize="large" />,
    color: '#FFF6E8',
    accent: '#E79A25',
    // /combustivel não tem página própria. Bombas também abre para o mecanico, pela URL (a rota aceita as duas credenciais).
    acesso: ['logistica'],
    children: [
      { label: 'Registros', to: '/combustivel/registros', icon: <ReceiptLongOutlinedIcon />, descricao: 'Histórico e lançamento de abastecimentos' },
      { label: 'Bombas', to: '/combustivel/bombas', icon: <OilBarrelOutlinedIcon />, descricao: 'Estoque, montante e entradas de diesel' },
    ],
  },
  {
    label: 'Engenharia',
    icon: <EngineeringIcon fontSize="large" />,
    color: '#F2F0FA',
    accent: '#6B5CA5',
    acesso: ['engenharia'],
    children: [
      { label: 'Cronograma', to: '/engenharia/cronograma', icon: <CalendarMonthIcon />, descricao: 'Andamento das obras ao longo do tempo' },
      { label: 'Prazos contratuais', to: '/engenharia/prazos', icon: <EventBusyIcon />, descricao: 'Prazos dos contratos das obras públicas' },
      { label: 'Obras', to: '/engenharia/obras', icon: <ConstructionIcon />, descricao: 'Lista das obras e o detalhe de cada uma' },
    ],
  },
  {
    label: 'Logística',
    icon: <LocalShippingOutlinedIcon fontSize="large" />,
    color: '#EEF3FA',
    accent: '#3A6EA5',
    acesso: ['logistica', 'mecanico'],
    children: [{ label: 'Cronograma', to: '/logistica/cronograma', icon: <CalendarMonthIcon />, descricao: 'Quem sai, para qual obra, com qual veículo e por quê' }],
  },
  {
    // Lado da equipe do portal do cliente (The Manuscript, 16_PORTAL_DO_CLIENTE.md).
    label: 'Portal do cliente',
    icon: <HandshakeOutlinedIcon fontSize="large" />,
    color: '#EAF2F8',
    accent: '#2F6B98',
    acesso: ['engenharia', 'escritorio'],
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
    acesso: ['retr0'],
    crt: true,
  },
];

const temAcesso = (profile: AuthorizationProfile | null, acesso: Acesso) =>
  acesso === 'qualquer' ? temAlgumaCredencial(profile) : temCredencial(profile, ...acesso);

// Cada área aparece para quem tem a sua credencial; o adm2 vê tudo, salvo as exclusivas (retr0). Um grupo mostra só os subitens
// que a pessoa pode abrir e some sem nenhum. Quem só tem credenciais do app (motorista, frentista) vê Cadastros com o Meu perfil.
export function filtrarMenuPrincipal(profile: AuthorizationProfile | null): MenuPrincipalItem[] {
  return menuPrincipal.flatMap((item) => {
    if (!item.children) return temAcesso(profile, item.acesso) ? [item] : [];
    const children = item.children.filter((child) => temAcesso(profile, child.acesso ?? item.acesso));
    return children.length ? [{ ...item, children }] : [];
  });
}
