import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';

// Ícone da área ERP (2026-11-27, pedido do responsável): o símbolo da marca ERP Ledur (public/logo-erp-ledur.svg) sem as
// letras, ou seja, o círculo aberto em degradê que entra na seta do L da Ledur (repositório ledur-marca). O L acompanha a
// cor do texto (azul-marinho no card da Home, branco no menu lateral); o círculo vai de um azul médio ao cinza da seta, que
// aparecem nos dois fundos. Traço mais grosso que o da marca, para ler em tamanho de ícone.

// Pontos do círculo e da volta até a seta (mesma conta da marca, com menos trechos).
const PONTOS: Array<[number, number]> = [
  [198.6, 49.5], [202, 41.8], [206.5, 34.7], [211.8, 28.3], [218.1, 22.7], [225, 18], [232.5, 14.4], [240.5, 11.8], [248.7, 10.3], [257.1, 10],
  [265.4, 10.9], [273.5, 12.9], [281.3, 16.1], [288.6, 20.3], [295.1, 25.4], [301, 31.4], [305.9, 38.2], [309.8, 45.6], [312.7, 53.5], [314.4, 61.6],
  [315, 70], [314.4, 78.4], [312.7, 86.5], [309.8, 94.4], [305.9, 101.8], [301, 108.6], [295.1, 114.6], [288.6, 119.7], [281.3, 123.9], [273.5, 127.1],
  [265.4, 129.1], [257.1, 130], [248.7, 129.7], [240.5, 128.2], [232.5, 125.6], [225, 122], [218.1, 117.3], [211.8, 111.7], [206.5, 105.3], [202, 98.2],
  [198.6, 90.5], [198.1, 88], [198.4, 86.1], [199.5, 84.8], [201.3, 83.9], [203.8, 83.3], [206.7, 83], [210.1, 82.9], [213.9, 83], [217.9, 83.1],
  [222, 83.1], [234, 83.1],
];
const INICIO = [61, 139, 196];
const FIM = [138, 141, 139];
const CINZA = '#8a8d8b';
const TRECHOS = PONTOS.slice(1).map(([x, y], i) => {
  const t = i / (PONTOS.length - 2);
  const cor = INICIO.map((v, k) => Math.round(v + (FIM[k] - v) * t));
  return { d: `M${PONTOS[i][0]} ${PONTOS[i][1]}L${x} ${y}`, cor: `rgb(${cor.join(',')})` };
});

export default function IconeErp(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="190 4 130 130" {...props}>
      <g fill="none" strokeWidth={9} strokeLinecap="round">
        {TRECHOS.map((t) => <path key={t.d} d={t.d} stroke={t.cor} />)}
      </g>
      <g transform="translate(234 41) scale(0.3438)">
        <path d="M42.30 116.43L42.30 0.00L0.00 0.00L0.00 74.13C16.52 90.65 25.78 99.91 42.30 116.43Z" />
        <path d="M2.15 168.69L120.70 168.69L120.70 124.79L46.05 124.79C28.90 141.93 19.29 151.54 2.15 168.69L2.15 168.69Z" />
        <path fill={CINZA} d="M36.57 122.48L0.00 85.88C2.32 95.35 4.47 107.99 4.42 122.94C4.38 137.46 2.28 149.77 0.00 159.07C12.19 146.87 24.38 134.68 36.57 122.48Z" />
      </g>
    </SvgIcon>
  );
}
