import { useCallback, useEffect, useState } from 'react';
import { CHAVE_BOOT_VISTO, deveMostrarBoot } from './boot';
import { gravarPrefs, lerPrefs, type PrefsDev } from './prefs';
import BootScreen from './shell/BootScreen';
import Desktop from './shell/Desktop';
import './devtoys.css';

const sessao = () => { try { return sessionStorage; } catch { return null; } };

// Rota /dev (só a credencial retr0): boot falso (uma vez por sessão, ou sempre pela preferência) e depois o Desktop.
export default function DevToysPage() {
  const [prefs, setPrefs] = useState<PrefsDev>(lerPrefs);
  const [tela, setTela] = useState<'boot' | 'desktop'>(() => (deveMostrarBoot(prefs.bootSempre, sessao()) ? 'boot' : 'desktop'));
  // O Desktop "liga" como um CRT só quando vem do boot.
  const [ligando, setLigando] = useState(false);

  // O Desktop cobre a tela inteira; a página de baixo não rola enquanto ele está aberto.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = anterior; };
  }, []);

  const fimDoBoot = useCallback(() => {
    try { sessao()?.setItem(CHAVE_BOOT_VISTO, '1'); } catch { /* sem armazenamento */ }
    setLigando(true);
    setTela('desktop');
  }, []);

  const mudarPrefs = (novas: PrefsDev) => { setPrefs(novas); gravarPrefs(novas); };

  if (tela === 'boot') return <BootScreen onFim={fimDoBoot} />;
  return <Desktop ligando={ligando} prefs={prefs} onPrefs={mudarPrefs} onReiniciar={() => setTela('boot')} />;
}
