import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { matchPath, useLocation } from 'react-router-dom';

// Title of the current page, shown in the header (same model as the client portal). Each route has a default here; a page
// whose title depends on its data (a vehicle, a checklist) sets it with useTituloPagina. Only the Home has a subtitle.
// A page with a logo shows it instead of the title text (the title stays as the image's alt).
// The list is also the map of pages used by the header's back button (rotaAnterior).
export type TituloPagina = { titulo: string; subtitulo?: string; logo?: string };

const FRIDAY = { titulo: 'Friday' };
// Abastecedora Ledur logo (white with an amber shadow) on the fuel pages.
const ABASTECEDORA = { logo: '/logo-abastecedora-ledur.svg' };

const TITULOS: Array<{ padrao: string } & TituloPagina> = [
  // /login and /acesso-negado have no title: the header shows the logo there.
  { padrao: '/', titulo: 'Bem-vindo ao painel', subtitulo: 'Escolha uma área para começar a trabalhar.' },
  { padrao: '/perfil', titulo: 'Meu perfil' },
  { padrao: '/friday', ...FRIDAY },
  { padrao: '/friday/meu-trabalho', ...FRIDAY },
  { padrao: '/friday/arquivo', ...FRIDAY },
  { padrao: '/friday/importar-monday', ...FRIDAY },
  { padrao: '/friday/quadros/:id', ...FRIDAY },
  { padrao: '/friday/quadros/:id/automacoes', ...FRIDAY },
  { padrao: '/engenharia/cronograma', titulo: 'Cronograma de Obras' },
  { padrao: '/engenharia/prazos', titulo: 'Cronograma de prazos contratuais' },
  { padrao: '/engenharia/obras', titulo: 'Obras' },
  { padrao: '/engenharia/obras/:id', titulo: 'Detalhes da Obra' },
  { padrao: '/dev', titulo: 'DEV' },
  { padrao: '/the-manuscript/*', titulo: 'The Manuscript' },
  { padrao: '/combustivel/registros', titulo: 'Registros de combustível', ...ABASTECEDORA },
  { padrao: '/combustivel/registros/novo', titulo: 'Lançamento de combustível' },
  { padrao: '/cadastros/usuarios/novo', titulo: 'Cadastro de usuários' },
  { padrao: '/cadastros/usuarios/kiosk', titulo: 'Credenciais Kiosk' },
  { padrao: '/cadastros/editar/usuarios', titulo: 'Usuários' },
  { padrao: '/frota/veiculos', titulo: 'Veículos' },
  { padrao: '/frota/veiculos/:id', titulo: 'Detalhes do Veículo' },
  { padrao: '/frota/registros', titulo: 'Registros' },
  { padrao: '/frota/checklists', titulo: 'Checklists' },
  { padrao: '/frota/checklists/:id', titulo: 'Checklist' },
  { padrao: '/frota/analytics', titulo: 'Analytics da Frota' },
  { padrao: '/combustivel/bombas', titulo: 'Bombas', ...ABASTECEDORA },
  { padrao: '/logistica/cronograma', titulo: 'Cronograma Logístico' },
  { padrao: '/portal-cliente/clientes', titulo: 'Clientes do portal' },
  { padrao: '/portal-cliente/contratos', titulo: 'Contratos no portal' },
  { padrao: '/portal-cliente/contratos/:id', titulo: 'Contrato no portal' },
  { padrao: '/portal-cliente/atendimento', titulo: 'Atendimento do portal' },
  { padrao: '/portal-cliente/noticias', titulo: 'Notícias do portal' },
];

const tituloDaRota = (caminho: string): TituloPagina | null => {
  const encontrado = TITULOS.find(({ padrao }) => matchPath({ path: padrao, end: true }, caminho));
  return encontrado ? { titulo: encontrado.titulo, subtitulo: encontrado.subtitulo, logo: encontrado.logo } : null;
};

// A path that is a page of its own. A "/*" route (The Manuscript's documents) counts only at its root.
const ehPagina = (caminho: string) =>
  TITULOS.some(({ padrao }) => (padrao.endsWith('/*') ? padrao.slice(0, -2) === caminho : matchPath({ path: padrao, end: true }, caminho)));

// Where the header's back button goes: up the URL to the nearest page, until the Home
// (/cadastros/usuarios/novo -> /cadastros -> /). A group without a page of its own (/frota) is skipped. Null on the Home.
export function rotaAnterior(caminho: string): string | null {
  const partes = caminho.split('/').filter(Boolean);
  if (partes.length === 0) return null;
  for (let fim = partes.length - 1; fim > 0; fim -= 1) {
    const ancestral = `/${partes.slice(0, fim).join('/')}`;
    if (ehPagina(ancestral)) return ancestral;
  }
  return '/';
}

type ContextoCabecalho = {
  titulo: TituloPagina | null;
  definir: (titulo: TituloPagina | null) => void;
};

const CabecalhoPaginaContext = createContext<ContextoCabecalho | null>(null);

export function CabecalhoPaginaProvider({ children }: { children: ReactNode }) {
  const [titulo, definir] = useState<TituloPagina | null>(null);
  const value = useMemo(() => ({ titulo, definir }), [titulo]);
  return <CabecalhoPaginaContext.Provider value={value}>{children}</CabecalhoPaginaContext.Provider>;
}

// Title shown in the header: the one set by the page, or the route default.
export function useCabecalhoPagina(): TituloPagina | null {
  const { pathname } = useLocation();
  const contexto = useContext(CabecalhoPaginaContext);
  return contexto?.titulo ?? tituloDaRota(pathname);
}

// A page sets its own title while it is open (e.g. "Checklist ABC1D23"); the route default comes back when it closes.
export function useTituloPagina(titulo: string | null | undefined) {
  const definir = useContext(CabecalhoPaginaContext)?.definir;
  useEffect(() => {
    if (!definir || !titulo) return;
    definir({ titulo });
    return () => definir(null);
  }, [definir, titulo]);
}
