import { useEffect, useState } from 'react';
import { ESCALA } from '../escala';
import type { DevToy } from '../registry';

function Desenho({ toy }: { toy: DevToy }) {
  return (
    <svg viewBox="0 0 16 16" width={32 * ESCALA} height={32 * ESCALA} aria-hidden="true" shapeRendering="crispEdges">
      <path d={toy.icone} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/**
 * Ícones de setores, como no Finder: um clique seleciona, dois cliques (ou Enter) abrem. Usado no Desktop e nas pastas.
 * Clicar fora de um ícone tira a seleção.
 */
export function IconesSetores({ toys, className, onAbrir }: { toys: DevToy[]; className: string; onAbrir: (id: string) => void }) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  useEffect(() => {
    const fora = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('.dt-icone')) setSelecionado(null); };
    window.addEventListener('pointerdown', fora);
    return () => window.removeEventListener('pointerdown', fora);
  }, []);
  return (
    <div className={className}>
      {toys.map((toy) => (
        <button
          key={toy.id}
          type="button"
          className={`dt-icone${selecionado === toy.id ? ' dt-selecionado' : ''}`}
          onClick={() => setSelecionado(toy.id)}
          onDoubleClick={() => onAbrir(toy.id)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAbrir(toy.id); } }}
        >
          <Desenho toy={toy} />
          <span>{toy.nome}</span>
        </button>
      ))}
    </div>
  );
}
