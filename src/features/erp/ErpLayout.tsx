import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import LoadingFallback from '../../components/LoadingFallback';
import './erpMenu.css';
import { caminhoDaTela, combinaBusca, MENU_ERP, type ItemMenuErp } from './menuErp';

// Moldura das telas do ERP (/erp/*), com o menu lateral do Elevor como o ERP do Samuel o fez (web/src/layout/Shell.tsx):
// começa recolhido numa faixa à esquerda e, aberto, fica por cima da tela (não empurra a página); fecha ao clicar fora,
// com Esc ou ao abrir outra tela. Pesquisa no alto; abre já no caminho da tela atual. Cores e seta de abrir/fechar do
// menu lateral do painel (MenuLateral.tsx); uma linha guia separa os níveis.
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

const chaveDe = (caminho: string[]) => caminho.join('›');
// Seta do grupo: para baixo fechado, para cima aberto.
const Seta = ({ aberto }: { aberto: boolean }) => <ExpandMoreIcon className={`seta${aberto ? ' aberta' : ''}`} aria-hidden />;

function MenuErp({ caminhoAtual }: { caminhoAtual: string[] }) {
  const [busca, setBusca] = useState('');
  // Abre os grupos do caminho da tela atual; o resto começa fechado.
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(caminhoAtual.map((_, i) => chaveDe(caminhoAtual.slice(0, i + 1)))));
  const alternar = (chave: string) => setAbertos((a) => { const n = new Set(a); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });
  const filtro = busca.trim();
  const combina = (i: ItemMenuErp): boolean => combinaBusca(i.rotulo, filtro) || !!i.filhos?.some(combina);
  const atual = chaveDe(caminhoAtual);

  const itens = (lista: ItemMenuErp[], pai: string[], nivel: number): ReactNode => lista.filter((i) => !filtro || combina(i)).map((i) => {
    const caminho = [...pai, i.rotulo];
    const chave = chaveDe(caminho);
    const Icone = i.icone;
    if (i.filhos) {
      const aberto = Boolean(filtro) || abertos.has(chave);
      return (
        <div key={chave}>
          <button type="button" className={`erp-menu-no grupo nivel-${nivel}${aberto ? ' aberto' : ''}`} aria-expanded={aberto} onClick={() => alternar(chave)}>
            {Icone && <Icone className="icone" />}<span>{i.rotulo}</span><Seta aberto={aberto} />
          </button>
          {aberto && <div className="erp-menu-filhos">{itens(i.filhos, caminho, nivel + 1)}</div>}
        </div>
      );
    }
    const conteudo = <>{Icone && <Icone className="icone" />}<span>{i.rotulo}</span></>;
    return i.para ? (
      <Link key={chave} to={i.para} className={`erp-menu-no folha nivel-${nivel}${chave === atual ? ' ativa' : ''}`} aria-current={chave === atual ? 'page' : undefined}>
        {conteudo}
      </Link>
    ) : (
      <div key={chave} className={`erp-menu-no folha nivel-${nivel} sem-tela`} aria-disabled="true" title="Ainda não chegou ao painel">
        {conteudo}<span className="em-breve">em breve</span>
      </div>
    );
  });

  return (
    <div className="erp-menu-conteudo">
      <input className="erp-menu-busca" placeholder="Pesquisar..." aria-label="Pesquisar no menu" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
      <nav className="erp-menu-arvore" aria-label="Menu do ERP">
        {MENU_ERP.filter((m) => !filtro || combinaBusca(m.rotulo, filtro) || m.filhos.some(combina)).map((m) => {
          const aberto = Boolean(filtro) || abertos.has(m.rotulo);
          const Icone = m.icone;
          return (
            <div key={m.rotulo}>
              <button type="button" className={`erp-menu-no modulo${aberto ? ' aberto' : ''}`} aria-expanded={aberto} onClick={() => alternar(m.rotulo)}>
                <Icone className="icone" /><span>{m.rotulo}</span><Seta aberto={aberto} />
              </button>
              {aberto && <div className="erp-menu-filhos">{itens(m.filhos, [m.rotulo], 1)}</div>}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export default function ErpLayout() {
  const { pathname } = useLocation();
  const [aberto, setAberto] = useState(false);
  const caminhoAtual = useMemo(() => caminhoDaTela(pathname), [pathname]);
  useEffect(() => { setAberto(false); }, [pathname]);
  useEffect(() => {
    if (!aberto) return undefined;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto]);

  return (
    <div className="erp-casca">
      <div className="erp-menu-faixa">
        <button type="button" className="erp-menu-botao" aria-label="Abrir o menu do ERP" title="Menu do ERP" aria-expanded={aberto} onClick={() => setAberto(true)}>
          {/* » e « (2026-11-27): o ☰ ficava igual ao do menu do painel, logo acima. */}
          <KeyboardDoubleArrowRightIcon />
        </button>
      </div>
      {aberto && (
        <>
          <div className="erp-menu-fundo" onClick={() => setAberto(false)} />
          <aside className="erp-menu" aria-label="Menu do ERP">
            <div className="erp-menu-topo">
              <Link to="/erp" className="erp-menu-inicio">ERP</Link>
              <button type="button" className="erp-menu-botao" aria-label="Recolher o menu do ERP" title="Recolher menu" onClick={() => setAberto(false)}>
                <KeyboardDoubleArrowLeftIcon />
              </button>
            </div>
            <MenuErp caminhoAtual={caminhoAtual} />
          </aside>
        </>
      )}
      <div className="erp-casca-area">
        <Suspense fallback={<LoadingFallback />}><Outlet /></Suspense>
      </div>
    </div>
  );
}
