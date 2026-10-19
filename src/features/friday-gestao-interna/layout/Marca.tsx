import { useState } from 'react';

// Logo do Friday: arquivo escolhido pela equipe em public/friday/ledur-logo.svg.
// Enquanto ele não existir, usa o logo que o sistema já publica.
const LOGO = '/friday/ledur-logo.svg';
const LOGO_RESERVA = '/logo_vetor.png';

export function LogoMarca({ className = 'marca-logo' }: { className?: string }) {
  const [src, setSrc] = useState(LOGO);
  return <img src={src} alt="Ledur Pré-Fabricados" className={className} onError={() => setSrc(LOGO_RESERVA)} />;
}
