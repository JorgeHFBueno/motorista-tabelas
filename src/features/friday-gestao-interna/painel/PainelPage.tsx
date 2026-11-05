import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from '../rotas.tsx';
import { AlertTriangle, ArrowDown, ArrowUp, BarChart3, CalendarRange, Copy, Database, Eye, Filter, HardHat, LayoutDashboard, Lock, MoreHorizontal, Pencil, PieChart, Plus, Sparkles, Star, Trash2, X } from 'lucide-react';
import { api, req, salvarFiltroGeralDoPainel, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { itensDoQuadro } from '../quadro/Celula.tsx';
import { Editavel, Menu, Modal, Popover, useConfirmar, usePopover } from '../ui/base.tsx';
import { fmtData } from '../util.ts';
import {
  calcularWidget, CATEGORICAS, colunasDosQuadros, DATAS, geralDiferente, GRUPO, itensDoWidget, NUMERICAS, TEM_EIXO, TEM_PILHA, valoresDaColuna,
  type Atalho, type Calculo, type ConfigPainel, type Ctx, type DadosQuadro, type FiltroGeral, type FiltroWidget, type Janela, type Periodo, type TipoWidget, type Widget,
} from './calculo.ts';
import { Grafico, type Selecao } from './Graficos.tsx';
import { etapasDoFunil, modeloObras, modeloVendas, novoIdWidget } from './modelos.ts';

const NOME_TIPO: Record<TipoWidget, string> = {
  numero: 'Número', pizza: 'Pizza', colunas: 'Colunas', barras: 'Barras', linha: 'Linha', bateria: 'Bateria', funil: 'Funil',
  pivo: 'Tabela dinâmica', matriz: 'Matriz', lista: 'Lista', carga: 'Carga de trabalho', texto: 'Texto',
};
const NOME_CALCULO: Record<Calculo, string> = { contagem: 'Quantidade de itens', soma: 'Soma', media: 'Média' };
const NOME_PERIODO: Record<Periodo, string> = { dia: 'Dia', semana: 'Semana', mes: 'Mês', trimestre: 'Trimestre', ano: 'Ano' };
const NOME_ATALHO: Record<Atalho, string> = {
  mes_atual: 'Mês atual', mes_anterior: 'Mês anterior', trimestre_atual: 'Trimestre atual', ano_atual: 'Este ano', ano_anterior: 'Ano anterior', ultimos_30: 'Últimos 30 dias', ultimos_90: 'Últimos 90 dias',
};
const nomeColuna = (t?: string) => (t === GRUPO ? 'Grupo do quadro' : t ?? '');
const descreverJanela = (j?: Janela) => {
  if (!j?.coluna) return '';
  if (j.atalho) return `${j.coluna}: ${NOME_ATALHO[j.atalho]}`;
  if (j.de || j.ate) return `${j.coluna}: ${j.de ? fmtData(j.de) : 'início'} a ${j.ate ? fmtData(j.ate) : 'hoje em diante'}`;
  return '';
};

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
  const [editarFiltros, setEditarFiltros] = useState(false);
  const [aberto, setAberto] = useState<{ w: Widget; sel: Selecao } | null>(null);
  // Mudar o filtro geral vale só na própria tela; quem edita pode salvar para todos.
  const [geralLocal, setGeralLocal] = useState<FiltroGeral | null>(null);
  const [nomesItens, setNomesItens] = useState<Map<number, string>>(new Map());

  const config = (painel?.config ?? {}) as ConfigPainel;
  const idsQuadros = useMemo(() => config.quadros ?? [], [config.quadros]);
  const widgets = config.widgets ?? [];
  const podeEditar = painel?.permissao === 'editar';
  const geral = geralLocal ?? config.geral ?? {};

  useEffect(() => {
    setPainel(null); setErro(''); setOcultos([]); setGeralLocal(null);
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

  // Nomes dos itens ligados, para agrupar por coluna de "Conectar quadros".
  useEffect(() => {
    const alvos = [...new Set(dados.flatMap(d => d.colunas).filter(c => c.tipo === 'ligacao' && c.config.quadro_id).map(c => Number(c.config.quadro_id)))];
    if (!alvos.length) return;
    let vivo = true;
    Promise.all(alvos.map(id => itensDoQuadro(id).catch(() => [] as Row[]))).then(listas => {
      if (vivo) setNomesItens(new Map(listas.flat().map(i => [Number(i.id), String(i.nome)])));
    });
    return () => { vivo = false; };
  }, [dados]);

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
  const ctx = useMemo<Ctx>(() => ({ nomeUsuario: nav.nomeUsuario, nomeItem: id => nomesItens.get(Number(id)) }), [nav.nomeUsuario, nomesItens]);

  if (erro) return <div className="vazio-grande"><h2>Painel não encontrado</h2><p className="muted">{erro}</p></div>;
  if (!painel) return <div className="carregando">Carregando painel…</div>;

  const salvarWidget = (w: Widget) => salvar({ widgets: widgets.some(x => x.id === w.id) ? widgets.map(x => (x.id === w.id ? w : x)) : [...widgets, w] });
  const usarModelo = async (nome: string, montar: (d: DadosQuadro[]) => Widget[]) => {
    if (widgets.length && !(await confirmar(`Acrescentar os widgets do modelo de ${nome} aos que já existem?`, 'Acrescentar'))) return;
    salvar({ widgets: [...widgets, ...montar(dados)] });
  };
  const usarVendas = () => usarModelo('vendas', modeloVendas);
  const usarObras = () => usarModelo('obras', modeloObras);
  const salvarGeralParaTodos = async () => {
    if (!geralLocal) return;
    await salvarFiltroGeralDoPainel(painelId, geralLocal);
    setPainel(p => (p ? { ...p, config: { ...(p.config as ConfigPainel), geral: geralLocal } } : p));
    setGeralLocal(null);
  };
  const irParaItem = (quadroId: number, itemId: number) => navigate(`/quadros/${quadroId}?item=${itemId}`);
  const moverWidget = (id: string, passo: number) => {
    const i = widgets.findIndex(x => x.id === id);
    const j = i + passo;
    if (i < 0 || j < 0 || j >= widgets.length) return;
    const nova = [...widgets];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    salvar({ widgets: nova });
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
          {podeEditar && <MenuPainel onVendas={usarVendas} onObras={usarObras} podeModelo={!!dados.length}
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
        {dados.length > 0 && widgets.length > 0 && <BarraGeral geral={geral} dados={dados} onMudar={setGeralLocal} onCondicoes={() => setEditarFiltros(true)} onSalvarParaTodos={podeEditar && geralLocal && geralDiferente(geralLocal, config.geral) ? salvarGeralParaTodos : undefined} />}
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
            <button className="fr-btn" onClick={usarVendas}><Sparkles size={15} /> Usar modelo de vendas</button>
            <button className="fr-btn" onClick={usarObras}><HardHat size={15} /> Usar modelo de obras</button>
            <button className="fr-btn btn-primario" onClick={() => setEditando(widgetNovo())}><Plus size={15} /> Adicionar widget</button>
          </div>}
        </div>
      ) : (
        <div className="painel-grade">
          {widgets.map((w, i) => (
            <CartaoWidget key={w.id} w={w} dados={visiveis} ctx={ctx} geral={geral} podeEditar={podeEditar} primeiro={i === 0} ultimo={i === widgets.length - 1}
              onAbrir={sel => setAberto({ w, sel })} onItem={irParaItem} onMover={passo => moverWidget(w.id, passo)}
              onEditar={() => setEditando(w)}
              onDuplicar={() => salvar({ widgets: [...widgets, { ...w, id: novoIdWidget(), titulo: w.titulo ? `${w.titulo} (cópia)` : '' }] })}
              onExcluir={async () => { if (await confirmar(`Excluir o widget “${w.titulo || NOME_TIPO[w.tipo]}”?`)) salvar({ widgets: widgets.filter(x => x.id !== w.id) }); }} />
          ))}
        </div>
      )}

      {editando && <EditorWidget inicial={editando} dados={dados} ctx={ctx} geral={geral} onFechar={() => setEditando(null)} onSalvar={w => { salvarWidget(w); setEditando(null); }} />}
      {escolherQuadros && <EscolherQuadros atuais={idsQuadros} onFechar={() => setEscolherQuadros(false)} onSalvar={ids => { salvar({ quadros: ids }); setEscolherQuadros(false); }} />}
      {editarFiltros && <CondicoesGerais inicial={geral.filtros ?? []} dados={dados} ctx={ctx} onFechar={() => setEditarFiltros(false)} onSalvar={filtros => { setGeralLocal({ ...geral, filtros }); setEditarFiltros(false); }} />}
      {aberto && <ItensAbertos {...aberto} dados={visiveis} ctx={ctx} geral={geral} onFechar={() => setAberto(null)} onItem={irParaItem} />}
    </div>
  );
}

const widgetNovo = (): Widget => ({ id: novoIdWidget(), titulo: '', tipo: 'numero', calculo: 'contagem', filtros: [] });

function MenuPainel({ onVendas, onObras, podeModelo, onExcluir }: { onVendas: () => void; onObras: () => void; podeModelo: boolean; onExcluir: () => void }) {
  const pop = usePopover<HTMLButtonElement>();
  return (
    <>
      <button ref={pop.ref} className="btn-icone" aria-label="Mais opções do painel" onClick={pop.alternar}><MoreHorizontal size={18} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={260}>
          <Menu onEscolher={pop.fechar} itens={[
            ...(podeModelo ? [
              { rotulo: 'Acrescentar modelo de vendas', icone: <Sparkles size={15} />, onClick: onVendas },
              { rotulo: 'Acrescentar modelo de obras', icone: <HardHat size={15} />, onClick: onObras },
            ] : []),
            { rotulo: 'Excluir painel', icone: <Trash2 size={15} />, perigo: true, onClick: onExcluir },
          ]} />
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------- filtro geral do painel
function SeletorJanela({ valor, colunas, onMudar, rotuloVazio }: { valor?: Janela; colunas: { titulo: string }[]; onMudar: (j: Janela | undefined) => void; rotuloVazio: string }) {
  const personalizado = !!valor?.coluna && !valor.atalho;
  return (
    <div className="seletor-janela">
      <select className="input-cheio" aria-label="Coluna de data" value={valor?.coluna ?? ''} onChange={e => onMudar(e.target.value ? { atalho: 'mes_atual', ...valor, coluna: e.target.value } : undefined)}>
        <option value="">{rotuloVazio}</option>
        {colunas.map(c => <option key={c.titulo} value={c.titulo}>{c.titulo}</option>)}
      </select>
      {valor?.coluna && (
        <select className="input-cheio" aria-label="Período" value={valor.atalho ?? ''} onChange={e => onMudar(e.target.value ? { coluna: valor.coluna, atalho: e.target.value as Atalho } : { coluna: valor.coluna })}>
          {(Object.keys(NOME_ATALHO) as Atalho[]).map(a => <option key={a} value={a}>{NOME_ATALHO[a]}</option>)}
          <option value="">Escolher datas</option>
        </select>
      )}
      {personalizado && (
        <>
          <input type="date" className="input-cheio" aria-label="De" value={valor.de ?? ''} onChange={e => onMudar({ ...valor, de: e.target.value || undefined })} />
          <input type="date" className="input-cheio" aria-label="Até" value={valor.ate ?? ''} onChange={e => onMudar({ ...valor, ate: e.target.value || undefined })} />
        </>
      )}
    </div>
  );
}

function BarraGeral({ geral, dados, onMudar, onCondicoes, onSalvarParaTodos }: { geral: FiltroGeral; dados: DadosQuadro[]; onMudar: (g: FiltroGeral) => void; onCondicoes: () => void; onSalvarParaTodos?: () => void }) {
  const datas = colunasDosQuadros(dados).filter(c => DATAS.includes(c.tipo));
  const filtros = (geral.filtros ?? []).filter(f => f.valores.length);
  return (
    <div className="painel-geral">
      <CalendarRange size={15} className="muted" />
      <SeletorJanela valor={geral.janela} colunas={datas} rotuloVazio="Qualquer data" onMudar={janela => onMudar({ ...geral, janela })} />
      <button className={`fr-btn btn-pequeno${filtros.length ? ' com-filtro' : ''}`} onClick={onCondicoes}><Filter size={14} /> Condições{filtros.length ? ` (${filtros.length})` : ''}</button>
      {(filtros.length > 0 || geral.janela) && <button className="fr-btn-link" onClick={() => onMudar({})}>Limpar</button>}
      {onSalvarParaTodos && <button className="fr-btn btn-pequeno" title="Sem salvar, o filtro vale só nesta tela" onClick={onSalvarParaTodos}>Salvar para todos</button>}
    </div>
  );
}

function EditorFiltros({ filtros, dados, ctx, onMudar }: { filtros: FiltroWidget[]; dados: DadosQuadro[]; ctx: Ctx; onMudar: (f: FiltroWidget[]) => void }) {
  const categoricas = colunasDosQuadros(dados).filter(c => CATEGORICAS.includes(c.tipo));
  const mudarFiltro = (i: number, m: Partial<FiltroWidget>) => onMudar(filtros.map((f, k) => (k === i ? { ...f, ...m } : f)));
  return (
    <>
      {filtros.map((f, i) => (
        <div key={i} className="filtro-widget">
          <div className="fw-linha">
            <select className="input-cheio" value={f.coluna} onChange={e => mudarFiltro(i, { coluna: e.target.value, valores: [] })}>
              <option value={GRUPO}>Grupo do quadro</option>{categoricas.map(c => <option key={c.titulo} value={c.titulo}>{c.titulo}</option>)}
            </select>
            <select className="input-cheio fw-op" value={f.negar ? 'nao' : 'e'} onChange={e => mudarFiltro(i, { negar: e.target.value === 'nao' })}>
              <option value="e">é</option><option value="nao">não é</option>
            </select>
            <button type="button" className="btn-icone" aria-label="Tirar filtro" onClick={() => onMudar(filtros.filter((_, k) => k !== i))}><X size={15} /></button>
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
      <button type="button" className="fr-btn-link" onClick={() => onMudar([...filtros, { coluna: categoricas.find(c => c.tipo === 'status')?.titulo ?? GRUPO, valores: [] }])}><Plus size={14} /> Adicionar condição</button>
    </>
  );
}

function CondicoesGerais({ inicial, dados, ctx, onSalvar, onFechar }: { inicial: FiltroWidget[]; dados: DadosQuadro[]; ctx: Ctx; onSalvar: (f: FiltroWidget[]) => void; onFechar: () => void }) {
  const [filtros, setFiltros] = useState(inicial);
  return (
    <Modal titulo="Condições do painel" largura={560} onClose={onFechar}
      rodape={<><button className="fr-btn" onClick={onFechar}>Cancelar</button><button className="fr-btn btn-primario" onClick={() => onSalvar(filtros.filter(f => f.valores.length))}>Aplicar</button></>}>
      <p className="muted small">Valem para todos os widgets, somadas às condições de cada um.</p>
      <div className="campo-form"><EditorFiltros filtros={filtros} dados={dados} ctx={ctx} onMudar={setFiltros} /></div>
    </Modal>
  );
}

// ---------------------------------------------------------------- cartão do widget
function CartaoWidget({ w, dados, ctx, geral, podeEditar, primeiro, ultimo, onAbrir, onItem, onMover, onEditar, onDuplicar, onExcluir }: {
  w: Widget; dados: DadosQuadro[]; ctx: Ctx; geral: FiltroGeral; podeEditar: boolean; primeiro: boolean; ultimo: boolean;
  onAbrir: (s: Selecao) => void; onItem: (quadroId: number, itemId: number) => void; onMover: (passo: number) => void;
  onEditar: () => void; onDuplicar: () => void; onExcluir: () => void;
}) {
  const r = useMemo(() => calcularWidget(w, dados, ctx, geral), [w, dados, ctx, geral]);
  const pop = usePopover<HTMLButtonElement>();
  const filtros = (w.filtros ?? []).filter(f => f.valores.length);
  const semTitulo = w.tipo === 'texto' && !w.titulo;
  const janelaUsada = w.janela?.coluna ? w.janela : w.ignorarGeral ? undefined : geral.janela;
  return (
    <section className={`painel-widget${w.largo ? ' largo' : ''}${w.tipo === 'numero' ? ' numero' : ''}${semTitulo ? ' sem-titulo' : ''}`}>
      <header>
        <h3 title={w.titulo}>{w.titulo || (semTitulo ? '' : 'Sem título')}</h3>
        {podeEditar && <button ref={pop.ref} className="btn-icone" aria-label={`Opções do widget ${w.titulo || NOME_TIPO[w.tipo]}`} onClick={pop.alternar}><MoreHorizontal size={16} /></button>}
        {pop.aberto && (
          <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={200}>
            <Menu onEscolher={pop.fechar} itens={[
              { rotulo: 'Editar', icone: <Pencil size={15} />, onClick: onEditar },
              { rotulo: 'Duplicar', icone: <Copy size={15} />, onClick: onDuplicar },
              ...(primeiro ? [] : [{ rotulo: 'Mover para antes', icone: <ArrowUp size={15} />, onClick: () => onMover(-1) }]),
              ...(ultimo ? [] : [{ rotulo: 'Mover para depois', icone: <ArrowDown size={15} />, onClick: () => onMover(1) }]),
              'separador',
              { rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onClick: onExcluir },
            ]} />
          </Popover>
        )}
      </header>
      {w.tipo !== 'texto' && <p className="pw-como">{descrever(w)}{filtros.map(f => ` · ${nomeColuna(f.coluna)} ${f.negar ? 'não é' : 'é'} ${f.valores.join(' ou ')}`).join('')}{descreverJanela(janelaUsada) ? ` · ${descreverJanela(janelaUsada)}` : ''}</p>}
      <Grafico w={w} r={r} onAbrir={onAbrir} onItem={onItem} />
      {(r.semEixo > 0 || r.semValor > 0 || r.faltando.length > 0 || ((w.comparar || w.tendencia) && !janelaUsada)) && (
        <ul className="pw-avisos">
          {r.semEixo > 0 && <li><AlertTriangle size={13} /> {r.semEixo} {r.semEixo === 1 ? 'item ficou' : 'itens ficaram'} de fora por não ter {nomeColuna(w.eixo)}.</li>}
          {r.semValor > 0 && <li><AlertTriangle size={13} /> {r.semValor} {r.semValor === 1 ? 'item está' : 'itens estão'} sem {w.valor} ({w.calculo === 'media' ? 'fora da média' : 'contam como zero'}).</li>}
          {r.faltando.map(f => <li key={f.quadro + f.coluna}><AlertTriangle size={13} /> “{f.quadro}” não tem a coluna {f.coluna}.</li>)}
          {(w.comparar || w.tendencia) && !janelaUsada && <li><AlertTriangle size={13} /> Escolha uma coluna de data e um período para comparar.</li>}
        </ul>
      )}
    </section>
  );
}

function descrever(w: Widget) {
  const valor = w.calculo === 'contagem' ? 'Quantidade de itens' : `${NOME_CALCULO[w.calculo]} de ${w.valor ?? '?'}`;
  const tempo = w.periodo && w.periodo !== 'mes' ? ` (${NOME_PERIODO[w.periodo].toLowerCase()})` : '';
  switch (w.tipo) {
    case 'numero': return valor;
    case 'matriz': return `${(w.colunas ?? []).length} colunas${w.soPendentes ? ', só com pendência' : ''}`;
    case 'lista': return w.dataAlerta ? `Ordem por ${w.ordenarPor ?? w.dataAlerta}${w.ocultarConcluidos ? ', sem os concluídos' : ''}` : `${(w.colunas ?? []).length} colunas`;
    case 'carga': return `${valor} por ${nomeColuna(w.eixo)} e ${w.data ?? '?'}${tempo}`;
    case 'bateria': return `${valor} por ${nomeColuna(w.eixo)}`;
    case 'funil': return `${valor} por ${nomeColuna(w.eixo)}`;
    case 'pivo': return `${valor}: ${nomeColuna(w.eixo)} x ${nomeColuna(w.pilha)}${tempo}`;
    default: return `${valor} por ${nomeColuna(w.eixo)}${tempo}${w.pilha && TEM_PILHA.includes(w.tipo) ? `, dividido por ${nomeColuna(w.pilha)}` : ''}`;
  }
}

// ---------------------------------------------------------------- itens por trás do número ou da barra
function ItensAbertos({ w, sel, dados, ctx, geral, onFechar, onItem }: { w: Widget; sel: Selecao; dados: DadosQuadro[]; ctx: Ctx; geral: FiltroGeral; onFechar: () => void; onItem: (q: number, i: number) => void }) {
  const itens = useMemo(() => itensDoWidget(w, dados, ctx, geral, sel), [w, dados, ctx, geral, sel]);
  return (
    <Modal titulo={sel.titulo || 'Itens'} largura={620} onClose={onFechar} rodape={<button className="fr-btn" onClick={onFechar}>Fechar</button>}>
      <p className="muted small">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</p>
      {!itens.length ? <p className="muted">Nenhum item.</p> : (
        <div className="pw-itens">
          {itens.map(i => (
            <button key={`${i.quadroId}-${i.id}`} className="pw-item" onClick={() => onItem(i.quadroId, i.id)}>
              <span className="pw-item-nome">{i.nome}<small className="muted">{i.quadro}{i.grupo ? ` · ${i.grupo}` : ''}</small></span>
              {i.valor && <span className="pw-num">{i.valor}</span>}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- editor de widget
const USA_CALCULO: TipoWidget[] = ['numero', 'pizza', 'colunas', 'barras', 'linha', 'bateria', 'funil', 'pivo', 'carga'];
const ROTULO_EIXO: Partial<Record<TipoWidget, string>> = { pizza: 'Fatias por', bateria: 'Coluna de status', funil: 'Coluna das etapas', pivo: 'Linhas', carga: 'Pessoa' };
const ROTULO_PILHA: Partial<Record<TipoWidget, string>> = { barras: 'Dividir cada barra por', colunas: 'Dividir cada coluna por', linha: 'Uma linha para cada', pivo: 'Colunas' };

function Grupo({ titulo, children }: { titulo: ReactNode; children: ReactNode }) {
  return <div className="campo-form">{titulo}{children}</div>;
}

function EditorWidget({ inicial, dados, ctx, geral, onSalvar, onFechar }: {
  inicial: Widget; dados: DadosQuadro[]; ctx: Ctx; geral: FiltroGeral; onSalvar: (w: Widget) => void; onFechar: () => void;
}) {
  const [w, setW] = useState<Widget>(inicial);
  const mudar = (m: Partial<Widget>) => setW(x => ({ ...x, ...m }));
  const cols = colunasDosQuadros(dados);
  const numericas = cols.filter(c => NUMERICAS.includes(c.tipo));
  const categoricas = cols.filter(c => CATEGORICAS.includes(c.tipo));
  const datas = cols.filter(c => DATAS.includes(c.tipo));
  const paraEixo = w.tipo === 'carga' ? cols.filter(c => c.tipo === 'pessoa') : w.tipo === 'bateria' || w.tipo === 'funil' ? cols.filter(c => ['status', 'lista'].includes(c.tipo)) : categoricas;
  const pilhaveis = cols.filter(c => (w.tipo === 'pivo' ? CATEGORICAS : ['status', 'pessoa', 'lista', 'caixa', 'ligacao']).includes(c.tipo));
  const usaCalculo = USA_CALCULO.includes(w.tipo);
  const calculos: Calculo[] = w.tipo === 'carga' || w.tipo === 'funil' || w.tipo === 'bateria' ? ['contagem', 'soma'] : ['contagem', 'soma', 'media'];
  const calculo = calculos.includes(w.calculo) ? w.calculo : 'contagem';
  const precisaValor = usaCalculo && calculo !== 'contagem';
  const temEixo = TEM_EIXO.includes(w.tipo);
  const temPilha = TEM_PILHA.includes(w.tipo);
  const ehTabela = w.tipo === 'matriz' || w.tipo === 'lista';
  const eixoData = cols.some(c => c.titulo === w.eixo && DATAS.includes(c.tipo)) || (temPilha && cols.some(c => c.titulo === w.pilha && DATAS.includes(c.tipo)));
  const ok = w.tipo === 'texto' ? !!w.texto?.trim()
    : !!w.titulo.trim() && (!precisaValor || !!w.valor) && (!temEixo || !!w.eixo) && (w.tipo !== 'pivo' || !!w.pilha)
      && (!ehTabela || !!w.colunas?.length || (w.tipo === 'lista' && !!w.dataAlerta)) && (w.tipo !== 'carga' || !!w.data);
  const final = useMemo<Widget>(() => ({ ...w, calculo }), [w, calculo]);
  const previa = useMemo(() => (ok ? calcularWidget(final, dados, ctx, geral) : null), [ok, final, dados, ctx, geral]);
  const opcaoCol = (c: { titulo: string; quadros: number }) => (
    <option key={c.titulo} value={c.titulo}>{c.titulo}{dados.length > 1 && c.quadros < dados.length ? ` (só em ${c.quadros} de ${dados.length} quadros)` : ''}</option>
  );
  const valores = useMemo(() => (w.eixo ? valoresDaColuna(dados, w.eixo, ctx) : []), [w.eixo, dados, ctx]);
  const trocarEtapa = (i: number, passo: number) => {
    const e = [...(w.etapas ?? [])];
    const j = i + passo;
    if (j < 0 || j >= e.length) return;
    [e[i], e[j]] = [e[j], e[i]];
    mudar({ etapas: e });
  };
  // Trocar a coluna das etapas já sugere a ordem natural do funil.
  const mudarEixo = (eixo?: string) => {
    if (w.tipo !== 'funil' || !eixo) return mudar({ eixo, feito: undefined });
    const rotulos = valoresDaColuna(dados, eixo, ctx).map(v => v.chave);
    const sugeridas = etapasDoFunil(rotulos);
    mudar({ eixo, etapas: sugeridas.length > 1 ? sugeridas : rotulos.filter(r => !/perd|cancel/i.test(r)) });
  };

  return (
    <Modal titulo={inicial.titulo || inicial.texto ? 'Editar widget' : 'Novo widget'} largura={820} onClose={onFechar}
      rodape={<><button className="fr-btn" onClick={onFechar}>Cancelar</button><button className="fr-btn btn-primario" disabled={!ok} onClick={() => onSalvar({ ...final, titulo: w.titulo.trim() })}>Salvar</button></>}>
      <div className="editor-widget">
        <div>
          <label className="campo-form">{w.tipo === 'texto' ? 'Título (opcional)' : 'Título'}<input className="input-cheio" autoFocus value={w.titulo} placeholder="Ex.: Receita ganha" onChange={e => mudar({ titulo: e.target.value })} /></label>
          <Grupo titulo="Tipo">
            <div className="seletor-tipos">
              {(Object.keys(NOME_TIPO) as TipoWidget[]).map(t => <button key={t} type="button" className={`chip-sub${w.tipo === t ? ' on' : ''}`} onClick={() => mudar({ tipo: t, eixo: t === 'carga' || t === 'bateria' || t === 'funil' ? undefined : w.eixo })}>{NOME_TIPO[t]}</button>)}
            </div>
          </Grupo>

          {w.tipo === 'texto' && <label className="campo-form">Texto<textarea className="input-cheio pw-area" rows={5} value={w.texto ?? ''} onChange={e => mudar({ texto: e.target.value })} /></label>}

          {usaCalculo && (
            <div className="campos-lado">
              <label className="campo-form">Calcular
                <select className="input-cheio" value={calculo} onChange={e => mudar({ calculo: e.target.value as Calculo })}>
                  {calculos.map(c => <option key={c} value={c}>{NOME_CALCULO[c]}</option>)}
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
          )}

          {temEixo && (
            <div className="campos-lado">
              <label className="campo-form">{ROTULO_EIXO[w.tipo] ?? 'Agrupar por'}
                <select className="input-cheio" value={w.eixo ?? ''} onChange={e => mudarEixo(e.target.value || undefined)}>
                  <option value="">Escolha…</option>{!['carga', 'bateria', 'funil'].includes(w.tipo) && <option value={GRUPO}>Grupo do quadro</option>}{paraEixo.map(opcaoCol)}
                </select>
              </label>
              {temPilha && (
                <label className="campo-form">{ROTULO_PILHA[w.tipo]}
                  <select className="input-cheio" value={w.pilha ?? ''} onChange={e => mudar({ pilha: e.target.value || undefined })}>
                    <option value="">{w.tipo === 'pivo' ? 'Escolha…' : 'Não dividir'}</option>{pilhaveis.map(opcaoCol)}
                  </select>
                </label>
              )}
            </div>
          )}

          {(eixoData || w.tipo === 'carga') && (
            <label className="campo-form">Agrupar as datas por
              <select className="input-cheio" value={w.periodo ?? (w.tipo === 'carga' ? 'semana' : 'mes')} onChange={e => mudar({ periodo: e.target.value as Periodo })}>
                {(w.tipo === 'carga' ? (['dia', 'semana', 'mes'] as Periodo[]) : (Object.keys(NOME_PERIODO) as Periodo[])).map(p => <option key={p} value={p}>{NOME_PERIODO[p]}</option>)}
              </select>
            </label>
          )}

          {['pizza', 'colunas', 'barras', 'pivo'].includes(w.tipo) && !eixoData && (
            <label className="campo-form">Ordem
              <select className="input-cheio" value={w.ordem ?? 'padrao'} onChange={e => mudar({ ordem: e.target.value as Widget['ordem'] })}>
                <option value="padrao">Ordem dos rótulos, ou do maior para o menor</option>
                <option value="maior">Maior para o menor</option>
                <option value="menor">Menor para o maior</option>
                <option value="alfabetica">Alfabética</option>
              </select>
            </label>
          )}

          {w.tipo === 'bateria' && !!w.eixo && (
            <Grupo titulo="Contam como feito (sem escolha: os rótulos marcados como concluído)">
              <div className="seletor-tipos">
                {valores.map(v => {
                  const on = w.feito?.includes(v.chave);
                  return <button key={v.chave} type="button" className={`chip-sub${on ? ' on' : ''}`} onClick={() => mudar({ feito: on ? w.feito!.filter(x => x !== v.chave) : [...(w.feito ?? []), v.chave] })}>{v.cor && <span className="pw-cor" style={{ background: v.cor }} />}{v.rotulo}</button>;
                })}
              </div>
            </Grupo>
          )}

          {w.tipo === 'funil' && !!w.eixo && (
            <Grupo titulo="Etapas, na ordem do funil">
              <div className="pw-etapas">
                {(w.etapas ?? []).map((e, i) => (
                  <div key={e} className="pw-etapa">
                    <span className="pw-rotulo">{e}</span>
                    <button type="button" className="btn-icone" aria-label={`Subir ${e}`} disabled={i === 0} onClick={() => trocarEtapa(i, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="btn-icone" aria-label={`Descer ${e}`} disabled={i === (w.etapas ?? []).length - 1} onClick={() => trocarEtapa(i, 1)}><ArrowDown size={14} /></button>
                    <button type="button" className="btn-icone" aria-label={`Tirar ${e}`} onClick={() => mudar({ etapas: w.etapas!.filter(x => x !== e) })}><X size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="seletor-tipos">
                {valores.filter(v => !w.etapas?.includes(v.chave)).map(v => <button key={v.chave} type="button" className="chip-sub" onClick={() => mudar({ etapas: [...(w.etapas ?? []), v.chave] })}><Plus size={12} /> {v.rotulo}</button>)}
              </div>
              <label className="check-form"><input type="checkbox" className="caixa" checked={w.acumular !== false} onChange={e => mudar({ acumular: e.target.checked })} /> Quem está numa etapa já passou pelas anteriores</label>
            </Grupo>
          )}

          {ehTabela && (
            <Grupo titulo="Colunas (clique na ordem em que devem aparecer)">
              <div className="seletor-tipos">
                {cols.map(c => {
                  const pos = w.colunas?.indexOf(c.titulo) ?? -1;
                  return <button key={c.titulo} type="button" className={`chip-sub${pos >= 0 ? ' on' : ''}`} onClick={() => mudar({ colunas: pos >= 0 ? w.colunas!.filter(x => x !== c.titulo) : [...(w.colunas ?? []), c.titulo] })}>{pos >= 0 ? `${pos + 1}. ` : ''}{c.titulo}</button>;
                })}
              </div>
            </Grupo>
          )}
          {w.tipo === 'matriz' && <label className="check-form"><input type="checkbox" className="caixa" checked={!!w.soPendentes} onChange={e => mudar({ soPendentes: e.target.checked })} /> Mostrar só as linhas com alguma coluna vazia</label>}
          {w.tipo === 'lista' && (
            <label className="campo-form">Coluna de vencimento (mostra dias e atraso)
              <select className="input-cheio" value={w.dataAlerta ?? ''} onChange={e => mudar({ dataAlerta: e.target.value || undefined })}>
                <option value="">Nenhuma</option>{datas.map(opcaoCol)}
              </select>
            </label>
          )}
          {ehTabela && (
            <div className="campos-lado">
              <label className="campo-form">Ordenar por
                <select className="input-cheio" value={w.ordenarPor ?? ''} onChange={e => mudar({ ordenarPor: e.target.value || undefined })}>
                  <option value="">{w.dataAlerta ? `${w.dataAlerta} (padrão)` : 'Nome do item'}</option>{cols.map(opcaoCol)}
                </select>
              </label>
              <label className="campo-form">Sentido
                <select className="input-cheio" value={w.direcao ?? 1} onChange={e => mudar({ direcao: Number(e.target.value) as 1 | -1 })}>
                  <option value={1}>Crescente</option><option value={-1}>Decrescente</option>
                </select>
              </label>
              <label className="campo-form">Mostrar no máximo
                <input type="number" min={1} className="input-cheio" value={w.limite ?? ''} placeholder="200" onChange={e => mudar({ limite: Number(e.target.value) || undefined })} />
              </label>
            </div>
          )}
          {w.tipo === 'carga' && (
            <div className="campos-lado">
              <label className="campo-form">Coluna de data ou período
                <select className="input-cheio" value={w.data ?? ''} onChange={e => mudar({ data: e.target.value || undefined })}>
                  <option value="">Escolha…</option>{datas.map(opcaoCol)}
                </select>
              </label>
              <label className="campo-form">Alerta acima de
                <input type="number" min={0} className="input-cheio" value={w.capacidade ?? ''} placeholder="Sem limite" onChange={e => mudar({ capacidade: Number(e.target.value) || undefined })} />
              </label>
            </div>
          )}
          {(w.tipo === 'lista' || w.tipo === 'carga') && <label className="check-form"><input type="checkbox" className="caixa" checked={w.tipo === 'carga' ? w.ocultarConcluidos !== false : !!w.ocultarConcluidos} onChange={e => mudar({ ocultarConcluidos: e.target.checked })} /> Tirar os itens concluídos</label>}

          {w.tipo === 'numero' && (
            <div className="campos-lado">
              <label className="campo-form">Comparar com
                <select className="input-cheio" value={w.comparar ?? ''} onChange={e => mudar({ comparar: (e.target.value || undefined) as Widget['comparar'] })}>
                  <option value="">Não comparar</option><option value="periodo_anterior">Período anterior</option><option value="ano_anterior">Mesmo período do ano anterior</option>
                </select>
              </label>
              <label className="check-form pw-check-meio"><input type="checkbox" className="caixa" checked={!!w.tendencia} onChange={e => mudar({ tendencia: e.target.checked })} /> Mini gráfico dos últimos 6 meses</label>
            </div>
          )}

          {w.tipo !== 'texto' && (
            <>
              {w.tipo !== 'carga' && <Grupo titulo="Período só deste widget"><SeletorJanela valor={w.janela} colunas={datas} rotuloVazio={geral.janela?.coluna ? 'Usar o do painel' : 'Qualquer data'} onMudar={janela => mudar({ janela })} /></Grupo>}
              <Grupo titulo="Só contar itens em que…"><EditorFiltros filtros={w.filtros ?? []} dados={dados} ctx={ctx} onMudar={filtros => mudar({ filtros })} /></Grupo>
              {(geral.janela?.coluna || !!geral.filtros?.length) && <label className="check-form"><input type="checkbox" className="caixa" checked={!!w.ignorarGeral} onChange={e => mudar({ ignorarGeral: e.target.checked })} /> Não aplicar o filtro geral do painel</label>}
            </>
          )}
          {w.tipo !== 'numero' && <label className="check-form"><input type="checkbox" className="caixa" checked={!!w.largo} onChange={e => mudar({ largo: e.target.checked })} /> Ocupar a largura toda</label>}
        </div>
        <div className="editor-previa">
          <span className="muted small">Prévia</span>
          {previa ? <section className="painel-widget"><header><h3>{w.titulo}</h3></header><Grafico w={final} r={previa} /></section>
            : <p className="muted small">Preencha os campos obrigatórios para ver a prévia.</p>}
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
