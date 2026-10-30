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
    largura: 425,
  },
  {
    id: 'padrao',
    nome: 'Padrao de teste',
    icone: 'M4 0h1v1h1v1h1v1H6V2H5V1H4zM11 0h1v1h-1v1h-1v1H9V2h1V1h1zM1 3h14v12H1zM2 4h12v10H2zM3 5h2v8H3zM6 5h2v8H6zM9 5h2v8H9zM12 5h1v8h-1z',
    componente: lazy(() => import('./toys/padrao/PadraoToy')),
    largura: 432, // canvas 320 × 1,25 + margens
  },
  {
    id: 'crawler',
    nome: 'Crawler',
    icone: 'M5 0h1v1H5zM10 0h1v1h-1zM6 1h4v3H6zM5 5h6v9H5zM2 6h3v1H2zM11 6h3v1h-3zM1 9h4v1H1zM11 9h4v1h-4zM2 12h3v1H2zM11 12h3v1h-3z',
    componente: lazy(() => import('./toys/crawler/CrawlerToy')),
    largura: 632, // área 480 × 1,25 + margens
  },
];
