import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { iniciais } from '../util.ts';

// Camadas flutuantes (popovers, janelas, painel do item) vão para a raiz do Friday, onde valem os estilos dele.
export const raizPortal = (): HTMLElement => document.querySelector<HTMLElement>(".friday-root") ?? document.body;

// ---------------------------------------------------------------- popover ancorado
// Renderizado na raiz do Friday com posição fixa, abaixo (ou acima, se não couber) do elemento âncora.
export function Popover({ ancora, onClose, children, largura, alinhar = 'inicio', className = '' }: {
  ancora: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  largura?: number;
  alinhar?: 'inicio' | 'centro' | 'fim';
  className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const posicionar = useCallback(() => {
    if (!ancora || !caixa.current) return;
    const a = ancora.getBoundingClientRect();
    const c = caixa.current.getBoundingClientRect();
    let left = alinhar === 'fim' ? a.right - c.width : alinhar === 'centro' ? a.left + a.width / 2 - c.width / 2 : a.left;
    left = Math.max(8, Math.min(left, window.innerWidth - c.width - 8));
    let top = a.bottom + 6;
    if (top + c.height > window.innerHeight - 8 && a.top - c.height - 6 > 8) top = a.top - c.height - 6;
    setPos({ top: Math.max(8, top), left });
  }, [ancora, alinhar]);

  useLayoutEffect(() => { posicionar(); }, [posicionar, children]);
  useEffect(() => {
    const fora = (e: globalThis.MouseEvent) => {
      const t = e.target as Node;
      if (caixa.current?.contains(t) || ancora?.contains(t)) return;
      onClose();
    };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('scroll', posicionar, true);
    };
  }, [ancora, onClose, posicionar]);

  return createPortal(
    <div ref={caixa} className={`fr-popover ${className}`} style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: largura }}
      onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      {children}
    </div>,
    raizPortal(),
  );
}

// Abre/fecha um popover a partir de um botão.
export function usePopover<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);
  const [aberto, setAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);
  return { ref, aberto, abrir: () => setAberto(true), alternar: () => setAberto(a => !a), fechar };
}

// ---------------------------------------------------------------- menu
export type ItemMenu = { rotulo: string; icone?: ReactNode; onClick?: () => void; perigo?: boolean; ativo?: boolean; sub?: ReactNode } | 'separador';

export function Menu({ itens, onEscolher }: { itens: ItemMenu[]; onEscolher?: () => void }) {
  return (
    <div className="menu" role="menu">
      {itens.map((it, i) => it === 'separador' ? <div key={i} className="menu-sep" /> : (
        <button key={i} role="menuitem" className={`menu-item${it.perigo ? ' perigo' : ''}${it.ativo ? ' ativo' : ''}`}
          onClick={() => { it.onClick?.(); onEscolher?.(); }}>
          <span className="menu-icone">{it.icone}</span>{it.rotulo}{it.sub}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- modal
export function Modal({ titulo, onClose, children, largura = 520, rodape }: { titulo: ReactNode; onClose: () => void; children: ReactNode; largura?: number; rodape?: ReactNode }) {
  useEffect(() => {
    // Escape fecha só a camada de cima: com um popover aberto dentro da janela, quem fecha é o popover.
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.fr-popover')) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return createPortal(
    <div className="modal-fundo" onMouseDown={onClose} onClick={e => e.stopPropagation()}>
      <div className="fr-modal" role="dialog" style={{ width: `min(${largura}px, calc(100vw - 32px))` }} onMouseDown={e => e.stopPropagation()}>
        <header><h2>{titulo}</h2><button className="btn-icone" onClick={onClose} aria-label="Fechar"><X size={18} /></button></header>
        <div className="modal-corpo">{children}</div>
        {rodape && <footer className="modal-rodape">{rodape}</footer>}
      </div>
    </div>,
    raizPortal(),
  );
}

// ---------------------------------------------------------------- confirmação (substitui window.confirm)
type Pedido = { mensagem: string; acao: string; resolver: (ok: boolean) => void };
const ConfirmarCtx = createContext<(mensagem: string, acao?: string) => Promise<boolean>>(async () => false);

export function ConfirmarProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const confirmar = useCallback((mensagem: string, acao = 'Excluir') => new Promise<boolean>(resolver => setPedido({ mensagem, acao, resolver })), []);
  const responder = (ok: boolean) => { pedido?.resolver(ok); setPedido(null); };
  return (
    <ConfirmarCtx.Provider value={confirmar}>
      {children}
      {pedido && (
        <Modal titulo="Tem certeza?" largura={420} onClose={() => responder(false)}
          rodape={<><button className="fr-btn" onClick={() => responder(false)}>Cancelar</button><button className="fr-btn btn-perigo-cheio" autoFocus onClick={() => responder(true)}>{pedido.acao}</button></>}>
          <p>{pedido.mensagem}</p>
        </Modal>
      )}
    </ConfirmarCtx.Provider>
  );
}
export const useConfirmar = () => useContext(ConfirmarCtx);

// ---------------------------------------------------------------- aviso rápido no canto (com "Desfazer")
type AvisoRapido = { id: number; texto: string; acao?: { rotulo: string; onClick: () => void } };
const AvisoRapidoCtx = createContext<(texto: string, acao?: AvisoRapido['acao']) => void>(() => {});

export function AvisoRapidoProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<AvisoRapido[]>([]);
  const tirar = (id: number) => setLista(l => l.filter(a => a.id !== id));
  const avisar = useCallback((texto: string, acao?: AvisoRapido['acao']) => {
    const id = Date.now() + Math.random();
    setLista(l => [...l.slice(-2), { id, texto, acao }]);
    setTimeout(() => setLista(l => l.filter(a => a.id !== id)), 8000);
  }, []);
  return (
    <AvisoRapidoCtx.Provider value={avisar}>
      {children}
      {lista.length > 0 && createPortal(
        <div className="avisos-rapidos" role="status">
          {lista.map(a => (
            <div key={a.id} className="aviso-rapido">
              <span>{a.texto}</span>
              {a.acao && <button className="fr-btn-link" onClick={() => { a.acao!.onClick(); tirar(a.id); }}>{a.acao.rotulo}</button>}
              <button className="btn-icone" aria-label="Fechar aviso" onClick={() => tirar(a.id)}><X size={14} /></button>
            </div>
          ))}
        </div>,
        raizPortal(),
      )}
    </AvisoRapidoCtx.Provider>
  );
}
export const useAvisoRapido = () => useContext(AvisoRapidoCtx);

// ---------------------------------------------------------------- texto editável no lugar
export function Editavel({ valor, onSalvar, className = '', placeholder = '', iniciarEditando = false, multilinha = false, travado }: {
  valor: string;
  travado?: string; // por que não edita (ex.: nome espelhado do cadastro); mostra só o texto
  onSalvar: (v: string) => void;
  className?: string;
  placeholder?: string;
  iniciarEditando?: boolean;
  multilinha?: boolean;
}) {
  const [editando, setEditando] = useState(iniciarEditando);
  const [texto, setTexto] = useState(valor);
  useEffect(() => { if (!editando) setTexto(valor); }, [valor, editando]);
  const salvar = () => {
    setEditando(false);
    const t = texto.trim();
    if (t !== valor.trim() && (t || !placeholder)) onSalvar(t);
    else setTexto(valor);
  };
  if (travado) return <span className={className} title={travado}>{valor}</span>;
  if (!editando) {
    return <span className={`editavel ${className}${valor ? '' : ' vazio'}`} tabIndex={0} onClick={e => { e.stopPropagation(); setEditando(true); }}
      onKeyDown={e => { if (e.key === 'Enter') setEditando(true); }}>{valor || placeholder}</span>;
  }
  const props = {
    autoFocus: true,
    className: `editavel-input ${className}`,
    value: texto,
    onChange: (e: { target: { value: string } }) => setTexto(e.target.value),
    onBlur: salvar,
    onClick: (e: MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(multilinha && e.shiftKey)) { e.preventDefault(); (e.target as HTMLElement).blur(); }
      if (e.key === 'Escape') { setTexto(valor); setEditando(false); }
    },
    onFocus: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.target.select(),
  };
  return multilinha ? <textarea rows={3} {...props} /> : <input {...props} />;
}

// ---------------------------------------------------------------- avatar
export function Avatar({ nome, cor, tamanho = 26, titulo }: { nome: string; cor?: string; tamanho?: number; titulo?: string }) {
  return (
    <span className="avatar" title={titulo ?? nome} style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.42, background: cor ?? '#8a94a6' }}>
      {iniciais(nome)}
    </span>
  );
}
