import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Archive, CornerLeftUp, ListTree, Zap, MessageCircle, Paperclip, Rows3, Trash2, X } from 'lucide-react';
import { api, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { Avatar, Editavel, raizPortal } from '../ui/base.tsx';
import { NOME_TRAVADO } from '../util.ts';
import { Celula } from './Celula.tsx';
import { Arquivos, Atualizacoes } from './Atualizacoes.tsx';
import { TabelaSubitens, type OpsItens } from './Subitens.tsx';
import { infoTipo, type Coluna, type Grupo, type Item, type Sub } from './tipos.ts';
import type { Acoes } from './useQuadro.ts';

type Aba = 'atualizacoes' | 'arquivos' | 'campos' | 'subitens' | 'atividade';

// Painel lateral do item: atualizações (comentários), todos os campos e o registro de atividade.
// "pai": quando o item aberto é um subitem (aí não há aba de subitens e o topo leva de volta ao item pai).
export function PainelItem({ item, grupo, colunas, acoes, ops, sub, pai, onAbrirPai, abaInicial, onFechar }: {
  item: Item; grupo?: Grupo; colunas: Coluna[]; acoes: Acoes; ops: OpsItens; sub: Sub | null; pai?: Item; onAbrirPai?: () => void; abaInicial?: string; onFechar: () => void;
}) {
  const nav = useNav();
  const nSub = (sub?.itens ?? []).filter(s => s.item_pai_id === item.id).length;
  const [aba, setAba] = useState<Aba>((['atualizacoes', 'arquivos', 'campos', 'subitens', 'atividade'].includes(abaInicial ?? '') ? abaInicial : 'atualizacoes') as Aba);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.popover, .modal')) onFechar(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onFechar]);

  return createPortal(
    <div className="painel-fundo" onMouseDown={onFechar}>
      <aside className="painel" onMouseDown={e => e.stopPropagation()} aria-label={`Item ${item.nome}`}>
        <header className="painel-cab">
          <div className="painel-topo">
            {grupo && <span className="painel-grupo" style={{ color: grupo.cor }}>● {grupo.nome}</span>}
            {pai && <button className="fr-btn-link painel-pai" onClick={onAbrirPai} title="Abrir o item pai"><CornerLeftUp size={14} /> {String(sub?.nome_item || 'Subitem')} de “{pai.nome}”</button>}
            <span className="espaco" />
            <button className="btn-icone" title="Arquivar item" onClick={() => ops.arquivar([item.id])}><Archive size={16} /></button>
            <button className="btn-icone" title="Excluir item (vai para a lixeira)" onClick={() => ops.excluir([item.id], item.nome)}><Trash2 size={16} /></button>
            <button className="btn-icone" onClick={onFechar} aria-label="Fechar"><X size={18} /></button>
          </div>
          <Editavel valor={item.nome} travado={item.nome_travado ? NOME_TRAVADO : undefined} className="painel-titulo" onSalvar={v => v && acoes.renomearItem(item.id, v)} />
          <nav className="painel-abas">
            <button className={aba === 'atualizacoes' ? 'on' : ''} onClick={() => setAba('atualizacoes')}><MessageCircle size={15} /> Atualizações{item.n_atualizacoes ? ` (${item.n_atualizacoes})` : ''}</button>
            <button className={aba === 'arquivos' ? 'on' : ''} onClick={() => setAba('arquivos')}><Paperclip size={15} /> Arquivos{item.n_anexos ? ` (${item.n_anexos})` : ''}</button>
            <button className={aba === 'campos' ? 'on' : ''} onClick={() => setAba('campos')}><Rows3 size={15} /> Campos</button>
            {!pai && <button className={aba === 'subitens' ? 'on' : ''} onClick={() => setAba('subitens')}><ListTree size={15} /> Subitens{nSub ? ` (${nSub})` : ''}</button>}
            <button className={aba === 'atividade' ? 'on' : ''} onClick={() => setAba('atividade')}><Activity size={15} /> Atividade</button>
          </nav>
        </header>
        <div className="painel-corpo">
          {aba === 'atualizacoes' && <Atualizacoes item={item} acoes={acoes} />}
          {aba === 'arquivos' && <Arquivos item={item} onContagem={n => acoes.ajustarItem(item.id, { n_anexos: n })} />}
          {aba === 'campos' && (
            <div className="campos">
              {colunas.map(c => {
                const Ic = infoTipo(c.tipo).icone;
                return (
                  <div key={c.id} className="campo">
                    <span className="campo-rotulo"><Ic size={14} /> {c.titulo}</span>
                    <div className={`campo-valor tipo-${c.tipo}`}>
                      <Celula modo="painel" coluna={c} valor={item.valores[c.id]} usuarios={nav.usuarios} item={item} colunas={colunas}
                        onMudar={v => acoes.definirValor(item.id, c.id, v)} onConfig={config => acoes.atualizarColuna(c.id, { config })} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {aba === 'subitens' && !pai && <TabelaSubitens pai={item} sub={sub} acoes={acoes} ops={ops} usuarios={nav.usuarios} modo="painel" />}
          {aba === 'atividade' && <RegistroAtividade filtro={{ item_id: item.id }} />}
        </div>
      </aside>
    </div>,
    raizPortal(),
  );
}


const ACAO: Record<string, string> = {
  criou: 'criou', alterou: 'alterou', renomeou: 'renomeou', moveu: 'moveu', excluiu: 'mandou para a lixeira', duplicou: 'duplicou',
  arquivou: 'arquivou', restaurou: 'restaurou', importou: 'importou',
};

export function RegistroAtividade({ filtro }: { filtro: Record<string, number> }) {
  const nav = useNav();
  const [lista, setLista] = useState<Row[] | null>(null);
  const chave = JSON.stringify(filtro);
  useEffect(() => { api.list('atividades', { ...JSON.parse(chave), _limite: 300 }).then(setLista); }, [chave]);
  if (!lista) return <p className="muted">Carregando…</p>;
  if (!lista.length) return <div className="vazio-painel"><Activity size={36} /><p>Nenhuma atividade registrada.</p></div>;
  return (
    <ul className="atividades">
      {lista.map(a => {
        const u = nav.usuarios.find(x => x.id === a.usuario_id);
        return (
          <li key={a.id}>
            <small className="muted">{a.criado_em.slice(5, 16).replace('-', '/')}</small>
            {a.automacao_id ? <span className="avatar avatar-auto" title="Automação"><Zap size={13} /></span> : <Avatar nome={u?.nome ?? '?'} cor={u?.cor} tamanho={22} />}
            <span className="at-item" title={a.item_nome}>{a.item_nome}</span>
            <span className="at-desc">
              {a.acao === 'alterou' ? <><b>{a.coluna_titulo}</b>: <s>{a.de ?? '—'}</s> → <b>{a.para ?? '—'}</b></>
                : a.acao === 'moveu' ? <>moveu de <s>{a.de}</s> para <b>{a.para}</b></>
                : a.acao === 'importou' ? <>importou <b>{a.para}</b> do Excel</>
                : a.acao === 'renomeou' ? <>renomeou de <s>{a.de}</s></>
                : ACAO[a.acao] ?? a.acao}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
