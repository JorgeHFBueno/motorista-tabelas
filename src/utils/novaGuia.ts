import type { MouseEvent } from 'react';

// For clickable elements that cannot be a real <a> link (rows with a menu or drag inside, table rows):
// the middle button and Ctrl/Cmd/Shift+click open `url` in a new tab, like a link; a normal click calls `ir(url)`
// (usually React Router's navigate). A click on a button or link nested inside the element is left to that control.
export function abreEmNovaGuia(url: string, ir: (url: string) => void) {
  const noProprioElemento = (e: MouseEvent<HTMLElement>) => {
    const controle = (e.target as HTMLElement).closest('button, a, input, select, textarea');
    return !controle || controle === e.currentTarget;
  };
  return {
    onClick: (e: MouseEvent<HTMLElement>) => {
      if ((e.ctrlKey || e.metaKey || e.shiftKey) && noProprioElemento(e)) {
        window.open(url, '_blank');
        return;
      }
      ir(url);
    },
    onAuxClick: (e: MouseEvent<HTMLElement>) => {
      if (e.button !== 1 || !noProprioElemento(e)) return;
      e.preventDefault();
      window.open(url, '_blank');
    },
    // Without this, the middle button starts the browser's auto-scroll instead of opening the tab.
    onMouseDown: (e: MouseEvent<HTMLElement>) => {
      if (e.button === 1 && noProprioElemento(e)) e.preventDefault();
    },
  };
}
