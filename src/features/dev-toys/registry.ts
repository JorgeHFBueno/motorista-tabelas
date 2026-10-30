import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// Brinquedos da área DEV: cada um vira um ícone no Desktop e abre numa janela. Nada aqui grava dados.
export type DevToy = {
  id: string;
  nome: string;
  /** Path SVG 16×16, 1 bit (pintado com currentColor, regra evenodd). */
  icone: string;
  componente: LazyExoticComponent<ComponentType>;
  largura: number;
};

export const DEV_TOYS: DevToy[] = [
  {
    id: 'sobre',
    nome: 'Sobre o DEV',
    icone: 'M2 1h12v10H2zM3 2h10v8H3zM5 4h2v2H5zM9 4h2v2H9zM5 7h6v1H5zM4 12h8v1H4zM1 14h14v1H1z',
    componente: lazy(() => import('./toys/sobre/SobreToy')),
    largura: 340,
  },
];
