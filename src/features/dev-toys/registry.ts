import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// Brinquedos da área DEV: cada um vira um ícone no Desktop e abre numa janela. Nada aqui grava dados.
export type DevToy = {
  id: string;
  nome: string;
  /** Path SVG 16×16, 1 bit (pintado com currentColor, regra evenodd). */
  icone: string;
  componente: LazyExoticComponent<ComponentType>;
  /** Largura da janela a 100% (a tela usa vezes ESCALA). */
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
  {
    id: 'padrao',
    nome: 'Padrao de teste',
    icone: 'M4 0h1v1h1v1h1v1H6V2H5V1H4zM11 0h1v1h-1v1h-1v1H9V2h1V1h1zM1 3h14v12H1zM2 4h12v10H2zM3 5h2v8H3zM6 5h2v8H6zM9 5h2v8H9zM12 5h1v8h-1z',
    componente: lazy(() => import('./toys/padrao/PadraoToy')),
    largura: 346, // canvas 320 + margens
  },
  {
    id: 'crawler',
    nome: 'Anomalias',
    icone: 'M5 0h1v1H5zM10 0h1v1h-1zM6 1h4v3H6zM5 5h6v9H5zM2 6h3v1H2zM11 6h3v1h-3zM1 9h4v1H1zM11 9h4v1h-4zM2 12h3v1H2zM11 12h3v1h-3z',
    componente: lazy(() => import('./toys/crawler/CrawlerToy')),
    largura: 506, // área 480 + margens
  },
  {
    id: 'viveiro',
    nome: 'Setor de Contencao',
    icone: 'M3 1h10v2H3zM1 4h14v11H1zM2 5h12v9H2zM5 9h1v1H5zM10 9h1v1h-1zM6 10h4v2H6zM5 12h1v1H5zM10 12h1v1h-1z',
    componente: lazy(() => import('./toys/viveiro/ViveiroToy')),
    largura: 430, // duas fichas por linha
  },
  {
    id: 'vinteum',
    nome: '21',
    // duas cartas, a da frente com um losango
    icone: 'M6 1h8v1H6zM6 2h1v2H6zM13 2h1v10h-1zM10 11h3v1h-3zM2 4h8v1H2zM2 14h8v1H2zM2 5h1v9H2zM9 5h1v9H9zM5 7h2v1H5zM4 8h4v2H4zM5 10h2v1H5z',
    componente: lazy(() => import('./toys/vinteum/VinteUmToy')),
    largura: 560, // mesa larga: nove cartas por linha
  },
  {
    id: 'poker',
    nome: 'Poker',
    icone: 'M3 1h10v14H3zM4 2h8v12H4zM7 5h2v1H7zM6 6h4v1H6zM5 7h6v2H5zM7 9h2v2H7z',
    componente: lazy(() => import('./toys/poker/PokerToy')),
    largura: 640,
  },
  {
    id: 'slot',
    nome: 'Slot Machine',
    icone: 'M3 1h8v1H3zM2 3h10v12H2zM3 5h8v4H3zM4 6h1v2H4zM6 6h2v2H6zM9 6h1v2H9zM5 11h4v1H5zM12 2h3v3h-3zM13 5h1v5h-1z',
    componente: lazy(() => import('./toys/slot/SlotToy')),
    largura: 520,
  },
  {
    id: 'xadrez',
    nome: 'Xadrez',
    icone: 'M7 0h2v1H7zM5 1h6v1H5zM7 2h2v2H7zM6 4h4v1H6zM4 5h8v3H4zM5 8h6v4H5zM3 12h10v3H3z',
    componente: lazy(() => import('./toys/xadrez/XadrezToy')),
    largura: 560,
  },
  {
    id: 'placar',
    nome: 'Placar de Lideres',
    icone: 'M3 1h10v1H3zM4 2h8v4H4zM7 3h2v1H7zM1 2h3v1H1zM12 2h3v1h-3zM1 3h1v2H1zM14 3h1v2h-1zM2 5h2v1H2zM12 5h2v1h-2zM5 6h6v1H5zM6 7h4v1H6zM7 8h2v3H7zM5 11h6v1H5zM4 12h8v2H4z',
    componente: lazy(() => import('./toys/placar/PlacarToy')),
    largura: 400,
  },
];
