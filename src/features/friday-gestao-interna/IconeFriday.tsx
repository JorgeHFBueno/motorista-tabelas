import { useId } from 'react';
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';

// O "F" da logo do Friday (duas barras azuis inclinadas e o ponto laranja), usado no card da Home e no menu lateral.
// Cada peça é uma cápsula inclinada 16°, medida sobre a logo original. As cores são fixas: não herda a cor do menu.
export default function IconeFriday(props: SvgIconProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <SvgIcon viewBox="38 13 342 342" {...props}>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0A1FB5" />
          <stop offset="0.5" stopColor="#005CF1" />
          <stop offset="1" stopColor="#0099FA" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0A80F0" />
          <stop offset="1" stopColor="#0096FB" />
        </linearGradient>
      </defs>
      <rect x="-141.25" y="-42.75" width="282.5" height="85.5" rx="42.75" fill={`url(#${id}-a)`} transform="translate(232.5 93.5) skewX(-16)" />
      <rect x="-107.25" y="-38.75" width="214.5" height="77.5" rx="38.75" fill={`url(#${id}-b)`} transform="translate(177.5 191.5) skewX(-16)" />
      <rect x="-38.5" y="-36.25" width="77" height="72.5" rx="36.25" fill="#FF8700" transform="translate(84 280.5) skewX(-16)" />
    </SvgIcon>
  );
}
