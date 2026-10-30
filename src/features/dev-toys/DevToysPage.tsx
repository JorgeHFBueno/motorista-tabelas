import { useEffect } from 'react';
import Desktop from './shell/Desktop';
import './devtoys.css';

// Rota /dev (só a credencial retr0): por enquanto abre direto no Desktop; o boot falso vem antes dele depois.
export default function DevToysPage() {
  // O Desktop cobre a tela inteira; a página de baixo não rola enquanto ele está aberto.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = anterior; };
  }, []);

  return <Desktop />;
}
