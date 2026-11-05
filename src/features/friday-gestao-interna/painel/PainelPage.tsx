import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from '../rotas.tsx';
import { AlertTriangle, BarChart3, Copy, Database, Eye, LayoutDashboard, Lock, MoreHorizontal, Pencil, PieChart, Plus, Sparkles, Star, Trash2, X } from 'lucide-react';
import { api, req, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { Editavel, Menu, Modal, Popover, useConfirmar, usePopover } from '../ui/base.tsx';
import {
  calcularWidget, CATEGORICAS, colunasDosQuadros, GRUPO, NUMERICAS, valoresDaColuna,
  type Calculo, type ConfigPainel, type DadosQuadro, type FiltroWidget, type TipoWidget, type Widget,
} from './calculo.ts';
import { Grafico } from './Graficos.tsx';
import { modeloVendas, novoIdWidget } from './modelos.ts';

const NOME_TIPO: Record<TipoWidget, string> = { numero: 'Número', pizza: 'Pizza', colunas: 'Colunas', barras: 'Barras' };
const NOME_CALCULO: Record<Calculo, string> = { contagem: 'Quantidade de itens', soma: 'Soma', media: 'Média' };
const nomeColuna = (t?: string) => (t === GRUPO ? 'Grupo do quadro' : t ?? '');

// Painel: quadro do tipo "painel" com widgets calculados sobre os itens de outros quadros.
export default function PainelPage({ painelId }: { painelId: number }) {
  const nav = useNav();
  const navigate = useNavigate();
  const confirmar = useConfirmar();
  const [painel, setPainel] = useState<Row | null>(null);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<DadosQuadro[]>([]);
  const [semAcesso, setSemAcesso] = useState<number[]>([]);
  const [carregando, setCarregando] = useState(false);
  // Quadros escondidos só nesta tela (não muda o painel salvo).
  const [ocultos, setOcultos] = useState<number[]>([]);
  const [editando, setEditando] = useState<Widget | null>(null);
  const [escolherQuadros, setEscolherQuadros] = useState(false);

  const config = (painel?.config ?? {}) as ConfigPainel;
  const idsQuadros = useMemo(() => config.quadros ?? [], [config.quadros]);
  const widgets = config.widgets ?? [];
  const podeEditar = painel?.permissao === 'editar';

  useEffect(() => {
    setPainel(null); setErro(''); setOcultos([]);
    req<{ quadro: Row }>('GET', `quadros/${painelId}/completo`).then(r => setPainel(r.quadro)).catch(e => setErro(e.message));
  }, [painelId]);

  // Itens de cada quadro de origem (cada um respeita a permissão de quem está vendo).
  const chave = idsQuadros.join(',');
  useEffect(() => {
    if (!chave) { setDados([]); setSemAcesso([]); return; }
    let vivo = true;
    setCarregando(true);
    const ids = chave.split(',').map(Number);
    Promise.all(ids.map(id => req<DadosQuadro>('GET', `quadros/${id}/completo`).catch(() => null))).then(lista => {
      if (!vivo) return;
      setDados(lista.filter((d): d is DadosQuadro => !!d));
      setSemAcesso(ids.filter((_, i) => !lista[i]));
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [chave]);

  const salvar = useCallback(async (mudar: Partial<ConfigPainel>) => {
    if (!painel) return;
    const novo = { ...config, ...mudar };
    setPainel({ ...painel, config: novo });
    await api.update('quadros', painelId, { config: novo });
  }, [painel, config, painelId]);
  const atualizarPainel = async (campos: Record<string, unknown>) => {
    setPainel(p => (p ? { ...p, ...campos } : p));
    await api.update('quadros', painelId, campos);
    nav.recarregar();
  };

  const visiveis = dados.filter(d => !ocultos.includes(Number(d.quadro.id)));
  const ctx = useMemo(() => ({ nomeUsuario: nav.nomeUsuario }), [nav.nomeUsuario]);

  if (erro) return <div className="vazio-grande"><h2>Painel não encontrado</h2><p className="muted">{erro}</p></div>;
  if (!painel) return <div className="carregando">Carregando painel…</div>;

  const salvarWidget = (w: Widget) => salvar({ widgets: widgets.some(x => x.id === w.id) ? widgets.map(x => (x.id === w.id ? w : x)) : [...widgets, w] });
  const usarModelo = async () => {
    if (widgets.length && !(await confirmar('Acrescentar os widgets do modelo de vendas aos que já existem?', 'Acrescentar'))) return;
    salvar({ widgets: [...widgets, ...modeloVendas(dados)] });
  };

  return (
    <div className="pagina-painel">
      <header className="quadro-cab">
        <div className="qc-linha">
          <LayoutDashboard size={22} className="muted" />
          <Editavel valor={String(painel.nome)} className="quadro-nome" onSalvar={v => { if (v && podeEditar) atualizarPainel({ nome: v }); }} />
          {!!painel.restrito && <span className="selo-restrito" title="Painel restrito: só algumas pessoas têm acesso"><Lock size={14} /></span>}
          <button className={`btn-icone favorito${painel.favorito ? ' on' : ''}`} title={painel.favorito ? 'Remover dos favoritos' : 'Favoritar'}
            onClick={() => atualizarPainel({ favorito: painel.favorito ? 0 : 1 })}>
            <Star size={18} />
          </button>
          <span className="espaco" />
          {podeEditar && <button className="fr-btn" onClick={() => setEscolherQuadros(true)}><Database size={15} /> Quadros ({idsQuadros.length})</button>}
          {podeEditar && <button className="fr-btn btn-primario" disabled={!dados.length} onClick={() => setEditando(widgetNovo())}><Plus size={15} /> Adicionar widget</button>}
          {podeEditar && <MenuPainel onModelo={usarModelo} podeModelo={!!dados.length}
            onExcluir={async () => { if (await confirmar(`Mover o painel “${painel.nome}” para a lixeira? Dá para restaurar por 30 dias.`)) { await api.remove('quadros', painelId); await nav.recarregar(); navigate('/'); } }} />}
        </div>
        <Editavel valor={String(painel.descricao ?? '')} placeholder="Adicionar descrição do painel" className="quadro-desc" onSalvar={v => { if (podeEditar) atualizarPainel({ descricao: v || null }); }} />
        {!podeEditar && <div className="aviso-leitura"><Eye size={15} /> Você pode ver este painel, mas não alterar.</div>}
        {dados.length > 1 && (
          <div className="painel-fontes">
            <span className="muted small">Mostrando:</span>
            {dados.map(d => {
              const id = Number(d.quadro.id);
              const on = !ocultos.includes(id);
              return <button key={id} className={`chip-sub${on ? ' on' : ''}`} title={on ? 'Clique para tirar este quadro da conta' : 'Clique para incluir este quadro'}
                onClick={() => setOcultos(o => (on ? [...o, id] : o.filter(x => x !== id)))}>{String(d.quadro.nome)}</button>;
            })}
          </div>
        )}
        {semAcesso.length > 0 && <div className="aviso-leitura"><AlertTriangle size={15} /> {semAcesso.length === 1 ? 'Um quadro deste painel não está' : `${semAcesso.length} quadros deste painel não estão`} disponíveis para você (sem acesso ou na lixeira) e ficaram fora da conta.</div>}
      </header>

      {!idsQuadros.length ? (
        <div className="vazio-grande">
          <PieChart size={40} className="muted" />
          <h3>Escolha de quais quadros vêm os dados</h3>
          <p className="muted">O painel junta os itens dos quadros escolhidos. As colunas com o mesmo título viram uma só.</p>
          {podeEditar && <button className="fr-btn btn-primario" onClick={() => setEscolherQuadros(true)}><Database size={15} /> Escolher quadros</button>}
        </div>
      ) : carregando && !dados.length ? <div className="carregando">Carregando dados…</div> : !widgets.length ? (
        <div className="vazio-grande">
          <BarChart3 size={40} className="muted" />
          <h3>Nenhum widget ainda</h3>
          {podeEditar && <div className="form-acoes" style={{ justifyContent: 'center' }}>
            <button className="fr-btn" onClick={usarModelo}><Sparkles size={15} /> Usar modelo de vendas</button>
            <button className="fr-btn btn-primario" onClick={() => setEditando(widgetNovo())}><Plus size={15} /> Adicionar widget</button>
          </div>}
        </div>
      ) : (
        <div className="painel-grade">
          {widgets.map(w => (
            <CartaoWidget key={w.id} w={w} dados={visiveis} ctx={ctx} podeEditar={podeEditar}
              onEditar={() => setEditando(w)}
              onDuplicar={() => salvar({ widgets: [...widgets, { ...w, id: novoIdWidget(), titulo: `${w.titulo} (cópia)` }] })}
              onExcluir={async () => { if (await confirmar(`Excluir o widget “${w.titulo}”?`)) salvar({ widgets: widgets.filter(x => x.id !== w.id) }); }} />
          ))}
        </div>
      )}

      {editando && <EditorWidget inicial={editando} dados={dados} ctx={ctx} onFechar={() => setEditando(null)} onSalvar={w => { salvarWidget(w); setEditando(null); }} />}
      {escolherQuadros && <EscolherQuadros atuais={idsQuadros} onFechar={() => setEscolherQuadros(false)} onSalvar={ids => { salvar({ quadros: ids }); setEscolherQuadros(false); }} />}
    </div>
  );
}

const widgetNovo = (): Widget => ({ id: novoIdWidget(), titulo: '', tipo: 'numero', calculo: 'contagem', filtros: [] });

function MenuPainel({ onModelo, podeModelo, onExcluir }: { onModelo: () => void; podeModelo: boolean; onExcluir: () => void }) {
  const pop = usePopover<HTMLButtonElement>();
  return (
    <>
      <button ref={pop.ref} className="btn-icone" aria-label="Mais opções do painel" onClick={pop.alternar}><MoreHorizontal size={18} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={260}>
          <Menu onEscolher={pop.fechar} itens={[
            ...(podeModelo ? [{ rotulo: 'Acrescentar modelo de vendas', icone: <Sparkles size={15} />, onClick: onModelo }] : []),
            { rotulo: 'Excluir painel', icone: <Trash2 size={15} />, perigo: true, onClick: onExcluir },
          ]} />
        </Popover>
      )}
    </>
  );
}

function CartaoWidget({ w, dados, ctx, podeEditar, onEditar, onDuplicar, onExcluir }: {
  w: Widget; dados: DadosQuadro[]; ctx: { nomeUsuario: (id: unknown) => string }; podeEditar: boolean;
  onEditar: () => void; onDuplicar: () => void; onExcluir: () => void;
}) {
  const r = useMemo(() => calcularWidget(w, dados, ctx), [w, dados, ctx]);
  const pop = usePopover<HTMLButtonElement>();
  const filtros = (w.filtros ?? []).filter(f => f.valores.length);
  return (
    <section className={`painel-widget${w.largo ? ' largo' : ''}${w.tipo === 'numero' ? ' numero' : ''}`}>
      <header>
        <h3 title={w.titulo}>{w.titulo || 'Sem título'}</h3>
        {podeEditar && <button ref={pop.ref} className="btn-icone" aria-label={`Opções do widget ${w.titulo}`} onClick={pop.alternar}><MoreHorizontal size={16} /></button>}
        {pop.aberto && (
          <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={200}>
            <Menu onEscolher={pop.fechar} itens={[
              { rotulo: 'Editar', icone: <Pencil size={15} />, onClick: onEditar },
              { rotulo: 'Duplicar', icone: <Copy size={15} />, onClick: onDuplicar },
              'separador',
              { rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onClick: onExcluir },
            ]} />
          </Popover>
        )}
      </header>
      <p className="pw-como">{descrever(w)}{filtros.map(f => ` · ${nomeColuna(f.coluna)} ${f.negar ? 'não é' : 'é'} ${f.valores.join(' ou ')}`).join('')}</p>
      <Grafico w={w} r={r} />
      {(r.semEixo > 0 || r.semValor > 0 || r.faltando.length > 0) && (
        <ul className="pw-avisos">
          {r.semEixo > 0 && <li><AlertTriangle size={13} /> {r.semEixo} {r.semEixo === 1 ? 'item ficou' : 'itens ficaram'} de fora por não ter {nomeColuna(w.eixo)}.</li>}
          {r.semValor > 0 && <li><AlertTriangle size={13} /> {r.semValor} {r.semValor === 1 ? 'item está' : 'itens estão'} sem {w.valor} ({w.calculo === 'media' ? 'fora da média' : 'contam como zero'}).</li>}
          {r.faltando.map(f => <li key={f.quadro + f.coluna}><AlertTriangle size={13} /> “{f.quadro}” não tem a coluna {f.coluna}.</li>)}
        </ul>
      )}
    </section>
  );
}

function descrever(w: Widget) {
  const valor = w.calculo === 'contagem' ? 'Quantidade de itens' : `${NOME_CALCULO[w.calculo]} de ${w.valor ?? '?'}`;
  if (w.tipo === 'numero') return valor;
  return `${valor} por ${nomeColuna(w.eixo)}${w.tipo === 'barras' && w.pilha ? `, dividido por ${nomeColuna(w.pilha)}` : ''}`;
}

// ---------------------------------------------------------------- editor de widget
function EditorWidget({ inicial, dados, ctx, onSalvar, onFechar }: {
  inicial: Widget; dados: DadosQuadro[]; ctx: { nomeUsuario: (id: unknown) => string }; onSalvar: (w: Widget) => void; onFechar: () => void;
}) {
  const [w, setW] = useState<Widget>(inicial);
  const mudar = (m: Partial<Widget>) => setW(x => ({ ...x, ...m }));
  const cols = colunasDosQuadros(dados);
  const numericas = cols.filter(c => NUMERICAS.includes(c.tipo));
  const categoricas = cols.filter(c => CATEGORICAS.includes(c.tipo));
  const pilhaveis = cols.filter(c => ['status', 'pessoa', 'lista', 'caixa'].includes(c.tipo));
  const filtros = w.filtros ?? [];
  const mudarFiltro = (i: number, m: Partial<FiltroWidget>) => mudar({ filtros: filtros.map((f, k) => (k === i ? { ...f, ...m } : f)) });
  const precisaValor = w.calculo !== 'contagem';
  const ok = !!w.titulo.trim() && (!precisaValor || !!w.valor) && (w.tipo === 'numero' || !!w.eixo);
  const previa = useMemo(() => (ok ? calcularWidget(w, dados, ctx) : null), [ok, w, dados, ctx]);
  const opcaoCol = (c: { titulo: string; quadros: number }) => (
    <option key={c.titulo} value={c.titulo}>{c.titulo}{dados.length > 1 && c.quadros < dados.length ? ` (só em ${c.quadros} de ${dados.length} quadros)` : ''}</option>
  );

  return (
    <Modal titulo={inicial.titulo ? 'Editar widget' : 'Novo widget'} largura={760} onClose={onFechar}
      rodape={<><button className="fr-btn" onClick={onFechar}>Cancelar</button><button className="fr-btn btn-primario" disabled={!ok} onClick={() => onSalvar({ ...w, titulo: w.titulo.trim() })}>Salvar</button></>}>
      <div className="editor-widget">
        <div>
          <label className="campo-form">Título<input className="input-cheio" autoFocus value={w.titulo} placeholder="Ex.: Receita ganha" onChange={e => mudar({ titulo: e.target.value })} /></label>
          <div className="campo-form">Tipo
            <div className="seletor-tipos">
              {(Object.keys(NOME_TIPO) as TipoWidget[]).map(t => <button key={t} type="button" className={`chip-sub${w.tipo === t ? ' on' : ''}`} onClick={() => mudar({ tipo: t })}>{NOME_TIPO[t]}</button>)}
            </div>
          </div>
          <div className="campos-lado">
            <label className="campo-form">Calcular
              <select className="input-cheio" value={w.calculo} onChange={e => mudar({ calculo: e.target.value as Calculo })}>
                {(Object.keys(NOME_CALCULO) as Calculo[]).map(c => <option key={c} value={c}>{NOME_CALCULO[c]}</option>)}
              </select>
            </label>
            {precisaValor && (
              <label className="campo-form">Da coluna
                <select className="input-cheio" value={w.valor ?? ''} onChange={e => mudar({ valor: e.target.value || undefined })}>
                  <option value="">Escolha…</option>{numericas.map(opcaoCol)}
                </select>
              </label>
            )}
          </div>
          {w.tipo !== 'numero' && (
            <div className="campos-lado">
              <label className="campo-form">{w.tipo === 'pizza' ? 'Fatias por' : 'Agrupar por'}
                <select className="input-cheio" value={w.eixo ?? ''} onChange={e => mudar({ eixo: e.target.value || undefined })}>
                  <option value="">Escolha…</option><option value={GRUPO}>Grupo do quadro</option>{categoricas.map(opcaoCol)}
                </select>
              </label>
              {w.tipo === 'barras' && (
                <label className="campo-form">Dividir cada barra por
                  <select className="input-cheio" value={w.pilha ?? ''} onChange={e => mudar({ pilha: e.target.value || undefined })}>
                    <option value="">Não dividir</option>{pilhaveis.map(opcaoCol)}
                  </select>
                </label>
              )}
            </div>
          )}
          <div className="campo-form">Só contar itens em que…
            {filtros.map((f, i) => (
              <div key={i} className="filtro-widget">
                <div className="fw-linha">
                  <select className="input-cheio" value={f.coluna} onChange={e => mudarFiltro(i, { coluna: e.target.value, valores: [] })}>
                    <option value={GRUPO}>Grupo do quadro</option>{categoricas.map(opcaoCol)}
                  </select>
                  <select className="input-cheio fw-op" value={f.negar ? 'nao' : 'e'} onChange={e => mudarFiltro(i, { negar: e.target.value === 'nao' })}>
                    <option value="e">é</option><option value="nao">não é</option>
                  </select>
                  <button type="button" className="btn-icone" aria-label="Tirar filtro" onClick={() => mudar({ filtros: filtros.filter((_, k) => k !== i) })}><X size={15} /></button>
                </div>
                <div className="seletor-tipos">
                  {valoresDaColuna(dados, f.coluna, ctx).map(v => {
                    const on = f.valores.includes(v.chave);
                    return <button key={v.chave} type="button" className={`chip-sub${on ? ' on' : ''}`} onClick={() => mudarFiltro(i, { valores: on ? f.valores.filter(x => x !== v.chave) : [...f.valores, v.chave] })}>
                      {v.cor && <span className="pw-cor" style={{ background: v.cor }} />}{v.rotulo}
                    </button>;
                  })}
                </div>
              </div>
            ))}
            <button type="button" className="fr-btn-link" onClick={() => mudar({ filtros: [...filtros, { coluna: categoricas.find(c => c.tipo === 'status')?.titulo ?? GRUPO, valores: [] }] })}><Plus size={14} /> Adicionar condição</button>
          </div>
          {w.tipo !== 'numero' && <label className="check-form"><input type="checkbox" className="caixa" checked={!!w.largo} onChange={e => mudar({ largo: e.target.checked })} /> Ocupar a largura toda</label>}
        </div>
        <div className="editor-previa">
          <span className="muted small">Prévia</span>
          {previa ? <section className="painel-widget"><header><h3>{w.titulo}</h3></header><Grafico w={w} r={previa} /></section>
            : <p className="muted small">Preencha título{precisaValor ? ', coluna do valor' : ''}{w.tipo !== 'numero' ? ' e agrupamento' : ''} para ver a prévia.</p>}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- quadros de origem
function EscolherQuadros({ atuais, onSalvar, onFechar }: { atuais: number[]; onSalvar: (ids: number[]) => void; onFechar: () => void }) {
  const nav = useNav();
  const [sel, setSel] = useState<number[]>(atuais);
  const [busca, setBusca] = useState('');
  const quadros = nav.quadros.filter(q => q.tipo !== 'painel' && String(q.nome).toLowerCase().includes(busca.trim().toLowerCase()));
  const area = (id: unknown) => nav.areas.find(a => a.id === id)?.nome;
  return (
    <Modal titulo="Quadros do painel" largura={520} onClose={onFechar}
      rodape={<><button className="fr-btn" onClick={onFechar}>Cancelar</button><button className="fr-btn btn-primario" onClick={() => onSalvar(sel)}>Salvar ({sel.length})</button></>}>
      <p className="muted small">Os itens dos quadros marcados entram na conta. Colunas com o mesmo título (ex.: “Valor do negócio”) são somadas juntas.</p>
      <input className="input-cheio" placeholder="Buscar quadro" value={busca} onChange={e => setBusca(e.target.value)} />
      <div className="lista-quadros-painel">
        {quadros.map(q => (
          <label key={q.id} className="check-form">
            <input type="checkbox" className="caixa" checked={sel.includes(q.id)} onChange={e => setSel(s => (e.target.checked ? [...s, q.id] : s.filter(x => x !== q.id)))} />
            {q.nome}<span className="muted small">{area(q.area_id)}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
