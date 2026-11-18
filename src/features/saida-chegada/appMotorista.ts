// App Motorista instalado (2026-11-18): o WEB instalado a partir de /motorista abre só /motorista
// (public/manifest-motorista.webmanifest, start_url e scope /motorista). The Manuscript, 06_REGISTROS_E_CHECKLISTS.md.

export const MANIFESTO_GERAL = '/manifest.webmanifest';
export const MANIFESTO_MOTORISTA = '/manifest-motorista.webmanifest';

export const ehRotaMotorista = (caminho: string) => caminho === '/motorista' || caminho.startsWith('/motorista/');

const CHAVE = 'ledur-app-motorista';

function aberturaPeloIconeDoMotorista(): boolean {
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true;
  return standalone && ehRotaMotorista(window.location.pathname);
}

// Decidido uma vez por janela, na abertura: o app do Motorista abre em /motorista; o app geral, se alguém o tiver
// instalado, abre em "/" e não vira modo Motorista ao navegar até lá.
function decidir(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const salvo = sessionStorage.getItem(CHAVE);
    if (salvo != null) return salvo === '1';
    const app = aberturaPeloIconeDoMotorista();
    sessionStorage.setItem(CHAVE, app ? '1' : '0');
    return app;
  } catch {
    return aberturaPeloIconeDoMotorista();
  }
}

const appMotorista = decidir();

/** Aberto pelo ícone do app Motorista: sem menu lateral nem links para fora de /motorista. */
export const ehAppMotorista = () => appMotorista;

/** Nas telas /motorista, o navegador oferece instalar o app Motorista; nas demais, o app geral. */
export function aplicarManifestoDaRota(caminho: string) {
  const motorista = ehRotaMotorista(caminho);
  const link = document.querySelector('link[rel="manifest"]');
  const alvo = motorista ? MANIFESTO_MOTORISTA : MANIFESTO_GERAL;
  if (link && link.getAttribute('href') !== alvo) link.setAttribute('href', alvo);
  // Nome do ícone no iPhone ("Adicionar à Tela de Início").
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', motorista ? 'Motorista' : 'Ledur');
}
