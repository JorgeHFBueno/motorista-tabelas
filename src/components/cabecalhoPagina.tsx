import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { matchPath, useLocation } from 'react-router-dom';

// Title and subtitle of the current page, shown in the header (same model as the client portal). Each route has a default
// here; a page whose title depends on its data (a vehicle, a checklist) sets it with useTituloPagina.
export type TituloPagina = { titulo: string; subtitulo?: string };

const TITULOS: Array<{ padrao: string } & TituloPagina> = [
  // /login and /acesso-negado have no title: the header shows the logo there.
  { padrao: '/', titulo: 'Bem-vindo ao painel', subtitulo: 'Escolha uma área para começar a trabalhar.' },
  { padrao: '/perfil', titulo: 'Meu perfil' },
  { padrao: '/portfolio', titulo: 'Meteorologia' },
  { padrao: '/friday/*', titulo: 'Friday', subtitulo: 'Gestão interna em quadros' },
  { padrao: '/engenharia/cronograma', titulo: 'Cronograma de Obras' },
  { padrao: '/engenharia/prazos', titulo: 'Cronograma de prazos contratuais', subtitulo: 'Obras públicas' },
  { padrao: '/engenharia/obras', titulo: 'Obras' },
  { padrao: '/engenharia/obras/:id', titulo: 'Detalhes da Obra' },
  { padrao: '/checklist/*', titulo: 'Checklist' },
  { padrao: '/dev', titulo: 'DEV' },
  { padrao: '/the-manuscript/*', titulo: 'The Manuscript' },
  { padrao: '/combustivel', titulo: 'Combustível' },
  { padrao: '/combustivel/novo', titulo: 'Lançamento de combustível' },
  { padrao: '/cadastros', titulo: 'Cadastros', subtitulo: 'Administre usuários, categorias e fornecedores do sistema.' },
  { padrao: '/cadastros/usuarios/novo', titulo: 'Cadastro de usuários', subtitulo: 'Cadastre usuários internos no Firebase Authentication e em funcionarios.' },
  { padrao: '/cadastros/usuarios/kiosk', titulo: 'Credenciais Kiosk', subtitulo: 'Emita, substitua ou revogue QR Codes usados para identificação no terminal de abastecimento.' },
  { padrao: '/cadastros/editar/:tipo', titulo: 'Editar cadastro' },
  { padrao: '/frota/veiculos', titulo: 'Veículos' },
  { padrao: '/frota/veiculos/:id', titulo: 'Detalhes do Veículo' },
  { padrao: '/frota/registros', titulo: 'Registros' },
  { padrao: '/frota/checklists', titulo: 'Checklists', subtitulo: 'Checklists de veículos e máquinas, independentes dos registros de saída e chegada.' },
  { padrao: '/frota/checklists/:id', titulo: 'Checklist' },
  { padrao: '/frota/analytics', titulo: 'Analytics da Frota', subtitulo: 'KPI desde 01/01/2025' },
  { padrao: '/bombas', titulo: 'Bombas', subtitulo: 'Controle e acompanhamento das bombas de combustível' },
  { padrao: '/logistica/cronograma', titulo: 'Cronograma Logístico', subtitulo: 'Quem sai, para qual obra, com qual veículo e por qual motivo' },
  { padrao: '/portal-cliente/clientes', titulo: 'Clientes do portal', subtitulo: 'Logins dos clientes e os CNPJ/CPF que cada um representa' },
  { padrao: '/portal-cliente/contratos', titulo: 'Contratos no portal', subtitulo: 'Contratos de obras-v2 publicados para os clientes' },
  { padrao: '/portal-cliente/contratos/:id', titulo: 'Contrato no portal' },
  { padrao: '/portal-cliente/atendimento', titulo: 'Atendimento do portal', subtitulo: 'Chamados abertos pelos clientes' },
  { padrao: '/portal-cliente/noticias', titulo: 'Notícias do portal', subtitulo: 'Notícias institucionais mostradas aos clientes' },
];

const tituloDaRota = (caminho: string): TituloPagina | null => {
  const encontrado = TITULOS.find(({ padrao }) => matchPath({ path: padrao, end: true }, caminho));
  return encontrado ? { titulo: encontrado.titulo, subtitulo: encontrado.subtitulo } : null;
};

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
export function useTituloPagina(titulo: string | null | undefined, subtitulo?: string) {
  const definir = useContext(CabecalhoPaginaContext)?.definir;
  useEffect(() => {
    if (!definir || !titulo) return;
    definir({ titulo, subtitulo });
    return () => definir(null);
  }, [definir, titulo, subtitulo]);
}
