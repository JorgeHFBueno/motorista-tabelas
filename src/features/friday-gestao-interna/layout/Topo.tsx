import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronsRight, LayoutGrid, Search } from 'lucide-react';
import { pesquisar, type Row } from '../api.ts';
import { Popover, usePopover } from '../ui/base.tsx';

// Barra superior: busca global. O menu do usuário e o sino de avisos ficam no cabeçalho do sistema (components/Header.tsx).
export function Topo({ lateralRecolhida, onExpandir }: { lateralRecolhida: boolean; onExpandir: () => void }) {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const [res, setRes] = useState<{ quadros: Row[]; itens: Row[] } | null>(null);
  const caixa = usePopover<HTMLLabelElement>();

  useEffect(() => {
    const t = busca.trim();
    if (!t) { setRes(null); return; }
    const h = setTimeout(() => pesquisar(t).then(setRes), 200);
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
            {res.quadros.map(q => <button key={q.id} className="pop-linha" onClick={() => ir(`/friday/quadros/${q.id}`)}><LayoutGrid size={15} />{q.nome}</button>)}
            {res.itens.length > 0 && <div className="menu-titulo">Itens</div>}
            {res.itens.map(i => <button key={i.id} className="pop-linha" onClick={() => ir(`/friday/quadros/${i.quadro_id}?item=${i.abrir_item_id ?? i.id}`)}>{i.nome}<small>{i.quadro_nome}</small></button>)}
          </div>
        </Popover>
      )}
    </header>
  );
}
