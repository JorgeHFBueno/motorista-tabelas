import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '../rotas.tsx';
import { ChevronsRight, LayoutGrid, Search } from 'lucide-react';
import { req, type Row } from '../api.ts';
import { Popover, usePopover } from '../ui/base.tsx';
import { Avisos } from './Avisos.tsx';

// Barra superior: busca global. Ajuda e menu do usuário ficam no cabeçalho do sistema (components/Header.tsx),
// e o sino de avisos do Friday é colocado lá, no espaço que o cabeçalho reserva enquanto o Friday está aberto.
export function Topo({ lateralRecolhida, onExpandir }: { lateralRecolhida: boolean; onExpandir: () => void }) {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [res, setRes] = useState<{ quadros: Row[]; itens: Row[] } | null>(null);
  const caixa = usePopover<HTMLLabelElement>();
  const [slotAvisos] = useState(() => document.getElementById('ledur-header-avisos'));

  useEffect(() => {
    const t = busca.trim();
    if (!t) { setRes(null); return; }
    const h = setTimeout(() => req<{ quadros: Row[]; itens: Row[] }>('GET', `busca?q=${encodeURIComponent(t)}`).then(setRes), 200);
    return () => clearTimeout(h);
  }, [busca]);

  const ir = (url: string) => { setBusca(''); caixa.fechar(); navigate(url); };

  return (
    <header className="topo">
      {lateralRecolhida && <button className="btn-icone" onClick={onExpandir} aria-label="Mostrar lateral"><ChevronsRight size={18} /></button>}
      <label ref={caixa.ref} className="topo-busca">
        <Search size={15} />
        <input placeholder="Buscar quadros e itens" value={busca} onChange={e => { setBusca(e.target.value); caixa.abrir(); }} onFocus={caixa.abrir} />
      </label>
      {caixa.aberto && res && (
        <Popover ancora={caixa.ref.current} onClose={caixa.fechar} largura={420}>
          <div className="busca-res">
            {!res.quadros.length && !res.itens.length && <p className="muted fr-small">Nada encontrado para “{busca}”.</p>}
            {res.quadros.length > 0 && <div className="menu-titulo">Quadros</div>}
            {res.quadros.map(q => <button key={q.id} className="pop-linha" onClick={() => ir(`/quadros/${q.id}`)}><LayoutGrid size={15} />{q.nome}</button>)}
            {res.itens.length > 0 && <div className="menu-titulo">Itens</div>}
            {res.itens.map(i => <button key={i.id} className="pop-linha" onClick={() => ir(`/quadros/${i.quadro_id}?item=${i.abrir_item_id ?? i.id}`)}>{i.nome}<small>{i.quadro_nome}</small></button>)}
          </div>
        </Popover>
      )}
      {slotAvisos ? createPortal(<Avisos />, slotAvisos) : <><span className="espaco" /><Avisos /></>}
    </header>
  );
}
