import { useEffect, useState } from 'react';
import { useNavigate as useNavigateSistema } from 'react-router-dom';
import { useNavigate } from '../rotas.tsx';
import { ChevronsRight, HelpCircle, LayoutGrid, LogOut, Search } from 'lucide-react';
import { req, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { Avatar, Menu, Popover, usePopover, type ItemMenu } from '../ui/base.tsx';
import { Avisos } from './Avisos.tsx';
import { LogoMarca } from './Marca.tsx';

// Barra superior: marca, busca global, avisos e menu do usuário.
export function Topo({ lateralRecolhida, onExpandir }: { lateralRecolhida: boolean; onExpandir: () => void }) {
  const nav = useNav();
  const navigate = useNavigate();
  const navigateSistema = useNavigateSistema();
  const [busca, setBusca] = useState('');
  const [res, setRes] = useState<{ quadros: Row[]; itens: Row[] } | null>(null);
  const caixa = usePopover<HTMLLabelElement>();
  const perfil = usePopover<HTMLButtonElement>();
  const PAPEL = { admin: 'Administrador', membro: 'Membro', leitor: 'Só leitura' } as Record<string, string>;
  // Login, senha e pessoas são os do sistema (Firebase). "Pessoas e acessos" volta na etapa de credenciais.
  const itensPerfil: ItemMenu[] = [
    { rotulo: 'Voltar ao sistema', icone: <LogOut size={15} />, onClick: () => navigateSistema('/') },
  ];

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
      <button className="marca" onClick={() => navigate('/')} title="Início">
        <LogoMarca />
      </button>
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
      <span className="espaco" />
      <Avisos />
      <button className="btn-icone topo-ic" title="Ajuda (em breve)" aria-label="Ajuda"><HelpCircle size={19} /></button>
      <button ref={perfil.ref} className="topo-perfil" onClick={perfil.alternar} aria-label="Menu do usuário">
        <Avatar nome={nav.usuario?.nome ?? '?'} cor={nav.usuario?.cor} tamanho={32} />
      </button>
      {perfil.aberto && (
        <Popover ancora={perfil.ref.current} onClose={perfil.fechar} alinhar="fim" largura={250}>
          <div className="perfil-cab"><strong>{nav.usuario?.nome}</strong><small className="muted">{nav.usuario?.email}</small><small className="muted">{PAPEL[nav.usuario?.acesso ?? ''] ?? ''}</small></div>
          <Menu onEscolher={perfil.fechar} itens={itensPerfil} />
        </Popover>
      )}
    </header>
  );
}
