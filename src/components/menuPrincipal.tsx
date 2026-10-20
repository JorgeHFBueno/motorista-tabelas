import type { ReactNode } from 'react';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ListAltIcon from '@mui/icons-material/ListAlt';
import DirectionsCarFilledIcon from '@mui/icons-material/DirectionsCarFilled';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import EngineeringIcon from '@mui/icons-material/Engineering';
import ConstructionIcon from '@mui/icons-material/Construction';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import type { AuthorizationProfile } from '../services/authorizationProfile';
import { isWebAdminAuthorized } from '../services/webAuthorization';

// Áreas do sistema: cards da Home e menu lateral aberto pelo cabeçalho nas demais páginas.
export type MenuPrincipalItem = {
  label: string;
  icon: ReactNode;
  color: string;
  accent: string;
  to?: string;
  requiresAdm2?: boolean;
  visibleToAll?: boolean;
  children?: Array<{ label: string; to: string; icon: ReactNode }>;
};

export const menuPrincipal: MenuPrincipalItem[] = [
  {
    label: 'The Manuscript',
    icon: <MenuBookRoundedIcon fontSize="large" />,
    color: '#EDF3F7',
    accent: '#174F76',
    to: '/the-manuscript',
    visibleToAll: true,
  },
  {
    label: 'Cadastros',
    icon: <AssignmentIndIcon fontSize="large" />,
    color: '#EAF2F8',
    accent: '#2F6B98',
    to: '/cadastros',
  },
  {
    label: 'Registros',
    icon: <ListAltIcon fontSize="large" />,
    color: '#F6F7F8',
    accent: '#5B5D5B',
    to: '/registros',
  },
  {
    label: 'Frota',
    icon: <DirectionsCarFilledIcon fontSize="large" />,
    color: '#EEF5F1',
    accent: '#2E9D6F',
    to: '/frota',
  },
  {
    label: 'Combustível',
    icon: <LocalGasStationIcon fontSize="large" />,
    color: '#FFF6E8',
    accent: '#E79A25',
    to: '/combustivel/novo',
  },
  {
    label: 'Engenharia',
    icon: <EngineeringIcon fontSize="large" />,
    color: '#F2F0FA',
    accent: '#6B5CA5',
    requiresAdm2: true,
    children: [
      { label: 'Obras', to: '/engenharia/obras', icon: <ConstructionIcon /> },
      { label: 'Cronograma', to: '/engenharia/cronograma', icon: <CalendarMonthIcon /> },
      { label: 'Prazos contratuais', to: '/engenharia/prazos', icon: <EventBusyIcon /> },
    ],
  },
];

// adm1 vê só Combustível e o que é de todos; Engenharia é de adm2. Quem não é admin web
// (ex.: funcionário que só usa Friday/The Manuscript) vê apenas o que é de todos.
export function filtrarMenuPrincipal(profile: AuthorizationProfile | null): MenuPrincipalItem[] {
  const isAdm1 = profile?.adm1 === true;
  const isAdm2 = profile?.adm2 === true;
  const isAdmin = isWebAdminAuthorized(profile);
  return menuPrincipal.filter((action) => {
    if (!isAdmin) return action.visibleToAll === true;
    if (action.requiresAdm2) return isAdm2;
    return !isAdm1 || action.label === 'Combustível' || action.visibleToAll;
  });
}

// adm2 abre o histórico; os demais vão direto ao lançamento (adm1 confirma o montante antes).
export const destinoCombustivel = (isAdm2: boolean) => (isAdm2 ? '/combustivel' : '/combustivel/novo');
