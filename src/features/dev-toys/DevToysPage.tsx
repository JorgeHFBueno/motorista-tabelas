import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CHAVE_BOOT_VISTO, deveMostrarBoot } from './boot';
import { CrtContexto } from './crt/contexto';
import { forcaCrt } from './crt/parametros';
import { gravarPrefs, lerPrefs, type PrefsDev } from './prefs';
import BootScreen from './shell/BootScreen';
import Desktop from './shell/Desktop';
import './devtoys.css';

const sessao = () => { try { return sessionStorage; } catch { return null; } };

function useMovimentoReduzido() {
  const [reduzido, setReduzido] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const mudar = () => setReduzido(mq.matches);
    mq.addEventListener('change', mudar);
    return () => mq.removeEventListener('change', mudar);
  }, []);
  return reduzido;
}

// Rota /dev (só a credencial retr0): boot falso (uma vez por sessão, ou sempre pela preferência) e depois o Desktop,
// os dois sob o mesmo CRT em CSS. Os brinquedos em canvas recebem a força do CRT pelo contexto.
export default function DevToysPage() {
  const [prefs, setPrefs] = useState<PrefsDev>(lerPrefs);
  const [tela, setTela] = useState<'boot' | 'desktop'>(() => (deveMostrarBoot(prefs.bootSempre, sessao()) ? 'boot' : 'desktop'));
  // O Desktop "liga" como um CRT só quando vem do boot.
  const [ligando, setLigando] = useState(false);
  const movimentoReduzido = useMovimentoReduzido();
  const forca = forcaCrt(prefs.crt, prefs.crtIntensidade);
  const crt = useMemo(() => ({ forca, movimentoReduzido }), [forca, movimentoReduzido]);

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

  return (
    <div className={`devtoys${forca > 0 ? ' dt-crt-on' : ''}`} style={{ '--crt-forca': forca } as CSSProperties}>
      <CrtContexto.Provider value={crt}>
        {tela === 'boot'
          ? <BootScreen onFim={fimDoBoot} />
          : <Desktop ligando={ligando} prefs={prefs} onPrefs={mudarPrefs} onReiniciar={() => setTela('boot')} />}
      </CrtContexto.Provider>
      {forca > 0 && <div className="dt-crt" aria-hidden="true" />}
    </div>
  );
}
