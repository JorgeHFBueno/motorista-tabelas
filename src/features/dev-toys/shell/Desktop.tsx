import { Suspense, useCallback, useEffect, useState, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { INTENSIDADES, type IntensidadeCrt } from '../crt/parametros';
import type { PrefsDev } from '../prefs';
import { ESCALA } from '../escala';
import { DEV_TOYS } from '../registry';
import { IconesSetores } from './IconesSetores';
import Window from './Window';

type Aberta = { id: string; x: number; y: number };

const ROTULO_INTENSIDADE: Record<IntensidadeCrt, string> = { baixa: 'Baixa', media: 'Media', alta: 'Alta' };

const horaAgora =() => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** No Desktop e no menu Setores: os setores que não estão dentro de uma pasta. */
const NO_DESKTOP = DEV_TOYS.filter((t) => !t.pasta);

type Props = { ligando: boolean; prefs: PrefsDev; onPrefs: (prefs: PrefsDev) => void; onReiniciar: () => void };

// Desktop da área DEV: barra de menus, ícones dos brinquedos e janelas (a última da lista fica na frente).
// O botão de regras de uma janela abre as Regras na aba do jogo dela.
export default function Desktop({ ligando, prefs, onPrefs, onReiniciar }: Props) {
  const navigate = useNavigate();
  const [janelas, setJanelas] = useState<Aberta[]>(() => [{ id: DEV_TOYS[0].id, x: 64 * ESCALA, y: 40 * ESCALA }]);
  const [menu, setMenu] = useState<string | null>(null);
  // a aba que o botão de regras pediu; `n` remonta as Regras para ela abrir nessa aba
  const [pedidoRegras, setPedidoRegras] = useState({ aba: undefined as string | undefined, n: 0 });
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

  const abrir = useCallback((id: string) => {
    setMenu(null);
    setJanelas((js) => {
      const aberta = js.find((j) => j.id === id);
      if (aberta) return [...js.filter((j) => j.id !== id), aberta];
      // em cascata, mas puxada para a esquerda o bastante para caber inteira na largura da tela
      const largura = Math.min((DEV_TOYS.find((t) => t.id === id)?.largura ?? 0) * ESCALA, window.innerWidth - 16);
      const x = Math.max(8, Math.min((64 + js.length * 24) * ESCALA, window.innerWidth - largura - 8));
      return [...js, { id, x, y: (40 + js.length * 24) * ESCALA }];
    });
  }, []);

  // Um brinquedo pode pedir para abrir outro (o Viveiro abre o Crawler e vice-versa): evento `ledur:dev-abrir`.
  useEffect(() => {
    const pedir = (e: Event) => {
      const id = (e as CustomEvent<unknown>).detail;
      if (typeof id === 'string' && DEV_TOYS.some((t) => t.id === id)) abrir(id);
    };
    window.addEventListener('ledur:dev-abrir', pedir);
    return () => window.removeEventListener('ledur:dev-abrir', pedir);
  }, [abrir]);
  const abrirRegras = (aba: string) => {
    setPedidoRegras((r) => ({ aba, n: r.n + 1 }));
    abrir('regras');
  };
  const focar = (id: string) => setJanelas((js) => (js.at(-1)?.id === id ? js : [...js.filter((j) => j.id !== id), js.find((j) => j.id === id)!]));
  const fechar = (id: string) => setJanelas((js) => js.filter((j) => j.id !== id));
  const mover = (id: string, x: number, y: number) => setJanelas((js) => js.map((j) => (j.id === id ? { ...j, x, y } : j)));

  const fundo = (e: PointerEvent<HTMLDivElement>) => {
    if (!(e.target as Element).closest('.dt-menubar')) setMenu(null);
  };

  const menus: Array<{ id: string; rotulo: string; itens: Array<{ rotulo: string; acao: () => void } | null> }> = [
    {
      id: 'ledur',
      rotulo: 'Ledur',
      itens: [
        { rotulo: 'Sobre o DEV', acao: () => abrir('sobre') },
        { rotulo: 'Reiniciar', acao: onReiniciar },
        { rotulo: `[${prefs.bootSempre ? 'x' : ' '}] Boot sempre`, acao: () => onPrefs({ ...prefs, bootSempre: !prefs.bootSempre }) },
        null,
        { rotulo: 'Sair do DEV', acao: () => navigate('/') },
      ],
    },
    { id: 'brinquedos', rotulo: 'Setores', itens: NO_DESKTOP.map((t) => ({ rotulo: t.nome, acao: () => abrir(t.id) })) },
    {
      id: 'crt',
      rotulo: 'CRT',
      itens: [
        { rotulo: `[${prefs.crt ? 'x' : ' '}] Ligado`, acao: () => onPrefs({ ...prefs, crt: !prefs.crt }) },
        null,
        ...INTENSIDADES.map((i) => ({
          rotulo: `(${prefs.crtIntensidade === i ? '*' : ' '}) ${ROTULO_INTENSIDADE[i]}`,
          acao: () => onPrefs({ ...prefs, crt: true, crtIntensidade: i }),
        })),
      ],
    },
  ];

  return (
    <div className={`dt-desktop${ligando ? ' dt-ligando' : ''}`} onPointerDown={fundo}>
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

      <IconesSetores toys={NO_DESKTOP} className="dt-icones" onAbrir={abrir} />

      {janelas.map((j, i) => {
        const toy = DEV_TOYS.find((t) => t.id === j.id);
        if (!toy) return null;
        const Brinquedo = toy.componente;
        const { regras } = toy;
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
            onRegras={regras ? () => abrirRegras(regras) : undefined}
          >
            <Suspense fallback={<p>Carregando...</p>}>
              {j.id === 'regras' ? <Brinquedo key={pedidoRegras.n} aba={pedidoRegras.aba} /> : <Brinquedo />}
            </Suspense>
          </Window>
        );
      })}
    </div>
  );
}
