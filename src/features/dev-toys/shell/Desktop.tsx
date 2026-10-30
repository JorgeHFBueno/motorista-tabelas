import { Suspense, useEffect, useState, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEV_TOYS, type DevToy } from '../registry';
import Window from './Window';

type Aberta = { id: string; x: number; y: number };

const horaAgora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function Icone({ toy }: { toy: DevToy }) {
  return (
    <svg viewBox="0 0 16 16" width={32} height={32} aria-hidden="true" shapeRendering="crispEdges">
      <path d={toy.icone} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

// Desktop da área DEV: barra de menus, ícones dos brinquedos e janelas (a última da lista fica na frente).
export default function Desktop() {
  const navigate = useNavigate();
  const [janelas, setJanelas] = useState<Aberta[]>(() => [{ id: DEV_TOYS[0].id, x: 64, y: 64 }]);
  const [menu, setMenu] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [hora, setHora] = useState(horaAgora);

  useEffect(() => {
    const t = window.setInterval(() => setHora(horaAgora()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  // Esc: fecha o menu aberto, depois a janela da frente; sem janelas, volta para a Home.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menu) setMenu(null);
      else if (janelas.length) setJanelas((js) => js.slice(0, -1));
      else navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, janelas.length, navigate]);

  const abrir = (id: string) => {
    setMenu(null);
    setJanelas((js) => {
      const aberta = js.find((j) => j.id === id);
      if (aberta) return [...js.filter((j) => j.id !== id), aberta];
      return [...js, { id, x: 64 + js.length * 24, y: 64 + js.length * 24 }];
    });
  };
  const focar = (id: string) => setJanelas((js) => (js.at(-1)?.id === id ? js : [...js.filter((j) => j.id !== id), js.find((j) => j.id === id)!]));
  const fechar = (id: string) => setJanelas((js) => js.filter((j) => j.id !== id));
  const mover = (id: string, x: number, y: number) => setJanelas((js) => js.map((j) => (j.id === id ? { ...j, x, y } : j)));

  const fundo = (e: PointerEvent<HTMLDivElement>) => {
    const alvo = e.target as Element;
    if (!alvo.closest('.dt-menubar')) setMenu(null);
    if (!alvo.closest('.dt-icone')) setSelecionado(null);
  };

  const menus: Array<{ id: string; rotulo: string; itens: Array<{ rotulo: string; acao: () => void } | null> }> = [
    { id: 'ledur', rotulo: 'Ledur', itens: [{ rotulo: 'Sobre o DEV', acao: () => abrir('sobre') }, null, { rotulo: 'Sair do DEV', acao: () => navigate('/') }] },
    { id: 'brinquedos', rotulo: 'Brinquedos', itens: DEV_TOYS.map((t) => ({ rotulo: t.nome, acao: () => abrir(t.id) })) },
  ];

  return (
    <div className="devtoys" onPointerDown={fundo}>
      <nav className="dt-menubar" aria-label="Menu do DEV">
        {menus.map((m) => (
          <div key={m.id} className="dt-menu">
            <button
              type="button"
              className={`dt-menu-titulo${menu === m.id ? ' dt-aberto' : ''}`}
              aria-expanded={menu === m.id}
              onClick={() => setMenu((atual) => (atual === m.id ? null : m.id))}
              onPointerEnter={() => setMenu((atual) => (atual ? m.id : atual))}
            >
              {m.rotulo}
            </button>
            {menu === m.id && (
              <ul className="dt-menu-lista" role="menu">
                {m.itens.map((item, i) => item
                  ? <li key={item.rotulo} role="none"><button type="button" role="menuitem" onClick={() => { setMenu(null); item.acao(); }}>{item.rotulo}</button></li>
                  : <li key={`sep-${i}`} role="separator" className="dt-separador" />)}
              </ul>
            )}
          </div>
        ))}
        <span className="dt-relogio">{hora}</span>
      </nav>

      <div className="dt-icones">
        {DEV_TOYS.map((toy) => (
          <button
            key={toy.id}
            type="button"
            className={`dt-icone${selecionado === toy.id ? ' dt-selecionado' : ''}`}
            onClick={() => setSelecionado(toy.id)}
            onDoubleClick={() => abrir(toy.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); abrir(toy.id); } }}
          >
            <Icone toy={toy} />
            <span>{toy.nome}</span>
          </button>
        ))}
      </div>

      {janelas.map((j, i) => {
        const toy = DEV_TOYS.find((t) => t.id === j.id);
        if (!toy) return null;
        const Brinquedo = toy.componente;
        return (
          <Window
            key={j.id}
            titulo={toy.nome}
            x={j.x}
            y={j.y}
            largura={toy.largura}
            z={10 + i}
            ativa={i === janelas.length - 1}
            onMover={(x, y) => mover(j.id, x, y)}
            onFechar={() => fechar(j.id)}
            onFocar={() => focar(j.id)}
          >
            <Suspense fallback={<p>Carregando...</p>}>
              <Brinquedo />
            </Suspense>
          </Window>
        );
      })}
    </div>
  );
}
