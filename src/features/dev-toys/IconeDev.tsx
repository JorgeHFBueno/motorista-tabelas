import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';
import './iconeDev.css';

// Símbolo da área DEV: o crânio do corvo (o mascote) de frente, um polígono só e simétrico em x=500. Os olhos e as
// narinas não têm borda: são cortes que atravessam o contorno, como os olhos da antiga raposa. Usado no card da Home e
// no menu lateral, numa "telinha" CRT: fundo escuro com scanlines e vinheta, e só o crânio brilha e oscila.
export default function IconeDev(props: SvgIconProps) {
  return (
    <span className="dev-crt-icone" aria-hidden="true">
      <SvgIcon viewBox="25 35 950 950" {...props}>
        <path d="M500 80L650 100L790 180L813 313L765 290L700 215L545 230L545 410L630 510L740 460L760 405L804 383L800 410L740 540L620 590L627 596L600 598L565 545L515 575L533 790L592 660L648 620L500 990L352 620L408 660L467 790L485 575L435 545L400 598L373 596L380 590L260 540L200 410L196 383L240 405L260 460L370 510L455 410L455 230L300 215L235 290L187 313L210 180L350 100Z" />
      </SvgIcon>
    </span>
  );
}
