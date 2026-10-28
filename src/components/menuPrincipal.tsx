import type { ReactNode } from 'react';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ListAltIcon from '@mui/icons-material/ListAlt';
import DirectionsCarFilledIcon from '@mui/icons-material/DirectionsCarFilled';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import EngineeringIcon from '@mui/icons-material/Engineering';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import type { AuthorizationProfile } from '../services/authorizationProfile';
import { temAlgumaCredencial, temCredencial, type Credencial } from '../services/credenciais';

// Áreas do sistema: cards da Home e menu lateral aberto pelo cabeçalho nas demais páginas.
export type MenuPrincipalItem = {
  label: string;
  icon: ReactNode;
  color: string;
  accent: string;
  to?: string;
  // Quem vê: 'qualquer' credencial, só 'adm2', ou uma credencial (o adm2 vê tudo).
  acesso: 'qualquer' | 'adm2' | Exclude<Credencial, 'adm2'>;
  children?: Array<{ label: string; to: string; icon: ReactNode }>;
};

export const menuPrincipal: MenuPrincipalItem[] = [
  {
    label: 'The Manuscript',
    icon: <MenuBookRoundedIcon fontSize="large" />,
    color: '#EDF3F7',
    accent: '#174F76',
    to: '/the-manuscript',
    acesso: 'adm2',
  },
  {
    label: 'Friday',
    icon: <ViewKanbanOutlinedIcon fontSize="large" />,
    color: '#EAF4FF',
    accent: '#1F4E8C',
    to: '/friday',
    acesso: 'escritorio',
  },
  {
    label: 'Cadastros',
    icon: <AssignmentIndIcon fontSize="large" />,
    color: '#EAF2F8',
    accent: '#2F6B98',
    to: '/cadastros',
    acesso: 'adm2',
  },
  {
    label: 'Frota',
    icon: <DirectionsCarFilledIcon fontSize="large" />,
    color: '#EEF5F1',
    accent: '#2E9D6F',
    acesso: 'adm2',
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
    to: '/combustivel',
    acesso: 'adm2',
  },
  {
    label: 'Engenharia',
    icon: <EngineeringIcon fontSize="large" />,
    color: '#F2F0FA',
    accent: '#6B5CA5',
    acesso: 'engenharia',
    children: [
      { label: 'Cronograma', to: '/engenharia/cronograma', icon: <CalendarMonthIcon /> },
      { label: 'Prazos contratuais', to: '/engenharia/prazos', icon: <EventBusyIcon /> },
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
];

// Cada área aparece para quem tem a sua credencial; o adm2 vê tudo. Quem só tem credenciais do app
// (motorista, frentista, mecânico) vê o Meu perfil.
export function filtrarMenuPrincipal(profile: AuthorizationProfile | null): MenuPrincipalItem[] {
  return menuPrincipal.filter((item) => {
    if (item.acesso === 'qualquer') return temAlgumaCredencial(profile);
    if (item.acesso === 'adm2') return temCredencial(profile);
    return temCredencial(profile, item.acesso);
  });
}
