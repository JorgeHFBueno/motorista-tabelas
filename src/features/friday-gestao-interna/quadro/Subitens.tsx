import { useState } from 'react';
import { Archive, Copy, ListTree, Lock, Maximize2, Shuffle, MessageCircle, MessageCirclePlus, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import type { Row } from '../api.ts';
import { Editavel, Menu, Popover, useConfirmar, usePopover } from '../ui/base.tsx';
import { Celula } from './Celula.tsx';
import { MenuTipos } from './MenuTipos.tsx';
import { itensCampoOficial } from './Tabela.tsx';
import { alvosPara } from './mudarTipo.ts';
import { MudarTipoDialogo } from './MudarTipo.tsx';
import { CampoOficialDialogo } from './TornarOficial.tsx';
import { infoTipo, type Coluna, type Item, type Sub } from './tipos.ts';
import { porPosicao, type Acoes } from './useQuadro.ts';

// Arquivar e excluir com aviso de "Desfazer" (definido na página do quadro).
export type OpsItens = { arquivar: (ids: number[]) => void; excluir: (ids: number[], nome?: string) => void };

// Subitens de um item. As linhas seguem o desenho da tabela principal (seleção, nome editável, abrir, conversa,
// células e "+ Adicionar"), com as colunas do quadro de subitens. Aparece expandida dentro da tabela ("tabela")
// e no painel do item ("painel").
export function TabelaSubitens({ pai, sub, acoes, ops, usuarios, modo, focarNovo, selecionados, setSelecionados, abrirItem }: {
  pai: Item; sub: Sub | null; acoes: Acoes; ops: OpsItens; usuarios: Row[]; modo: 'tabela' | 'painel'; focarNovo?: boolean;
  selecionados?: Set<number>; setSelecionados?: (s: Set<number>) => void; abrirItem?: (id: number, aba?: string) => void;
}) {
  const confirmar = useConfirmar();
  const [novo, setNovo] = useState('');
  const itens = (sub?.itens ?? []).filter(s => s.item_pai_id === pai.id).sort(porPosicao);
  const todas = sub?.colunas ?? [];
  const colunas = todas.filter(c => !c.oculta);
  const nomeItem = String(sub?.nome_item || 'Subitem');
  const criar = () => { const n = novo.trim(); if (n) { setNovo(''); acoes.criarSubitem(pai.id, n); } };

  const largura = (c: Coluna) => Math.min(c.largura ?? 140, modo === 'painel' ? 170 : 220);
  const larguraNome = modo === 'painel' ? 250 : 340;
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
              <th className="tq-nome tq-nome-sub" title="Clique para mudar como os subitens são chamados (ex.: Escopo da obra)">
                <Editavel valor={nomeItem} className="col-titulo" onSalvar={v => v && acoes.renomearItensSub(v)} />
              </th>
              {colunas.map(c => <CabecalhoSub key={c.id} coluna={c} acoes={acoes} confirmar={confirmar} />)}
              <th className="tq-mais"><AdicionarColunaSub acoes={acoes} /></th>
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
                    <MenuSubitem item={it} ops={ops} onAbrir={abrirItem ? () => abrirItem(it.id) : undefined} onDuplicar={() => acoes.duplicarItens([it.id])} />
                    {abrirItem && <button className="abrir-item" onClick={() => abrirItem(it.id)} title="Abrir"><Maximize2 size={13} /> Abrir</button>}
                    {abrirItem && (
                      <button className={`bolha${it.n_atualizacoes ? ' com' : ''}`} onClick={() => abrirItem(it.id)} title="Atualizações" aria-label={`${it.n_atualizacoes ?? 0} atualizações`}>
                        {it.n_atualizacoes ? <><MessageCircle size={17} /><span>{it.n_atualizacoes}</span></> : <MessageCirclePlus size={17} />}
                      </button>
                    )}
                  </div>
                </td>
                {colunas.map(c => (
                  <td key={c.id} className={`tq-cel tipo-${c.tipo}`}>
                    <Celula coluna={c} valor={it.valores[c.id]} usuarios={usuarios} item={it} colunas={todas}
                      onMudar={v => acoes.definirValor(it.id, c.id, v)} onConfig={config => acoes.atualizarColuna(c.id, { config })} />
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

function CabecalhoSub({ coluna, acoes, confirmar }: { coluna: Coluna; acoes: Acoes; confirmar: ReturnType<typeof useConfirmar> }) {
  const pop = usePopover<HTMLButtonElement>();
  const [renomear, setRenomear] = useState(false);
  const [campoOficial, setCampoOficial] = useState<'adicionar' | 'descontinuar' | null>(null);
  const [mudarTipo, setMudarTipo] = useState(false);
  const adm2 = useAuth().authorizationProfile?.adm2 === true;
  const Ic = infoTipo(coluna.tipo).icone;
  return (
    <th className="tq-col">
      <div className="col-cab">
        <Editavel key={renomear ? 'r' : 'n'} iniciarEditando={renomear} valor={coluna.titulo} className="col-titulo"
          onSalvar={v => { setRenomear(false); if (v) acoes.atualizarColuna(coluna.id, { titulo: v }); }} />
        {coluna.oficial && <span className="col-oficial" title={`Campo oficial dos subitens do cadastro “${coluna.oficial.nome}” (${coluna.oficial.chave}). Pode renomear; não pode excluir.`}><Lock size={12} /></span>}
        <button ref={pop.ref} className="btn-icone col-menu" aria-label={`Menu da coluna ${coluna.titulo}`} onClick={pop.alternar}><MoreHorizontal size={14} /></button>
      </div>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={220}>
          <div className="menu-titulo"><Ic size={14} /> {infoTipo(coluna.tipo).rotulo} (subitens)</div>
          <Menu onEscolher={pop.fechar} itens={[
            { rotulo: 'Renomear', icone: <Pencil size={15} />, onClick: () => setRenomear(true) },
            ...(!coluna.oficial && alvosPara(coluna).length ? [{ rotulo: 'Mudar tipo…', icone: <Shuffle size={15} />, onClick: () => setMudarTipo(true) }] : []),
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

function AdicionarColunaSub({ acoes }: { acoes: Acoes }) {
  const pop = usePopover<HTMLButtonElement>();
  return (
    <>
      <button ref={pop.ref} className="btn-icone" aria-label="Adicionar coluna aos subitens" title="Adicionar coluna aos subitens" onClick={pop.alternar}><Plus size={15} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={340}>
          <MenuTipos onEscolher={t => { pop.fechar(); acoes.criarColunaSub(t, infoTipo(t).rotulo); }} />
        </Popover>
      )}
    </>
  );
}
