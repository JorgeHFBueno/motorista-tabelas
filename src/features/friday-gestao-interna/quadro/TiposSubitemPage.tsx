import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Layers, Lock, Pencil, Plus } from 'lucide-react';
import LoadingFallback from '../../../components/LoadingFallback';
import { Editavel, Popover, useAvisoRapido, useConfirmar, usePopover } from '../ui/base.tsx';
import { corTexto } from '../util.ts';
import { EditorRotulos } from './Celula.tsx';
import { MenuTipos } from './MenuTipos.tsx';
import { infoColuna, infoTipo, type Coluna, type Rotulo, type TipoMenu } from './tipos.ts';
import { colunaNoTipo, combinacoes, limparMapa, marcarColunaNoTipo, tiposDoSub, tiposItemDo, type MapaTipos } from './tiposSubitem.ts';
import { useQuadro, type Dados } from './useQuadro.ts';

// Página "Tipos de item e subitem" (/friday/quadros/:id/tipos). Duas colunas de status do quadro definem o tipo do
// item (ex.: PÚBLICA / PRIVADA) e o tipo dos subitens dele (ex.: CANALIZAÇÃO / PONTE / PAVILHÃO). Cada tipo de item
// mostra as suas colunas do quadro; cada combinação dos dois mostra as suas colunas nos subitens. Regras em
// tiposSubitem.ts. Tudo é rascunho até "Salvar", no fim da página; "Cancelar" descarta.

type NovaColuna = { id: number; tipoMenu: TipoMenu; titulo: string }; // ainda não criada (id negativo até salvar)
type Dim = { coluna: number | 'nova' | null; rotulos: Rotulo[] };       // coluna do tipo e os tipos (sem o vazio "0")
type Formato = 'ambos' | 'item' | 'sub' | null; // de que são as chaves do mapa: combinação "a:b", só o item ou só o subitem
type Matriz = { colunas: MapaTipos; novas: NovaColuna[]; titulos: Record<string, string>; formato?: Formato };
type Rascunho = { item: Dim; sub: Dim; mItem: Matriz; mSub: Matriz };
type Grupo = { chave: string; partes: Rotulo[] };
const ZERO: Rotulo = { id: '0', texto: '', cor: '#c4c4c4' };
const semVazio = (rs: unknown) => ((rs ?? []) as Rotulo[]).filter(r => r.id !== '0');
const matriz = (colunas: MapaTipos | undefined, formato: Formato = null): Matriz => ({ colunas: { ...(colunas ?? {}) }, novas: [], titulos: {}, formato });
// Mapa dos subitens no formato de agora: marcações feitas só por tipo de subitem (ou de item) valem para todas as
// combinações dele quando o outro lado é ligado (PONTE → PÚBLICA+PONTE e PRIVADA+PONTE); formato incompatível recomeça.
function noFormato(m: Matriz, atual: Formato, itens: string[], subs: string[]): MapaTipos {
  if (!m.formato || m.formato === atual) return m.colunas;
  if (atual !== 'ambos') return {};
  const abrir = (x: string) => (m.formato === 'sub' ? itens.map(a => `${a}:${x}`) : subs.map(b => `${x}:${b}`));
  return Object.fromEntries(Object.entries(m.colunas).map(([k, l]) => [k, l.flatMap(abrir)]));
}
const formatoDe = (item: boolean, sub: boolean): Formato => (item && sub ? 'ambos' : item ? 'item' : sub ? 'sub' : null);

function base(d: Dados): Rascunho {
  const ti = tiposItemDo(d.quadro.config as Record<string, unknown>);
  const ts = tiposDoSub(d.sub?.config);
  const rot = (id: unknown) => semVazio(d.colunas.find(c => c.id === Number(id))?.config.rotulos);
  return {
    item: { coluna: ti ? Number(ti.coluna_id) : null, rotulos: ti ? rot(ti.coluna_id) : [] },
    sub: { coluna: ts && Number(ts.coluna_id) ? Number(ts.coluna_id) : null, rotulos: ts && Number(ts.coluna_id) ? rot(ts.coluna_id) : [] },
    mItem: matriz(ti?.colunas), mSub: matriz(ts?.colunas, ts ? formatoDe(!!Number(ts.coluna_item), !!Number(ts.coluna_id)) : null),
  };
}

export default function TiposSubitemPage() {
  const quadroId = Number(useParams().id);
  const navigate = useNavigate();
  const confirmar = useConfirmar();
  const avisar = useAvisoRapido();
  const q = useQuadro(quadroId);
  const [r, setR] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const original = useMemo(() => (q.dados ? base(q.dados) : null), [q.dados]);
  useEffect(() => { if (original && !r) setR(original); }, [original, r]);

  if (q.erro) return <div className="vazio-grande"><h2>Quadro não encontrado</h2></div>;
  if (!q.dados || !r || !original) return <LoadingFallback label="Carregando tipos…" />;
  const { quadro, colunas, sub } = q.dados;
  const somenteVer = quadro.permissao === 'ver';
  const nomeItem = String(quadro.nome_item || 'Item').toLowerCase();
  const nomeSub = String(sub?.nome_item || 'Subitem').toLowerCase();
  const colunaDe = (d: Dim) => (typeof d.coluna === 'number' ? colunas.find(c => c.id === d.coluna) : undefined);
  const ativa = (d: Dim) => d.coluna === 'nova' || !!colunaDe(d);
  const tiposI = ativa(r.item) ? r.item.rotulos.filter(x => x.texto.trim()) : null;
  const tiposS = ativa(r.sub) && sub?.grupo_id ? r.sub.rotulos.filter(x => x.texto.trim()) : null;
  const gruposItem: Grupo[] = (tiposI ?? []).map(x => ({ chave: x.id, partes: [x] }));
  const combos: Grupo[] = tiposI || tiposS ? combinacoes(tiposI, tiposS) : [];
  const formato = formatoDe(!!tiposI, !!tiposS);
  const mSubAgora: Matriz = { ...r.mSub, colunas: noFormato(r.mSub, formato, (tiposI ?? []).map(x => x.id), (tiposS ?? []).map(x => x.id)), formato };
  // As colunas dos tipos não entram na lista de colunas por tipo (aparecem sempre).
  const deTipo = new Set([r.item.coluna, r.sub.coluna].filter((x): x is number => typeof x === 'number'));
  const linhasItem: (Coluna | NovaColuna)[] = [...colunas.filter(c => !deTipo.has(c.id)), ...r.mItem.novas];
  const linhasSub: (Coluna | NovaColuna)[] = [...(sub?.colunas ?? []).filter(c => !c.oculta), ...r.mSub.novas];
  const mudou = JSON.stringify(r) !== JSON.stringify(original);
  const mudar = (p: Partial<Rascunho>) => setR({ ...r, ...p });

  const statusLivres = (outra: Dim) => colunas.filter(c => c.tipo === 'status' && c.id !== outra.coluna);
  // Trocar a coluna do tipo recomeça as marcações que dependem dela (os rótulos são outros).
  const escolherColuna = (lado: 'item' | 'sub', v: string) => {
    const coluna = !v ? null : v === 'nova' ? 'nova' as const : Number(v);
    if (coluna === r[lado].coluna) return;
    const rotulos = typeof coluna === 'number' ? semVazio(colunas.find(c => c.id === coluna)?.config.rotulos) : [];
    // Marcações dos subitens que não dependem deste lado ficam (ex.: só por PONTE/PAVILHÃO, ao trocar o tipo do item;
    // são abertas nas combinações); as que dependem dele recomeçam.
    const f = r.mSub.formato ?? null;
    const mSub = r[lado].coluna !== null && (f === 'ambos' || f === lado) ? { ...r.mSub, colunas: {}, formato: null } : r.mSub;
    if (lado === 'item') mudar({ item: { coluna, rotulos }, mItem: { ...r.mItem, colunas: {} }, mSub });
    else mudar({ sub: { coluna, rotulos }, mSub });
  };
  // Tipos editados: os que saíram deixam de valer nas marcações (o id não é reaproveitado por engano).
  const aplicarTipos = (lado: 'item' | 'sub', rs: Rotulo[]) => {
    const rotulos = rs.filter(x => x.id !== '0');
    const ni = lado === 'item' ? rotulos : r.item.rotulos, ns = lado === 'sub' ? rotulos : r.sub.rotulos;
    const vi = ativa(r.item) ? ni : null, vs = ativa(r.sub) && sub?.grupo_id ? ns : null;
    // Marcações dos subitens em outro formato ficam como estão (abertas ao mostrar e ao salvar).
    const fmt = formatoDe(!!vi, !!vs);
    mudar({
      [lado]: { ...r[lado], rotulos },
      mItem: { ...r.mItem, colunas: lado === 'item' ? limparMapa(r.mItem.colunas, ni.map(x => x.id)) : r.mItem.colunas },
      mSub: r.mSub.formato && r.mSub.formato !== fmt ? r.mSub : { ...r.mSub, colunas: limparMapa(r.mSub.colunas, vi || vs ? combinacoes(vi, vs).map(c => c.chave) : []), formato: fmt },
    });
  };

  // Coluna do tipo: a escolhida ou a criada agora, com os tipos gravados como rótulos (mais o vazio de sempre).
  const garantirColuna = async (d: Dim, titulo: string) => {
    const col = d.coluna === 'nova' ? await q.criarColuna('status', titulo) : colunaDe(d);
    if (!col) throw new Error(`A coluna “${titulo}” não existe mais.`);
    const rotulos = [...d.rotulos.map(x => ({ ...x, texto: x.texto.trim() })).filter(x => x.texto), semZero(col.config.rotulos) ?? ZERO];
    if (d.coluna === 'nova' || JSON.stringify(rotulos) !== JSON.stringify(col.config.rotulos)) await q.atualizarColuna(col.id, { config: { ...col.config, rotulos } });
    return { col, tipos: rotulos.filter(x => x.id !== '0') };
  };
  // Colunas novas: criadas agora; o id provisório do mapa vira o id de verdade.
  const criarNovas = async (m: Matriz, criarColuna: (tm: TipoMenu, titulo: string) => Promise<Coluna>) => {
    const mapa = { ...m.colunas };
    for (const n of m.novas) {
      const c = await criarColuna(n.tipoMenu, n.titulo.trim() || infoTipo(n.tipoMenu).rotulo);
      const lista = mapa[String(n.id)];
      delete mapa[String(n.id)];
      if (lista) mapa[String(c.id)] = lista;
    }
    return mapa;
  };
  const renomear = async (m: Matriz, lista: Coluna[]) => {
    for (const [id, titulo] of Object.entries(m.titulos)) {
      const c = lista.find(x => x.id === Number(id));
      if (c && titulo.trim() && titulo.trim() !== c.titulo) await q.atualizarColuna(c.id, { titulo: titulo.trim() });
    }
  };
  const gravar = async () => {
    await renomear(r.mItem, colunas);
    await renomear(r.mSub, sub?.colunas ?? []);
    let item: { col: Coluna; tipos: Rotulo[] } | null = null;
    if (r.item.coluna !== null) {
      item = await garantirColuna(r.item, 'Tipo do item');
      const mapa = await criarNovas(r.mItem, (tm, titulo) => q.criarColuna(tm, titulo));
      await q.atualizarQuadro({ config: { ...(quadro.config ?? {}), tipos_item: { coluna_id: item.col.id, colunas: limparMapa(mapa, item.tipos.map(x => x.id)) } } });
    } else if (tiposItemDo(quadro.config as Record<string, unknown>)) {
      await q.atualizarQuadro({ config: { ...(quadro.config ?? {}), tipos_item: null } });
    }
    if (!sub?.grupo_id) return;
    const subTipo = r.sub.coluna !== null ? await garantirColuna(r.sub, 'Tipo do subitem') : null;
    if (!item && !subTipo) { await q.tiposSub(null); return; }
    const fmt = formatoDe(!!item, !!subTipo);
    const atual = { ...r.mSub, colunas: noFormato(r.mSub, fmt, (item?.tipos ?? []).map(x => x.id), (subTipo?.tipos ?? []).map(x => x.id)) };
    const mapa = await criarNovas(atual, (tm, titulo) => q.criarColunaSub(tm, titulo));
    const validas = combinacoes(item?.tipos ?? null, subTipo?.tipos ?? null).map(c => c.chave);
    await q.tiposSub({ coluna_item: item?.col.id ?? null, coluna_id: subTipo?.col.id ?? null, colunas: limparMapa(mapa, validas) });
  };
  const salvar = async () => {
    setSalvando(true);
    try { await gravar(); } catch (e) { avisar(`Não foi possível salvar: ${(e as Error).message}`); return; } finally { setSalvando(false); }
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
          <h1><Layers size={22} className="ic-auto" /> Tipos de item e {nomeSub}</h1>
          <p className="muted">O {nomeItem} tem um tipo (ex.: PÚBLICA ou PRIVADA) e um tipo para os {nomeSub}s dele (ex.: PONTE ou PAVILHÃO). Cada tipo mostra só as colunas marcadas: no quadro, as do tipo do {nomeItem}; nos {nomeSub}s, as da combinação dos dois. Os valores das colunas escondidas continuam guardados. Nada muda no quadro até “Salvar”, no fim da página.</p>
        </div>
      </header>
      {somenteVer && <div className="aviso-leitura">Você pode ver este quadro, mas não alterar.</div>}

      <SecaoTipos titulo={`Tipos de ${nomeItem}`} dica={`Coluna do ${nomeItem} que define o tipo dele`} d={r.item} col={colunaDe(r.item)} opcoes={statusLivres(r.sub)}
        nova="Tipo do item" somenteVer={somenteVer} onColuna={v => escolherColuna('item', v)} onTipos={rs => aplicarTipos('item', rs)} />
      {gruposItem.length > 0 && (
        <MatrizColunas titulo={`Colunas do quadro em cada tipo de ${nomeItem}`} grupos={gruposItem} linhas={linhasItem} m={r.mItem} somenteVer={somenteVer}
          onChange={mItem => mudar({ mItem })} />
      )}

      {!sub?.grupo_id ? (
        <div className="vazio-painel"><Layers size={36} /><p>Este quadro ainda não tem {nomeSub}s.</p><small>Crie o primeiro {nomeSub} num {nomeItem} para configurar os tipos deles.</small></div>
      ) : (
        <>
          <SecaoTipos titulo={`Tipos de ${nomeSub}`} dica={`Coluna do ${nomeItem} que define o tipo dos ${nomeSub}s dele (todos seguem o ${nomeItem})`} d={r.sub} col={colunaDe(r.sub)}
            opcoes={statusLivres(r.item)} nova="Tipo do subitem" somenteVer={somenteVer} onColuna={v => escolherColuna('sub', v)} onTipos={rs => aplicarTipos('sub', rs)} />
          {combos.length > 0 && (
            <MatrizColunas titulo={`Colunas dos ${nomeSub}s em cada combinação`} grupos={combos} linhas={linhasSub} m={mSubAgora} somenteVer={somenteVer}
              onChange={mSub => mudar({ mSub: { ...mSub, formato } })} />
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
    </div>
  );
}

const semZero = (rs: unknown) => ((rs ?? []) as Rotulo[]).find(x => x.id === '0');
const Chip = ({ r }: { r: Rotulo }) => <span className="ts-tipo" style={{ background: r.cor, color: corTexto(r.cor) }}>{r.texto}</span>;

// Coluna do tipo (ou "nova", criada ao salvar) e os tipos, editados sem o rótulo vazio (o item sem tipo).
function SecaoTipos({ titulo, dica, d, col, opcoes, nova, somenteVer, onColuna, onTipos }: {
  titulo: string; dica: string; d: Dim; col: Coluna | undefined; opcoes: Coluna[]; nova: string; somenteVer: boolean;
  onColuna: (v: string) => void; onTipos: (rs: Rotulo[]) => void;
}) {
  const pop = usePopover<HTMLButtonElement>();
  const tipos = d.rotulos.filter(x => x.texto.trim());
  return (
    <section className="ts-bloco">
      <h3>{titulo}</h3>
      <div className="ts-linha">
        <label className="muted">{dica}</label>
        <select className="input-cheio" value={d.coluna == null ? '' : String(d.coluna)} disabled={somenteVer} onChange={e => onColuna(e.target.value)}>
          <option value="">Nenhuma (sem tipos: mostra todas as colunas)</option>
          {opcoes.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
          <option value="nova">Nova coluna “{nova}” (criada ao salvar)</option>
          {typeof d.coluna === 'number' && !col && <option value={String(d.coluna)}>(coluna excluída)</option>}
        </select>
      </div>
      {typeof d.coluna === 'number' && !col && <p className="aviso-erro">A coluna escolhida não existe mais: escolha outra ou “Nenhuma”.</p>}
      {(d.coluna === 'nova' || col) && (
        <div className="ts-linha ts-tipos">
          {tipos.map(x => <Chip key={x.id} r={x} />)}
          {!tipos.length && <span className="muted">Nenhum tipo ainda.</span>}
          {!somenteVer && <button ref={pop.ref} className="fr-btn" onClick={pop.alternar}><Pencil size={14} /> Cadastrar e editar tipos</button>}
          {pop.aberto && (
            <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={300}>
              <EditorRotulos rotulos={d.rotulos} protegidos={col?.oficial?.rotulos} onSalvar={onTipos} onFechar={pop.fechar} />
            </Popover>
          )}
        </div>
      )}
    </section>
  );
}

// Colunas (linhas) × tipos ou combinações (colunas): marcada em todos = comum. O "+" cria uma coluna só naquele grupo.
function MatrizColunas({ titulo, grupos, linhas, m, somenteVer, onChange }: {
  titulo: string; grupos: Grupo[]; linhas: (Coluna | NovaColuna)[]; m: Matriz; somenteVer: boolean; onChange: (m: Matriz) => void;
}) {
  const todos = grupos.map(g => g.chave);
  const nova = (tipoMenu: TipoMenu, chave: string) => {
    const id = -(m.novas.length + 1) - Math.floor(Math.random() * 1e6) * 100; // provisório, único nesta página
    onChange({ ...m, novas: [...m.novas, { id, tipoMenu, titulo: infoTipo(tipoMenu).rotulo }], colunas: { ...m.colunas, [String(id)]: [chave] } });
  };
  return (
    <section className="ts-bloco">
      <h3>{titulo}</h3>
      <p className="muted">Coluna marcada em todos é comum: aparece também nos tipos criados depois.</p>
      <div className="ts-rolagem">
        <table className="ts-tabela">
          <thead>
            <tr>
              <th>Coluna</th>
              {grupos.map(g => (
                <th key={g.chave}>
                  <span className="ts-combo">{g.partes.map((p, i) => <span key={p.id}>{i > 0 && ' + '}<Chip r={p} /></span>)}</span>
                  {!somenteVer && <NovaColunaNoTipo onEscolher={tm => nova(tm, g.chave)} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(c => {
              const ehNova = 'tipoMenu' in c;
              const Ic = ehNova ? infoTipo(c.tipoMenu).icone : infoColuna(c).icone;
              const titulo = ehNova ? c.titulo : m.titulos[String(c.id)] ?? c.titulo;
              return (
                <tr key={c.id}>
                  <td className="ts-coluna">
                    <Ic size={14} />
                    <Editavel valor={titulo} travado={somenteVer ? 'Você só pode ver este quadro.' : undefined}
                      onSalvar={v => { if (!v) return; onChange(ehNova ? { ...m, novas: m.novas.map(n => (n.id === c.id ? { ...n, titulo: v } : n)) } : { ...m, titulos: { ...m.titulos, [String(c.id)]: v } }); }} />
                    {!ehNova && c.oficial && <span title="Campo oficial"><Lock size={12} /></span>}
                    {ehNova && <small className="ts-nova">nova</small>}
                    {!m.colunas[String(c.id)] && <small className="muted">comum</small>}
                  </td>
                  {grupos.map(g => (
                    <td key={g.chave} className="ts-marca">
                      <input type="checkbox" className="caixa" disabled={somenteVer} checked={colunaNoTipo(m, c.id, g.chave)} aria-label={`${titulo} em ${g.partes.map(p => p.texto).join(' + ')}`}
                        onChange={e => onChange({ ...m, colunas: marcarColunaNoTipo(m, c.id, g.chave, e.target.checked, todos).colunas ?? {} })} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NovaColunaNoTipo({ onEscolher }: { onEscolher: (t: TipoMenu) => void }) {
  const pop = usePopover<HTMLButtonElement>();
  return (
    <>
      <button ref={pop.ref} className="btn-icone" title="Nova coluna só aqui" aria-label="Nova coluna só aqui" onClick={pop.alternar}><Plus size={14} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={340}>
          <MenuTipos onEscolher={tm => { pop.fechar(); onEscolher(tm); }} />
        </Popover>
      )}
    </>
  );
}
