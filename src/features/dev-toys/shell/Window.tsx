import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { ESCALA } from '../escala';

type Props = {
  titulo: string;
  x: number;
  y: number;
  largura: number;
  ativa: boolean;
  z: number;
  onMover: (x: number, y: number) => void;
  onFechar: () => void;
  onFocar: () => void;
  /** Só nos jogos com regras: o botão ao lado do de fechar abre as Regras na aba deles. */
  onRegras?: () => void;
  children: ReactNode;
};

const ALTURA_MENU = 26 * ESCALA;
const SOBRA = 48 * ESCALA; // pedaço da janela que sempre fica na tela para poder puxá-la de volta

// Desenhos 7×7 das caixinhas da barra de título.
const X = 'M0 0h1v1H0zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM4 4h1v1H4zM5 5h1v1H5zM6 6h1v1H6zM6 0h1v1H6zM5 1h1v1H5zM4 2h1v1H4zM2 4h1v1H2zM1 5h1v1H1zM0 6h1v1H0z';
const INTERROGACAO = 'M1 0h5v1H1zM0 1h1v1H0zM6 1h1v2H6zM3 3h3v1H3zM3 4h1v1H3zM3 6h1v1H3z';

function Caixinha({ classe, rotulo, desenho, onClick }: { classe: string; rotulo: string; desenho: string; onClick: () => void }) {
  return (
    <button type="button" className={`dt-caixinha ${classe}`} aria-label={rotulo} title={rotulo} onClick={onClick}>
      <svg viewBox="0 0 7 7" aria-hidden="true" shapeRendering="crispEdges"><path d={desenho} /></svg>
    </button>
  );
}

// Janela no estilo System 6: arrasta pela barra de título listrada e fecha pela caixinha da esquerda (com o X); nos
// jogos, a caixinha do lado (?) abre as regras.
export default function Window({ titulo, x, y, largura, ativa, z, onMover, onFechar, onFocar, onRegras, children }: Props) {
  const arrasto = useRef<{ dx: number; dy: number } | null>(null);

  const iniciar = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('.dt-caixinha')) return;
    arrasto.current = { dx: e.clientX - x, dy: e.clientY - y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    if (!arrasto.current) return;
    const nx = Math.min(Math.max(e.clientX - arrasto.current.dx, SOBRA - largura * ESCALA), window.innerWidth - SOBRA);
    const ny = Math.min(Math.max(e.clientY - arrasto.current.dy, ALTURA_MENU), window.innerHeight - SOBRA);
    onMover(nx, ny);
  };
  const soltar = () => { arrasto.current = null; };

  return (
    <section
      className={`dt-janela${ativa ? ' dt-ativa' : ''}`}
      // nunca mais larga que a tela; --dt-topo: o conteúdo vai só até o pé da tela e rola por dentro
      style={{ left: x, top: y, width: `min(${largura * ESCALA}px, calc(100vw - 16px))`, zIndex: z, '--dt-topo': `${y}px` } as CSSProperties}
      role="dialog"
      aria-label={titulo}
      onPointerDownCapture={onFocar}
    >
      <div className="dt-titulo" onPointerDown={iniciar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
        <Caixinha classe="dt-fechar" rotulo={`Fechar ${titulo}`} desenho={X} onClick={onFechar} />
        {onRegras && <Caixinha classe="dt-regras-botao" rotulo={`Regras de ${titulo}`} desenho={INTERROGACAO} onClick={onRegras} />}
        <span className="dt-titulo-texto">{titulo}</span>
      </div>
      <div className="dt-conteudo">{children}</div>
    </section>
  );
}
