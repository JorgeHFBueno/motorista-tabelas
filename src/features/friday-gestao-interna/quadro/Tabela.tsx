import { useMemo, useRef, useState, type MouseEvent as EventoMouse } from 'react';
import {
  AlarmClock, Archive, ArrowDown, ArrowDownAZ, ArrowDownUp, ArrowLeft, ArrowRight, ArrowUp, ArrowUpAZ, CalendarDays, Check, ChevronDown, ChevronRight, Copy, EyeOff, FileSpreadsheet, GripVertical, Group, ListTree, Maximize2,
  Lock, LockOpen, MessageCircle, Shuffle, MessageCirclePlus, Sigma, MoreHorizontal, Palette, Pencil, Pin, PinOff, Plus, Trash2,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import type { Pessoa } from '../api.ts';
import { Menu, Popover, useConfirmar, usePopover, Editavel, type ItemMenu } from '../ui/base.tsx';
import { CORES, fmtData, fmtNumeroColuna, NOME_TRAVADO, posEntre } from '../util.ts';
import { Celula } from './Celula.tsx';
import { EditorFormula } from './EditorFormula.tsx';
import { AGRUPAVEIS, type GrupoVirtual } from './filtros.ts';
import { MenuTipos } from './MenuTipos.tsx';
import { TabelaSubitens, type OpsItens } from './Subitens.tsx';
import { alvosPara } from './mudarTipo.ts';
import { MudarTipoDialogo } from './MudarTipo.tsx';
import { CampoOficialDialogo, TIPOS_OFICIAIS } from './TornarOficial.tsx';
import { ehPrazo, infoColuna, infoTipo, type Coluna, type Grupo, type Item, type Ordenacao, type Rotulo, type Sub } from './tipos.ts';
import { fmtDuracao, totalSegundos } from './tempo.ts';
import type { Acoes } from './useQuadro.ts';

export type { Ordenacao };
export type Agrupamento = { grupos: GrupoVirtual[]; grupoDe: Map<number, number[]> } | null;

const ehFixa = (c: Coluna) => !!c.config?.fixa; // coluna fixada (config.fixa), para todos que abrem o quadro
const LARGURA_NOME = 360; // coluna do item, quando o quadro ainda não tem largura salva (config.largura_nome)
const LIMITE_INICIAL = 60;

export function Tabela({ grupos: gruposReais, colunas: colunasVisiveis, todasColunas, itens, sub, acoes, ops, usuarios, nomeItem, selecionados, setSelecionados, abrirItem,
  ordenacao, setOrdenacao, ordenacaoAlterada, onSalvarOrdenacao, onOcultar, onAgrupar, onExportarGrupo, agrupamento, larguraNome, onLarguraNome }: {
  grupos: Grupo[];
  colunas: Coluna[];
  todasColunas: Coluna[];
  itens: Item[];
  sub: Sub | null;
  acoes: Acoes;
  ops: OpsItens;
  usuarios: Pessoa[];
  nomeItem: string;
  selecionados: Set<number>;
  setSelecionados: (s: Set<number>) => void;
  abrirItem: (id: number, aba?: string) => void;
  ordenacao: Ordenacao;
  setOrdenacao: (o: Ordenacao) => void;
  // A ordenação da tela difere da salva na visão: o cabeçalho da coluna ordenada mostra "limpar" e "salvar".
  ordenacaoAlterada: boolean;
  onSalvarOrdenacao: () => void;
  onOcultar: (colunaId: number) => void;
  onAgrupar: (colunaId: number) => void;
  onExportarGrupo: (g: Grupo, itens: Item[]) => void;
  // "Agrupar por": grupos virtuais (um por valor da coluna) no lugar dos grupos do quadro.
  agrupamento: Agrupamento;
  larguraNome?: number;
  onLarguraNome: (largura: number) => void;
}) {
  const virtual = !!agrupamento;
  const grupos: (Grupo | GrupoVirtual)[] = agrupamento?.grupos ?? gruposReais;
  const [recolhidosV, setRecolhidosV] = useState<Set<number>>(new Set());
  // Itens com os subitens abertos na tabela; focoSub = item cujo campo "adicionar subitem" ganha o foco.
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const [focoSub, setFocoSub] = useState<number | null>(null);
  const alternarSubs = (id: number, abrir?: boolean) => setAbertos(s => { const n = new Set(s); if (abrir ?? !n.has(id)) n.add(id); else n.delete(id); return n; });
  const [larguras, setLarguras] = useState<Record<number, number>>({});
  const [nomeArrastando, setNomeArrastando] = useState<number | null>(null);
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
  // "Fixar" (menu da coluna): as colunas fixadas vêm logo depois do item e ficam paradas ao rolar para o lado, como o item.
  const colunas = useMemo(() => [...colunasVisiveis.filter(ehFixa), ...colunasVisiveis.filter(c => !ehFixa(c))], [colunasVisiveis]);
  const larguraItem = nomeArrastando ?? larguraNome ?? LARGURA_NOME;
  const larguraTotal = 40 + larguraItem + colunas.reduce((s, c) => s + largura(c), 0) + 60;
  const fixas = colunas.filter(ehFixa);
  const esquerda = new Map<number, number>();
  fixas.reduce((x, c) => { esquerda.set(c.id, x); return x + largura(c); }, 40 + larguraItem);
  const classeFixa = (c: Coluna) => (esquerda.has(c.id) ? ` fixo coluna-fixa${c.id === fixas[fixas.length - 1].id ? ' ultima-fixa' : ''}` : '');
  const estiloFixa = (c: Coluna) => (esquerda.has(c.id) ? { left: esquerda.get(c.id) } : undefined);
  // Mover para a esquerda/direita só troca com uma vizinha do mesmo lado (fixada com fixada, livre com livre).
  const vizinha = (k: number, c: Coluna) => (colunas[k] && ehFixa(colunas[k]) === ehFixa(c) ? colunas[k] : undefined);
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
  const arrastarBorda = (x0: number, w0: number, min: number, max: number, aoMover: (w: number) => void, aoSoltar: (w: number) => void) => {
    let w = w0;
    const mover = (e: MouseEvent) => { w = Math.max(min, Math.min(max, w0 + e.clientX - x0)); aoMover(w); };
    const soltar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
      document.body.classList.remove('redimensionando');
      if (w !== w0) aoSoltar(Math.round(w));
    };
    document.body.classList.add('redimensionando');
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  };
  const iniciarResize = (c: Coluna, x0: number) =>
    arrastarBorda(x0, largura(c), 70, 600, w => setLarguras(l => ({ ...l, [c.id]: w })), w => acoes.atualizarColuna(c.id, { largura: w }));
  // A coluna do item vale para o quadro todo (todos os grupos), como as outras colunas.
  const iniciarResizeNome = (x0: number) =>
    arrastarBorda(x0, larguraItem, 200, 900, setNomeArrastando, w => { onLarguraNome(w); setNomeArrastando(null); });
  // Duplo clique na borda: a coluna à esquerda dela fica do tamanho do conteúdo (como no monday). Mede as linhas
  // visíveis de todos os grupos com a coluna estreita: o que transborda (texto cortado com "…") soma à largura.
  const raiz = useRef<HTMLDivElement>(null);
  const larguraDoConteudo = (indice: number, min: number, max: number) => {
    const tabelas = [...(raiz.current?.querySelectorAll<HTMLTableElement>(':scope > section > table.tq') ?? [])];
    const cols = tabelas.map(t => t.querySelector<HTMLElement>(`:scope > colgroup > col:nth-child(${indice + 1})`));
    const antes = cols.map(c => c?.style.width ?? '');
    cols.forEach(c => { if (c) c.style.width = `${min}px`; });
    let w = min;
    for (const t of tabelas) for (const tr of t.rows) {
      if (tr.cells.length !== colunas.length + 3) continue; // linhas com células mescladas (subitens, novo item)
      const td = tr.cells[indice];
      const cortado = Math.max(0, ...[...td.querySelectorAll<HTMLElement>('*')].map(el => el.scrollWidth - el.clientWidth));
      w = Math.max(w, td.scrollWidth + cortado);
    }
    cols.forEach((c, k) => { if (c) c.style.width = antes[k]; });
    return Math.min(max, Math.ceil(w) + 4);
  };
  const ajustarNome = () => onLarguraNome(larguraDoConteudo(1, 200, 900));
  const ajustarColuna = (c: Coluna, indice: number) => {
    const w = larguraDoConteudo(indice, 70, 600);
    setLarguras(l => ({ ...l, [c.id]: w }));
    if (w !== c.largura) acoes.atualizarColuna(c.id, { largura: w });
  };

  // Hover: o texto cortado (…) aparece inteiro na dica, no nome do item e em qualquer célula.
  const dicaTextoCortado = (e: EventoMouse<HTMLTableSectionElement>) => {
    const td = (e.target as HTMLElement).closest('td');
    if (!td || !(td.classList.contains('tq-cel') || td.classList.contains('tq-nome'))) return;
    const alvo = td.querySelector<HTMLElement>('.nome-texto') ?? td;
    const cortado = [alvo, ...alvo.querySelectorAll<HTMLElement>('*')].some(el => el.scrollWidth > el.clientWidth + 1);
    const texto = alvo.innerText.trim();
    if (cortado && texto) alvo.title = texto;
    else alvo.removeAttribute('title');
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
      <col style={{ width: larguraItem }} />
      {colunas.map(c => <col key={c.id} style={{ width: largura(c) }} />)}
      {/* Sem largura: a sobra da tela fica com a coluna do "+", e as colunas mantêm a largura delas (também ao medir o conteúdo). */}
      <col />
    </colgroup>
  );

  return (
    <div ref={raiz} className="tabela-quadro" style={{ width: `max(${larguraTotal}px, calc(100cqw - 56px))` }}>
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
                    {colunas.map(c => <td key={c.id} className={`tq-resumo${classeFixa(c)}`} style={estiloFixa(c)}><Resumo coluna={c} itens={lista} /></td>)}
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
                    <th className="tq-nome fixo">
                      {nomeItem}
                      <span className="redim" title="Arraste para ajustar; clique duas vezes para caber o conteúdo"
                        onMouseDown={e => { e.preventDefault(); iniciarResizeNome(e.clientX); }} onDoubleClick={ajustarNome} />
                    </th>
                    {colunas.map((c, ci) => (
                      <CabecalhoColuna key={c.id} coluna={c} acoes={acoes} confirmar={confirmar} onFormula={setEditorFormula} aoCriar={aoCriar}
                        ordenacao={ordenacao} setOrdenacao={setOrdenacao} ordenacaoAlterada={ordenacaoAlterada} onSalvarOrdenacao={onSalvarOrdenacao}
                        onOcultar={() => onOcultar(c.id)} onAgrupar={() => onAgrupar(c.id)}
                        anterior={vizinha(ci - 1, c)} proxima={vizinha(ci + 1, c)} onResize={x => iniciarResize(c, x)} onAjustar={() => ajustarColuna(c, ci + 2)}
                        classeFixa={classeFixa(c)} estiloFixa={estiloFixa(c)} />
                    ))}
                    <th className="tq-mais"><AdicionarColuna acoes={acoes} aoCriar={aoCriar} /></th>
                  </tr>
                </thead>
                <tbody onMouseOver={dicaTextoCortado}>
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
                          <Editavel valor={i.nome} travado={i.nome_travado ? NOME_TRAVADO : undefined} onSalvar={v => v && acoes.renomearItem(i.id, v)} className="nome-texto" />
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
                        <td key={c.id} className={`tq-cel tipo-${c.tipo}${classeFixa(c)}`} style={estiloFixa(c)}>
                          <Celula coluna={c} valor={i.valores[c.id]} usuarios={usuarios} item={i} colunas={todasColunas}
                            onMudar={v => acoes.definirValor(i.id, c.id, v)} onTempo={op => acoes.tempo(i.id, c.id, op)} onConfig={config => acoes.atualizarColuna(c.id, { config })} />
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
                    {colunas.map(c => <td key={c.id} className={`tq-resumo${classeFixa(c)}`} style={estiloFixa(c)}><Resumo coluna={c} itens={lista} /></td>)}
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
function CabecalhoColuna({ coluna, acoes, confirmar, ordenacao, setOrdenacao, ordenacaoAlterada, onSalvarOrdenacao, anterior, proxima, onResize, onAjustar, onFormula, aoCriar, onOcultar, onAgrupar,
  classeFixa, estiloFixa }: {
  coluna: Coluna; acoes: Acoes; confirmar: ReturnType<typeof useConfirmar>;
  ordenacao: Ordenacao; setOrdenacao: (o: Ordenacao) => void; ordenacaoAlterada: boolean; onSalvarOrdenacao: () => void;
  onFormula: (c: Coluna) => void; aoCriar: (c: Coluna) => void; onOcultar: () => void; onAgrupar: () => void;
  anterior?: Coluna; proxima?: Coluna; onResize: (x: number) => void; onAjustar: () => void;
  classeFixa: string; estiloFixa?: { left: number | undefined };
}) {
  // Ordenação rápida: a seta ordena só por esta coluna (crescente, depois decrescente), na hora; "salvar" grava na visão.
  const dir = ordenacao.find(o => o.colunaId === coluna.id)?.dir;
  const ordenarRapido = () => setOrdenacao([{ colunaId: coluna.id, dir: dir === 1 ? -1 : 1 }]);
  const menu = usePopover<HTMLButtonElement>();
  const [renomear, setRenomear] = useState(false);
  const [tipos, setTipos] = useState(false);
  const [campoOficial, setCampoOficial] = useState<'adicionar' | 'descontinuar' | null>(null);
  const [mudarTipo, setMudarTipo] = useState(false);
  const adm2 = useAuth().authorizationProfile?.adm2 === true;
  const Icone = infoColuna(coluna).icone;
  const trocar = (outra?: Coluna) => {
    if (!outra) return;
    acoes.atualizarColuna(coluna.id, { posicao: outra.posicao });
    acoes.atualizarColuna(outra.id, { posicao: coluna.posicao });
  };
  return (
    <th className={`tq-col${dir ? ' ordenada' : ''}${dir && ordenacaoAlterada ? ' com-ordem-rapida' : ''}${classeFixa}`} style={estiloFixa}>
      {dir && ordenacaoAlterada && (
        <div className="ordem-rapida">
          <button onClick={() => setOrdenacao(ordenacao.filter(o => o.colunaId !== coluna.id))} title="Tirar esta ordenação">limpar</button>
          <button onClick={onSalvarOrdenacao} title="Salvar a ordenação na visão">salvar</button>
        </div>
      )}
      <button className="btn-icone col-ordem" onClick={ordenarRapido} aria-label={`Ordenar por ${coluna.titulo}`}
        title={dir === 1 ? 'Crescente (clique para decrescente)' : dir === -1 ? 'Decrescente (clique para crescente)' : 'Ordenar por esta coluna'}>
        {dir === 1 ? <ArrowUp size={13} /> : dir === -1 ? <ArrowDown size={13} /> : <ArrowDownUp size={13} />}
      </button>
      <div className="col-cab">
        <Editavel key={renomear ? 'r' : 'n'} iniciarEditando={renomear} valor={coluna.titulo} className="col-titulo"
          onSalvar={v => { setRenomear(false); if (v) acoes.atualizarColuna(coluna.id, { titulo: v }); }} />
        {coluna.oficial && <span className="col-oficial" title={coluna.oficial.somente_leitura
          ? `Só leitura: o valor vem do cadastro “${coluna.oficial.nome}” (${coluna.oficial.chave}).`
          : `Campo oficial do cadastro “${coluna.oficial.nome}” (${coluna.oficial.chave}). Pode renomear; não pode excluir.`}><Lock size={12} /></span>}
        <button ref={menu.ref} className="btn-icone col-menu" aria-label={`Menu da coluna ${coluna.titulo}`} onClick={menu.alternar}><MoreHorizontal size={15} /></button>
      </div>
      <span className="redim" title="Arraste para ajustar; clique duas vezes para caber o conteúdo"
        onMouseDown={e => { e.preventDefault(); onResize(e.clientX); }} onDoubleClick={onAjustar} />
      {menu.aberto && (
        <Popover ancora={menu.ref.current} onClose={() => { menu.fechar(); setTipos(false); }} largura={240}>
          {tipos ? (
            <MenuTipos onEscolher={async t => { menu.fechar(); setTipos(false); aoCriar(await acoes.criarColuna(t, infoTipo(t).rotulo, coluna.posicao)); }} />
          ) : (
            <>
              <div className="menu-titulo"><Icone size={14} /> {infoColuna(coluna).rotulo}</div>
              <Menu onEscolher={menu.fechar} itens={[
                ...(coluna.tipo === 'formula' ? [{ rotulo: 'Editar fórmula', icone: <Sigma size={15} />, onClick: () => onFormula(coluna) }] : []),
                { rotulo: 'Renomear', icone: <Pencil size={15} />, onClick: () => setRenomear(true) },
                // Campo oficial não muda de tipo; só aparece quando há um tipo compatível para converter.
                ...(alvosPara(coluna).length ? [{ rotulo: 'Mudar tipo…', icone: <Shuffle size={15} />, onClick: () => setMudarTipo(true) }] : []),
                { rotulo: 'Ordenar crescente', icone: <ArrowDownAZ size={15} />, onClick: () => setOrdenacao([{ colunaId: coluna.id, dir: 1 }]) },
                { rotulo: 'Ordenar decrescente', icone: <ArrowUpAZ size={15} />, onClick: () => setOrdenacao([{ colunaId: coluna.id, dir: -1 }]) },
                ...(coluna.tipo === 'data' ? [
                  { rotulo: 'É prazo (mostra atraso)', icone: <AlarmClock size={15} />, ativo: ehPrazo(coluna), sub: ehPrazo(coluna) ? <Check size={14} className="menu-check" /> : undefined,
                    onClick: () => acoes.atualizarColuna(coluna.id, { config: { ...coluna.config, prazo: !ehPrazo(coluna) } }) },
                  { rotulo: 'Mostrar sempre o ano', icone: <CalendarDays size={15} />, ativo: !!coluna.config.com_ano, sub: coluna.config.com_ano ? <Check size={14} className="menu-check" /> : undefined,
                    onClick: () => acoes.atualizarColuna(coluna.id, { config: { ...coluna.config, com_ano: !coluna.config.com_ano } }) },
                ] : []),
                { rotulo: ehFixa(coluna) ? 'Desafixar coluna' : 'Fixar coluna', icone: ehFixa(coluna) ? <PinOff size={15} /> : <Pin size={15} />,
                  onClick: () => acoes.atualizarColuna(coluna.id, { config: { ...coluna.config, fixa: !ehFixa(coluna) } }) },
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
      {mudarTipo && <MudarTipoDialogo coluna={coluna} onFechar={() => setMudarTipo(false)} onPronto={() => { setMudarTipo(false); acoes.recarregar(); }} />}
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
      return <div className="resumo-num"><strong>{fmtNumeroColuna(coluna.config, media ? soma / nums.length : soma)}</strong><small>{media ? 'média' : 'soma'}</small></div>;
    }
    case 'data': case 'periodo': {
      const ds = vals.flatMap(v => (coluna.tipo === 'periodo' ? [v.inicio, v.fim] : [v])).filter(Boolean).sort();
      if (!ds.length) return null;
      return <div className="resumo-datas">{fmtData(ds[0])}{ds.length > 1 && ds[0] !== ds.at(-1) ? ` – ${fmtData(ds.at(-1))}` : ''}</div>;
    }
    case 'caixa': return vals.length ? <div className="resumo-num"><strong>{vals.length}/{itens.length}</strong></div> : null;
    case 'tempo': {
      const seg = vals.reduce((t: number, v) => t + totalSegundos(v), 0);
      return vals.length ? <div className="resumo-num"><strong>{fmtDuracao(seg)}</strong><small>soma</small></div> : null;
    }
    default: return null;
  }
}

