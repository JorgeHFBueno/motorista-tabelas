import { useEffect, useState } from 'react'
import './App.css'
import TabelaCombustivel from './components/TabelaCombustivel'
import Header from './components/Header'
import PortifolioPage from './components/PortifolioPage'

type Page = 'cliente' | 'portifolio'

function getInitialPage(): Page {
  return window.location.hash === '#portifolio' ? 'portifolio' : 'cliente'
}

export default function App() {
  const [page, setPage] = useState<Page>(getInitialPage)

  useEffect(() => {
    const onHashChange = () => setPage(getInitialPage())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <div className="App" style={{ padding: 20 }}>
      <Header />
      {page === 'cliente' ? (
        <>
          <h1>Visualização de Combustível</h1>
          <TabelaCombustivel />
        </>
      ) : (
        <PortifolioPage />
      )}
    </div>
  )
}
