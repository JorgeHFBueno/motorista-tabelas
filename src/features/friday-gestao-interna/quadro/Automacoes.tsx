import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useNavigate } from '../rotas.tsx';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Copy, History, MoreHorizontal, Pencil, Plus, Search, Trash2, X, Zap,
} from 'lucide-react';
import { api, req, type Pessoa, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { Avatar, Menu, Modal, Popover, useConfirmar, usePopover } from '../ui/base.tsx';
import { corTexto } from '../util.ts';
import { tempoRelativo } from './Atualizacoes.tsx';
import { ehPrazo, infoTipo, statusPrincipal, type Coluna, type Grupo, type Rotulo } from './tipos.ts';
import { useQuadro } from './useQuadro.ts';

// ---------------------------------------------------------------- modelo (igual ao do servidor: server/src/automacoes.ts)
type Gatilho = { tipo: 'item_criado' | 'coluna_muda' | 'item_movido' | 'data_chega'; coluna_id?: number; grupo_id?: number | null; para?: string[]; de?: string[]; dias?: number; ponta?: 'inicio' | 'fim' };
type Condicao = { alvo: number | 'grupo'; op: string; valor?: unknown };
type Acao = {
  tipo: 'definir' | 'mover' | 'notificar' | 'subitem' | 'arquivar' | 'criar_item' | 'webhook';
  coluna_id?: number; valor?: unknown; modo?: 'substituir' | 'adicionar'; grupo_id?: number | null; quadro_id?: number;
  para?: string[]; coluna_pessoa?: number | null; texto?: string; nome?: string; url?: string;
};
type Automacao = { id?: number; quadro_id: number; nome?: string | null; ativa?: number; modo: 'todas' | 'qualquer'; gatilho: Gatilho; condicoes: Condicao[]; acoes: Acao[] } & Partial<Row>;
type Ctx = { colunas: Coluna[]; grupos: Grupo[]; usuarios: Pessoa[]; quadros: Row[] };

const GATILHOS: { tipo: Gatilho['tipo']; rotulo: string }[] = [
  { tipo: 'coluna_muda', rotulo: 'uma coluna mudar (ex.: Status)' },
  { tipo: 'item_criado', rotulo: 'um item for criado' },
  { tipo: 'item_movido', rotulo: 'um item for movido de grupo' },
  { tipo: 'data_chega', rotulo: 'uma data chegar (prazo)' },
];
const ACOES: { tipo: Acao['tipo']; rotulo: string }[] = [
  { tipo: 'definir', rotulo: 'Mudar o valor de uma coluna' },
  { tipo: 'mover', rotulo: 'Mover o item para um grupo' },
  { tipo: 'subitem', rotulo: 'Criar um subitem' },
  { tipo: 'criar_item', rotulo: 'Criar um item em outro quadro' },
  { tipo: 'arquivar', rotulo: 'Arquivar o item' },
  { tipo: 'webhook', rotulo: 'Enviar para um webhook (outro sistema)' },
];
// Tipos que podem ser gatilho "quando mudar", ter valor definido por ação e ser usados em condições.
const GATILHO_COLUNA = ['status', 'lista', 'pessoa', 'caixa', 'data', 'periodo', 'texto', 'numero', 'texto_longo', 'telefone', 'email', 'link', 'avaliacao', 'arquivos'];
const DEFINIVEIS = ['status', 'lista', 'pessoa', 'data', 'texto', 'texto_longo', 'numero', 'caixa', 'telefone', 'email', 'avaliacao'];
const CONDICIONAVEIS = ['status', 'lista', 'pessoa', 'caixa', 'data', 'periodo', 'texto', 'texto_longo', 'numero', 'telefone', 'email', 'link', 'avaliacao'];
const COM_VALORES = ['status', 'lista', 'pessoa', 'caixa'];

function operadores(tipo: string): { op: string; rotulo: string }[] {
  switch (tipo) {
    case 'grupo': return [{ op: 'e', rotulo: 'é' }, { op: 'nao_e', rotulo: 'não é' }];
    case 'status': return [{ op: 'e', rotulo: 'é' }, { op: 'nao_e', rotulo: 'não é' }, { op: 'concluido', rotulo: 'está concluído' }, { op: 'nao_concluido', rotulo: 'não está concluído' }, { op: 'vazio', rotulo: 'está vazio' }];
    case 'lista': case 'pessoa': return [{ op: 'e', rotulo: 'tem' }, { op: 'nao_e', rotulo: 'não tem' }, { op: 'vazio', rotulo: 'está vazio' }, { op: 'preenchido', rotulo: 'está preenchido' }];
    case 'caixa': return [{ op: 'marcada', rotulo: 'está marcada' }, { op: 'desmarcada', rotulo: 'está desmarcada' }];
    case 'numero': case 'avaliacao': return [{ op: 'igual', rotulo: 'é igual a' }, { op: 'maior', rotulo: 'é maior que' }, { op: 'menor', rotulo: 'é menor que' }, { op: 'vazio', rotulo: 'está vazio' }, { op: 'preenchido', rotulo: 'está preenchido' }];
    case 'data': case 'periodo': return [{ op: 'antes_hoje', rotulo: 'já passou' }, { op: 'hoje', rotulo: 'é hoje' }, { op: 'depois_hoje', rotulo: 'ainda vai chegar' }, { op: 'vazio', rotulo: 'está vazia' }, { op: 'preenchido', rotulo: 'está preenchida' }];
    default: return [{ op: 'contem', rotulo: 'contém' }, { op: 'igual', rotulo: 'é igual a' }, { op: 'vazio', rotulo: 'está vazio' }, { op: 'preenchido', rotulo: 'está preenchido' }];
  }
}
const precisaValor = (op: string) => !['vazio', 'preenchido', 'concluido', 'nao_concluido', 'marcada', 'desmarcada', 'antes_hoje', 'hoje', 'depois_hoje'].includes(op);

// Opções de valor de uma coluna (rótulos, opções, pessoas ou marcada/desmarcada).
function opcoesDe(c: Coluna | undefined, ctx: Ctx, comCriador = false): { id: string; texto: string; cor?: string }[] {
  if (!c) return [];
  if (c.tipo === 'status') {
    const rs = (c.config.rotulos ?? []) as Rotulo[];
    return [...rs.filter(r => r.id !== '0'), ...rs.filter(r => r.id === '0')].map(r => ({ id: r.id, texto: r.texto || 'Sem rótulo', cor: r.id === '0' ? '#c4c4c4' : r.cor }));
  }
  if (c.tipo === 'lista') return ((c.config.opcoes ?? []) as Rotulo[]).map(o => ({ id: o.id, texto: o.texto }));
  if (c.tipo === 'pessoa') return [...(comCriador ? [{ id: '0', texto: 'Quem criou o item' }] : []), ...ctx.usuarios.filter(u => u.ativo).map(u => ({ id: u.id, texto: u.nome, cor: u.cor }))];
  if (c.tipo === 'caixa') return [{ id: '1', texto: 'Marcada' }, { id: '0', texto: 'Desmarcada' }];
  return [];
}
const nomesDe = (c: Coluna | undefined, ids: unknown, ctx: Ctx) => {
  const ops = opcoesDe(c, ctx, true);
  return ((Array.isArray(ids) ? ids : ids == null ? [] : [ids]) as unknown[]).map(id => ops.find(o => o.id === String(id))?.texto ?? '?').join(' ou ');
};

// ---------------------------------------------------------------- frase legível ("Quando… e só se… então…")
const B = ({ children }: { children: ReactNode }) => <b className="auto-token">{children}</b>;
function fraseGatilho(g: Gatilho, ctx: Ctx): ReactNode {
  const col = ctx.colunas.find(c => c.id === g.coluna_id);
  const grupo = ctx.grupos.find(x => x.id === g.grupo_id);
  switch (g.tipo) {
    case 'item_criado': return <>Quando um item for <B>criado</B>{grupo && <> no grupo <B>{grupo.nome}</B></>}</>;
    case 'item_movido': return <>Quando um item for <B>movido</B>{grupo ? <> para <B>{grupo.nome}</B></> : ' de grupo'}</>;
    case 'coluna_muda': return <>Quando <B>{col?.titulo ?? '[coluna]'}</B> mudar{g.para?.length ? <> para <B>{nomesDe(col, g.para, ctx)}</B></> : ''}</>;
    case 'data_chega': {
      const d = Number(g.dias ?? 0);
      const nome = <B>{col?.titulo ?? '[data]'}{col?.tipo === 'periodo' ? (g.ponta === 'inicio' ? ' (início)' : ' (fim)') : ''}</B>;
      return d === 0 ? <>Quando chegar a data de {nome}</> : <><B>{Math.abs(d)} {Math.abs(d) === 1 ? 'dia' : 'dias'} {d < 0 ? 'antes' : 'depois'}</B> de {nome}</>;
    }
  }
}
function fraseCondicao(c: Condicao, ctx: Ctx): ReactNode {
  if (c.alvo === 'grupo') return <>o grupo {c.op === 'nao_e' ? 'não é' : 'é'} <B>{((c.valor ?? []) as number[]).map(id => ctx.grupos.find(g => g.id === id)?.nome ?? '?').join(' ou ')}</B></>;
  const col = ctx.colunas.find(x => x.id === c.alvo);
  const op = operadores(col?.tipo ?? '').find(o => o.op === c.op)?.rotulo ?? c.op;
  const valor = !precisaValor(c.op) ? null : COM_VALORES.includes(col?.tipo ?? '') ? nomesDe(col, c.valor, ctx) : String(c.valor ?? '');
  return <><B>{col?.titulo ?? '[coluna]'}</B> {op}{valor != null && <> <B>{valor || '…'}</B></>}</>;
}
function fraseAcao(a: Acao, ctx: Ctx): ReactNode {
  const col = ctx.colunas.find(c => c.id === a.coluna_id);
  switch (a.tipo) {
    case 'definir': {
      if (a.valor == null) return <>limpe <B>{col?.titulo ?? '[coluna]'}</B></>;
      let v: ReactNode = String(a.valor);
      if (COM_VALORES.includes(col?.tipo ?? '')) v = nomesDe(col, col?.tipo === 'caixa' ? (a.valor ? '1' : '0') : a.valor, ctx).replace(/ ou /g, ', ');
      if (col?.tipo === 'data') { const r = Number((a.valor as { relativo?: number }).relativo ?? 0); v = typeof a.valor === 'object' ? (r ? `hoje + ${r} ${Math.abs(r) === 1 ? 'dia' : 'dias'}` : 'hoje') : String(a.valor); }
      return a.modo === 'adicionar' ? <>adicione <B>{v}</B> em <B>{col?.titulo ?? '[coluna]'}</B></> : <>mude <B>{col?.titulo ?? '[coluna]'}</B> para <B>{v}</B></>;
    }
    case 'mover': return <>mova o item para <B>{ctx.grupos.find(g => g.id === a.grupo_id)?.nome ?? '[grupo]'}</B></>;
    case 'notificar': {
      const quem = [...(a.para ?? []).map(id => String(ctx.usuarios.find(u => u.id === id)?.nome ?? '?')), ...(a.coluna_pessoa ? [`as pessoas de ${ctx.colunas.find(c => c.id === a.coluna_pessoa)?.titulo ?? '?'}`] : [])];
      return <>avise <B>{quem.join(', ') || '[pessoas]'}</B></>;
    }
    case 'subitem': return <>crie o subitem <B>{a.nome || '…'}</B></>;
    case 'criar_item': return <>crie um item em <B>{String(ctx.quadros.find(q => q.id === a.quadro_id)?.nome ?? '[quadro]')}</B></>;
    case 'arquivar': return <><B>arquive</B> o item</>;
    case 'webhook': return <>envie para o <B>webhook</B></>;
  }
}
function Frase({ a, ctx }: { a: Automacao; ctx: Ctx }) {
  return (
    <span className="auto-frase">
      {fraseGatilho(a.gatilho, ctx)}
      {a.condicoes.length > 0 && <>, e só se {a.condicoes.map((c, k) => <Fragment key={k}>{k > 0 && (a.modo === 'qualquer' ? ' ou ' : ' e ')}{fraseCondicao(c, ctx)}</Fragment>)}</>}
      , então {a.acoes.length ? a.acoes.map((x, k) => <Fragment key={k}>{k > 0 && (k === a.acoes.length - 1 ? ' e ' : ', ')}{fraseAcao(x, ctx)}</Fragment>) : <B>[ação]</B>}.
    </span>
  );
}

// O que falta preencher (null = pronto para salvar).
function pendencia(a: Automacao): string | null {
  const g = a.gatilho;
  if ((g.tipo === 'coluna_muda' || g.tipo === 'data_chega') && !g.coluna_id) return 'Escolha a coluna do “Quando”.';
  for (const c of a.condicoes) if (precisaValor(c.op) && (c.valor == null || c.valor === '' || (Array.isArray(c.valor) && !c.valor.length))) return 'Complete as condições (ou remova as que sobraram).';
  if (!a.acoes.length) return 'Adicione pelo menos uma ação.';
  for (const x of a.acoes) {
    if (x.tipo === 'definir' && !x.coluna_id) return 'Escolha a coluna que a ação vai mudar.';
    if (x.tipo === 'mover' && !x.grupo_id) return 'Escolha o grupo de destino.';
    if (x.tipo === 'notificar' && !(x.para?.length) && !x.coluna_pessoa) return 'Escolha quem vai ser avisado.';
    if (x.tipo === 'criar_item' && !x.quadro_id) return 'Escolha o quadro onde o item vai ser criado.';
    if (x.tipo === 'webhook' && !/^https?:\/\//i.test(x.url ?? '')) return 'Informe o endereço do webhook (https://…).';
  }
  return null;
}

// ---------------------------------------------------------------- modelos prontos
function modelos(ctx: Ctx, quadroId: number): { titulo: string; a: Automacao }[] {
  const st = statusPrincipal(ctx.colunas);
  const feitos = ((st?.config.rotulos ?? []) as Rotulo[]).filter(r => r.concluido).map(r => r.id);
  const pessoaCol = ctx.colunas.find(c => c.tipo === 'pessoa');
  const base = (gatilho: Gatilho, acoes: Acao[]): Automacao => ({ quadro_id: quadroId, modo: 'todas', gatilho, condicoes: [], acoes });
  return [
    { titulo: 'Quando o status mudar, mover o item para um grupo', a: base({ tipo: 'coluna_muda', coluna_id: st?.id, para: [] }, [{ tipo: 'mover' }]) },
    { titulo: 'Quando ficar concluído, arquivar o item', a: base({ tipo: 'coluna_muda', coluna_id: st?.id, para: feitos }, [{ tipo: 'arquivar' }]) },
    { titulo: 'Quando um item for criado, atribuir quem criou', a: base({ tipo: 'item_criado' }, [{ tipo: 'definir', coluna_id: pessoaCol?.id, valor: ['0'], modo: 'adicionar' }]) },
    { titulo: 'Quando um item for criado, criar subitens de etapas', a: base({ tipo: 'item_criado' }, [{ tipo: 'subitem', nome: 'Etapa 1' }]) },
  ];
}

// ---------------------------------------------------------------- página
export default function AutomacoesPage() {
  const quadroId = Number(useParams().id);
  const nav = useNav();
  const navigate = useNavigate();
  const confirmar = useConfirmar();
  const q = useQuadro(quadroId);
  const [lista, setLista] = useState<Automacao[] | null>(null);
  const [historico, setHistorico] = useState<Row[] | null>(null);
  const [aba, setAba] = useState<'lista' | 'historico'>('lista');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Automacao | null>(null);
  const [escolherModelo, setEscolherModelo] = useState(false);

  const carregar = useCallback(() => {
    req<Automacao[]>('GET', `quadros/${quadroId}/automacoes`).then(setLista);
    api.list('execucoes', { quadro_id: quadroId, _limite: 300 }).then(setHistorico);
  }, [quadroId]);
  useEffect(carregar, [carregar]);

  const ctx: Ctx = useMemo(() => ({ colunas: q.dados?.colunas ?? [], grupos: q.dados?.grupos ?? [], usuarios: nav.usuarios, quadros: nav.quadros }), [q.dados, nav.usuarios, nav.quadros]);
  if (q.erro) return <div className="vazio-grande"><h2>Quadro não encontrado</h2></div>;
  if (!q.dados || !lista) return <div className="carregando">Carregando automações…</div>;
  const quadro = q.dados.quadro;
  const filtradas = lista.filter(a => !busca.trim() || `${a.nome ?? ''} ${JSON.stringify(a)}`.toLowerCase().includes(busca.trim().toLowerCase()));
  const nomeAuto = (id: number) => { const a = lista.find(x => x.id === id); return a ? a.nome || `Automação ${a.id}` : 'Automação excluída'; };

  const salvar = async (a: Automacao) => {
    const corpo = { quadro_id: quadroId, nome: a.nome || null, modo: a.modo, gatilho: a.gatilho, condicoes: a.condicoes, acoes: a.acoes, ativa: a.ativa ?? 1 };
    if (a.id) await api.update('automacoes', a.id, corpo); else await api.create('automacoes', corpo);
    setEditando(null);
    carregar();
  };
  const alternar = async (a: Automacao) => {
    setLista(l => l && l.map(x => (x.id === a.id ? { ...x, ativa: a.ativa ? 0 : 1 } : x)));
    await api.update('automacoes', a.id!, { ativa: a.ativa ? 0 : 1 });
  };

  return (
    <div className="pagina pagina-automacoes">
      <button className="fr-btn-link voltar" onClick={() => navigate(`/quadros/${quadroId}`)}><ArrowLeft size={15} /> {quadro.nome}</button>
      <header className="pagina-cab">
        <div>
          <h1><Zap size={22} className="ic-auto" /> Automações</h1>
          <p className="muted">Regras do quadro: <b>quando</b> algo acontecer, <b>e só se</b> as condições baterem, <b>então</b> o app faz as ações sozinho.</p>
          <p className="aviso-leitura">As regras já podem ser criadas, mas ainda não rodam: a execução chega na etapa de automações.</p>
        </div>
        <button className="fr-btn btn-primario" onClick={() => setEscolherModelo(true)}><Plus size={16} /> Criar automação</button>
      </header>
      <nav className="abas-visoes arquivo-abas">
        <button className={`aba-visao${aba === 'lista' ? ' on' : ''}`} onClick={() => setAba('lista')}><Zap size={15} /> Automações ({lista.length})</button>
        <button className={`aba-visao${aba === 'historico' ? ' on' : ''}`} onClick={() => setAba('historico')}><History size={15} /> Histórico</button>
      </nav>

      {aba === 'lista' && (
        <>
          {lista.length > 0 && <label className="busca-barra arquivo-busca"><Search size={15} /><input placeholder="Buscar automação" value={busca} onChange={e => setBusca(e.target.value)} /></label>}
          {!lista.length && (
            <div className="vazio-painel"><Zap size={36} /><p>Nenhuma automação neste quadro.</p><small>Comece por um modelo pronto ou monte a sua: “Quando o Status mudar para Feito, mova o item para Concluídos”.</small>
              <button className="fr-btn btn-primario" style={{ marginTop: 10 }} onClick={() => setEscolherModelo(true)}><Plus size={16} /> Criar automação</button></div>
          )}
          <div className="auto-lista">
            {filtradas.map(a => (
              <CartaoAutomacao key={a.id} a={a} ctx={ctx} onAlternar={() => alternar(a)} onEditar={() => setEditando(structuredClone(a))}
                onDuplicar={() => setEditando({ ...structuredClone(a), id: undefined, nome: a.nome ? `${a.nome} (cópia)` : null })}
                onExcluir={async () => { if (await confirmar('Excluir esta automação? O histórico dela também é apagado.')) { await api.remove('automacoes', a.id!); carregar(); } }} />
            ))}
          </div>
        </>
      )}

      {aba === 'historico' && (
        !historico?.length ? <div className="vazio-painel"><History size={36} /><p>Nenhuma execução ainda.</p></div> : (
          <div className="arquivo-lista">
            {historico.map(h => (
              <div key={h.id} className="arquivo-linha">
                <span className={`arquivo-ic${h.ok ? ' ok' : ' erro'}`}>{h.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span>
                <div className="arquivo-nome">
                  <strong>{nomeAuto(h.automacao_id)}</strong>
                  <small className="muted">Item <button className="fr-btn-link" onClick={() => navigate(`/quadros/${quadroId}?item=${h.item_id}`)}>{h.item_nome}</button> · {h.detalhe}</small>
                </div>
                <small className="muted arquivo-quando">{tempoRelativo(h.criado_em)}</small>
              </div>
            ))}
          </div>
        )
      )}

      {escolherModelo && (
        <Modal titulo="Criar automação" largura={640} onClose={() => setEscolherModelo(false)}>
          <p className="muted fr-small">Comece por um modelo e ajuste os detalhes, ou monte do zero.</p>
          <div className="auto-modelos">
            {modelos(ctx, quadroId).map(m => (
              <button key={m.titulo} className="auto-modelo" onClick={() => { setEscolherModelo(false); setEditando(m.a); }}><Zap size={16} /> {m.titulo}</button>
            ))}
            <button className="auto-modelo zero" onClick={() => { setEscolherModelo(false); setEditando({ quadro_id: quadroId, modo: 'todas', gatilho: { tipo: 'coluna_muda' }, condicoes: [], acoes: [] }); }}><Plus size={16} /> Começar do zero</button>
          </div>
        </Modal>
      )}
      {editando && <EditorAutomacao inicial={editando} ctx={ctx} onSalvar={salvar} onFechar={() => setEditando(null)} />}
    </div>
  );
}

function CartaoAutomacao({ a, ctx, onAlternar, onEditar, onDuplicar, onExcluir }: { a: Automacao; ctx: Ctx; onAlternar: () => void; onEditar: () => void; onDuplicar: () => void; onExcluir: () => void }) {
  const pop = usePopover<HTMLButtonElement>();
  const autor = ctx.usuarios.find(u => u.id === a.criado_por);
  return (
    <div className={`auto-cartao${a.ativa ? '' : ' desligada'}`}>
      <div className="auto-cartao-corpo" onClick={onEditar}>
        {a.nome && <div className="auto-nome">{a.nome}</div>}
        <Frase a={a} ctx={ctx} />
        <div className="auto-meta muted fr-small">
          {autor && <span><Avatar nome={autor.nome} cor={autor.cor} tamanho={18} /> {autor.nome}</span>}
          <span>{a.n_execucoes ? `rodou ${a.n_execucoes} ${a.n_execucoes === 1 ? 'vez' : 'vezes'}` : 'ainda não rodou'}</span>
          {a.ultima_execucao && <span>última {tempoRelativo(a.ultima_execucao)}</span>}
          {a.n_erros ? <span className="texto-alerta"><AlertTriangle size={12} /> {a.n_erros} com erro</span> : null}
        </div>
      </div>
      <label className="chave" title={a.ativa ? 'Ligada (clique para desligar)' : 'Desligada (clique para ligar)'}>
        <input type="checkbox" checked={!!a.ativa} onChange={onAlternar} aria-label={a.ativa ? 'Desligar automação' : 'Ligar automação'} /><span />
      </label>
      <button ref={pop.ref} className="btn-icone" aria-label="Menu da automação" onClick={pop.alternar}><MoreHorizontal size={18} /></button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={190}>
          <Menu onEscolher={pop.fechar} itens={[
            { rotulo: 'Editar', icone: <Pencil size={15} />, onClick: onEditar },
            { rotulo: 'Duplicar', icone: <Copy size={15} />, onClick: onDuplicar },
            'separador',
            { rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onClick: onExcluir },
          ]} />
        </Popover>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- editor
function EditorAutomacao({ inicial, ctx, onSalvar, onFechar }: { inicial: Automacao; ctx: Ctx; onSalvar: (a: Automacao) => Promise<void>; onFechar: () => void }) {
  const [a, setA] = useState<Automacao>(inicial);
  const [salvando, setSalvando] = useState(false);
  const falta = pendencia(a);
  const g = a.gatilho;
  const setG = (m: Partial<Gatilho>) => setA(x => ({ ...x, gatilho: { ...x.gatilho, ...m } }));
  const colG = ctx.colunas.find(c => c.id === g.coluna_id);
  const setCond = (k: number, m: Partial<Condicao>) => setA(x => ({ ...x, condicoes: x.condicoes.map((c, j) => (j === k ? { ...c, ...m } : c)) }));
  const setAcao = (k: number, m: Partial<Acao>) => setA(x => ({ ...x, acoes: x.acoes.map((c, j) => (j === k ? { ...c, ...m } : c)) }));
  const colsDe = (tipos: string[]) => ctx.colunas.filter(c => tipos.includes(c.tipo));

  return (
    <Modal titulo={<><Zap size={18} /> {inicial.id ? 'Editar automação' : 'Nova automação'}</>} largura={820} onClose={onFechar}
      rodape={<>
        <span className={`fr-small espaco ${falta ? 'texto-alerta' : 'muted'}`}>{falta ?? 'Pronta para salvar.'}</span>
        <button className="fr-btn" onClick={onFechar}>Cancelar</button>
        <button className="fr-btn btn-primario" disabled={!!falta || salvando} onClick={async () => { setSalvando(true); try { await onSalvar(a); } finally { setSalvando(false); } }}>Salvar automação</button>
      </>}>
      <div className="auto-previa"><Frase a={a} ctx={ctx} /></div>

      {/* ---- Quando */}
      <section className="auto-bloco">
        <h4>Quando</h4>
        <div className="auto-linha">
          <select value={g.tipo} onChange={e => setA(x => ({ ...x, gatilho: { tipo: e.target.value as Gatilho['tipo'] } }))}>
            {GATILHOS.map(t => <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>)}
          </select>
          {g.tipo === 'coluna_muda' && (
            <select value={g.coluna_id ?? ''} onChange={e => setG({ coluna_id: Number(e.target.value) || undefined, para: [], de: [] })}>
              <option value="">Escolha a coluna…</option>
              {colsDe(GATILHO_COLUNA).map(c => <option key={c.id} value={c.id}>{c.titulo} ({infoTipo(c.tipo).rotulo.toLowerCase()})</option>)}
            </select>
          )}
          {(g.tipo === 'item_criado' || g.tipo === 'item_movido') && (
            <select value={g.grupo_id ?? ''} onChange={e => setG({ grupo_id: Number(e.target.value) || null })}>
              <option value="">{g.tipo === 'item_criado' ? 'em qualquer grupo' : 'para qualquer grupo'}</option>
              {ctx.grupos.map(x => <option key={x.id} value={x.id}>{g.tipo === 'item_criado' ? 'no grupo' : 'para'} {x.nome}</option>)}
            </select>
          )}
          {g.tipo === 'data_chega' && (
            <>
              <select value={g.coluna_id ?? ''} onChange={e => setG({ coluna_id: Number(e.target.value) || undefined })}>
                <option value="">Escolha a data…</option>
                {colsDe(['data', 'periodo']).map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
              </select>
              {colG?.tipo === 'periodo' && (
                <select value={g.ponta ?? 'fim'} onChange={e => setG({ ponta: e.target.value as 'inicio' | 'fim' })}><option value="inicio">início</option><option value="fim">fim</option></select>
              )}
              <select value={Number(g.dias ?? 0) === 0 ? 'no' : Number(g.dias) < 0 ? 'antes' : 'depois'}
                onChange={e => setG({ dias: e.target.value === 'no' ? 0 : (e.target.value === 'antes' ? -1 : 1) * Math.max(1, Math.abs(Number(g.dias ?? 1)) || 1) })}>
                <option value="no">no próprio dia</option><option value="antes">dias antes</option><option value="depois">dias depois</option>
              </select>
              {Number(g.dias ?? 0) !== 0 && <input type="number" min={1} max={365} className="auto-num" value={Math.abs(Number(g.dias))} onChange={e => setG({ dias: Math.sign(Number(g.dias)) * Math.max(1, Number(e.target.value) || 1) })} />}
            </>
          )}
        </div>
        {g.tipo === 'coluna_muda' && colG && COM_VALORES.includes(colG.tipo) && (
          <div className="auto-linha">
            <span className="muted fr-small">mudar para (deixe vazio para qualquer mudança):</span>
            <Escolha opcoes={opcoesDe(colG, ctx)} valor={g.para ?? []} onMudar={para => setG({ para })} />
          </div>
        )}
        {g.tipo === 'data_chega' && <p className="muted fr-small">Roda uma vez por item, no dia certo (o app confere as datas a cada 10 minutos).</p>}
      </section>

      {/* ---- E só se */}
      <section className="auto-bloco">
        <h4>E só se <span className="muted fr-small">(opcional)</span></h4>
        {a.condicoes.length > 1 && (
          <div className="auto-linha">
            <select value={a.modo} onChange={e => setA(x => ({ ...x, modo: e.target.value as 'todas' | 'qualquer' }))}>
              <option value="todas">todas as condições valerem</option><option value="qualquer">qualquer uma valer</option>
            </select>
          </div>
        )}
        {a.condicoes.map((c, k) => {
          const col = c.alvo === 'grupo' ? undefined : ctx.colunas.find(x => x.id === c.alvo);
          const tipo = c.alvo === 'grupo' ? 'grupo' : col?.tipo ?? '';
          return (
            <div key={k} className="auto-linha auto-item">
              <select value={String(c.alvo)} onChange={e => { const alvo = e.target.value === 'grupo' ? 'grupo' : Number(e.target.value); const t = alvo === 'grupo' ? 'grupo' : ctx.colunas.find(x => x.id === alvo)?.tipo ?? ''; setCond(k, { alvo, op: operadores(t)[0].op, valor: undefined }); }}>
                <option value="grupo">Grupo</option>
                {colsDe(CONDICIONAVEIS).map(x => <option key={x.id} value={x.id}>{x.titulo}</option>)}
              </select>
              <select value={c.op} onChange={e => setCond(k, { op: e.target.value })}>
                {operadores(tipo).map(o => <option key={o.op} value={o.op}>{o.rotulo}</option>)}
              </select>
              {precisaValor(c.op) && (tipo === 'grupo'
                ? <Escolha opcoes={ctx.grupos.map(x => ({ id: String(x.id), texto: x.nome, cor: x.cor }))} valor={((c.valor ?? []) as number[]).map(String)} onMudar={v => setCond(k, { valor: v.map(Number) })} />
                : COM_VALORES.includes(tipo) ? <Escolha opcoes={opcoesDe(col, ctx)} valor={((c.valor ?? []) as unknown[]).map(String)} onMudar={v => setCond(k, { valor: v })} />
                : <input className="auto-texto" type={tipo === 'numero' || tipo === 'avaliacao' ? 'number' : 'text'} value={String(c.valor ?? '')} onChange={e => setCond(k, { valor: e.target.value })} />)}
              <button className="btn-icone" aria-label="Remover condição" onClick={() => setA(x => ({ ...x, condicoes: x.condicoes.filter((_, j) => j !== k) }))}><X size={15} /></button>
            </div>
          );
        })}
        <button className="fr-btn-link" onClick={() => setA(x => ({ ...x, condicoes: [...x.condicoes, { alvo: 'grupo', op: 'e', valor: [] }] }))}><Plus size={14} /> Adicionar condição</button>
      </section>

      {/* ---- Então */}
      <section className="auto-bloco">
        <h4>Então</h4>
        {a.acoes.map((x, k) => {
          const col = ctx.colunas.find(c => c.id === x.coluna_id);
          return (
            <div key={k} className="auto-linha auto-item">
              <select value={x.tipo} onChange={e => setAcao(k, { tipo: e.target.value as Acao['tipo'], coluna_id: undefined, valor: undefined, modo: undefined })}>
                {ACOES.map(t => <option key={t.tipo} value={t.tipo}>{t.rotulo}</option>)}
              </select>
              {x.tipo === 'definir' && (
                <>
                  <select value={x.coluna_id ?? ''} onChange={e => setAcao(k, { coluna_id: Number(e.target.value) || undefined, valor: undefined, modo: undefined })}>
                    <option value="">Escolha a coluna…</option>
                    {colsDe(DEFINIVEIS).map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                  </select>
                  {col && <ValorAcao col={col} acao={x} ctx={ctx} onMudar={m => setAcao(k, m)} />}
                </>
              )}
              {x.tipo === 'mover' && (
                <select value={x.grupo_id ?? ''} onChange={e => setAcao(k, { grupo_id: Number(e.target.value) || null })}>
                  <option value="">Escolha o grupo…</option>
                  {ctx.grupos.map(gr => <option key={gr.id} value={gr.id}>{gr.nome}</option>)}
                </select>
              )}
              {x.tipo === 'notificar' && (
                <div className="auto-sub">
                  <Escolha opcoes={ctx.usuarios.filter(u => u.ativo).map(u => ({ id: u.id, texto: u.nome, cor: u.cor }))} valor={x.para ?? []} onMudar={v => setAcao(k, { para: v })} vazio="ninguém fixo" />
                  <select value={x.coluna_pessoa ?? ''} onChange={e => setAcao(k, { coluna_pessoa: Number(e.target.value) || null })}>
                    <option value="">e mais ninguém</option>
                    {colsDe(['pessoa']).map(c => <option key={c.id} value={c.id}>e as pessoas de {c.titulo}</option>)}
                  </select>
                  <input className="auto-texto largo" placeholder="Mensagem (use {nome} para o nome do item)" value={x.texto ?? ''} onChange={e => setAcao(k, { texto: e.target.value })} />
                </div>
              )}
              {x.tipo === 'subitem' && <input className="auto-texto largo" placeholder="Nome do subitem (pode usar {nome})" value={x.nome ?? ''} onChange={e => setAcao(k, { nome: e.target.value })} />}
              {x.tipo === 'criar_item' && <CriarItemDestino acao={x} ctx={ctx} onMudar={m => setAcao(k, m)} />}
              {x.tipo === 'webhook' && <input className="auto-texto largo" placeholder="https://… (recebe o item em JSON)" value={x.url ?? ''} onChange={e => setAcao(k, { url: e.target.value })} />}
              <button className="btn-icone" aria-label="Remover ação" onClick={() => setA(y => ({ ...y, acoes: y.acoes.filter((_, j) => j !== k) }))}><X size={15} /></button>
            </div>
          );
        })}
        <button className="fr-btn-link" onClick={() => setA(x => ({ ...x, acoes: [...x.acoes, { tipo: 'definir' }] }))}><Plus size={14} /> Adicionar ação</button>
      </section>

      <label className="campo-form auto-nome-campo">Nome (opcional)<input className="input-cheio" placeholder="Ex.: Mover obras concluídas" value={a.nome ?? ''} onChange={e => setA(x => ({ ...x, nome: e.target.value }))} /></label>
    </Modal>
  );
}

// Valor que a ação "mudar o valor" grava, conforme o tipo da coluna.
function ValorAcao({ col, acao, ctx, onMudar }: { col: Coluna; acao: Acao; ctx: Ctx; onMudar: (m: Partial<Acao>) => void }) {
  if (col.tipo === 'status') {
    return (
      <select value={acao.valor == null ? '' : String(acao.valor)} onChange={e => onMudar({ valor: e.target.value || undefined })}>
        <option value="">Escolha o rótulo…</option>
        {opcoesDe(col, ctx).filter(o => o.id !== '0').map(o => <option key={o.id} value={o.id}>{o.texto}</option>)}
      </select>
    );
  }
  if (col.tipo === 'lista' || col.tipo === 'pessoa') {
    return (
      <div className="auto-sub">
        <select value={acao.modo ?? 'substituir'} onChange={e => onMudar({ modo: e.target.value as 'substituir' | 'adicionar' })}>
          <option value="substituir">trocar por</option><option value="adicionar">adicionar</option>
        </select>
        <Escolha opcoes={opcoesDe(col, ctx, col.tipo === 'pessoa')} valor={((acao.valor ?? []) as unknown[]).map(String)} onMudar={v => onMudar({ valor: v })} />
      </div>
    );
  }
  if (col.tipo === 'caixa') {
    return <select value={acao.valor ? '1' : '0'} onChange={e => onMudar({ valor: e.target.value === '1' })}><option value="1">marcar</option><option value="0">desmarcar</option></select>;
  }
  if (col.tipo === 'data') {
    const rel = typeof acao.valor === 'object' && acao.valor ? Number((acao.valor as { relativo?: number }).relativo ?? 0) : null;
    return (
      <div className="auto-sub">
        <select value={acao.valor === null ? 'limpar' : rel == null ? '' : rel === 0 ? 'hoje' : 'mais'}
          onChange={e => onMudar({ valor: e.target.value === 'limpar' ? null : e.target.value === 'hoje' ? { relativo: 0 } : e.target.value === 'mais' ? { relativo: 7 } : undefined })}>
          <option value="">Escolha…</option><option value="hoje">a data de hoje</option><option value="mais">hoje + alguns dias</option><option value="limpar">limpar a data</option>
        </select>
        {rel != null && rel !== 0 && <><input type="number" className="auto-num" min={1} max={365} value={rel} onChange={e => onMudar({ valor: { relativo: Math.max(1, Number(e.target.value) || 1) } })} /> <span className="muted fr-small">dias</span></>}
      </div>
    );
  }
  return <input className="auto-texto" type={col.tipo === 'numero' || col.tipo === 'avaliacao' ? 'number' : 'text'} placeholder={col.tipo === 'numero' ? 'Valor' : 'Texto (pode usar {nome})'} value={String(acao.valor ?? '')} onChange={e => onMudar({ valor: e.target.value })} />;
}

function CriarItemDestino({ acao, ctx, onMudar }: { acao: Acao; ctx: Ctx; onMudar: (m: Partial<Acao>) => void }) {
  const [grupos, setGrupos] = useState<Row[]>([]);
  useEffect(() => { if (acao.quadro_id) api.list('grupos', { quadro_id: acao.quadro_id }).then(setGrupos); else setGrupos([]); }, [acao.quadro_id]);
  return (
    <div className="auto-sub">
      <select value={acao.quadro_id ?? ''} onChange={e => onMudar({ quadro_id: Number(e.target.value) || undefined, grupo_id: null })}>
        <option value="">Escolha o quadro…</option>
        {ctx.quadros.map(q => <option key={q.id} value={q.id}>{q.nome}</option>)}
      </select>
      {acao.quadro_id && (
        <select value={acao.grupo_id ?? ''} onChange={e => onMudar({ grupo_id: Number(e.target.value) || null })}>
          <option value="">no primeiro grupo</option>
          {grupos.map(g => <option key={g.id} value={g.id}>no grupo {g.nome}</option>)}
        </select>
      )}
      <input className="auto-texto" placeholder="Nome (padrão: {nome})" value={acao.nome ?? ''} onChange={e => onMudar({ nome: e.target.value })} />
    </div>
  );
}

// Seleção de vários valores em "fichas" (rótulos com cor, pessoas, grupos).
function Escolha({ opcoes, valor, onMudar, vazio = 'qualquer' }: { opcoes: { id: string; texto: string; cor?: string }[]; valor: string[]; onMudar: (v: string[]) => void; vazio?: string }) {
  const pop = usePopover<HTMLButtonElement>();
  const sel = opcoes.filter(o => valor.includes(o.id));
  return (
    <>
      <button ref={pop.ref} className="auto-escolha" onClick={pop.alternar}>
        {sel.length ? sel.map(o => <span key={o.id} className="auto-ficha" style={o.cor ? { background: o.cor, color: corTexto(o.cor) } : undefined}>{o.texto}</span>) : <span className="muted">{vazio}</span>}
      </button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={260}>
          <div className="pop-pessoa pop-rolagem">
            {opcoes.map(o => (
              <button key={o.id} className="pop-linha" onClick={() => onMudar(valor.includes(o.id) ? valor.filter(x => x !== o.id) : [...valor, o.id])}>
                <span className={`marcador${valor.includes(o.id) ? ' on' : ''}`}>{valor.includes(o.id) && <CheckCircle2 size={12} />}</span>
                {o.cor && <span className="bolinha" style={{ background: o.cor }} />}{o.texto}
              </button>
            ))}
            {!opcoes.length && <p className="muted fr-small">Nenhuma opção.</p>}
          </div>
        </Popover>
      )}
    </>
  );
}
