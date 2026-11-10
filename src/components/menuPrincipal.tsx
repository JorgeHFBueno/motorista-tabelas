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
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import NewspaperOutlinedIcon from '@mui/icons-material/NewspaperOutlined';
import IconeDev from '../features/dev-toys/IconeDev';
import type { AuthorizationProfile } from '../services/authorizationProfile';
import { temAlgumaCredencial, temCredencial, type Credencial } from '../services/credenciais';

// Áreas do sistema: cards da Home e menu lateral aberto pelo cabeçalho nas demais páginas.
export type MenuPrincipalItem = {
  label: string;
  icon: ReactNode;
  color: string;
  accent: string;
  to?: string;
  // Quem vê: 'qualquer' credencial ou as credenciais da área (o adm2 vê tudo, salvo as exclusivas, como retr0).
  acesso: 'qualquer' | Exclude<Credencial, 'adm2'>[];
  children?: Array<{ label: string; to: string; icon: ReactNode }>;
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
    icon: <ViewKanbanOutlinedIcon fontSize="large" />,
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
      { label: 'Usuários', to: '/cadastros/editar/usuarios', icon: <PeopleAltOutlinedIcon /> },
      { label: 'Novo usuário', to: '/cadastros/usuarios/novo', icon: <PersonAddAltOutlinedIcon /> },
      { label: 'Credenciais Kiosk', to: '/cadastros/usuarios/kiosk', icon: <QrCode2RoundedIcon /> },
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
      { label: 'Veículos', to: '/frota/veiculos', icon: <LocalShippingOutlinedIcon /> },
      { label: 'Registros', to: '/frota/registros', icon: <ListAltIcon /> },
      { label: 'Checklists', to: '/frota/checklists', icon: <FactCheckOutlinedIcon /> },
      { label: 'KPI', to: '/frota/analytics', icon: <InsightsOutlinedIcon /> },
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
      { label: 'Registros', to: '/combustivel/registros', icon: <ReceiptLongOutlinedIcon /> },
      { label: 'Bombas', to: '/combustivel/bombas', icon: <OilBarrelOutlinedIcon /> },
    ],
  },
  {
    label: 'Engenharia',
    icon: <EngineeringIcon fontSize="large" />,
    color: '#F2F0FA',
    accent: '#6B5CA5',
    acesso: ['engenharia'],
    children: [
      { label: 'Cronograma', to: '/engenharia/cronograma', icon: <CalendarMonthIcon /> },
      { label: 'Prazos contratuais', to: '/engenharia/prazos', icon: <EventBusyIcon /> },
      { label: 'Obras', to: '/engenharia/obras', icon: <ConstructionIcon /> },
    ],
  },
  {
    label: 'Logística',
    icon: <LocalShippingOutlinedIcon fontSize="large" />,
    color: '#EEF3FA',
    accent: '#3A6EA5',
    acesso: ['logistica', 'mecanico'],
    children: [{ label: 'Cronograma', to: '/logistica/cronograma', icon: <CalendarMonthIcon /> }],
  },
  {
    // Lado da equipe do portal do cliente (The Manuscript, 16_PORTAL_DO_CLIENTE.md).
    label: 'Portal do cliente',
    icon: <HandshakeOutlinedIcon fontSize="large" />,
    color: '#EAF2F8',
    accent: '#2F6B98',
    acesso: ['engenharia', 'escritorio'],
    children: [
      { label: 'Clientes', to: '/portal-cliente/clientes', icon: <PeopleAltOutlinedIcon /> },
      { label: 'Contratos', to: '/portal-cliente/contratos', icon: <DescriptionOutlinedIcon /> },
      { label: 'Atendimento', to: '/portal-cliente/atendimento', icon: <SupportAgentOutlinedIcon /> },
      { label: 'Notícias', to: '/portal-cliente/noticias', icon: <NewspaperOutlinedIcon /> },
    ],
  },
  {
    label: 'Meu perfil',
    icon: <PersonOutlineRoundedIcon fontSize="large" />,
    color: '#F3F6F9',
    accent: '#3D5A73',
    to: '/perfil',
    acesso: 'qualquer',
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

// Cada área aparece para quem tem a sua credencial; o adm2 vê tudo, salvo as exclusivas (retr0). Quem só tem credenciais do app
// (motorista, frentista) vê o Meu perfil.
export function filtrarMenuPrincipal(profile: AuthorizationProfile | null): MenuPrincipalItem[] {
  return menuPrincipal.filter((item) => {
    if (item.acesso === 'qualquer') return temAlgumaCredencial(profile);
    return temCredencial(profile, ...item.acesso);
  });
}
