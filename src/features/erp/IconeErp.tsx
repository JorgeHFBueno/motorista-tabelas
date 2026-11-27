import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';

// Ícone da área ERP (2026-11-27, pedido do responsável): o símbolo "L" da Ledur, do repositório ledur-marca (o mesmo da
// marca ERP Ledur em public/logo-erp-ledur.svg), na cor do texto. A seta fica um pouco mais clara, como o cinza da logo.
// Usado no card da Home e no menu lateral.
export default function IconeErp(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="-24 0 168.69 168.69" {...props}>
      <path d="M42.30 116.43L42.30 0.00L0.00 0.00L0.00 74.13C16.52 90.65 25.78 99.91 42.30 116.43Z" />
      <path d="M2.15 168.69L120.70 168.69L120.70 124.79L46.05 124.79C28.90 141.93 19.29 151.54 2.15 168.69L2.15 168.69Z" />
      <path opacity="0.6" d="M36.57 122.48L0.00 85.88C2.32 95.35 4.47 107.99 4.42 122.94C4.38 137.46 2.28 149.77 0.00 159.07C12.19 146.87 24.38 134.68 36.57 122.48Z" />
    </SvgIcon>
  );
}
