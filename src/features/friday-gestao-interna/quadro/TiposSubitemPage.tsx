import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Layers, Lock, Pencil, Plus } from 'lucide-react';
import LoadingFallback from '../../../components/LoadingFallback';
import { Editavel, Popover, useAvisoRapido, useConfirmar, usePopover } from '../ui/base.tsx';
import { corTexto } from '../util.ts';
import { EditorRotulos } from './Celula.tsx';
import { MenuTipos } from './MenuTipos.tsx';
import { infoColuna, infoTipo, type Coluna, type Rotulo, type TipoMenu } from './tipos.ts';
import { colunaNoTipo, marcarColunaNoTipo, tiposDoSub, type TiposSub } from './tiposSubitem.ts';
import { useQuadro, type Dados } from './useQuadro.ts';

// Página "Tipos de subitem" (/friday/quadros/:id/tipos): uma coluna de status do quadro define o tipo de cada item
// (ex.: PONTE ou PAVILHÃO) e, para cada tipo, quais colunas os subitens mostram. Regras em tiposSubitem.ts.
// Tudo é um rascunho até "Salvar", no fim da página; "Cancelar" descarta e volta ao quadro.

// Coluna nova dos subitens, ainda não criada (id negativo até salvar).
type NovaColuna = { id: number; tipoMenu: TipoMenu; titulo: string };
type Rascunho = {
  coluna: number | 'nova' | null;   // coluna do tipo ('nova' = criar "Tipo" ao salvar)
  rotulos: Rotulo[];                // os tipos (rótulos da coluna, sem o vazio "0")
  padrao: string | null;            // tipo do item sem tipo
  colunas: Record<string, string[]>; // colunas dos subitens fora do comum
  novas: NovaColuna[];
  titulos: Record<string, string>;  // colunas dos subitens renomeadas
};
const ZERO: Rotulo = { id: '0', texto: '', cor: '#c4c4c4' };
const semVazio = (rs: Rotulo[] | undefined) => (rs ?? []).filter(r => r.id !== '0');

function base(d: Dados): Rascunho {
  const t = tiposDoSub(d.sub?.config);
  const col = t ? d.colunas.find(c => c.id === Number(t.coluna_id)) : undefined;
  return { coluna: t ? Number(t.coluna_id) : null, rotulos: semVazio(col?.config.rotulos as Rotulo[]), padrao: t?.padrao ?? null,
    colunas: { ...(t?.colunas ?? {}) }, novas: [], titulos: {} };
}

export default function TiposSubitemPage() {
  const quadroId = Number(useParams().id);
  const navigate = useNavigate();
  const confirmar = useConfirmar();
  const avisar = useAvisoRapido();
  const q = useQuadro(quadroId);
  const [r, setR] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const pop = usePopover<HTMLButtonElement>();
  const original = useMemo(() => (q.dados ? base(q.dados) : null), [q.dados]);
  useEffect(() => { if (original && !r) setR(original); }, [original, r]);

  if (q.erro) return <div className="vazio-grande"><h2>Quadro não encontrado</h2></div>;
  if (!q.dados || !r || !original) return <LoadingFallback label="Carregando tipos de subitem…" />;
  const { quadro, colunas, sub } = q.dados;
  const somenteVer = quadro.permissao === 'ver';
  const nomeItem = String(quadro.nome_item || 'Item').toLowerCase();
  const nomeSub = String(sub?.nome_item || 'Subitem');
  const statusDoQuadro = colunas.filter(c => c.tipo === 'status');
  const colunaTipo = typeof r.coluna === 'number' ? colunas.find(c => c.id === r.coluna) : undefined;
  const ativa = r.coluna === 'nova' || !!colunaTipo;
  const tiposLista = r.rotulos.filter(x => x.texto.trim());
  const todos = tiposLista.map(x => x.id);
  const t: TiposSub = { coluna_id: 0, padrao: r.padrao, colunas: r.colunas };
  const linhas: (Coluna | NovaColuna)[] = [...(sub?.colunas ?? []).filter(c => !c.oculta), ...r.novas];
  const mudou = JSON.stringify(r) !== JSON.stringify(original);
  const mudar = (p: Partial<Rascunho>) => setR({ ...r, ...p });

  const escolherColuna = (v: string) => {
    if (!v) { mudar({ coluna: null }); return; }
    const coluna = v === 'nova' ? 'nova' as const : Number(v);
    if (coluna === r.coluna) return;
    // Trocar a coluna do tipo recomeça a escolha (os rótulos são outros).
    const col = typeof coluna === 'number' ? colunas.find(c => c.id === coluna) : undefined;
    mudar({ coluna, rotulos: semVazio(col?.config.rotulos as Rotulo[]), padrao: null, colunas: {} });
  };
  // Tipos editados: os que saíram deixam de valer no mapa e no padrão (o id não é reaproveitado por engano).
  const aplicarTipos = (rs: Rotulo[]) => {
    const ficam = new Set(rs.map(x => x.id));
    const colunasMapa = Object.fromEntries(Object.entries(r.colunas).map(([k, l]) => [k, l.filter(x => ficam.has(x))]));
    mudar({ rotulos: rs.filter(x => x.id !== '0'), colunas: colunasMapa, padrao: r.padrao && ficam.has(r.padrao) ? r.padrao : null });
  };
  const novaColuna = (tipoMenu: TipoMenu, tipo: string) => {
    const id = -(r.novas.length + 1);
    mudar({ novas: [...r.novas, { id, tipoMenu, titulo: infoTipo(tipoMenu).rotulo }], colunas: { ...r.colunas, [String(id)]: [tipo] } });
  };

  // A coluna do tipo, os tipos, as colunas novas e o mapa (com "Nenhuma", só desliga).
  const gravarTipos = async () => {
    if (r.coluna === null) { await q.tiposSub(null); return; }
    let col = colunaTipo;
    if (r.coluna === 'nova') col = await q.criarColuna('status', 'Tipo');
    if (!col) throw new Error('A coluna do tipo não existe mais.');
    const rotulos = [...r.rotulos.map(x => ({ ...x, texto: x.texto.trim() })).filter(x => x.texto), (col.config.rotulos as Rotulo[] | undefined)?.find(x => x.id === '0') ?? ZERO];
    if (r.coluna === 'nova' || JSON.stringify(rotulos) !== JSON.stringify(col.config.rotulos)) await q.atualizarColuna(col.id, { config: { ...col.config, rotulos } });
    const mapa = { ...r.colunas };
    for (const n of r.novas) {
      const c = await q.criarColunaSub(n.tipoMenu, n.titulo.trim() || infoTipo(n.tipoMenu).rotulo);
      const lista = mapa[String(n.id)];
      delete mapa[String(n.id)];
      if (lista) mapa[String(c.id)] = lista;
    }
    // Lista com todos os tipos = coluna comum (sai do mapa).
    const validos = rotulos.filter(x => x.id !== '0').map(x => x.id);
    for (const k of Object.keys(mapa)) {
      const l = mapa[k].filter(x => validos.includes(x));
      if (validos.every(x => l.includes(x))) delete mapa[k]; else mapa[k] = l;
    }
    await q.tiposSub({ coluna_id: col.id, padrao: r.padrao && validos.includes(r.padrao) ? r.padrao : null, colunas: mapa });
  };
  const salvar = async () => {
    setSalvando(true);
    try {
      for (const [id, titulo] of Object.entries(r.titulos)) {
        const c = sub?.colunas.find(x => x.id === Number(id));
        if (c && titulo.trim() && titulo.trim() !== c.titulo) await q.atualizarColuna(c.id, { titulo: titulo.trim() });
      }
      await gravarTipos();
    } catch (e) {
      avisar(`Não foi possível salvar: ${(e as Error).message}`);
      return;
    } finally {
      setSalvando(false);
    }
    await q.recarregar();
    setR(null); // recomeça do que ficou gravado
    avisar('Tipos salvos.');
  };
  const sair = async () => {
    if (mudou && !(await confirmar('Descartar as alterações dos tipos? Nada foi salvo.', 'Descartar'))) return;
    navigate(`/friday/quadros/${quadroId}`);
  };

  return (
    <div className="pagina pagina-automacoes pagina-tipos-sub">
      <button className="fr-btn-link voltar" onClick={sair}><ArrowLeft size={15} /> {quadro.nome}</button>
      <header className="pagina-cab">
        <div>
          <h1><Layers size={22} className="ic-auto" /> Tipos de {nomeSub.toLowerCase()}</h1>
          <p className="muted">Uma coluna do {nomeItem} define o tipo dele (ex.: PONTE ou PAVILHÃO). Cada tipo mostra nos {nomeSub.toLowerCase()}s só as colunas marcadas. Os valores das colunas escondidas continuam guardados. Nada muda no quadro até “Salvar”, no fim da página.</p>
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
              <select className="input-cheio" value={r.coluna == null ? '' : String(r.coluna)} disabled={somenteVer} onChange={e => escolherColuna(e.target.value)}>
                <option value="">Nenhuma (todos os {nomeSub.toLowerCase()}s mostram todas as colunas)</option>
                {statusDoQuadro.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                <option value="nova">Nova coluna “Tipo” (criada ao salvar)</option>
                {typeof r.coluna === 'number' && !colunaTipo && <option value={String(r.coluna)}>(coluna excluída)</option>}
              </select>
            </div>
            {typeof r.coluna === 'number' && !colunaTipo && <p className="aviso-erro">A coluna escolhida não existe mais: escolha outra ou “Nenhuma”.</p>}
          </section>

          {ativa && (
            <>
              <section className="ts-bloco">
                <h3>Tipos</h3>
                <div className="ts-linha ts-tipos">
                  {tiposLista.map(x => <span key={x.id} className="ts-tipo" style={{ background: x.cor, color: corTexto(x.cor) }}>{x.texto}</span>)}
                  {!tiposLista.length && <span className="muted">Nenhum tipo ainda.</span>}
                  {!somenteVer && <button ref={pop.ref} className="fr-btn" onClick={pop.alternar}><Pencil size={14} /> Cadastrar e editar tipos</button>}
                </div>
                {pop.aberto && (
                  <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={300}>
                    {/* Sem o rótulo vazio ("0", o item sem tipo): cada linha aqui é um tipo. */}
                    <EditorRotulos rotulos={r.rotulos} protegidos={colunaTipo?.oficial?.rotulos} onSalvar={aplicarTipos} onFechar={pop.fechar} />
                  </Popover>
                )}
                <div className="ts-linha">
                  <label htmlFor="ts-padrao">{nomeItem[0].toUpperCase() + nomeItem.slice(1)} sem tipo conta como</label>
                  <select id="ts-padrao" className="input-cheio" value={r.padrao ?? ''} disabled={somenteVer} onChange={e => mudar({ padrao: e.target.value || null })}>
                    <option value="">Nenhum (mostra todas as colunas)</option>
                    {tiposLista.map(x => <option key={x.id} value={x.id}>{x.texto}</option>)}
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
                          {tiposLista.map(x => (
                            <th key={x.id}>
                              <span className="ts-tipo" style={{ background: x.cor, color: corTexto(x.cor) }}>{x.texto}</span>
                              {!somenteVer && <NovaColunaNoTipo onEscolher={tm => novaColuna(tm, x.id)} />}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map(c => {
                          const nova = 'tipoMenu' in c;
                          const Ic = nova ? infoTipo(c.tipoMenu).icone : infoColuna(c).icone;
                          const titulo = nova ? c.titulo : r.titulos[String(c.id)] ?? c.titulo;
                          return (
                            <tr key={c.id}>
                              <td className="ts-coluna">
                                <Ic size={14} />
                                <Editavel valor={titulo} travado={somenteVer ? 'Você só pode ver este quadro.' : undefined}
                                  onSalvar={v => { if (!v) return; if (nova) mudar({ novas: r.novas.map(n => (n.id === c.id ? { ...n, titulo: v } : n)) }); else mudar({ titulos: { ...r.titulos, [String(c.id)]: v } }); }} />
                                {!nova && c.oficial && <span title="Campo oficial"><Lock size={12} /></span>}
                                {nova && <small className="ts-nova">nova</small>}
                                {!r.colunas[String(c.id)] && <small className="muted">comum</small>}
                              </td>
                              {tiposLista.map(x => (
                                <td key={x.id} className="ts-marca">
                                  <input type="checkbox" className="caixa" disabled={somenteVer} checked={colunaNoTipo(t, c.id, x.id)} aria-label={`${titulo} em ${x.texto}`}
                                    onChange={e => mudar({ colunas: marcarColunaNoTipo(t, c.id, x.id, e.target.checked, todos).colunas ?? {} })} />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          {!somenteVer && (
            <div className="ts-rodape">
              <span className="muted">{mudou ? 'Há alterações não salvas.' : 'Nenhuma alteração.'}</span>
              <button className="fr-btn" onClick={() => { if (mudou) setR(original); else navigate(`/friday/quadros/${quadroId}`); }} disabled={salvando}>Cancelar</button>
              <button className="fr-btn btn-primario" onClick={salvar} disabled={!mudou || salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          )}
        </>
      )}
    </div>
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
