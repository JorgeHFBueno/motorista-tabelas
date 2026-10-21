import { useMemo, useRef, useState } from 'react';
import {
  AlarmClock, Archive, ArrowDownAZ, ArrowLeft, ArrowRight, ArrowUpAZ, CalendarDays, Check, ChevronDown, ChevronRight, Copy, EyeOff, FileSpreadsheet, GripVertical, Group, ListTree, Maximize2,
  Lock, LockOpen, MessageCircle, MessageCirclePlus, Sigma, MoreHorizontal, Palette, Pencil, Plus, Trash2,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import type { Row } from '../api.ts';
import { Menu, Popover, useConfirmar, usePopover, Editavel, type ItemMenu } from '../ui/base.tsx';
import { CORES, fmtData, fmtNumero, posEntre } from '../util.ts';
import { Celula } from './Celula.tsx';
import { EditorFormula } from './EditorFormula.tsx';
import { AGRUPAVEIS, type GrupoVirtual } from './filtros.ts';
import { MenuTipos } from './MenuTipos.tsx';
import { TabelaSubitens, type OpsItens } from './Subitens.tsx';
import { CampoOficialDialogo, TIPOS_OFICIAIS } from './TornarOficial.tsx';
import { ehPrazo, infoTipo, type Coluna, type Grupo, type Item, type Ordenacao, type Rotulo, type Sub } from './tipos.ts';
import type { Acoes } from './useQuadro.ts';

export type { Ordenacao };
export type Agrupamento = { grupos: GrupoVirtual[]; grupoDe: Map<number, number[]> } | null;

const LARGURA_NOME = 360;
const LIMITE_INICIAL = 60;

export function Tabela({ grupos: gruposReais, colunas, todasColunas, itens, sub, acoes, ops, usuarios, nomeItem, selecionados, setSelecionados, abrirItem, setOrdenacao,
  onOcultar, onAgrupar, onExportarGrupo, agrupamento }: {
  grupos: Grupo[];
  colunas: Coluna[];
  todasColunas: Coluna[];
  itens: Item[];
  sub: Sub | null;
  acoes: Acoes;
  ops: OpsItens;
  usuarios: Row[];
  nomeItem: string;
  selecionados: Set<number>;
  setSelecionados: (s: Set<number>) => void;
  abrirItem: (id: number, aba?: string) => void;
  setOrdenacao: (o: Ordenacao) => void;
  onOcultar: (colunaId: number) => void;
  onAgrupar: (colunaId: number) => void;
  onExportarGrupo: (g: Grupo, itens: Item[]) => void;
  // "Agrupar por": grupos virtuais (um por valor da coluna) no lugar dos grupos do quadro.
  agrupamento: Agrupamento;
}) {
  const virtual = !!agrupamento;
  const grupos: (Grupo | GrupoVirtual)[] = agrupamento?.grupos ?? gruposReais;
  const [recolhidosV, setRecolhidosV] = useState<Set<number>>(new Set());
  // Itens com os subitens abertos na tabela; focoSub = item cujo campo "adicionar subitem" ganha o foco.
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const [focoSub, setFocoSub] = useState<number | null>(null);
  const alternarSubs = (id: number, abrir?: boolean) => setAbertos(s => { const n = new Set(s); if (abrir ?? !n.has(id)) n.add(id); else n.delete(id); return n; });
  const [larguras, setLarguras] = useState<Record<number, number>>({});
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<{ grupoId: number; antesDe: number | null } | null>(null);
  // Grupos grandes mostram os itens em partes (desempenho com milhares de linhas).
  const [limites, setLimites] = useState<Record<number, number>>({});
  const limiteDe = (gid: number) => limites[gid] ?? LIMITE_INICIAL;
  const confirmar = useConfirmar();
  const [editorFormula, setEditorFormula] = useState<Coluna | null>(null);
  // Coluna de fórmula nova: abre o editor logo após criar.
  const aoCriar = (c: Coluna) => { if (c.tipo === 'formula') setEditorFormula(c); };

  const largura = (c: Coluna) => larguras[c.id] ?? c.largura ?? 140;
  const larguraTotal = 40 + LARGURA_NOME + colunas.reduce((s, c) => s + largura(c), 0) + 60;
  const porGrupo = useMemo(() => {
    const m = new Map<number, Item[]>();
    for (const i of itens) {
      if (i.item_pai_id) continue;
      for (const g of agrupamento ? agrupamento.grupoDe.get(i.id) ?? [] : [i.grupo_id]) {
        const l = m.get(g);
        if (l) l.push(i); else m.set(g, [i]);
      }
    }
    return m;
  }, [itens, agrupamento]);
  const nSub = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of sub?.itens ?? []) m.set(s.item_pai_id!, (m.get(s.item_pai_id!) ?? 0) + 1);
    return m;
  }, [sub?.itens]);
  const recolhido = (g: Grupo) => (virtual ? recolhidosV.has(g.id) : !!g.recolhido);
  const alternarGrupo = (g: Grupo) => {
    if (!virtual) { acoes.atualizarGrupo(g.id, { recolhido: g.recolhido ? 0 : 1 }); return; }
    setRecolhidosV(s => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; });
  };
  // Item novo num grupo virtual entra no primeiro grupo do quadro já com o valor do grupo (ex.: o status).
  const criarNoGrupo = (g: Grupo | GrupoVirtual, nome: string) => {
    if (!('valoresNovo' in g)) return acoes.criarItem(g.id, nome);
    const destino = gruposReais[0];
    if (destino) return acoes.criarItem(destino.id, nome, false, g.valoresNovo);
  };

  // Redimensionar coluna arrastando a borda do cabeçalho.
  const iniciarResize = (c: Coluna, x0: number) => {
    const w0 = largura(c);
    let w = w0;
    const mover = (e: MouseEvent) => { w = Math.max(70, Math.min(600, w0 + e.clientX - x0)); setLarguras(l => ({ ...l, [c.id]: w })); };
    const soltar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
      document.body.classList.remove('redimensionando');
      if (w !== w0) acoes.atualizarColuna(c.id, { largura: Math.round(w) });
    };
    document.body.classList.add('redimensionando');
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  };

  const soltarItem = (grupoId: number, antesDe: number | null) => {
    const id = arrastando;
    setArrastando(null);
    setAlvo(null);
    if (id == null) return;
    const lista = (porGrupo.get(grupoId) ?? []).filter(i => i.id !== id);
    const idx = antesDe == null ? lista.length : lista.findIndex(i => i.id === antesDe);
    acoes.moverItem(id, grupoId, posEntre(lista[idx - 1]?.posicao ?? null, lista[idx]?.posicao ?? null));
  };

  const colgroup = (
    <colgroup>
      <col style={{ width: 40 }} />
      <col style={{ width: LARGURA_NOME }} />
      {colunas.map(c => <col key={c.id} style={{ width: largura(c) }} />)}
      <col style={{ width: 60 }} />
    </colgroup>
  );

  return (
    <div className="tabela-quadro" style={{ width: `max(${larguraTotal}px, calc(100cqw - 56px))` }}>
      {grupos.map(g => {
        const lista = porGrupo.get(g.id) ?? [];
        const todosSel = lista.length > 0 && lista.every(i => selecionados.has(i.id));
        return (
          <section key={g.id} className="grupo" style={{ ['--cor-grupo' as string]: g.cor }}>
            <CabecalhoGrupo grupo={g} total={lista.length} acoes={acoes} confirmar={confirmar} nomeItem={nomeItem} virtual={virtual} recolhido={recolhido(g)}
              onAlternar={() => alternarGrupo(g)} onExportar={() => onExportarGrupo(g, lista)}
              onSubitens={abrir => lista.forEach(i => (nSub.get(i.id) ? alternarSubs(i.id, abrir) : null))} />
            {recolhido(g) ? (
              <table className="tq">
                {colgroup}
                <tbody>
                  <tr className="tq-recolhido">
                    <td className="tq-sel" />
                    <td className="tq-nome fixo"><strong style={{ color: g.cor }}>{g.nome}</strong> <span className="muted">{lista.length} {lista.length === 1 ? nomeItem.toLowerCase() : 'itens'}</span></td>
                    {colunas.map(c => <td key={c.id} className="tq-resumo"><Resumo coluna={c} itens={lista} /></td>)}
                    <td />
                  </tr>
                </tbody>
              </table>
            ) : (
              <table className="tq">
                {colgroup}
                <thead>
                  <tr>
                    <th className="tq-sel fixo">
                      <input type="checkbox" className="caixa" checked={todosSel} aria-label="Selecionar todos do grupo"
                        onChange={() => { const s = new Set(selecionados); lista.forEach(i => (todosSel ? s.delete(i.id) : s.add(i.id))); setSelecionados(s); }} />
                    </th>
                    <th className="tq-nome fixo">{nomeItem}</th>
                    {colunas.map((c, ci) => (
                      <CabecalhoColuna key={c.id} coluna={c} acoes={acoes} confirmar={confirmar} setOrdenacao={setOrdenacao} onFormula={setEditorFormula} aoCriar={aoCriar}
                        onOcultar={() => onOcultar(c.id)} onAgrupar={() => onAgrupar(c.id)}
                        anterior={colunas[ci - 1]} proxima={colunas[ci + 1]} onResize={x => iniciarResize(c, x)} />
                    ))}
                    <th className="tq-mais"><AdicionarColuna acoes={acoes} aoCriar={aoCriar} /></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, limiteDe(g.id)).map(i => [
                    <tr key={i.id}
                      className={`${selecionados.has(i.id) ? 'sel' : ''}${alvo?.grupoId === g.id && alvo.antesDe === i.id ? ' alvo-antes' : ''}${arrastando === i.id ? ' arrastando' : ''}`}
                      onDragOver={e => { if (arrastando != null) { e.preventDefault(); setAlvo({ grupoId: g.id, antesDe: i.id }); } }}
                      onDrop={() => soltarItem(g.id, i.id)}>
                      <td className="tq-sel fixo">
                        <input type="checkbox" className="caixa" checked={selecionados.has(i.id)} aria-label={`Selecionar ${i.nome}`}
                          onChange={() => { const s = new Set(selecionados); if (s.has(i.id)) s.delete(i.id); else s.add(i.id); setSelecionados(s); }} />
                      </td>
                      <td className="tq-nome fixo">
                        <div className="nome-item">
                          {!virtual && (
                            <span className="alca" draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setArrastando(i.id); }} onDragEnd={() => { setArrastando(null); setAlvo(null); }} title="Arrastar">
                              <GripVertical size={14} />
                            </span>
                          )}
                          <button className={`seta-sub${nSub.get(i.id) ? ' tem' : ''}${abertos.has(i.id) ? ' aberta' : ''}`} onClick={() => alternarSubs(i.id)}
                            aria-label={abertos.has(i.id) ? 'Recolher subitens' : 'Mostrar subitens'} title={abertos.has(i.id) ? 'Recolher subitens' : 'Subitens'}>
                            <ChevronRight size={14} />
                          </button>
                          <Editavel valor={i.nome} onSalvar={v => v && acoes.renomearItem(i.id, v)} className="nome-texto" />
                          {nSub.get(i.id) ? <button className={`chip-sub${abertos.has(i.id) ? ' on' : ''}`} onClick={() => alternarSubs(i.id)} title="Mostrar ou recolher os subitens">{nSub.get(i.id)} <ListTree size={13} /></button> : null}
                          <MenuLinha item={i} ops={ops} onAbrir={() => abrirItem(i.id)} onDuplicar={() => acoes.duplicarItens([i.id])}
                            onSubitem={() => { alternarSubs(i.id, true); setFocoSub(i.id); }} />
                          <button className="abrir-item" onClick={() => abrirItem(i.id)} title="Abrir"><Maximize2 size={13} /> Abrir</button>
                          <button className={`bolha${i.n_atualizacoes ? ' com' : ''}`} onClick={() => abrirItem(i.id)} title="Atualizações" aria-label={`${i.n_atualizacoes ?? 0} atualizações`}>
                            {i.n_atualizacoes ? <><MessageCircle size={17} /><span>{i.n_atualizacoes}</span></> : <MessageCirclePlus size={17} />}
                          </button>
                        </div>
                      </td>
                      {colunas.map(c => (
                        <td key={c.id} className={`tq-cel tipo-${c.tipo}`}>
                          <Celula coluna={c} valor={i.valores[c.id]} usuarios={usuarios} item={i} colunas={todasColunas}
                            onMudar={v => acoes.definirValor(i.id, c.id, v)} onConfig={config => acoes.atualizarColuna(c.id, { config })} />
                        </td>
                      ))}
                      <td />
                    </tr>,
                    abertos.has(i.id) && (
                      <tr key={`s${i.id}`} className="tq-subs">
                        <td className="tq-sel fixo" />
                        <td className="tq-subs-cel" colSpan={colunas.length + 2}>
                          <TabelaSubitens pai={i} sub={sub} acoes={acoes} ops={ops} usuarios={usuarios} modo="tabela" focarNovo={focoSub === i.id}
                            selecionados={selecionados} setSelecionados={setSelecionados} abrirItem={abrirItem} />
                        </td>
                      </tr>
                    ),
                  ])}
                  {lista.length > limiteDe(g.id) && (
                    <tr className="tq-mais-itens">
                      <td className="tq-sel fixo" />
                      <td className="tq-nome fixo" colSpan={1}>
                        <button className="fr-btn-link" onClick={() => setLimites(l => ({ ...l, [g.id]: limiteDe(g.id) + 200 }))}>Mostrar mais {Math.min(200, lista.length - limiteDe(g.id))}</button>
                        <span className="muted"> · </span>
                        <button className="fr-btn-link" onClick={() => setLimites(l => ({ ...l, [g.id]: lista.length }))}>Mostrar todos ({lista.length})</button>
                      </td>
                      <td colSpan={colunas.length + 1} />
                    </tr>
                  )}
                  <tr className={`tq-novo${alvo?.grupoId === g.id && alvo.antesDe == null ? ' alvo-antes' : ''}`}
                    onDragOver={e => { if (arrastando != null) { e.preventDefault(); setAlvo({ grupoId: g.id, antesDe: null }); } }}
                    onDrop={() => soltarItem(g.id, null)}>
                    <td className="tq-sel fixo" />
                    <td className="tq-nome fixo"><NovoItem nomeItem={nomeItem} onCriar={nome => criarNoGrupo(g, nome)} /></td>
                    <td colSpan={colunas.length + 1} />
                  </tr>
                  <tr className="tq-rodape">
                    <td className="tq-sel-vazio fixo" />
                    <td className="tq-nome-vazio fixo" />
                    {colunas.map(c => <td key={c.id} className="tq-resumo"><Resumo coluna={c} itens={lista} /></td>)}
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </section>
        );
      })}
      {editorFormula && (
        <EditorFormula coluna={editorFormula} colunas={todasColunas} itens={itens}
          onSalvar={(formula, titulo) => acoes.atualizarColuna(editorFormula.id, { titulo, config: { ...editorFormula.config, formula } })}
          onFechar={() => setEditorFormula(null)} />
      )}
      {!virtual && (
        <button className="fr-btn adicionar-grupo" onClick={() => acoes.criarGrupo('Novo grupo', false, CORES[(grupos.length * 5) % CORES.length])}>
          <Plus size={16} /> Adicionar novo grupo
        </button>
      )}
      {virtual && !grupos.length && <p className="muted vazio-visao">Nenhum item para agrupar.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- cabeçalho do grupo
function CabecalhoGrupo({ grupo, total, acoes, confirmar, nomeItem, virtual, recolhido, onAlternar, onExportar, onSubitens }: {
  grupo: Grupo; total: number; acoes: Acoes; confirmar: ReturnType<typeof useConfirmar>; nomeItem: string;
  virtual: boolean; recolhido: boolean; onAlternar: () => void; onExportar: () => void; onSubitens: (abrir: boolean) => void;
}) {
  const menu = usePopover<HTMLButtonElement>();
  const [cores, setCores] = useState(false);
  const [renomear, setRenomear] = useState(false);
  const comuns: ItemMenu[] = [
    { rotulo: recolhido ? 'Expandir grupo' : 'Recolher grupo', icone: recolhido ? <ChevronDown size={15} /> : <ChevronRight size={15} />, onClick: onAlternar },
    { rotulo: 'Mostrar todos os subitens', icone: <ListTree size={15} />, onClick: () => onSubitens(true) },
    { rotulo: 'Recolher todos os subitens', icone: <ListTree size={15} />, onClick: () => onSubitens(false) },
    { rotulo: 'Exportar grupo para Excel', icone: <FileSpreadsheet size={15} />, onClick: onExportar },
  ];
  return (
    <div className="grupo-cab">
      <button ref={menu.ref} className="btn-icone grupo-menu" aria-label="Menu do grupo" onClick={menu.alternar}><MoreHorizontal size={16} /></button>
      <button className="btn-icone" style={{ color: grupo.cor }} aria-label={recolhido ? 'Expandir grupo' : 'Recolher grupo'} onClick={onAlternar}>
        {recolhido ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
      </button>
      {virtual
        ? <span className="grupo-nome">{grupo.nome}</span>
        : <Editavel key={renomear ? 'r' : 'n'} iniciarEditando={renomear} valor={grupo.nome} className="grupo-nome" onSalvar={v => { setRenomear(false); if (v) acoes.atualizarGrupo(grupo.id, { nome: v }); }} />}
      {!virtual && acoes.oficial?.grupo === 'ativo' && <span className="col-oficial" title={`Grupo oficial do cadastro “${acoes.oficial.nome}” (${acoes.oficial.grupo_chave}): o nome do grupo é gravado no cadastro oficial.`}><Lock size={12} /></span>}
      <span className="grupo-total">{total} {total === 1 ? nomeItem.toLowerCase() : 'itens'}</span>
      {menu.aberto && (
        <Popover ancora={menu.ref.current} onClose={() => { menu.fechar(); setCores(false); }} largura={230}>
          {cores ? (
            <div className="paleta paleta-solta">
              {CORES.map(c => <button key={c} style={{ background: c }} aria-label={c} onClick={() => { acoes.atualizarGrupo(grupo.id, { cor: c }); menu.fechar(); setCores(false); }} />)}
            </div>
          ) : (
            <Menu onEscolher={menu.fechar} itens={virtual ? comuns : [
              ...comuns,
              'separador',
              { rotulo: 'Renomear grupo', icone: <Pencil size={15} />, onClick: () => setRenomear(true) },
              { rotulo: 'Mudar cor', icone: <Palette size={15} />, onClick: () => setTimeout(() => { menu.abrir(); setCores(true); }) },
              { rotulo: 'Adicionar grupo', icone: <Plus size={15} />, onClick: () => acoes.criarGrupo('Novo grupo', true) },
              'separador',
              { rotulo: 'Arquivar grupo', icone: <Archive size={15} />, onClick: async () => { if (await confirmar(`Arquivar o grupo “${grupo.nome}” com seus ${total} itens? Ele sai da tabela e pode ser restaurado em Arquivo e lixeira.`, 'Arquivar')) acoes.arquivarGrupo(grupo.id); } },
              { rotulo: 'Excluir grupo', icone: <Trash2 size={15} />, perigo: true, onClick: async () => { if (await confirmar(`Mover o grupo “${grupo.nome}” e seus ${total} itens para a lixeira? Dá para restaurar por 30 dias.`)) acoes.excluirGrupo(grupo.id); } },
            ]} />
          )}
        </Popover>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- cabeçalho da coluna
function CabecalhoColuna({ coluna, acoes, confirmar, setOrdenacao, anterior, proxima, onResize, onFormula, aoCriar, onOcultar, onAgrupar }: {
  coluna: Coluna; acoes: Acoes; confirmar: ReturnType<typeof useConfirmar>; setOrdenacao: (o: Ordenacao) => void;
  onFormula: (c: Coluna) => void; aoCriar: (c: Coluna) => void; onOcultar: () => void; onAgrupar: () => void;
  anterior?: Coluna; proxima?: Coluna; onResize: (x: number) => void;
}) {
  const menu = usePopover<HTMLButtonElement>();
  const [renomear, setRenomear] = useState(false);
  const [tipos, setTipos] = useState(false);
  const [campoOficial, setCampoOficial] = useState<'adicionar' | 'descontinuar' | null>(null);
  const adm2 = useAuth().authorizationProfile?.adm2 === true;
  const Icone = infoTipo(coluna.tipo).icone;
  const trocar = (outra?: Coluna) => {
    if (!outra) return;
    acoes.atualizarColuna(coluna.id, { posicao: outra.posicao });
    acoes.atualizarColuna(outra.id, { posicao: coluna.posicao });
  };
  return (
    <th className="tq-col">
      <div className="col-cab">
        <Editavel key={renomear ? 'r' : 'n'} iniciarEditando={renomear} valor={coluna.titulo} className="col-titulo"
          onSalvar={v => { setRenomear(false); if (v) acoes.atualizarColuna(coluna.id, { titulo: v }); }} />
        {coluna.oficial && <span className="col-oficial" title={coluna.oficial.somente_leitura
          ? `Só leitura: o valor vem do cadastro “${coluna.oficial.nome}” (${coluna.oficial.chave}).`
          : `Campo oficial do cadastro “${coluna.oficial.nome}” (${coluna.oficial.chave}). Pode renomear; não pode excluir.`}><Lock size={12} /></span>}
        <button ref={menu.ref} className="btn-icone col-menu" aria-label={`Menu da coluna ${coluna.titulo}`} onClick={menu.alternar}><MoreHorizontal size={15} /></button>
      </div>
      <span className="redim" onMouseDown={e => { e.preventDefault(); onResize(e.clientX); }} />
      {menu.aberto && (
        <Popover ancora={menu.ref.current} onClose={() => { menu.fechar(); setTipos(false); }} largura={240}>
          {tipos ? (
            <MenuTipos onEscolher={async t => { menu.fechar(); setTipos(false); aoCriar(await acoes.criarColuna(t, infoTipo(t).rotulo, coluna.posicao)); }} />
          ) : (
            <>
              <div className="menu-titulo"><Icone size={14} /> {infoTipo(coluna.tipo).rotulo}</div>
              <Menu onEscolher={menu.fechar} itens={[
                ...(coluna.tipo === 'formula' ? [{ rotulo: 'Editar fórmula', icone: <Sigma size={15} />, onClick: () => onFormula(coluna) }] : []),
                { rotulo: 'Renomear', icone: <Pencil size={15} />, onClick: () => setRenomear(true) },
                { rotulo: 'Ordenar crescente', icone: <ArrowDownAZ size={15} />, onClick: () => setOrdenacao({ colunaId: coluna.id, dir: 1 }) },
                { rotulo: 'Ordenar decrescente', icone: <ArrowUpAZ size={15} />, onClick: () => setOrdenacao({ colunaId: coluna.id, dir: -1 }) },
                ...(coluna.tipo === 'data' ? [
                  { rotulo: 'É prazo (mostra atraso)', icone: <AlarmClock size={15} />, ativo: ehPrazo(coluna), sub: ehPrazo(coluna) ? <Check size={14} className="menu-check" /> : undefined,
                    onClick: () => acoes.atualizarColuna(coluna.id, { config: { ...coluna.config, prazo: !ehPrazo(coluna) } }) },
                  { rotulo: 'Mostrar sempre o ano', icone: <CalendarDays size={15} />, ativo: !!coluna.config.com_ano, sub: coluna.config.com_ano ? <Check size={14} className="menu-check" /> : undefined,
                    onClick: () => acoes.atualizarColuna(coluna.id, { config: { ...coluna.config, com_ano: !coluna.config.com_ano } }) },
                ] : []),
                { rotulo: 'Mover para a esquerda', icone: <ArrowLeft size={15} />, onClick: () => trocar(anterior) },
                { rotulo: 'Mover para a direita', icone: <ArrowRight size={15} />, onClick: () => trocar(proxima) },
                { rotulo: 'Adicionar coluna à direita', icone: <Plus size={15} />, onClick: () => setTimeout(() => { menu.abrir(); setTipos(true); }) },
                ...(AGRUPAVEIS.has(coluna.tipo) ? [{ rotulo: 'Agrupar por esta coluna', icone: <Group size={15} />, onClick: onAgrupar }] : []),
                { rotulo: 'Ocultar coluna', icone: <EyeOff size={15} />, onClick: onOcultar },
                ...itensCampoOficial(adm2 && !!acoes.oficial && acoes.oficial.modo !== 'existente', coluna, setCampoOficial),
                // Campo oficial não pode ser excluído (os dados vivem no cadastro oficial).
                ...(coluna.oficial ? [] : ['separador' as const,
                  { rotulo: 'Excluir coluna', icone: <Trash2 size={15} />, perigo: true, onClick: async () => { if (await confirmar(`Excluir a coluna “${coluna.titulo}” e todos os valores dela?`)) acoes.excluirColuna(coluna.id); } }]),
              ]} />
            </>
          )}
        </Popover>
      )}
      {campoOficial && acoes.oficial && <CampoOficialDialogo quadroId={acoes.oficial.quadroId} coluna={coluna} modo={campoOficial}
        onFechar={() => setCampoOficial(null)} onPronto={() => { setCampoOficial(null); acoes.recarregar(); }} />}
    </th>
  );
}

/** Itens de menu de cadastro oficial de uma coluna (só adm2, quadro ou subitens já oficiais). */
export function itensCampoOficial(podeMudar: boolean, coluna: Coluna, abrir: (modo: 'adicionar' | 'descontinuar') => void): ItemMenu[] {
  if (!podeMudar) return [];
  if (coluna.oficial) return [{ rotulo: 'Descontinuar campo oficial…', icone: <LockOpen size={15} />, onClick: () => abrir('descontinuar') }];
  return TIPOS_OFICIAIS.has(coluna.tipo) ? [{ rotulo: 'Tornar campo oficial…', icone: <Lock size={15} />, onClick: () => abrir('adicionar') }] : [];
}

function AdicionarColuna({ acoes, aoCriar }: { acoes: Acoes; aoCriar: (c: Coluna) => void }) {
  const pop = usePopover<HTMLButtonElement>();
  return (
    <>
      <button ref={pop.ref} className="btn-icone" aria-label="Adicionar coluna" onClick={pop.alternar}><Plus size={16} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={340}>
          <MenuTipos onEscolher={async t => { pop.fechar(); aoCriar(await acoes.criarColuna(t, infoTipo(t).rotulo)); }} />
        </Popover>
      )}
    </>
  );
}

// Menu de uma linha (item): abrir, subitem, duplicar, arquivar, excluir.
function MenuLinha({ item, ops, onAbrir, onDuplicar, onSubitem }: { item: Item; ops: OpsItens; onAbrir: () => void; onDuplicar: () => void; onSubitem: () => void }) {
  const pop = usePopover<HTMLButtonElement>();
  return (
    <>
      <button ref={pop.ref} className="btn-icone item-menu" aria-label={`Menu de ${item.nome}`} onClick={pop.alternar}><MoreHorizontal size={15} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={220}>
          <Menu onEscolher={pop.fechar} itens={[
            { rotulo: 'Abrir item', icone: <Maximize2 size={15} />, onClick: onAbrir },
            { rotulo: 'Adicionar subitem', icone: <ListTree size={15} />, onClick: onSubitem },
            { rotulo: 'Duplicar', icone: <Copy size={15} />, onClick: onDuplicar },
            'separador',
            { rotulo: 'Arquivar', icone: <Archive size={15} />, onClick: () => ops.arquivar([item.id]) },
            { rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onClick: () => ops.excluir([item.id], item.nome) },
          ]} />
        </Popover>
      )}
    </>
  );
}

function NovoItem({ nomeItem, onCriar }: { nomeItem: string; onCriar: (nome: string) => unknown }) {
  const [texto, setTexto] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const criar = () => { const t = texto.trim(); if (t) { onCriar(t); setTexto(''); } };
  return (
    <input ref={ref} className="novo-item" placeholder={`+ Adicionar ${nomeItem.toLowerCase()}`} value={texto}
      onChange={e => setTexto(e.target.value)} onBlur={criar} onKeyDown={e => { if (e.key === 'Enter') criar(); if (e.key === 'Escape') { setTexto(''); ref.current?.blur(); } }} />
  );
}

// ---------------------------------------------------------------- resumo do rodapé do grupo
export function Resumo({ coluna, itens }: { coluna: Coluna; itens: Item[] }) {
  const vals = itens.map(i => i.valores[coluna.id]).filter(v => v != null && v !== '');
  switch (coluna.tipo) {
    case 'status': {
      if (!itens.length) return null;
      const rotulos = (coluna.config.rotulos ?? []) as Rotulo[];
      const cont = new Map<string, number>();
      for (const i of itens) { const k = String(i.valores[coluna.id] ?? '0'); cont.set(k, (cont.get(k) ?? 0) + 1); }
      return (
        <div className="resumo-status" title={rotulos.filter(r => cont.get(r.id)).map(r => `${r.texto || 'sem rótulo'}: ${cont.get(r.id)}`).join('\n')}>
          {rotulos.filter(r => cont.get(r.id)).map(r => <span key={r.id} style={{ background: r.cor, flexGrow: cont.get(r.id) }} />)}
        </div>
      );
    }
    case 'numero': {
      if (!vals.length || coluna.config.resumo === 'nenhum') return null;
      const nums = vals.map(Number).filter(Number.isFinite);
      const soma = nums.reduce((a, b) => a + b, 0);
      const media = coluna.config.resumo === 'media';
      return <div className="resumo-num"><strong>{fmtNumero(media ? soma / nums.length : soma, coluna.config.unidade)}</strong><small>{media ? 'média' : 'soma'}</small></div>;
    }
    case 'data': case 'periodo': {
      const ds = vals.flatMap(v => (coluna.tipo === 'periodo' ? [v.inicio, v.fim] : [v])).filter(Boolean).sort();
      if (!ds.length) return null;
      return <div className="resumo-datas">{fmtData(ds[0])}{ds.length > 1 && ds[0] !== ds.at(-1) ? ` – ${fmtData(ds.at(-1))}` : ''}</div>;
    }
    case 'caixa': return vals.length ? <div className="resumo-num"><strong>{vals.length}/{itens.length}</strong></div> : null;
    default: return null;
  }
}

