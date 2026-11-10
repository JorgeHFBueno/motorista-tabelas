import { useLayoutEffect, useRef, useState } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { NavProvider, useNav } from './nav.tsx';
import { Navigate } from './rotas.tsx';
import { AvisoRapidoProvider, ConfirmarProvider } from './ui/base.tsx';
import { Lateral } from './layout/Lateral.tsx';
import { Topo } from './layout/Topo.tsx';
import QuadroPage from './quadro/QuadroPage.tsx';
import PainelPage from './painel/PainelPage.tsx';
import Inicio from './paginas/Inicio.tsx';
import MeuTrabalho from './paginas/MeuTrabalho.tsx';
import Arquivo from './paginas/Arquivo.tsx';
import AutomacoesPage from './quadro/Automacoes.tsx';
import ImportarMonday from './paginas/ImportarMonday.tsx';
import ChavesApi from './paginas/ChavesApi.tsx';
import Historico from './paginas/Historico.tsx';
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
          <Route path="historico" element={<Historico />} />
          <Route path="quadros/:id" element={<QuadroOuPainel />} />
          <Route path="arquivo" element={<Arquivo />} />
          <Route path="quadros/:id/automacoes" element={<AutomacoesPage />} />
          <Route path="importar-monday" element={<ImportarMonday />} />
          <Route path="chaves-api" element={<ChavesApi />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// Painéis ficam na mesma lista (e no mesmo endereço) que os quadros.
function QuadroOuPainel() {
  const id = Number(useParams().id);
  const nav = useNav();
  return nav.quadros.find(q => q.id === id)?.tipo === 'painel' ? <PainelPage key={id} painelId={id} /> : <QuadroPage />;
}
