import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Layers, Lock, Pencil, Plus } from 'lucide-react';
import LoadingFallback from '../../../components/LoadingFallback';
import { Editavel, Popover, usePopover } from '../ui/base.tsx';
import { corTexto } from '../util.ts';
import { EditorRotulos } from './Celula.tsx';
import { MenuTipos } from './MenuTipos.tsx';
import { infoColuna, infoTipo, type Coluna, type Rotulo, type TipoMenu } from './tipos.ts';
import { colunaNoTipo, colunaSoNoTipo, marcarColunaNoTipo, tiposDoSub, type TiposSub } from './tiposSubitem.ts';
import { useQuadro } from './useQuadro.ts';

// Página "Tipos de subitem" (/friday/quadros/:id/tipos): uma coluna de status do quadro define o tipo de cada item
// (ex.: PONTE ou PAVILHÃO) e, para cada tipo, quais colunas os subitens mostram. Regras em tiposSubitem.ts.
export default function TiposSubitemPage() {
  const quadroId = Number(useParams().id);
  const navigate = useNavigate();
  const q = useQuadro(quadroId);
  const [editandoTipos, setEditandoTipos] = useState(false);
  const pop = usePopover<HTMLButtonElement>();

  if (q.erro) return <div className="vazio-grande"><h2>Quadro não encontrado</h2></div>;
  if (!q.dados) return <LoadingFallback label="Carregando tipos de subitem…" />;
  const { quadro, colunas, sub } = q.dados;
  const somenteVer = quadro.permissao === 'ver';
  const nomeItem = String(quadro.nome_item || 'Item').toLowerCase();
  const nomeSub = String(sub?.nome_item || 'Subitem');
  const t = tiposDoSub(sub?.config);
  const statusDoQuadro = colunas.filter(c => c.tipo === 'status');
  const colunaTipo = t ? colunas.find(c => c.id === Number(t.coluna_id)) : undefined;
  const tiposLista = ((colunaTipo?.config.rotulos ?? []) as Rotulo[]).filter(r => r.id !== '0' && r.texto.trim());
  const todos = tiposLista.map(r => r.id);
  const colunasSub = (sub?.colunas ?? []).filter(c => !c.oculta);
  const salvar = (novo: TiposSub | null) => { void q.tiposSub(novo); };

  const escolherColuna = (id: string) => {
    if (!id) { salvar(null); return; }
    // Trocar a coluna do tipo recomeça a escolha (os rótulos são outros).
    salvar(Number(id) === Number(t?.coluna_id) ? t : { coluna_id: Number(id), padrao: null, colunas: {} });
  };
  const criarColunaTipo = async () => {
    const c = await q.criarColuna('status', 'Tipo');
    if (!c) return;
    // Começa sem os rótulos padrão do Status (Em andamento, Feito…): os tipos são cadastrados aqui.
    await q.atualizarColuna(c.id, { config: { ...c.config, rotulos: [{ id: '0', texto: '', cor: '#c4c4c4' }] } });
    salvar({ coluna_id: c.id, padrao: null, colunas: {} });
  };

  return (
    <div className="pagina pagina-automacoes pagina-tipos-sub">
      <button className="fr-btn-link voltar" onClick={() => navigate(`/friday/quadros/${quadroId}`)}><ArrowLeft size={15} /> {quadro.nome}</button>
      <header className="pagina-cab">
        <div>
          <h1><Layers size={22} className="ic-auto" /> Tipos de {nomeSub.toLowerCase()}</h1>
          <p className="muted">Uma coluna do {nomeItem} define o tipo dele (ex.: PONTE ou PAVILHÃO). Cada tipo mostra nos {nomeSub.toLowerCase()}s só as colunas marcadas. Os valores das colunas escondidas continuam guardados.</p>
        </div>
      </header>
      {somenteVer && <div className="aviso-leitura">Você pode ver este quadro, mas não alterar.</div>}
      {!sub?.grupo_id ? (
        <div className="vazio-painel"><Layers size={36} /><p>Este quadro ainda não tem {nomeSub.toLowerCase()}s.</p><small>Crie o primeiro {nomeSub.toLowerCase()} num {nomeItem} e volte aqui.</small></div>
      ) : (
        <>
          <section className="ts-bloco">
            <h3>Coluna que define o tipo</h3>
            <div className="ts-linha">
              <select className="input-cheio" value={t ? String(t.coluna_id) : ''} disabled={somenteVer} onChange={e => escolherColuna(e.target.value)}>
                <option value="">Nenhuma (todos os {nomeSub.toLowerCase()}s mostram todas as colunas)</option>
                {statusDoQuadro.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                {t && !colunaTipo && <option value={String(t.coluna_id)}>(coluna excluída)</option>}
              </select>
              {!t && !somenteVer && <button className="fr-btn" onClick={criarColunaTipo}><Plus size={15} /> Criar coluna “Tipo”</button>}
            </div>
            {t && !colunaTipo && <p className="aviso-erro">A coluna escolhida não existe mais: escolha outra ou “Nenhuma”.</p>}
          </section>

          {t && colunaTipo && (
            <>
              <section className="ts-bloco">
                <h3>Tipos</h3>
                <div className="ts-linha ts-tipos">
                  {tiposLista.map(r => <span key={r.id} className="ts-tipo" style={{ background: r.cor, color: corTexto(r.cor) }}>{r.texto}</span>)}
                  {!tiposLista.length && <span className="muted">Nenhum tipo ainda.</span>}
                  {!somenteVer && <button ref={pop.ref} className="fr-btn" onClick={() => { setEditandoTipos(true); pop.alternar(); }}><Pencil size={14} /> Cadastrar e editar tipos</button>}
                </div>
                {pop.aberto && editandoTipos && (
                  <Popover ancora={pop.ref.current} onClose={() => { pop.fechar(); setEditandoTipos(false); }} largura={300}>
                    <EditorRotulos rotulos={(colunaTipo.config.rotulos ?? []) as Rotulo[]} comVazio protegidos={colunaTipo.oficial?.rotulos}
                      onSalvar={rs => q.atualizarColuna(colunaTipo.id, { config: { ...colunaTipo.config, rotulos: rs } })}
                      onFechar={() => { pop.fechar(); setEditandoTipos(false); }} />
                  </Popover>
                )}
                <div className="ts-linha">
                  <label htmlFor="ts-padrao">{nomeItem[0].toUpperCase() + nomeItem.slice(1)} sem tipo conta como</label>
                  <select id="ts-padrao" className="input-cheio" value={t.padrao ?? ''} disabled={somenteVer} onChange={e => salvar({ ...t, padrao: e.target.value || null })}>
                    <option value="">Nenhum (mostra todas as colunas)</option>
                    {tiposLista.map(r => <option key={r.id} value={r.id}>{r.texto}</option>)}
                  </select>
                </div>
              </section>

              {tiposLista.length > 0 && (
                <section className="ts-bloco">
                  <h3>Colunas dos {nomeSub.toLowerCase()}s em cada tipo</h3>
                  <p className="muted">Coluna marcada em todos os tipos é comum: aparece também nos tipos criados depois.</p>
                  <div className="ts-rolagem">
                    <table className="ts-tabela">
                      <thead>
                        <tr>
                          <th>Coluna</th>
                          {tiposLista.map(r => (
                            <th key={r.id}>
                              <span className="ts-tipo" style={{ background: r.cor, color: corTexto(r.cor) }}>{r.texto}</span>
                              {!somenteVer && <NovaColunaNoTipo onEscolher={async tm => { const c = await q.criarColunaSub(tm, infoTipo(tm).rotulo); if (c) salvar(colunaSoNoTipo(t, c.id, r.id)); }} />}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {colunasSub.map(c => <LinhaColuna key={c.id} c={c} t={t} tipos={tiposLista} todos={todos} somenteVer={somenteVer} q={q} salvar={salvar} />)}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function LinhaColuna({ c, t, tipos, todos, somenteVer, q, salvar }: {
  c: Coluna; t: TiposSub; tipos: Rotulo[]; todos: string[]; somenteVer: boolean; q: ReturnType<typeof useQuadro>; salvar: (t: TiposSub) => void;
}) {
  const Ic = infoColuna(c).icone;
  const comum = !t.colunas?.[String(c.id)];
  return (
    <tr>
      <td className="ts-coluna">
        <Ic size={14} />
        <Editavel valor={c.titulo} travado={somenteVer ? "Você só pode ver este quadro." : undefined} onSalvar={v => v && q.atualizarColuna(c.id, { titulo: v })} />
        {c.oficial && <span title="Campo oficial"><Lock size={12} /></span>}
        {comum && <small className="muted">comum</small>}
      </td>
      {tipos.map(r => (
        <td key={r.id} className="ts-marca">
          <input type="checkbox" className="caixa" disabled={somenteVer} checked={colunaNoTipo(t, c.id, r.id)} aria-label={`${c.titulo} em ${r.texto}`}
            onChange={e => salvar(marcarColunaNoTipo(t, c.id, r.id, e.target.checked, todos))} />
        </td>
      ))}
    </tr>
  );
}

function NovaColunaNoTipo({ onEscolher }: { onEscolher: (t: TipoMenu) => void }) {
  const pop = usePopover<HTMLButtonElement>();
  return (
    <>
      <button ref={pop.ref} className="btn-icone" title="Nova coluna só neste tipo" aria-label="Nova coluna só neste tipo" onClick={pop.alternar}><Plus size={14} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={340}>
          <MenuTipos onEscolher={tm => { pop.fechar(); onEscolher(tm); }} />
        </Popover>
      )}
    </>
  );
}
