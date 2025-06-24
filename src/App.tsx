import { useEffect, useState } from 'react';
import './App.css';
import TabelaCombustivel from './components/TabelaCombustivel';
import Header from './components/Header';
import PortifolioPage from './components/PortifolioPage';

type Page = 'cliente' | 'portifolio';

function getInitialPage(): Page {
  return window.location.hash === '#portifolio' ? 'portifolio' : 'cliente';
}

function App() {
  const [page, setPage] = useState<Page>(getInitialPage());

  useEffect(() => {
    const handleHashChange = () => {
      setPage(getInitialPage());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <><div className="App" style={{ padding: 20 }}>
      <h1>Visualização de Combustível</h1>
      <TabelaCombustivel />
    </div><>
        <Header />
        {page === 'cliente' && (
          <div className="App" style={{ padding: 20 }}>
            <h1>Visualização de Combustível</h1>
            <TabelaCombustivel />
          </div>
        )}
        {page === 'portifolio' && <PortifolioPage />}
      </></>
  );
}

export default App;