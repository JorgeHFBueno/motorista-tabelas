import { useState } from 'react';
import { Archive, Copy, ListTree, Lock, Maximize2, Shuffle, MessageCircle, MessageCirclePlus, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import type { Pessoa } from '../api.ts';
import { Editavel, Menu, Popover, useConfirmar, usePopover } from '../ui/base.tsx';
import { Celula } from './Celula.tsx';
import { MenuTipos } from './MenuTipos.tsx';
import { arrastarBorda, larguraDoConteudo } from '../util.ts';
import { itensCampoOficial, itensReais } from './Tabela.tsx';
import { alvosPara } from './mudarTipo.ts';
import { MudarTipoDialogo } from './MudarTipo.tsx';
import { CampoOficialDialogo } from './TornarOficial.tsx';
import { infoColuna, infoTipo, type Coluna, type Item, type Sub } from './tipos.ts';
import { porPosicao, type Acoes } from './useQuadro.ts';
import { chaveDoSubitem, colunaNoTipo, tiposDoSub } from './tiposSubitem.ts';

// Arquivar e excluir com aviso de "Desfazer" (definido na página do quadro).
export type OpsItens = { arquivar: (ids: number[]) => void; excluir: (ids: number[], nome?: string) => void };

// Subitens de um item. As linhas seguem o desenho da tabela principal (seleção, nome editável, abrir, conversa,
// células e "+ Adicionar"), com as colunas do quadro de subitens. Aparece expandida dentro da tabela ("tabela")
// e no painel do item ("painel").
export function TabelaSubitens({ pai, sub, acoes, ops, usuarios, modo, focarNovo, selecionados, setSelecionados, abrirItem }: {
  pai: Item; sub: Sub | null; acoes: Acoes; ops: OpsItens; usuarios: Pessoa[]; modo: 'tabela' | 'painel'; focarNovo?: boolean;
  selecionados?: Set<number>; setSelecionados?: (s: Set<number>) => void; abrirItem?: (id: number, aba?: string) => void;
}) {
  const confirmar = useConfirmar();
  const [novo, setNovo] = useState('');
  const itens = (sub?.itens ?? []).filter(s => s.item_pai_id === pai.id).sort(porPosicao);
  const todas = sub?.colunas ?? [];
  // Tipos de subitem: a combinação dos tipos do item pai (ex.: PÚBLICA + PONTE) decide as colunas mostradas.
  const tipos = tiposDoSub(sub?.config);
  const tipo = chaveDoSubitem(tipos, pai);
  const colunas = todas.filter(c => !c.oculta && colunaNoTipo(tipos, c.id, tipo));
  const nomeItem = String(sub?.nome_item || 'Subitem');
  const criar = () => { const n = novo.trim(); if (n) { setNovo(''); acoes.criarSubitem(pai.id, n); } };

  // Na tabela, as colunas se ajustam como na tabela principal: arrastar a borda do cabeçalho ou clicar duas vezes nela
  // para caber o conteúdo. Vale para todos os subitens do quadro: a coluna do subitem em config.largura_nome do quadro
  // de subitens, as outras na largura da coluna. No painel do item, as colunas ficam estreitas e fixas.
  const [colArrastando, setColArrastando] = useState<{ id: number; w: number } | null>(null);
  const largura = (c: Coluna) => (modo === 'painel' ? Math.min(c.largura ?? 140, 170) : colArrastando?.id === c.id ? colArrastando.w : c.largura ?? 140);
  const [nomeArrastando, setNomeArrastando] = useState<number | null>(null);
  const larguraNome = modo === 'painel' ? 250 : nomeArrastando ?? (Number(sub?.config?.largura_nome) || 340);
  const iniciarResizeNome = (x0: number) =>
    arrastarBorda(x0, larguraNome, 200, 900, setNomeArrastando, w => { void acoes.larguraNomeSub(w).finally(() => setNomeArrastando(null)); });
  const iniciarResize = (c: Coluna, x0: number) =>
    arrastarBorda(x0, largura(c), 70, 600, w => setColArrastando({ id: c.id, w }), w => { acoes.atualizarColuna(c.id, { largura: w }); setColArrastando(null); });
  // Duplo clique: mede a coluna em todas as tabelas de subitens abertas no quadro (todas usam a mesma largura). Com tipos
  // de subitem, cada tabela pode ter outras colunas: a posição da coluna vem do cabeçalho (data-coluna) de cada uma.
  const medir = (borda: HTMLElement, chave: string, min: number, max: number) => {
    const tabelas = [...(borda.closest('.tabela-quadro')?.querySelectorAll<HTMLTableElement>('table.tq-sub') ?? [])];
    const propria = borda.closest<HTMLTableElement>('table.tq-sub');
    if (propria && !tabelas.includes(propria)) tabelas.push(propria);
    return Math.max(min, ...tabelas.map(t => {
      const th = t.tHead?.querySelector<HTMLTableCellElement>(`th[data-coluna="${chave}"]`);
      return th ? larguraDoConteudo([t], th.cellIndex, t.tHead!.rows[0].cells.length, min, max) : min;
    }));
  };
  const ajustarNome = (borda: HTMLElement) => {
    const w = medir(borda, 'nome', 200, 900);
    if (w !== larguraNome) void acoes.larguraNomeSub(w);
  };
  const ajustarColuna = (c: Coluna, borda: HTMLElement) => {
    const w = medir(borda, String(c.id), 70, 600);
    if (w !== c.largura) acoes.atualizarColuna(c.id, { largura: w });
  };
  const larguraTotal = 40 + larguraNome + colunas.reduce((s, c) => s + largura(c), 0) + 44;

  const sel = selecionados ?? new Set<number>();
  const todosSel = itens.length > 0 && itens.every(i => sel.has(i.id));
  const marcar = (ids: number[], marcado: boolean) => {
    if (!setSelecionados) return;
    const s = new Set(sel);
    for (const id of ids) { if (marcado) s.add(id); else s.delete(id); }
    setSelecionados(s);
  };

  return (
    <div className={`subitens subitens-${modo}`}>
      {modo === 'painel' && !itens.length && (
        <div className="vazio-painel"><ListTree size={36} /><p>Nenhum {nomeItem.toLowerCase()}.</p><small>Divida o item em etapas menores, cada uma com responsável e status.</small></div>
      )}
      <div className="sub-rolagem">
        <table className="tq tq-sub" style={{ width: larguraTotal }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: larguraNome }} />
            {colunas.map(c => <col key={c.id} style={{ width: largura(c) }} />)}
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="tq-sel">
                {setSelecionados && <input type="checkbox" className="caixa" checked={todosSel} disabled={!itens.length} aria-label={`Selecionar todos os subitens de ${pai.nome}`} onChange={() => marcar(itens.map(i => i.id), !todosSel)} />}
              </th>
              <th className="tq-nome tq-nome-sub" data-coluna="nome" title="Clique para mudar como os subitens são chamados (ex.: Escopo da obra)">
                <Editavel valor={nomeItem} className="col-titulo" onSalvar={v => v && acoes.renomearItensSub(v)} />
                {modo === 'tabela' && (
                  <span className="redim" title="Arraste para ajustar; clique duas vezes para caber o conteúdo"
                    onMouseDown={e => { e.preventDefault(); iniciarResizeNome(e.clientX); }} onDoubleClick={e => ajustarNome(e.currentTarget)} />
                )}
              </th>
              {colunas.map(c => <CabecalhoSub key={c.id} coluna={c} acoes={acoes} confirmar={confirmar}
                {...(modo === 'tabela' ? { onResize: (x: number) => iniciarResize(c, x), onAjustar: (borda: HTMLElement) => ajustarColuna(c, borda) } : {})} />)}
              <th className="tq-mais"><AdicionarColunaSub acoes={acoes} tipo={tipo} /></th>
            </tr>
          </thead>
          <tbody>
            {itens.map(it => (
              <tr key={it.id} className={sel.has(it.id) ? 'sel' : ''}>
                <td className="tq-sel">
                  {setSelecionados && <input type="checkbox" className="caixa" checked={sel.has(it.id)} aria-label={`Selecionar ${it.nome}`} onChange={() => marcar([it.id], !sel.has(it.id))} />}
                </td>
                <td className="tq-nome">
                  <div className="nome-item">
                    <Editavel valor={it.nome} className="nome-texto" onSalvar={v => v && acoes.renomearItem(it.id, v)} />
                    {/* "⋯" e "Abrir" por cima do fim do nome ao passar o mouse, como na tabela principal. */}
                    <span className="fim-linha">
                      <span className="acoes-linha">
                        <MenuSubitem item={it} ops={ops} onAbrir={abrirItem ? () => abrirItem(it.id) : undefined} onDuplicar={() => acoes.duplicarItens([it.id])} />
                        {abrirItem && <button className="abrir-item" onClick={() => abrirItem(it.id)} title="Abrir"><Maximize2 size={13} /> Abrir</button>}
                      </span>
                      {abrirItem && (
                        <button className={`bolha${it.atualizacoes_novas ? ' nova' : ''}`} onClick={() => abrirItem(it.id)} title={it.atualizacoes_novas ? 'Atualizações (há novas)' : 'Atualizações'} aria-label={`${it.n_atualizacoes ?? 0} atualizações${it.atualizacoes_novas ? ', com novas' : ''}`}>
                          {it.n_atualizacoes ? <><MessageCircle size={17} /><span>{it.n_atualizacoes}</span></> : <MessageCirclePlus size={17} />}
                        </button>
                      )}
                    </span>
                  </div>
                </td>
                {colunas.map(c => (
                  <td key={c.id} className={`tq-cel tipo-${c.tipo}`}>
                    <Celula coluna={c} valor={it.valores[c.id]} usuarios={usuarios} item={it} colunas={todas}
                      onMudar={v => acoes.definirNaCelula(sel, it.id, c, v)} onTempo={op => acoes.tempo(it.id, c.id, op)} onConfig={config => acoes.atualizarColuna(c.id, { config })} />
                  </td>
                ))}
                <td />
              </tr>
            ))}
            <tr className="tq-novo">
              <td className="tq-sel" />
              <td className="tq-nome">
                <input className="novo-item" autoFocus={focarNovo} placeholder={`+ Adicionar ${nomeItem.toLowerCase()}`} value={novo} onChange={e => setNovo(e.target.value)}
                  onBlur={criar} onKeyDown={e => { if (e.key === 'Enter') criar(); if (e.key === 'Escape') setNovo(''); }} />
              </td>
              <td colSpan={colunas.length + 1} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MenuSubitem({ item, ops, onAbrir, onDuplicar }: { item: Item; ops: OpsItens; onAbrir?: () => void; onDuplicar: () => void }) {
  const pop = usePopover<HTMLButtonElement>();
  return (
    <>
      <button ref={pop.ref} className="btn-icone item-menu" aria-label={`Menu do subitem ${item.nome}`} onClick={pop.alternar}><MoreHorizontal size={15} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={210}>
          <Menu onEscolher={pop.fechar} itens={[
            ...(onAbrir ? [{ rotulo: 'Abrir', icone: <Maximize2 size={15} />, onClick: onAbrir }] : []),
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

// onResize/onAjustar: só na tabela (borda de ajuste da largura, como na tabela principal).
function CabecalhoSub({ coluna, acoes, confirmar, onResize, onAjustar }: {
  coluna: Coluna; acoes: Acoes; confirmar: ReturnType<typeof useConfirmar>; onResize?: (x: number) => void; onAjustar?: (borda: HTMLElement) => void;
}) {
  const pop = usePopover<HTMLButtonElement>();
  const [renomear, setRenomear] = useState(false);
  const [campoOficial, setCampoOficial] = useState<'adicionar' | 'descontinuar' | null>(null);
  const [mudarTipo, setMudarTipo] = useState(false);
  const adm2 = useAuth().authorizationProfile?.adm2 === true;
  const Ic = infoColuna(coluna).icone;
  return (
    <th className="tq-col" data-coluna={coluna.id}>
      <div className="col-cab">
        <Editavel key={renomear ? 'r' : 'n'} iniciarEditando={renomear} valor={coluna.titulo} className="col-titulo"
          onSalvar={v => { setRenomear(false); if (v) acoes.atualizarColuna(coluna.id, { titulo: v }); }} />
        {coluna.oficial && <span className="col-oficial" title={`Campo oficial dos subitens do cadastro “${coluna.oficial.nome}” (${coluna.oficial.chave}). Pode renomear; não pode excluir.`}><Lock size={12} /></span>}
        <button ref={pop.ref} className="btn-icone col-menu" aria-label={`Menu da coluna ${coluna.titulo}`} onClick={pop.alternar}><MoreHorizontal size={14} /></button>
      </div>
      {onResize && (
        <span className="redim" title="Arraste para ajustar; clique duas vezes para caber o conteúdo"
          onMouseDown={e => { e.preventDefault(); onResize(e.clientX); }} onDoubleClick={e => onAjustar?.(e.currentTarget)} />
      )}
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={220}>
          <div className="menu-titulo"><Ic size={14} /> {infoColuna(coluna).rotulo} (subitens)</div>
          <Menu onEscolher={pop.fechar} itens={[
            { rotulo: 'Renomear', icone: <Pencil size={15} />, onClick: () => setRenomear(true) },
            ...(alvosPara(coluna).length ? [{ rotulo: 'Mudar tipo…', icone: <Shuffle size={15} />, onClick: () => setMudarTipo(true) }] : []),
            ...itensReais(coluna, acoes),
            ...itensCampoOficial(adm2 && acoes.oficial?.subitens === 'ativo', coluna, setCampoOficial),
            // Campo oficial não pode ser excluído (os dados vivem no cadastro oficial).
            ...(coluna.oficial ? [] : ['separador' as const,
              { rotulo: 'Excluir coluna', icone: <Trash2 size={15} />, perigo: true, onClick: async () => { if (await confirmar(`Excluir a coluna “${coluna.titulo}” dos subitens, com todos os valores?`)) acoes.excluirColuna(coluna.id); } }]),
          ]} />
        </Popover>
      )}
      {campoOficial && acoes.oficial && <CampoOficialDialogo quadroId={acoes.oficial.quadroId} coluna={coluna} modo={campoOficial}
        onFechar={() => setCampoOficial(null)} onPronto={() => { setCampoOficial(null); acoes.recarregar(); }} />}
      {mudarTipo && <MudarTipoDialogo coluna={coluna} onFechar={() => setMudarTipo(false)} onPronto={() => { setMudarTipo(false); acoes.recarregar(); }} />}
    </th>
  );
}

// Com tipos de subitem, a coluna criada aqui fica só no tipo deste item (ajustável em "Tipos de subitem").
function AdicionarColunaSub({ acoes, tipo }: { acoes: Acoes; tipo: string | null }) {
  const pop = usePopover<HTMLButtonElement>();
  return (
    <>
      <button ref={pop.ref} className="btn-icone" aria-label="Adicionar coluna aos subitens" title="Adicionar coluna aos subitens" onClick={pop.alternar}><Plus size={15} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={340}>
          <MenuTipos onEscolher={t => { pop.fechar(); acoes.criarColunaSub(t, infoTipo(t).rotulo, tipo); }} />
        </Popover>
      )}
    </>
  );
}
