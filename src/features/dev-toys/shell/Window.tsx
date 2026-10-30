import { useRef, type PointerEvent, type ReactNode } from 'react';
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
  children: ReactNode;
};

const ALTURA_MENU = 40 * ESCALA;
const SOBRA = 48 * ESCALA; // pedaço da janela que sempre fica na tela para poder puxá-la de volta

// Janela no estilo System 6: arrasta pela barra de título listrada e fecha pela caixinha da esquerda.
export default function Window({ titulo, x, y, largura, ativa, z, onMover, onFechar, onFocar, children }: Props) {
  const arrasto = useRef<{ dx: number; dy: number } | null>(null);

  const iniciar = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('.dt-fechar')) return;
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
      style={{ left: x, top: y, width: largura * ESCALA, zIndex: z }}
      role="dialog"
      aria-label={titulo}
      onPointerDownCapture={onFocar}
    >
      <div className="dt-titulo" onPointerDown={iniciar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
        <button type="button" className="dt-fechar" aria-label={`Fechar ${titulo}`} onClick={onFechar} />
        <span className="dt-titulo-texto">{titulo}</span>
      </div>
      <div className="dt-conteudo">{children}</div>
    </section>
  );
}
