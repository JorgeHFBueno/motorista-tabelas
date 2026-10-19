import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from '../rotas.tsx';
import {
  ArrowDownAZ, Archive, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsLeft, ChevronsUpDown, Copy, Folder, FolderOpen, FolderPlus, Home, LayoutGrid,
  ListChecks, Lock, MoreHorizontal, Pencil, Plus, Search, Star, Trash2, FolderInput,
} from 'lucide-react';
import { Permissoes } from './Permissoes.tsx';
import { api, req, type Row } from '../api.ts';
import { PERMISSOES_FINAS, useNav } from '../nav.tsx';
import { Menu, Modal, Popover, useConfirmar, usePopover } from '../ui/base.tsx';
import { CORES, corTexto } from '../util.ts';

// Largura da lateral: arrastável pela borda (200–480 px), lembrada neste navegador; duplo clique volta ao padrão.
const LARGURA_PADRAO = 255;
const lerLargura = () => { try { return Number(localStorage.getItem('ledur:lateral')) || LARGURA_PADRAO; } catch { return LARGURA_PADRAO; } };
const aplicarLargura = (w: number) => document.documentElement.style.setProperty('--largura-lateral', `${w}px`);
// Recuo de cada nível da árvore (pasta > subpasta > quadro) vai no CSS pela variável --nivel.
const nivelCss = (n: number) => ({ ['--nivel' as string]: n }) as CSSProperties;
const porNome = (a: Row, b: Row) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true, sensitivity: 'base' });

// Lateral no estilo de quadros: atalhos, favoritos, seletor de área de trabalho e árvore de pastas/quadros.
export function Lateral({ onRecolher }: { onRecolher: () => void }) {
  const nav = useNav();
  const navigate = useNavigate();
  const local = useLocation();
  const confirmar = useConfirmar();
  const [busca, setBusca] = useState('');
  const [favAberto, setFavAberto] = useState(true);
  const [modal, setModal] = useState<null | { tipo: 'quadro' | 'pasta' | 'area' | 'renomear'; pastaId?: number | null; alvo?: Row; tabela?: string }>(null);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [soltarEm, setSoltarEm] = useState<number | 'raiz' | null>(null);
  const [permissoes, setPermissoes] = useState<{ recurso: 'area' | 'pasta' | 'quadro'; id: number; nome: string } | null>(null);
  const admin = !!nav.usuario?.admin;
  const area = nav.areas.find(a => a.id === nav.areaId);
  const mais = usePopover<HTMLButtonElement>();
  useEffect(() => { aplicarLargura(lerLargura()); }, []);
  const redimensionar = (x0: number) => {
    const w0 = lerLargura();
    let w = w0;
    const mover = (e: MouseEvent) => { w = Math.max(200, Math.min(480, w0 + e.clientX - x0)); aplicarLargura(w); };
    const soltar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
      document.body.classList.remove('redimensionando');
      try { localStorage.setItem('ledur:lateral', String(Math.round(w))); } catch { /* sem armazenamento */ }
    };
    document.body.classList.add('redimensionando');
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  };
  const larguraPadrao = () => { aplicarLargura(LARGURA_PADRAO); try { localStorage.removeItem('ledur:lateral'); } catch { /* sem armazenamento */ } };

  const quadroAtual = Number(local.pathname.match(/^\/quadros\/(\d+)/)?.[1]) || null;
  const pastasDaArea = nav.pastas.filter(p => p.area_id === nav.areaId);
  const quadrosDaArea = nav.quadros.filter(q => q.area_id === nav.areaId);
  const b = busca.trim().toLowerCase();
  const casa = (q: Row) => !b || q.nome.toLowerCase().includes(b);

  const moverQuadro = async (quadroId: number, pastaId: number | null) => {
    await api.update('quadros', quadroId, { pasta_id: pastaId });
    nav.recarregar();
  };
  const soltar = (pastaId: number | null) => {
    if (arrastando != null) moverQuadro(arrastando, pastaId);
    setArrastando(null);
    setSoltarEm(null);
  };
  // Quantos quadros há dentro da pasta (contando subpastas).
  const contar = (pastaId: number): number =>
    quadrosDaArea.filter(q => q.pasta_id === pastaId).length + pastasDaArea.filter(p => p.pasta_pai_id === pastaId).reduce((s, p) => s + contar(p.id), 0);
  const abrirTodas = async (aberta: 0 | 1) => {
    await Promise.all(pastasDaArea.filter(p => !!p.aberta !== !!aberta).map(p => api.update('pastas', p.id, { aberta })));
    nav.recarregar();
  };
  // Ordena pastas e quadros de A a Z dentro de cada nível (grava a nova posição).
  const ordenarAZ = async () => {
    if (!(await confirmar(`Ordenar as pastas e os quadros de “${area?.nome ?? 'esta área'}” de A a Z? A ordem atual é substituída.`, 'Ordenar'))) return;
    const muda: Promise<unknown>[] = [];
    const grupos = (lista: Row[], chave: string) => {
      const m = new Map<unknown, Row[]>();
      for (const x of lista) m.set(x[chave] ?? null, [...(m.get(x[chave] ?? null) ?? []), x]);
      return [...m.values()];
    };
    for (const irmas of grupos(pastasDaArea, 'pasta_pai_id')) [...irmas].sort(porNome).forEach((p, k) => { if (p.posicao !== k + 1) muda.push(api.update('pastas', p.id, { posicao: k + 1 })); });
    for (const irmos of grupos(quadrosDaArea, 'pasta_id')) [...irmos].sort(porNome).forEach((q, k) => { if (q.posicao !== k + 1) muda.push(api.update('quadros', q.id, { posicao: k + 1 })); });
    await Promise.all(muda);
    nav.recarregar();
  };

  // Uma pasta e seu conteúdo (subpastas e quadros), recursivamente.
  const renderPasta = (p: Row, nivel: number): ReactNode => {
    const filhas = pastasDaArea.filter(x => x.pasta_pai_id === p.id);
    const quadros = quadrosDaArea.filter(q => q.pasta_id === p.id && casa(q));
    if (b && !quadros.length && !filhas.length) return null;
    const aberta = !!p.aberta || !!b;
    const total = contar(p.id);
    return (
      <div key={`p${p.id}`}>
        <div className={`arvore-linha pasta${soltarEm === p.id ? ' alvo' : ''}`} style={nivelCss(nivel)} title={p.nome}
          onClick={() => api.update('pastas', p.id, { aberta: p.aberta ? 0 : 1 }).then(nav.recarregar)}
          onDragOver={e => { if (arrastando != null) { e.preventDefault(); setSoltarEm(p.id); } }}
          onDragLeave={() => setSoltarEm(null)} onDrop={() => soltar(p.id)}>
          {aberta ? <ChevronDown size={14} className="seta" /> : <ChevronRight size={14} className="seta" />}
          {aberta ? <FolderOpen size={16} style={p.cor ? { color: p.cor } : undefined} /> : <Folder size={16} style={p.cor ? { color: p.cor } : undefined} />}
          <span className="arvore-nome">{p.nome}</span>
          {!!p.restrito && <Lock size={12} className="arvore-cadeado" aria-label="restrita" />}
          {total > 0 && <span className="arvore-n" title={`${total} ${total === 1 ? 'quadro' : 'quadros'}`}>{total}</span>}
          <MenuPasta pasta={p} onPermissoes={PERMISSOES_FINAS && admin ? () => setPermissoes({ recurso: 'pasta', id: p.id, nome: p.nome }) : undefined}
            onNovoQuadro={() => setModal({ tipo: 'quadro', pastaId: p.id })} onSubpasta={() => setModal({ tipo: 'pasta', pastaId: p.id })}
            onRenomear={() => setModal({ tipo: 'renomear', alvo: p, tabela: 'pastas' })}
            onExcluir={async () => { if (await confirmar(`Excluir a pasta “${p.nome}”? Os quadros dela vão para fora das pastas.`)) { await api.remove('pastas', p.id); nav.recarregar(); } }} />
        </div>
        {aberta && (
          <div className="arvore-filhos" style={nivelCss(nivel)}>
            {filhas.map(f => renderPasta(f, nivel + 1))}
            {quadros.map(q => renderQuadro(q, nivel + 1))}
            {!quadros.length && !filhas.length && <div className="arvore-vazia" style={nivelCss(nivel + 1)}>Pasta vazia</div>}
          </div>
        )}
      </div>
    );
  };

  const renderQuadro = (q: Row, nivel: number) => (
    <div key={`q${q.id}`} className={`arvore-linha quadro${q.id === quadroAtual ? ' ativo' : ''}${arrastando === q.id ? ' arrastando' : ''}`}
      style={nivelCss(nivel)} title={q.nome} draggable onDragStart={() => setArrastando(q.id)} onDragEnd={() => { setArrastando(null); setSoltarEm(null); }}
      onClick={() => navigate(`/quadros/${q.id}`)}>
      <span className="seta-vazia" />
      <LayoutGrid size={15} />
      <span className="arvore-nome">{q.nome}</span>
      {!!q.restrito && <Lock size={12} className="arvore-cadeado" aria-label="restrito" />}
      <MenuQuadroLateral quadro={q} pastas={pastasDaArea} onMover={pid => moverQuadro(q.id, pid)}
        onPermissoes={PERMISSOES_FINAS && admin ? () => setPermissoes({ recurso: 'quadro', id: q.id, nome: q.nome }) : undefined}
        onRenomear={() => setModal({ tipo: 'renomear', alvo: q, tabela: 'quadros' })}
        onArquivar={async () => { if (await confirmar(`Arquivar o quadro “${q.nome}”? Ele sai da lateral e pode ser restaurado em Arquivo e lixeira.`, 'Arquivar')) { await req('POST', `quadros/${q.id}/arquivar`); await nav.recarregar(); if (q.id === quadroAtual) navigate('/'); } }}
        onExcluir={async () => { if (await confirmar(`Mover o quadro “${q.nome}” para a lixeira? Dá para restaurar por 30 dias.`)) { await api.remove('quadros', q.id); await nav.recarregar(); if (q.id === quadroAtual) navigate('/'); } }} />
    </div>
  );

  const favoritos = nav.quadros.filter(q => q.favorito);

  return (
    <aside className="lateral">
      <nav className="lateral-atalhos">
        <NavLink to="/" end className={({ isActive }) => `atalho${isActive ? ' ativo' : ''}`}><Home size={17} /> Início</NavLink>
        <NavLink to="/meu-trabalho" className={({ isActive }) => `atalho${isActive ? ' ativo' : ''}`}><ListChecks size={17} /> Meu trabalho</NavLink>
        <NavLink to="/arquivo" className={({ isActive }) => `atalho${isActive ? ' ativo' : ''}`}><Archive size={17} /> Arquivo e lixeira</NavLink>
        <button className="btn-icone recolher" onClick={onRecolher} title="Recolher lateral" aria-label="Recolher lateral"><ChevronsLeft size={16} /></button>
      </nav>

      <div className="lateral-secao">
        <button className="secao-titulo" onClick={() => setFavAberto(!favAberto)}>
          {favAberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Star size={15} /> Favoritos
        </button>
        {favAberto && (favoritos.length ? favoritos.map(q => (
          <div key={q.id} className={`arvore-linha quadro${q.id === quadroAtual ? ' ativo' : ''}`} style={nivelCss(1)} title={q.nome} onClick={() => navigate(`/quadros/${q.id}`)}>
            <LayoutGrid size={15} /><span className="arvore-nome">{q.nome}</span>
          </div>
        )) : <div className="arvore-vazia" style={{ paddingLeft: 26 }}>Marque quadros com a estrela</div>)}
      </div>

      <div className="lateral-secao area-secao">
        <div className="area-linha">
          <SeletorArea onNova={admin ? () => setModal({ tipo: 'area' }) : undefined} onRenomear={admin ? a => setModal({ tipo: 'renomear', alvo: a, tabela: 'areas' }) : undefined}
            onPermissoes={PERMISSOES_FINAS && admin ? a => setPermissoes({ recurso: 'area', id: a.id, nome: a.nome }) : undefined}
            onExcluir={admin ? async a => { if (await confirmar(`Excluir a área “${a.nome}” com todas as pastas e quadros?`)) { await api.remove('areas', a.id); nav.recarregar(); } } : undefined} />
          <button ref={mais.ref} className="btn-icone btn-mais" aria-label="Adicionar" onClick={mais.alternar}><Plus size={16} /></button>
          {mais.aberto && (
            <Popover ancora={mais.ref.current} onClose={mais.fechar} largura={220}>
              <div className="menu-titulo">Adicionar em {area?.nome}</div>
              <Menu onEscolher={mais.fechar} itens={[
                { rotulo: 'Novo quadro', icone: <LayoutGrid size={15} />, onClick: () => setModal({ tipo: 'quadro', pastaId: null }) },
                { rotulo: 'Nova pasta', icone: <FolderPlus size={15} />, onClick: () => setModal({ tipo: 'pasta', pastaId: null }) },
              ]} />
              <div className="menu-titulo">Organizar</div>
              <Menu onEscolher={mais.fechar} itens={[
                { rotulo: 'Recolher todas as pastas', icone: <ChevronsDownUp size={15} />, onClick: () => abrirTodas(0) },
                { rotulo: 'Expandir todas as pastas', icone: <ChevronsUpDown size={15} />, onClick: () => abrirTodas(1) },
                { rotulo: 'Ordenar de A a Z', icone: <ArrowDownAZ size={15} />, onClick: ordenarAZ },
              ]} />
            </Popover>
          )}
        </div>
        <label className="lateral-busca"><Search size={14} /><input placeholder="Buscar quadros" value={busca} onChange={e => setBusca(e.target.value)} /></label>
      </div>

      <div className={`arvore${soltarEm === 'raiz' ? ' alvo' : ''}`}
        onDragOver={e => { if (arrastando != null && e.target === e.currentTarget) { e.preventDefault(); setSoltarEm('raiz'); } }}
        onDrop={e => { if (e.target === e.currentTarget) soltar(null); }}>
        {pastasDaArea.filter(p => !p.pasta_pai_id).map(p => renderPasta(p, 0))}
        {quadrosDaArea.filter(q => !q.pasta_id && casa(q)).map(q => renderQuadro(q, 0))}
        {!quadrosDaArea.length && !pastasDaArea.length && (
          <div className="arvore-vazia grande">
            <p>Esta área ainda não tem quadros.</p>
            <button className="fr-btn btn-primario" onClick={() => setModal({ tipo: 'quadro', pastaId: null })}>Criar quadro</button>
          </div>
        )}
        {arrastando != null && <div className={`zona-raiz${soltarEm === 'raiz' ? ' alvo' : ''}`} onDragOver={e => { e.preventDefault(); setSoltarEm('raiz'); }} onDrop={() => soltar(null)}>Soltar aqui para tirar da pasta</div>}
      </div>

      {permissoes && <Permissoes {...permissoes} onFechar={() => setPermissoes(null)} />}
      <div className="lateral-redim" title="Arraste para mudar a largura (duplo clique volta ao normal)"
        onMouseDown={e => { e.preventDefault(); redimensionar(e.clientX); }} onDoubleClick={larguraPadrao} />
      {modal?.tipo === 'quadro' && <NovoQuadroModal pastaId={modal.pastaId ?? null} onFechar={() => setModal(null)} />}
      {modal?.tipo === 'pasta' && (
        <NomeModal titulo={modal.pastaId ? 'Nova subpasta' : 'Nova pasta'} rotulo="Nome da pasta" onFechar={() => setModal(null)}
          onSalvar={async nome => { await api.create('pastas', { area_id: nav.areaId, pasta_pai_id: modal.pastaId ?? null, nome, aberta: 1 }); nav.recarregar(); }} />
      )}
      {modal?.tipo === 'area' && (
        <NomeModal titulo="Nova área de trabalho" rotulo="Nome da área" onFechar={() => setModal(null)}
          onSalvar={async nome => { const a = await api.create('areas', { nome, cor: CORES[nav.areas.length % CORES.length] }); await nav.recarregar(); nav.setAreaId(a.id); }} />
      )}
      {modal?.tipo === 'renomear' && modal.alvo && (
        <NomeModal titulo="Renomear" rotulo="Novo nome" inicial={modal.alvo.nome} onFechar={() => setModal(null)}
          onSalvar={async nome => { await api.update(modal.tabela!, modal.alvo!.id, { nome }); nav.recarregar(); }} />
      )}
    </aside>
  );
}

// ---------------------------------------------------------------- seletor de área
function SeletorArea({ onNova, onRenomear, onExcluir, onPermissoes }: { onNova?: () => void; onRenomear?: (a: Row) => void; onExcluir?: (a: Row) => void; onPermissoes?: (a: Row) => void }) {
  const nav = useNav();
  const pop = usePopover<HTMLButtonElement>();
  const area = nav.areas.find(a => a.id === nav.areaId);
  return (
    <>
      <button ref={pop.ref} className="seletor-area" onClick={pop.alternar}>
        <span className="area-icone" style={{ background: area?.cor ?? '#1f4e8c', color: corTexto(area?.cor ?? '#1f4e8c') }}>{area?.nome?.[0] ?? '?'}</span>
        <span className="area-nome">{area?.nome ?? 'Área de trabalho'}</span>
        <ChevronDown size={15} />
      </button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={260}>
          <div className="menu-titulo">Áreas de trabalho</div>
          <div className="menu">
            {nav.areas.map(a => (
              <div key={a.id} className={`menu-item area-op${a.id === nav.areaId ? ' ativo' : ''}`} onClick={() => { nav.setAreaId(a.id); pop.fechar(); }}>
                <span className="area-icone pequeno" style={{ background: a.cor, color: corTexto(a.cor) }}>{a.nome[0]}</span>{a.nome}
                {!!a.restrito && <Lock size={12} className="arvore-cadeado" aria-label="restrita" />}
                <span className="espaco" />
                {onPermissoes && <button className="btn-icone" title="Permissões" onClick={e => { e.stopPropagation(); pop.fechar(); onPermissoes(a); }}><Lock size={13} /></button>}
                {onRenomear && <button className="btn-icone" title="Renomear" onClick={e => { e.stopPropagation(); pop.fechar(); onRenomear(a); }}><Pencil size={13} /></button>}
                {onExcluir && nav.areas.length > 1 && <button className="btn-icone" title="Excluir" onClick={e => { e.stopPropagation(); pop.fechar(); onExcluir(a); }}><Trash2 size={13} /></button>}
              </div>
            ))}
            {onNova && <div className="menu-sep" />}
            {onNova && <button className="menu-item" onClick={() => { pop.fechar(); onNova(); }}><span className="menu-icone"><Plus size={15} /></span>Nova área de trabalho</button>}
          </div>
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------- menus de contexto
function MenuPasta({ pasta, onNovoQuadro, onSubpasta, onRenomear, onExcluir, onPermissoes }: { pasta: Row; onNovoQuadro: () => void; onSubpasta: () => void; onRenomear: () => void; onExcluir: () => void; onPermissoes?: () => void }) {
  const pop = usePopover<HTMLButtonElement>();
  return (
    <>
      <button ref={pop.ref} className="btn-icone arvore-menu" aria-label={`Menu da pasta ${pasta.nome}`} onClick={e => { e.stopPropagation(); pop.alternar(); }}><MoreHorizontal size={15} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={220}>
          <Menu onEscolher={pop.fechar} itens={[
            { rotulo: 'Novo quadro nesta pasta', icone: <LayoutGrid size={15} />, onClick: onNovoQuadro },
            { rotulo: 'Nova subpasta', icone: <FolderPlus size={15} />, onClick: onSubpasta },
            { rotulo: 'Renomear pasta', icone: <Pencil size={15} />, onClick: onRenomear },
            ...(onPermissoes ? [{ rotulo: 'Permissões da pasta', icone: <Lock size={15} />, onClick: onPermissoes }] : []),
            'separador',
            { rotulo: 'Excluir pasta', icone: <Trash2 size={15} />, perigo: true, onClick: onExcluir },
          ]} />
        </Popover>
      )}
    </>
  );
}

function MenuQuadroLateral({ quadro, pastas, onMover, onRenomear, onArquivar, onExcluir, onPermissoes }: { quadro: Row; pastas: Row[]; onMover: (pastaId: number | null) => void; onRenomear: () => void; onArquivar: () => void; onExcluir: () => void; onPermissoes?: () => void }) {
  const nav = useNav();
  const navigate = useNavigate();
  const pop = usePopover<HTMLButtonElement>();
  const [mover, setMover] = useState(false);
  return (
    <>
      <button ref={pop.ref} className="btn-icone arvore-menu" aria-label={`Menu do quadro ${quadro.nome}`} onClick={e => { e.stopPropagation(); pop.alternar(); }}><MoreHorizontal size={15} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={() => { pop.fechar(); setMover(false); }} largura={230}>
          {mover ? (
            <>
              <div className="menu-titulo">Mover para</div>
              <Menu onEscolher={pop.fechar} itens={[
                { rotulo: 'Sem pasta', icone: <LayoutGrid size={15} />, ativo: !quadro.pasta_id, onClick: () => onMover(null) },
                ...pastas.map(p => ({ rotulo: p.nome, icone: <Folder size={15} />, ativo: quadro.pasta_id === p.id, onClick: () => onMover(p.id) })),
              ]} />
            </>
          ) : (
            <Menu onEscolher={() => { if (!mover) pop.fechar(); }} itens={[
              { rotulo: 'Renomear', icone: <Pencil size={15} />, onClick: onRenomear },
              { rotulo: 'Mover para pasta', icone: <FolderInput size={15} />, onClick: () => setTimeout(() => { pop.abrir(); setMover(true); }) },
              { rotulo: quadro.favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos', icone: <Star size={15} />, onClick: () => api.update('quadros', quadro.id, { favorito: quadro.favorito ? 0 : 1 }).then(nav.recarregar) },
              { rotulo: 'Duplicar', icone: <Copy size={15} />, onClick: async () => { const n = await req<{ id: number }>('POST', `quadros/${quadro.id}/duplicar`, {}); await nav.recarregar(); navigate(`/quadros/${n.id}`); } },
              ...(onPermissoes ? [{ rotulo: 'Permissões', icone: <Lock size={15} />, onClick: onPermissoes }] : []),
              'separador',
              { rotulo: 'Arquivar quadro', icone: <Archive size={15} />, onClick: onArquivar },
              { rotulo: 'Excluir quadro', icone: <Trash2 size={15} />, perigo: true, onClick: onExcluir },
            ]} />
          )}
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------- modais
export function NomeModal({ titulo, rotulo, inicial = '', onSalvar, onFechar }: { titulo: string; rotulo: string; inicial?: string; onSalvar: (nome: string) => Promise<void> | void; onFechar: () => void }) {
  const [nome, setNome] = useState(inicial);
  return (
    <Modal titulo={titulo} largura={420} onClose={onFechar}>
      <form onSubmit={async e => { e.preventDefault(); if (!nome.trim()) return; await onSalvar(nome.trim()); onFechar(); }}>
        <label className="campo-form">{rotulo}<input className="input-cheio" autoFocus value={nome} onChange={e => setNome(e.target.value)} /></label>
        <div className="form-acoes"><button type="button" className="fr-btn" onClick={onFechar}>Cancelar</button><button className="fr-btn btn-primario" disabled={!nome.trim()}>Salvar</button></div>
      </form>
    </Modal>
  );
}

export function NovoQuadroModal({ pastaId, onFechar }: { pastaId: number | null; onFechar: () => void }) {
  const nav = useNav();
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [pasta, setPasta] = useState<number | ''>(pastaId ?? '');
  const [base, setBase] = useState<number | ''>('');
  const [comItens, setComItens] = useState(false);
  const pastas = nav.pastas.filter(p => p.area_id === nav.areaId);
  return (
    <Modal titulo="Criar quadro" largura={480} onClose={onFechar}>
      <form onSubmit={async e => {
        e.preventDefault();
        if (!nome.trim()) return;
        const dados = { nome: nome.trim(), area_id: nav.areaId, pasta_id: pasta || null };
        const q = base ? await req<{ id: number }>('POST', `quadros/${base}/duplicar`, { ...dados, com_itens: comItens }) : await api.create('quadros', dados);
        await nav.recarregar();
        onFechar();
        navigate(`/quadros/${q.id}`);
      }}>
        <label className="campo-form">Nome do quadro<input className="input-cheio" autoFocus placeholder="Ex.: Obras 2027" value={nome} onChange={e => setNome(e.target.value)} /></label>
        <label className="campo-form">Pasta
          <select className="input-cheio" value={pasta} onChange={e => setPasta(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Sem pasta</option>{pastas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label className="campo-form">Começar a partir de
          <select className="input-cheio" value={base} onChange={e => setBase(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Quadro em branco (Responsável, Status e Data)</option>
            {nav.quadros.map(q => <option key={q.id} value={q.id}>Estrutura de “{q.nome}”</option>)}
          </select>
        </label>
        {base !== '' && <label className="check-form"><input type="checkbox" className="caixa" checked={comItens} onChange={e => setComItens(e.target.checked)} /> Copiar também os itens</label>}
        <div className="form-acoes"><button type="button" className="fr-btn" onClick={onFechar}>Cancelar</button><button className="fr-btn btn-primario" disabled={!nome.trim()}>Criar quadro</button></div>
      </form>
    </Modal>
  );
}
