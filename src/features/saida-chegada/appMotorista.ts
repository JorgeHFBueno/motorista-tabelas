// App Motorista instalado (2026-11-18): o WEB instalado a partir de /motorista abre só /motorista
// (public/manifest-motorista.webmanifest, start_url e scope /motorista). The Manuscript, 06_REGISTROS_E_CHECKLISTS.md.

/** Cores da Ledur, as mesmas do app Flutter (lib/core/theme/ledur_tema.dart, CoresLedur) e do tema da WEB. */
export const CORES_LEDUR = { azulMarinho: '#12293B', fundo: '#F7F9FB', borda: '#DDE3E8' } as const;

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
  // Cor da barra do celular (status e navegação, no app instalado): o azul-marinho do cabeçalho; nas demais, a do index.html.
  const tema = document.querySelector('meta[name="theme-color"]');
  if (tema) {
    tema.setAttribute('data-geral', tema.getAttribute('data-geral') ?? tema.getAttribute('content') ?? '');
    tema.setAttribute('content', motorista ? CORES_LEDUR.azulMarinho : tema.getAttribute('data-geral') ?? '');
  }
}

// ------------------------------------------------------------------ instalar (Android/Chrome)

/** Evento do Chrome que permite abrir a janela de instalação por um botão da página. */
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let eventoInstalar: EventoInstalar | null = null;
const ouvintesInstalar = new Set<() => void>();
const avisarInstalar = () => { for (const ouvinte of ouvintesInstalar) ouvinte(); };

// Guardado na carga da página: o Chrome o dispara uma vez. Só em /motorista, onde o manifesto é o do app Motorista e a
// página mostra o próprio aviso; nas demais telas o Chrome segue com o dele.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    if (!ehRotaMotorista(window.location.pathname)) return;
    e.preventDefault();
    eventoInstalar = e as EventoInstalar;
    avisarInstalar();
  });
  window.addEventListener('appinstalled', () => {
    eventoInstalar = null;
    avisarInstalar();
  });
}

export const assinarInstalar = (ouvinte: () => void) => {
  ouvintesInstalar.add(ouvinte);
  return () => { ouvintesInstalar.delete(ouvinte); };
};

/** O Chrome deixa instalar por um botão (Android; no iPhone, nunca). */
export const podeInstalarPorBotao = () => eventoInstalar != null;

/** Abre a janela de instalação do Chrome; true se a pessoa aceitou. */
export async function instalarPorBotao(): Promise<boolean> {
  const evento = eventoInstalar;
  if (!evento) return false;
  eventoInstalar = null;
  avisarInstalar();
  await evento.prompt();
  return (await evento.userChoice).outcome === 'accepted';
}
