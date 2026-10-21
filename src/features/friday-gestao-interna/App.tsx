import { useLayoutEffect, useRef, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { NavProvider, useNav } from './nav.tsx';
import { Navigate } from './rotas.tsx';
import { AvisoRapidoProvider, ConfirmarProvider } from './ui/base.tsx';
import { Lateral } from './layout/Lateral.tsx';
import { Topo } from './layout/Topo.tsx';
import QuadroPage from './quadro/QuadroPage.tsx';
import Inicio from './paginas/Inicio.tsx';
import MeuTrabalho from './paginas/MeuTrabalho.tsx';
import Arquivo from './paginas/Arquivo.tsx';
import AutomacoesPage from './quadro/Automacoes.tsx';
import ImportarMonday from './paginas/ImportarMonday.tsx';
import ConciliacaoPagina from './paginas/Conciliacao.tsx';
import './styles.css';

// Friday — gestão interna em quadros (rota /friday do sistema). O acesso já foi validado pelo
// EmployeeRoute do sistema; tudo aqui dentro fica sob .friday-root, inclusive os estilos.
export default function FridayApp() {
  // Ocupa a tela abaixo do cabeçalho do sistema (o Friday rola por dentro, não a página).
  const raiz = useRef<HTMLDivElement>(null);
  const [topo, setTopo] = useState(0);
  useLayoutEffect(() => {
    const medir = () => setTopo((raiz.current?.getBoundingClientRect().top ?? 0) + window.scrollY);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  return (
    <div ref={raiz} className="friday-root" style={{ height: `calc(100dvh - ${topo}px)` }}>
      <NavProvider>
        <ConfirmarProvider>
          <AvisoRapidoProvider>
            <Friday />
          </AvisoRapidoProvider>
        </ConfirmarProvider>
      </NavProvider>
    </div>
  );
}

function Friday() {
  const nav = useNav();
  const [recolhida, setRecolhida] = useState(false);
  if (nav.erro) return <div className="carregando">Não foi possível abrir o Friday: {nav.erro}</div>;
  if (!nav.carregado || !nav.usuario) return <div className="carregando">Carregando…</div>;
  return (
    <div className={`app${recolhida ? ' sem-lateral' : ''}`}>
      <Topo lateralRecolhida={recolhida} onExpandir={() => setRecolhida(false)} />
      {!recolhida && <Lateral onRecolher={() => setRecolhida(true)} />}
      <main className="principal">
        <Routes>
          <Route index element={<Inicio />} />
          <Route path="meu-trabalho" element={<MeuTrabalho />} />
          <Route path="quadros/:id" element={<QuadroPage />} />
          <Route path="arquivo" element={<Arquivo />} />
          <Route path="quadros/:id/automacoes" element={<AutomacoesPage />} />
          <Route path="quadros/:id/conciliar" element={<ConciliacaoPagina />} />
          <Route path="importar-monday" element={<ImportarMonday />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
