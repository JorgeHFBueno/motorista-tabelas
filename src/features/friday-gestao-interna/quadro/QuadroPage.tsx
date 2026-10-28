import { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useNavigate } from '../rotas.tsx';
import {
  Activity, Archive, ArchiveRestore, ArrowDownUp, CalendarDays, ChevronDown, Columns3, Copy, Download, EyeOff, FileSpreadsheet, Filter, FolderInput, GanttChart, Group,
  Eye, Kanban as IconeKanban, Lock, LockOpen, MoreHorizontal, Pencil, Plus, Search, Star, Table2, Trash2, Upload, UserRound, X, Zap,
} from 'lucide-react';
import { req } from '../api.ts';
import { useAuth } from '../../../contexts/AuthContext';
import { DesfazerOficial, GrupoOficialDialogo, TornarOficial } from './TornarOficial.tsx';
import { NomeModal } from '../layout/Lateral.tsx';
import { Permissoes } from '../layout/Permissoes.tsx';
import { PERMISSOES_FINAS, useNav } from '../nav.tsx';
import { Avatar, Editavel, Menu, Modal, Popover, useAvisoRapido, useConfirmar, usePopover, type ItemMenu } from '../ui/base.tsx';
import { corTexto } from '../util.ts';
import { exportarExcel } from './excel.ts';
import { AGRUPAVEIS, agruparItens, aplicarFiltros, estadoDaVisao, filtravel, mesmoEstado, normalizar, opcoesFiltro, totalFiltros, type Contexto } from './filtros.ts';
import { ImportarExcel } from './ImportarExcel.tsx';
import { PainelItem, RegistroAtividade } from './PainelItem.tsx';
import type { OpsItens } from './Subitens.tsx';
import { Tabela } from './Tabela.tsx';
import { chaveCelula, infoTipo, textoCelula, type Agrupar, type Coluna, type EstadoVisao, type Grupo, type Item, type Ordenacao, type Visao } from './tipos.ts';
import { porPosicao, useQuadro } from './useQuadro.ts';
import { Calendario, Cronograma, Kanban } from './Visoes.tsx';

const ICONE_VISAO = { tabela: Table2, kanban: IconeKanban, calendario: CalendarDays, cronograma: GanttChart };
const NOME_VISAO = { tabela: 'Tabela', kanban: 'Kanban', calendario: 'Calendário', cronograma: 'Cronograma' };
// Tipos de coluna que cada visão aceita como base.
const BASE_VISAO: Record<Visao['tipo'], string[]> = { tabela: [], kanban: ['status'], calendario: ['data', 'periodo'], cronograma: ['periodo'] };
const VISAO_PADRAO = { id: 0, quadro_id: 0, tipo: 'tabela', nome: 'Tabela principal', config: {}, posicao: 0 } as Visao;

export default function QuadroPage() {
  const quadroId = Number(useParams().id);
  const nav = useNav();
  const navigate = useNavigate();
  const confirmar = useConfirmar();
  const avisar = useAvisoRapido();
  const [params, setParams] = useSearchParams();
  const q = useQuadro(quadroId);
  const { dados } = q;

  const [busca, setBusca] = useState('');
  // Filtros, ordem, agrupamento e colunas ocultas: valem na hora e só ficam salvos na visão com "Salvar na visão".
  const [rascunho, setRascunho] = useState<{ visaoId: number; e: EstadoVisao } | null>(null);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [atividade, setAtividade] = useState(false);
  const [importar, setImportar] = useState(false);
  const [salvarComo, setSalvarComo] = useState(false);

  const itemAberto = Number(params.get('item')) || null;
  const abrirItem = useCallback((id: number | null, aba?: string) => setParams(p => {
    const n = new URLSearchParams(p);
    if (id) n.set('item', String(id)); else n.delete('item');
    if (id && aba) n.set('aba', aba); else n.delete('aba');
    return n;
  }), [setParams]);
  const escolherVisao = (id: number) => setParams(p => { const n = new URLSearchParams(p); n.set('visao', String(id)); return n; });

  const colunas = useMemo(() => dados?.colunas ?? [], [dados?.colunas]);
  const visoes = dados?.visoes ?? [];
  const visao = visoes.find(v => v.id === Number(params.get('visao'))) ?? visoes[0] ?? VISAO_PADRAO;
  const salvo = useMemo(() => estadoDaVisao(visao, colunas), [visao, colunas]);
  const estado = rascunho?.visaoId === visao.id ? rascunho.e : salvo;
  const alterado = !mesmoEstado(estado, salvo);
  const mudarEstado = (m: Partial<EstadoVisao>) => setRascunho({ visaoId: visao.id, e: { ...estado, ...m } });

  const ctx: Contexto = useMemo(() => ({ colunas, nomeUsuario: nav.nomeUsuario, eu: nav.usuario?.id ?? null }), [colunas, nav.nomeUsuario, nav.usuario]);
  const colunasVisiveis = useMemo(() => colunas.filter(c => !estado.ocultas.includes(c.id)), [colunas, estado.ocultas]);

  const itensFiltrados = useMemo(() => {
    if (!dados) return [];
    const b = busca.trim().toLowerCase();
    // Busca também nos subitens: o item pai aparece se algum subitem casar.
    const paisComSub = new Set(b ? (dados.sub?.itens ?? []).filter(s => s.nome.toLowerCase().includes(b)).map(s => s.item_pai_id) : []);
    let lista = b
      ? dados.itens.filter(i => i.nome.toLowerCase().includes(b) || paisComSub.has(i.id) || colunas.some(c => textoCelula(c, i, colunas, nav.nomeUsuario).toLowerCase().includes(b)))
      : dados.itens;
    lista = aplicarFiltros(lista, estado, ctx);
    const o = estado.ordenacao;
    const col = o && colunas.find(c => c.id === o.colunaId);
    if (!col) return [...lista].sort(porPosicao);
    const chave = new Map(lista.map(i => [i.id, chaveCelula(col, i, colunas, nav.nomeUsuario)]));
    return [...lista].sort((a, z) => {
      const ka = chave.get(a.id)!, kz = chave.get(z.id)!;
      if (ka === '' && kz !== '') return 1;
      if (kz === '' && ka !== '') return -1;
      return (ka < kz ? -1 : ka > kz ? 1 : 0) * o!.dir;
    });
  }, [dados, busca, estado, ctx, colunas, nav.nomeUsuario]);

  const agrupamento = useMemo(
    () => (visao.tipo === 'tabela' && estado.agrupar ? agruparItens(itensFiltrados, estado.agrupar, { ...ctx, usuarios: nav.usuarios as never }) : null),
    [visao.tipo, estado.agrupar, itensFiltrados, ctx, nav.usuarios],
  );

  if (q.erro) return <div className="vazio-grande"><h2>Quadro não encontrado</h2><p className="muted">{q.erro}</p></div>;
  if (!dados) return <div className="carregando">Carregando quadro…</div>;

  const { quadro, grupos } = dados;
  const nomeItem = String(quadro.nome_item ?? 'Item');
  const colunaBase = visao.tipo === 'tabela' ? null
    : colunas.find(c => c.id === visao.config.coluna_id && BASE_VISAO[visao.tipo].includes(c.tipo)) ?? colunas.find(c => BASE_VISAO[visao.tipo].includes(c.tipo)) ?? null;
  const nFiltros = totalFiltros(estado);
  // O item aberto pode ser um subitem: o painel usa as colunas dos subitens e mostra o item pai.
  const itemSel = itemAberto ? dados.itens.find(i => i.id === itemAberto) ?? dados.sub?.itens.find(i => i.id === itemAberto) : undefined;
  const paiSel = itemSel?.item_pai_id ? dados.itens.find(i => i.id === itemSel.item_pai_id) : undefined;
  const idsSub = new Set((dados.sub?.itens ?? []).map(i => i.id));
  const temSubSelecionado = [...selecionados].some(id => idsSub.has(id));
  const base = { itens: itensFiltrados, colunas: colunasVisiveis, todasColunas: colunas, grupos, acoes: q, usuarios: nav.usuarios, abrirItem };

  // Arquivar e excluir (vai para a lixeira) com "Desfazer" no aviso.
  const tirarDaTela = (ids: number[]) => {
    setSelecionados(s => new Set([...s].filter(id => !ids.includes(id))));
    if (itemAberto && ids.includes(itemAberto)) abrirItem(null);
  };
  const ops: OpsItens = {
    arquivar: async ids => {
      tirarDaTela(ids);
      await q.arquivarItens(ids);
      avisar(ids.length === 1 ? 'Arquivado.' : `${ids.length} itens arquivados.`, { rotulo: 'Desfazer', onClick: () => q.restaurar('itens', ids) });
    },
    excluir: async (ids, nome) => {
      const msg = ids.length === 1 && nome ? `Mover “${nome}” para a lixeira?` : `Mover ${ids.length} itens para a lixeira?`;
      if (!(await confirmar(`${msg} Dá para restaurar por 30 dias em Arquivo e lixeira.`))) return;
      tirarDaTela(ids);
      await q.excluirItens(ids);
      avisar(ids.length === 1 ? 'Movido para a lixeira.' : `${ids.length} itens movidos para a lixeira.`, { rotulo: 'Desfazer', onClick: () => q.restaurar('itens', ids) });
    },
  };

  const exportar = async (titulo: string, itens: Item[], cols: Coluna[]) => {
    try {
      await exportarExcel({ arquivo: `${quadro.nome} - ${titulo}`, nomeItem, colunas: cols, todasColunas: colunas, grupos, itens, sub: dados.sub, nomeUsuario: nav.nomeUsuario });
    } catch (e) { alert(`Não foi possível gerar a planilha: ${(e as Error).message}`); }
  };

  const salvarNaVisao = async () => {
    const config = { ...visao.config, ...normalizar(estado) };
    if (visao.id) await q.atualizarVisao(visao.id, { config });
    else escolherVisao((await q.criarVisao('Tabela principal', 'tabela', undefined, config)).id);
    setRascunho(null);
  };

  const novoItem = async () => {
    const g = grupos[0] ?? (await q.criarGrupo('Grupo 1'));
    const it = await q.criarItem(g.id, `Novo ${nomeItem.toLowerCase()}`, true);
    abrirItem(it.id);
  };

  return (
    <div className={`pagina-quadro visao-${visao.tipo}${quadro.permissao === 'ver' ? ' somente-leitura' : ''}`}>
      {/* ---------------- cabeçalho */}
      <header className="quadro-cab">
        <div className="qc-linha">
          <Editavel valor={quadro.nome} className="quadro-nome" onSalvar={async v => { if (v) { await q.atualizarQuadro({ nome: v }); nav.recarregar(); } }} />
          {!!quadro.restrito && <span className="selo-restrito" title="Quadro restrito: só algumas pessoas têm acesso"><Lock size={14} /></span>}
          {quadro.oficial && <span className="selo-oficial" title={`Cadastro oficial “${quadro.oficial.nome}” (${quadro.oficial.chave}): as colunas com cadeado são lidas e gravadas no cadastro oficial.`}><Lock size={12} /> Oficial</span>}
          <button className={`btn-icone favorito${quadro.favorito ? ' on' : ''}`} title={quadro.favorito ? 'Remover dos favoritos' : 'Favoritar'}
            onClick={async () => { await q.atualizarQuadro({ favorito: quadro.favorito ? 0 : 1 }); nav.recarregar(); }}>
            <Star size={18} />
          </button>
          <span className="espaco" />
          <span className="avatares qc-pessoas">{nav.usuarios.filter(u => u.ativo).slice(0, 4).map(u => <Avatar key={u.id} nome={u.nome} cor={u.cor} tamanho={28} />)}</span>
          <button className="fr-btn" onClick={() => navigate(`/quadros/${quadroId}/automacoes`)} title="Regras automáticas do quadro">
            <Zap size={15} className="ic-auto" /> Automações{quadro.n_automacoes ? ` / ${quadro.n_automacoes}` : ''}
          </button>
          <button className="fr-btn" onClick={() => setAtividade(true)}><Activity size={15} /> Atividade</button>
          <MenuQuadro quadro={quadro} acoes={q} confirmar={confirmar} temOcultas={estado.ocultas.length > 0}
            onMostrarOcultas={() => mudarEstado({ ocultas: [] })}
            onExportarVisao={() => exportar(visao.nome, itensFiltrados, colunasVisiveis)}
            onExportarTudo={() => exportar('completo', [...dados.itens].sort(porPosicao), colunas)}
            onImportar={() => setImportar(true)}
            onSaiu={() => { nav.recarregar(); navigate('/'); }} />
        </div>
        <Editavel valor={quadro.descricao ?? ''} placeholder="Adicionar descrição do quadro" className="quadro-desc" onSalvar={v => q.atualizarQuadro({ descricao: v || null })} />
        {quadro.permissao === 'ver' && <div className="aviso-leitura"><Eye size={15} /> Você pode ver este quadro, mas não alterar. Para editar, peça acesso a um administrador.</div>}
        <AbasVisoes visoes={visoes} atual={visao} colunas={colunas} acoes={q} confirmar={confirmar} onEscolher={escolherVisao} />
      </header>

      {/* ---------------- barra de ferramentas */}
      <div className="quadro-barra">
        <div className="btn-dividido">
          <button className="fr-btn btn-primario" onClick={novoItem}>Novo {nomeItem.toLowerCase()}</button>
          <NovoMenu onGrupo={() => q.criarGrupo('Novo grupo', true)} onImportar={() => setImportar(true)} />
        </div>
        <label className="busca-barra"><Search size={15} /><input placeholder="Buscar" value={busca} onChange={e => setBusca(e.target.value)} />{busca && <button className="btn-icone" onClick={() => setBusca('')} aria-label="Limpar busca"><X size={13} /></button>}</label>
        <FiltroPessoa pessoa={estado.pessoa} setPessoa={pessoa => mudarEstado({ pessoa })} />
        <FiltroCompleto colunas={colunas} grupos={grupos} itens={dados.itens} estado={estado} ctx={ctx} mostrando={itensFiltrados.length} nomeItem={nomeItem}
          mudar={filtros => mudarEstado({ filtros })} />
        <OrdenarMenu colunas={colunas} ordenacao={estado.ordenacao} setOrdenacao={ordenacao => mudarEstado({ ordenacao })} />
        {visao.tipo === 'tabela' && <AgruparMenu colunas={colunas} agrupar={estado.agrupar} setAgrupar={agrupar => mudarEstado({ agrupar })} />}
        {visao.tipo === 'tabela' && <OcultarMenu colunas={colunas} ocultas={estado.ocultas} setOcultas={ocultas => mudarEstado({ ocultas })} />}
        {colunaBase && (
          <label className="base-visao">{infoTipo(colunaBase.tipo).rotulo}:
            <select value={colunaBase.id} onChange={e => q.atualizarVisao(visao.id, { config: { ...visao.config, coluna_id: Number(e.target.value) } })}>
              {colunas.filter(c => BASE_VISAO[visao.tipo].includes(c.tipo)).map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
            </select>
          </label>
        )}
        {nFiltros > 0 && <button className="fr-btn-link" onClick={() => mudarEstado({ filtros: {}, pessoa: null })}>Limpar filtros ({nFiltros})</button>}
        {alterado && (
          <div className="salvar-visao">
            <span className="muted fr-small">Mudanças nesta visão</span>
            <button className="fr-btn btn-primario btn-pequeno" onClick={salvarNaVisao}>Salvar na visão</button>
            <button className="fr-btn btn-pequeno" onClick={() => setRascunho(null)}>Descartar</button>
            <button className="fr-btn-link fr-small" onClick={() => setSalvarComo(true)}>Salvar como nova visão</button>
          </div>
        )}
      </div>

      {/* ---------------- visão */}
      <div className="quadro-conteudo">
        {visao.tipo === 'tabela' && (
          <Tabela grupos={grupos} colunas={colunasVisiveis} todasColunas={colunas} itens={itensFiltrados} sub={dados.sub} acoes={q} ops={ops} usuarios={nav.usuarios} nomeItem={nomeItem}
            selecionados={selecionados} setSelecionados={setSelecionados} abrirItem={abrirItem} setOrdenacao={ordenacao => mudarEstado({ ordenacao })}
            onOcultar={id => mudarEstado({ ocultas: [...estado.ocultas, id] })}
            onAgrupar={id => mudarEstado({ agrupar: { coluna_id: id, ordem: 1, vazios: false } })}
            onExportarGrupo={(g, lista) => exportar(g.nome, lista, colunasVisiveis)}
            agrupamento={agrupamento} />
        )}
        {visao.tipo !== 'tabela' && !colunaBase && (
          <div className="vazio-grande">
            <h3>Esta visão precisa de uma coluna de {BASE_VISAO[visao.tipo].map(t => infoTipo(t).rotulo.toLowerCase()).join(' ou ')}</h3>
            <button className="fr-btn btn-primario" onClick={async () => { const c = await q.criarColuna(BASE_VISAO[visao.tipo][0] as Coluna['tipo'], infoTipo(BASE_VISAO[visao.tipo][0]).rotulo); q.atualizarVisao(visao.id, { config: { ...visao.config, coluna_id: c.id } }); }}>
              Criar coluna {infoTipo(BASE_VISAO[visao.tipo][0]).rotulo}
            </button>
          </div>
        )}
        {visao.tipo === 'kanban' && colunaBase && <Kanban {...base} coluna={colunaBase} />}
        {visao.tipo === 'calendario' && colunaBase && <Calendario {...base} coluna={colunaBase} />}
        {visao.tipo === 'cronograma' && colunaBase && <Cronograma {...base} coluna={colunaBase} />}
      </div>

      {/* ---------------- seleção em lote */}
      {selecionados.size > 0 && (
        <BarraSelecao n={selecionados.size} grupos={grupos} comSubitens={temSubSelecionado} onLimpar={() => setSelecionados(new Set())}
          onDuplicar={async () => { await q.duplicarItens([...selecionados]); setSelecionados(new Set()); }}
          onMover={async gid => { await q.moverItens([...selecionados], gid); setSelecionados(new Set()); }}
          onExportar={() => exportar('selecionados', itensFiltrados.filter(i => selecionados.has(i.id)), colunasVisiveis)}
          onArquivar={() => ops.arquivar([...selecionados])}
          onExcluir={() => ops.excluir([...selecionados])} />
      )}

      {itemSel && (
        <PainelItem key={itemSel.id} item={itemSel} grupo={paiSel ? undefined : grupos.find(g => g.id === itemSel.grupo_id)} colunas={paiSel ? dados.sub?.colunas ?? [] : colunas}
          pai={paiSel} onAbrirPai={paiSel ? () => abrirItem(paiSel.id, 'subitens') : undefined}
          acoes={q} ops={ops} sub={dados.sub} abaInicial={params.get('aba') ?? undefined} onFechar={() => abrirItem(null)} />
      )}
      {atividade && (
        <Modal titulo={`Atividade — ${quadro.nome}`} largura={720} onClose={() => setAtividade(false)}>
          <RegistroAtividade filtro={{ quadro_id: quadroId }} />
        </Modal>
      )}
      {importar && <ImportarExcel quadroId={quadroId} nomeItem={nomeItem} colunas={colunas} grupos={grupos} sub={dados.sub} acoes={q} usuarios={nav.usuarios} onFechar={() => setImportar(false)} />}
      {salvarComo && (
        <NomeModal titulo="Salvar como nova visão" rotulo="Nome da visão" inicial={`${visao.nome} (filtrada)`} onFechar={() => setSalvarComo(false)}
          onSalvar={async nome => { const v = await q.criarVisao(nome, visao.tipo, visao.config.coluna_id, normalizar(estado)); setRascunho(null); escolherVisao(v.id); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- abas das visões
function AbasVisoes({ visoes, atual, colunas, acoes, confirmar, onEscolher }: {
  visoes: Visao[]; atual: Visao; colunas: Coluna[]; acoes: ReturnType<typeof useQuadro>; confirmar: ReturnType<typeof useConfirmar>; onEscolher: (id: number) => void;
}) {
  const nova = usePopover<HTMLButtonElement>();
  const [menuDe, setMenuDe] = useState<{ v: Visao; el: HTMLElement } | null>(null);
  const [renomear, setRenomear] = useState<number | null>(null);
  const criar = async (tipo: Visao['tipo']) => {
    nova.fechar();
    const base = colunas.find(c => BASE_VISAO[tipo].includes(c.tipo));
    const v = await acoes.criarVisao(NOME_VISAO[tipo], tipo, base?.id);
    onEscolher(v.id);
  };
  const filtrada = (v: Visao) => { const c = v.config ?? {}; return Object.values(c.filtros ?? {}).some(x => x.length) || !!c.pessoa || !!c.agrupar || !!c.ordenacao; };
  return (
    <nav className="abas-visoes">
      {visoes.map(v => {
        const Ic = ICONE_VISAO[v.tipo] ?? Table2;
        return (
          <div key={v.id} className={`aba-visao${v.id === atual.id ? ' on' : ''}`} onClick={() => onEscolher(v.id)} title={filtrada(v) ? 'Visão com filtros, ordem ou agrupamento salvos' : undefined}>
            <Ic size={15} />
            {renomear === v.id
              ? <Editavel iniciarEditando valor={v.nome} onSalvar={n => { setRenomear(null); if (n) acoes.atualizarVisao(v.id, { nome: n }); }} />
              : <span>{v.nome}</span>}
            {filtrada(v) && <Filter size={11} className="aba-filtro" />}
            {v.id === atual.id && <button className="btn-icone aba-menu" aria-label="Menu da visão" onClick={e => { e.stopPropagation(); setMenuDe({ v, el: e.currentTarget }); }}><MoreHorizontal size={14} /></button>}
          </div>
        );
      })}
      <button ref={nova.ref} className="btn-icone aba-nova" aria-label="Adicionar visão" onClick={nova.alternar}><Plus size={16} /></button>
      {nova.aberto && (
        <Popover ancora={nova.ref.current} onClose={nova.fechar} largura={220}>
          <div className="menu-titulo">Adicionar visão</div>
          <Menu itens={(Object.keys(NOME_VISAO) as Visao['tipo'][]).map(t => { const Ic = ICONE_VISAO[t]; return { rotulo: NOME_VISAO[t], icone: <Ic size={15} />, onClick: () => criar(t) }; })} />
        </Popover>
      )}
      {menuDe && (
        <Popover ancora={menuDe.el} onClose={() => setMenuDe(null)} largura={200}>
          <Menu onEscolher={() => setMenuDe(null)} itens={[
            { rotulo: 'Renomear', icone: <Pencil size={15} />, onClick: () => setRenomear(menuDe.v.id) },
            { rotulo: 'Duplicar visão', icone: <Copy size={15} />, onClick: async () => { const v = await acoes.criarVisao(`${menuDe.v.nome} (cópia)`, menuDe.v.tipo, undefined, menuDe.v.config); onEscolher(v.id); } },
            ...(visoes.length > 1 ? [{ rotulo: 'Excluir visão', icone: <Trash2 size={15} />, perigo: true, onClick: async () => { if (await confirmar(`Excluir a visão “${menuDe.v.nome}”? Os itens não são apagados.`)) acoes.excluirVisao(menuDe.v.id); } }] : []),
          ]} />
        </Popover>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------- menus da barra
function NovoMenu({ onGrupo, onImportar }: { onGrupo: () => void; onImportar: () => void }) {
  const pop = usePopover<HTMLButtonElement>();
  return (
    <>
      <button ref={pop.ref} className="fr-btn btn-primario btn-seta" aria-label="Mais opções de criação" onClick={pop.alternar}><ChevronDown size={15} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={220}>
          <Menu onEscolher={pop.fechar} itens={[
            { rotulo: 'Novo grupo', icone: <Columns3 size={15} />, onClick: onGrupo },
            { rotulo: 'Importar do Excel', icone: <Upload size={15} />, onClick: onImportar },
          ]} />
        </Popover>
      )}
    </>
  );
}

function FiltroPessoa({ pessoa, setPessoa }: { pessoa: string | null; setPessoa: (id: string | null) => void }) {
  const nav = useNav();
  const pop = usePopover<HTMLButtonElement>();
  const u = nav.usuarios.find(x => x.id === pessoa);
  return (
    <>
      <button ref={pop.ref} className={`fr-btn btn-barra${pessoa ? ' ativo' : ''}`} onClick={pop.alternar}>
        {u ? <Avatar nome={u.nome} cor={u.cor} tamanho={20} /> : <UserRound size={15} />} Pessoa
      </button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={260}>
          <div className="menu-titulo">Filtrar por pessoa</div>
          <div className="filtro-pessoas">
            {nav.usuarios.filter(x => x.ativo).map(x => (
              <button key={x.id} className={x.id === pessoa ? 'on' : ''} title={x.nome} onClick={() => { setPessoa(x.id === pessoa ? null : x.id); pop.fechar(); }}>
                <Avatar nome={x.nome} cor={x.cor} tamanho={32} />
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

// Filtro rápido: todas as colunas, com a contagem de itens por valor. Várias opções numa coluna = qualquer uma (OU);
// opções em colunas diferentes = todas (E).
function FiltroCompleto({ colunas, grupos, itens, estado, ctx, mostrando, nomeItem, mudar }: {
  colunas: Coluna[]; grupos: Grupo[]; itens: Item[]; estado: EstadoVisao; ctx: Contexto; mostrando: number; nomeItem: string; mudar: (f: Record<string, string[]>) => void;
}) {
  const nav = useNav();
  const pop = usePopover<HTMLButtonElement>();
  const [buscaCol, setBuscaCol] = useState('');
  const n = Object.values(estado.filtros).reduce((s, v) => s + v.length, 0);
  const alternar = (k: string, chave: string) => {
    const atual = estado.filtros[k] ?? [];
    mudar({ ...estado.filtros, [k]: atual.includes(chave) ? atual.filter(x => x !== chave) : [...atual, chave] });
  };
  const b = buscaCol.trim().toLowerCase();
  const cols = colunas.filter(c => filtravel(c) && (!b || c.titulo.toLowerCase().includes(b)));
  const contGrupo = new Map<number, number>();
  for (const i of itens) contGrupo.set(i.grupo_id, (contGrupo.get(i.grupo_id) ?? 0) + 1);
  return (
    <>
      <button ref={pop.ref} className={`fr-btn btn-barra${n ? ' ativo' : ''}`} onClick={pop.alternar}><Filter size={15} /> Filtrar{n ? ` / ${n}` : ''}</button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={Math.min(940, window.innerWidth - 40)} className="pop-filtro">
          <div className="filtro-topo">
            <strong>Filtro rápido</strong>
            <span className="muted fr-small">Mostrando {mostrando} de {itens.length} {itens.length === 1 ? nomeItem.toLowerCase() : 'itens'}</span>
            <span className="espaco" />
            <label className="busca-pop filtro-busca"><Search size={14} /><input placeholder="Buscar coluna" value={buscaCol} onChange={e => setBuscaCol(e.target.value)} /></label>
            {n > 0 && <button className="fr-btn-link" onClick={() => mudar({})}>Limpar tudo</button>}
          </div>
          <div className="filtro-colunas">
            {(!b || 'grupo'.includes(b)) && (
              <div className="filtro-coluna">
                <strong><Columns3 size={12} /> Grupo</strong>
                <div className="filtro-opcoes">
                  {grupos.map(g => (
                    <BotaoOpcao key={g.id} on={(estado.filtros.grupo ?? []).includes(String(g.id))} rotulo={g.nome} n={contGrupo.get(g.id) ?? 0} cor={g.cor} onClick={() => alternar('grupo', String(g.id))} />
                  ))}
                </div>
              </div>
            )}
            {cols.map(c => {
              const Ic = infoTipo(c.tipo).icone;
              const marcadas = estado.filtros[String(c.id)] ?? [];
              const ops = opcoesFiltro(c, itens, ctx).filter(o => o.n > 0 || o.especial || c.tipo === 'status' || marcadas.includes(o.chave));
              return (
                <div key={c.id} className="filtro-coluna">
                  <strong title={c.titulo}><Ic size={12} /> {c.titulo}</strong>
                  <div className="filtro-opcoes">
                    {ops.map(o => (
                      <BotaoOpcao key={o.chave} on={marcadas.includes(o.chave)} rotulo={o.rotulo} n={o.n} cor={o.cor} especial={o.especial}
                        usuario={o.usuario ? (nav.usuarios.find(x => x.id === o.usuario) as { nome: string; cor?: string } | undefined) : undefined} onClick={() => alternar(String(c.id), o.chave)} />
                    ))}
                    {!ops.length && <small className="muted">Sem valores</small>}
                  </div>
                </div>
              );
            })}
          </div>
        </Popover>
      )}
    </>
  );
}
function BotaoOpcao({ on, rotulo, n, cor, especial, usuario, onClick }: { on: boolean; rotulo: string; n: number; cor?: string; especial?: boolean; usuario?: { nome: string; cor?: string }; onClick: () => void }) {
  return (
    <button className={`filtro-opcao${on ? ' on' : ''}${n === 0 ? ' zero' : ''}${especial ? ' especial' : ''}`} onClick={onClick} title={rotulo}>
      {cor && <span className="bolinha" style={{ background: cor }} />}
      {usuario && <Avatar nome={usuario.nome} cor={usuario.cor} tamanho={18} />}
      <span className="fo-texto">{rotulo}</span>
      <small>{n}</small>
    </button>
  );
}

function OrdenarMenu({ colunas, ordenacao, setOrdenacao }: { colunas: Coluna[]; ordenacao: Ordenacao; setOrdenacao: (o: Ordenacao) => void }) {
  const pop = usePopover<HTMLButtonElement>();
  const col = colunas.find(c => c.id === ordenacao?.colunaId);
  return (
    <>
      <button ref={pop.ref} className={`fr-btn btn-barra${ordenacao ? ' ativo' : ''}`} onClick={pop.alternar}><ArrowDownUp size={15} /> Ordenar{col ? `: ${col.titulo}` : ''}</button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={300}>
          <div className="menu-titulo">Ordenar por</div>
          <div className="ordenar">
            <select value={ordenacao?.colunaId ?? ''} onChange={e => setOrdenacao(e.target.value ? { colunaId: Number(e.target.value), dir: ordenacao?.dir ?? 1 } : null)}>
              <option value="">Posição manual</option>
              {colunas.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
            </select>
            {ordenacao && (
              <select value={ordenacao.dir} onChange={e => setOrdenacao({ ...ordenacao, dir: Number(e.target.value) as 1 | -1 })}>
                <option value={1}>Crescente</option><option value={-1}>Decrescente</option>
              </select>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}

function AgruparMenu({ colunas, agrupar, setAgrupar }: { colunas: Coluna[]; agrupar: Agrupar | null; setAgrupar: (a: Agrupar | null) => void }) {
  const pop = usePopover<HTMLButtonElement>();
  const col = colunas.find(c => c.id === agrupar?.coluna_id);
  const opcoes = colunas.filter(c => AGRUPAVEIS.has(c.tipo));
  return (
    <>
      <button ref={pop.ref} className={`fr-btn btn-barra${col ? ' ativo' : ''}`} onClick={pop.alternar}><Group size={15} /> Agrupar{col ? `: ${col.titulo}` : ''}</button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={320}>
          <div className="menu-titulo">Agrupar itens por</div>
          <div className="ordenar agrupar">
            <select value={agrupar?.coluna_id ?? ''} onChange={e => setAgrupar(e.target.value ? { coluna_id: Number(e.target.value), ordem: agrupar?.ordem ?? 1, vazios: agrupar?.vazios ?? false } : null)}>
              <option value="">Grupos do quadro (padrão)</option>
              {opcoes.map(c => <option key={c.id} value={c.id}>{c.titulo} ({infoTipo(c.tipo).rotulo.toLowerCase()})</option>)}
            </select>
            {agrupar && (
              <>
                <select value={agrupar.ordem} onChange={e => setAgrupar({ ...agrupar, ordem: Number(e.target.value) as 1 | -1 })}>
                  <option value={1}>Ordem crescente</option><option value={-1}>Ordem decrescente</option>
                </select>
                <label className="check-form"><input type="checkbox" className="caixa" checked={agrupar.vazios} onChange={e => setAgrupar({ ...agrupar, vazios: e.target.checked })} /> Mostrar grupos vazios</label>
                <p className="muted fr-small">Item novo num desses grupos já nasce com o valor do grupo. Para mover entre grupos, mude o valor na célula.</p>
              </>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}

function OcultarMenu({ colunas, ocultas, setOcultas }: { colunas: Coluna[]; ocultas: number[]; setOcultas: (o: number[]) => void }) {
  const pop = usePopover<HTMLButtonElement>();
  const n = colunas.filter(c => ocultas.includes(c.id)).length;
  return (
    <>
      <button ref={pop.ref} className={`fr-btn btn-barra${n ? ' ativo' : ''}`} onClick={pop.alternar}><EyeOff size={15} /> Ocultar{n ? ` / ${n}` : ''}</button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={270}>
          <div className="menu-titulo">Colunas visíveis nesta visão {n > 0 && <button className="fr-btn-link fr-small" onClick={() => setOcultas([])}>Mostrar todas</button>}</div>
          <div className="lista-check">
            {colunas.map(c => {
              const Ic = infoTipo(c.tipo).icone;
              const oculta = ocultas.includes(c.id);
              return (
                <label key={c.id}><input type="checkbox" className="caixa" checked={!oculta} onChange={() => setOcultas(oculta ? ocultas.filter(x => x !== c.id) : [...ocultas, c.id])} />
                  <span className="tipo-ic" style={{ background: infoTipo(c.tipo).cor, color: corTexto(infoTipo(c.tipo).cor) }}><Ic size={12} /></span>{c.titulo}</label>
              );
            })}
          </div>
        </Popover>
      )}
    </>
  );
}

function MenuQuadro({ quadro, acoes, confirmar, temOcultas, onMostrarOcultas, onExportarVisao, onExportarTudo, onImportar, onSaiu }: {
  quadro: Record<string, any>; acoes: ReturnType<typeof useQuadro>; confirmar: ReturnType<typeof useConfirmar>; temOcultas: boolean;
  onMostrarOcultas: () => void; onExportarVisao: () => void; onExportarTudo: () => void; onImportar: () => void; onSaiu: () => void;
}) {
  const nav = useNav();
  const navigate = useNavigate();
  const pop = usePopover<HTMLButtonElement>();
  const [nomeItem, setNomeItem] = useState(false);
  const [permissoes, setPermissoes] = useState(false);
  const [oficializar, setOficializar] = useState<'quadro' | 'subitens' | 'desfazer' | 'grupo' | 'grupo_descontinuar' | null>(null);
  const existente = quadro.oficial?.modo === 'existente';
  const adm2 = useAuth().authorizationProfile?.adm2 === true;
  const itens: ItemMenu[] = [
    // Cadastros oficiais: só adm2, quadro comum ainda não oficial.
    ...(adm2 && !quadro.oficial && quadro.tipo !== 'subitens' ? [{ rotulo: 'Tornar oficial…', icone: <Lock size={15} />, onClick: () => setOficializar('quadro') }, 'separador' as const] : []),
    // Subitens oficiais: quadro oficial com subitens que ainda não são oficiais (ou promoção interrompida).
    // Cadastro existente: a ligação com a coleção é feita por script (decisão de 2026-10-28); subitens e grupo oficiais ainda não valem.
    ...(adm2 && quadro.oficial && !existente && quadro.oficial.subitens !== 'ativo' && acoes.dados?.sub
      ? [{ rotulo: quadro.oficial.subitens === 'migrando' ? 'Retomar subitens oficiais…' : 'Tornar subitens oficiais…', icone: <Lock size={15} />, onClick: () => setOficializar('subitens') }, 'separador' as const] : []),
    ...(adm2 && quadro.oficial ? [
      ...(existente ? [] : [quadro.oficial.grupo === 'ativo'
        ? { rotulo: 'Descontinuar o grupo oficial…', icone: <LockOpen size={15} />, onClick: () => setOficializar('grupo_descontinuar') }
        : { rotulo: 'Tornar o grupo oficial…', icone: <Lock size={15} />, onClick: () => setOficializar('grupo') }]),
      { rotulo: 'Desfazer oficialização…', icone: <LockOpen size={15} />, onClick: () => setOficializar('desfazer') }, 'separador' as const] : []),
    ...(PERMISSOES_FINAS && nav.usuario?.admin ? [{ rotulo: 'Permissões do quadro', icone: <Lock size={15} />, onClick: () => setPermissoes(true) }, 'separador' as const] : []),
    { rotulo: 'Exportar visão atual para Excel', icone: <FileSpreadsheet size={15} />, onClick: onExportarVisao },
    { rotulo: 'Exportar quadro inteiro para Excel', icone: <Download size={15} />, onClick: onExportarTudo },
    { rotulo: 'Importar itens do Excel', icone: <Upload size={15} />, onClick: onImportar },
    'separador',
    { rotulo: 'Duplicar quadro (só estrutura)', icone: <Copy size={15} />, onClick: async () => { const n = await req<{ id: number }>('POST', `quadros/${quadro.id}/duplicar`, {}); await nav.recarregar(); navigate(`/quadros/${n.id}`); } },
    { rotulo: 'Duplicar quadro com itens', icone: <Copy size={15} />, onClick: async () => { const n = await req<{ id: number }>('POST', `quadros/${quadro.id}/duplicar`, { com_itens: true }); await nav.recarregar(); navigate(`/quadros/${n.id}`); } },
    { rotulo: `Nome dos itens: “${quadro.nome_item ?? 'Item'}”`, icone: <Pencil size={15} />, onClick: () => setNomeItem(true) },
    ...(temOcultas ? [{ rotulo: 'Mostrar colunas ocultas', icone: <EyeOff size={15} />, onClick: onMostrarOcultas }] : []),
    { rotulo: 'Arquivo e lixeira deste quadro', icone: <ArchiveRestore size={15} />, onClick: () => navigate(`/arquivo?quadro=${quadro.id}`) },
    'separador',
    { rotulo: 'Arquivar quadro', icone: <Archive size={15} />, onClick: async () => { if (await confirmar(`Arquivar o quadro “${quadro.nome}”? Ele sai da lateral e pode ser restaurado em Arquivo e lixeira.`, 'Arquivar')) { await req('POST', `quadros/${quadro.id}/arquivar`); onSaiu(); } } },
    { rotulo: 'Excluir quadro', icone: <Trash2 size={15} />, perigo: true, onClick: async () => { if (await confirmar(`Mover o quadro “${quadro.nome}” para a lixeira? Dá para restaurar por 30 dias; depois disso ele é apagado de vez.`)) { await req('DELETE', `quadros/${quadro.id}`); onSaiu(); } } },
  ];
  return (
    <>
      <button ref={pop.ref} className="btn-icone" aria-label="Menu do quadro" onClick={pop.alternar}><MoreHorizontal size={18} /></button>
      {pop.aberto && <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={280}><Menu onEscolher={pop.fechar} itens={itens} /></Popover>}
      {permissoes && <Permissoes recurso="quadro" id={Number(quadro.id)} nome={String(quadro.nome)} onFechar={() => { setPermissoes(false); acoes.recarregar(); }} />}
      {oficializar === 'quadro' && <TornarOficial quadro={quadro} colunas={acoes.dados?.colunas ?? []} onFechar={() => setOficializar(null)} onPronto={() => { setOficializar(null); acoes.recarregar(); }} />}
      {oficializar === 'subitens' && acoes.dados?.sub && <TornarOficial quadro={quadro} colunas={acoes.dados.sub.colunas}
        subitens={{ nomeItem: String(acoes.dados.sub.nome_item || 'Subitem'), chave: quadro.oficial?.subitens === 'migrando' ? quadro.oficial.sub_chave : null }}
        onFechar={() => setOficializar(null)} onPronto={() => { setOficializar(null); acoes.recarregar(); }} />}
      {(oficializar === 'grupo' || oficializar === 'grupo_descontinuar') && quadro.oficial && <GrupoOficialDialogo quadroId={Number(quadro.id)} oficial={quadro.oficial}
        modo={oficializar === 'grupo' ? 'ativar' : 'descontinuar'} onFechar={() => setOficializar(null)} onPronto={() => { setOficializar(null); acoes.recarregar(); }} />}
      {oficializar === 'desfazer' && quadro.oficial && <DesfazerOficial quadroId={Number(quadro.id)} oficial={quadro.oficial}
        onFechar={() => setOficializar(null)} onPronto={() => { setOficializar(null); acoes.recarregar(); nav.recarregar(); }} />}
      {nomeItem && (
        <Modal titulo="Como chamar os itens deste quadro?" largura={420} onClose={() => setNomeItem(false)}>
          <form onSubmit={e => { e.preventDefault(); const v = new FormData(e.currentTarget).get('n') as string; if (v.trim()) acoes.atualizarQuadro({ nome_item: v.trim() }); setNomeItem(false); }}>
            <p className="muted fr-small">Ex.: Obra, Viagem, Tarefa, Veículo. Aparece em “Novo …” e no cabeçalho da tabela.</p>
            <input name="n" className="input-cheio" autoFocus defaultValue={quadro.nome_item ?? 'Item'} />
            <div className="form-acoes"><button type="button" className="fr-btn" onClick={() => setNomeItem(false)}>Cancelar</button><button className="fr-btn btn-primario">Salvar</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

// Com subitens na seleção, "Mover para" e "Exportar" somem (valem só para itens do quadro).
function BarraSelecao({ n, grupos, comSubitens, onLimpar, onDuplicar, onMover, onExportar, onArquivar, onExcluir }: {
  n: number; grupos: { id: number; nome: string; cor: string }[]; comSubitens: boolean; onLimpar: () => void; onDuplicar: () => void; onMover: (g: number) => void;
  onExportar: () => void; onArquivar: () => void; onExcluir: () => void;
}) {
  const pop = usePopover<HTMLButtonElement>();
  return (
    <div className="barra-selecao">
      <span className="bs-n">{n}</span><span>{n === 1 ? 'item selecionado' : 'itens selecionados'}</span>
      <button className="bs-acao" onClick={onDuplicar}><Copy size={18} />Duplicar</button>
      {!comSubitens && <button ref={pop.ref} className="bs-acao" onClick={pop.alternar}><FolderInput size={18} />Mover para</button>}
      {!comSubitens && <button className="bs-acao" onClick={onExportar}><FileSpreadsheet size={18} />Exportar</button>}
      <button className="bs-acao" onClick={onArquivar}><Archive size={18} />Arquivar</button>
      <button className="bs-acao perigo" onClick={onExcluir}><Trash2 size={18} />Excluir</button>
      <button className="btn-icone" onClick={onLimpar} aria-label="Limpar seleção"><X size={18} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={240}>
          <div className="menu-titulo">Mover para o grupo</div>
          <Menu onEscolher={pop.fechar} itens={grupos.map(g => ({ rotulo: g.nome, icone: <span className="bolinha" style={{ background: g.cor }} />, onClick: () => onMover(g.id) }))} />
        </Popover>
      )}
    </div>
  );
}
