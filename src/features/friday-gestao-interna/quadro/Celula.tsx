import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, CheckCircle2, Circle, Download, ExternalLink, Lock, Paperclip, Pencil, Plus, Search, Star, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { api, copiarArquivosMonday, enviarArquivo, type Pessoa, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { calcular, textoResultado } from './formula.ts';
import { IconeTipo, urlArquivo } from './Atualizacoes.tsx';
import { Avatar, Popover, usePopover } from '../ui/base.tsx';
import { CORES, corTexto, diasEntre, fmtData, fmtDataComAno, fmtNumeroColuna, hojeISO, somarDias } from '../util.ts';
import { ehPrazo, itemConcluido, rotuloDe, vazio, type Coluna, type Item, type Rotulo } from './tipos.ts';

export type CelulaProps = {
  coluna: Coluna;
  valor: any;
  onMudar: (v: unknown) => void;
  onConfig: (config: Record<string, any>) => void;
  usuarios: Pessoa[];
  modo?: 'tabela' | 'painel';
  // Necessários para fórmulas (que leem outras colunas do item) e arquivos.
  item?: Item;
  colunas?: Coluna[];
};

// Uma célula: mostra o valor conforme o tipo da coluna e abre o editor adequado.
export function Celula(p: CelulaProps) {
  // Campo só leitura de um cadastro existente (ex.: quilometragem, mantida pelo app): mostra o valor, sem editor.
  if (p.coluna.oficial?.somente_leitura) {
    const v = p.valor;
    return <div className="cel cel-centro cel-so-leitura" title="Só leitura: o valor vem do cadastro">{vazio(v) ? '' : typeof v === 'number' ? v.toLocaleString('pt-BR') : String(v)}</div>;
  }
  switch (p.coluna.tipo) {
    case 'status': return <CelulaStatus {...p} />;
    case 'pessoa': return <CelulaPessoa {...p} />;
    case 'data': return <CelulaData {...p} />;
    case 'periodo': return <CelulaPeriodo {...p} />;
    case 'lista': return <CelulaLista {...p} />;
    case 'numero': return <CelulaTexto {...p} numero />;
    case 'caixa': return <div className="cel cel-centro"><input type="checkbox" className="caixa" checked={!!p.valor} onChange={e => p.onMudar(e.target.checked || null)} aria-label={p.coluna.titulo} /></div>;
    case 'avaliacao': return <CelulaAvaliacao {...p} />;
    case 'texto_longo': return <CelulaTextoLongo {...p} />;
    case 'link': return <CelulaLink {...p} />;
    case 'ligacao': return <CelulaLigacao {...p} />;
    case 'formula': return <CelulaFormula {...p} />;
    case 'arquivos': return <CelulaArquivos {...p} />;
    default: return <CelulaTexto {...p} />;
  }
}

// ---------------------------------------------------------------- texto, número, telefone, e-mail
function CelulaTexto({ coluna, valor, onMudar, numero }: CelulaProps & { numero?: boolean }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  // Número ×10: digita-se só dígitos (205) e, ao sair, aparece com uma casa decimal (20,5); guarda o inteiro.
  const x10 = !!numero && !!coluna.config.x10;
  if (editando) {
    return (
      <input
        className={`cel-input${numero ? ' num' : ''}`}
        autoFocus
        type={numero && !x10 ? 'number' : coluna.tipo === 'email' ? 'email' : 'text'}
        inputMode={x10 ? 'numeric' : undefined}
        step="any"
        value={texto}
        onChange={e => setTexto(x10 ? e.target.value.replace(/\D/g, '') : e.target.value)}
        onBlur={() => {
          setEditando(false);
          const novo = numero ? (texto === '' ? null : x10 ? Number.parseInt(texto, 10) : Number(texto)) : texto.trim() || null;
          if (String(novo ?? '') !== String(valor ?? '')) onMudar(novo);
        }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setTexto(valor ?? ''); setEditando(false); } }}
      />
    );
  }
  const exib = numero ? fmtNumeroColuna(coluna.config, valor) : valor;
  return (
    <div className={`cel cel-texto${numero ? ' cel-centro' : ''}`} onClick={() => { setTexto(valor ?? ''); setEditando(true); }}>
      {coluna.tipo === 'email' && valor ? <a className="cel-valor" href={`mailto:${valor}`} onClick={e => e.stopPropagation()}>{valor}</a> : <span className="cel-valor">{exib}</span>}
      {vazio(valor) && <Pencil size={13} className="cel-dica" />}
    </div>
  );
}

// ---------------------------------------------------------------- status
function CelulaStatus({ coluna, valor, onMudar, onConfig }: CelulaProps) {
  const pop = usePopover<HTMLDivElement>();
  const [editandoRotulos, setEditandoRotulos] = useState(false);
  const r = rotuloDe(coluna, valor);
  const rotulos = (coluna.config.rotulos ?? []) as Rotulo[];
  return (
    <>
      <div ref={pop.ref} className="cel cel-status" style={{ background: r?.cor ?? '#c4c4c4', color: corTexto(r?.cor ?? '#c4c4c4') }} onClick={pop.alternar}>
        <span>{r?.texto}</span>
        <span className="dobra" />
      </div>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={() => { pop.fechar(); setEditandoRotulos(false); }} alinhar="centro" largura={editandoRotulos ? 300 : 220}>
          {editandoRotulos ? (
            <EditorRotulos rotulos={rotulos} comVazio comConcluido protegidos={coluna.oficial?.rotulos} onSalvar={rs => onConfig({ ...coluna.config, rotulos: rs })} onFechar={() => setEditandoRotulos(false)} />
          ) : (
            <div className="pop-status">
              {[...rotulos.filter(x => x.id !== '0'), ...rotulos.filter(x => x.id === '0')].map(x => (
                <button key={x.id} className="rotulo-btn" style={{ background: x.cor, color: corTexto(x.cor) }}
                  onClick={() => { onMudar(x.id === '0' ? null : x.id); pop.fechar(); }}>{x.texto || ' '}{x.concluido && <Check size={13} className="rotulo-feito" />}</button>
              ))}
              <button className="fr-btn-link pop-rodape" onClick={() => setEditandoRotulos(true)}><Pencil size={14} /> Editar rótulos</button>
            </div>
          )}
        </Popover>
      )}
    </>
  );
}

// Editor de rótulos (status) ou opções (lista suspensa): texto, cor, ordem e exclusão.
// comConcluido: cada rótulo pode ser marcado como "concluído" (conta como feito).
// protegidos: ids dos rótulos de um campo oficial — podem ser renomeados e recoloridos, mas não excluídos.
export function EditorRotulos({ rotulos, onSalvar, onFechar, comVazio, semCor, comConcluido, protegidos }: {
  rotulos: Rotulo[]; onSalvar: (r: Rotulo[]) => void; onFechar: () => void; comVazio?: boolean; semCor?: boolean; comConcluido?: boolean; protegidos?: string[];
}) {
  const [lista, setLista] = useState(rotulos);
  const [paleta, setPaleta] = useState<string | null>(null);
  const set = (id: string, campos: Partial<Rotulo>) => setLista(l => l.map(x => (x.id === id ? { ...x, ...campos } : x)));
  const novoId = () => String(Math.max(0, ...lista.map(x => Number(x.id) || 0)) + 1);
  return (
    <div className="editor-rotulos">
      {lista.map(x => (
        <div key={x.id} className="er-linha">
          {!semCor && <button className="er-cor" style={{ background: x.cor }} onClick={() => setPaleta(paleta === x.id ? null : x.id)} aria-label="Cor" />}
          <input value={x.texto} placeholder={x.id === '0' && comVazio ? '(sem rótulo)' : 'Rótulo'} onChange={e => set(x.id, { texto: e.target.value })} />
          {comConcluido && x.id !== '0' && (
            <button className={`btn-icone er-feito${x.concluido ? ' on' : ''}`} title={x.concluido ? 'Conta como concluído (clique para desmarcar)' : 'Marcar como rótulo de concluído'}
              aria-pressed={!!x.concluido} onClick={() => set(x.id, { concluido: !x.concluido || undefined })}>
              {x.concluido ? <CheckCircle2 size={15} /> : <Circle size={15} />}
            </button>
          )}
          {protegidos?.includes(x.id)
            ? <span className="btn-icone er-protegido" title="Rótulo de campo oficial: pode renomear, não pode excluir"><Lock size={13} /></span>
            : !(comVazio && x.id === '0') && <button className="btn-icone" aria-label="Excluir rótulo" onClick={() => setLista(l => l.filter(y => y.id !== x.id))}><Trash2 size={14} /></button>}
          {paleta === x.id && (
            <div className="paleta">
              {CORES.map(c => <button key={c} style={{ background: c }} aria-label={c} onClick={() => { set(x.id, { cor: c }); setPaleta(null); }} />)}
            </div>
          )}
        </div>
      ))}
      <button className="fr-btn-link" onClick={() => setLista(l => [...l.filter(y => y.id !== '0'), { id: novoId(), texto: 'Novo rótulo', cor: CORES[(l.length * 3) % CORES.length] }, ...l.filter(y => y.id === '0')])}>
        <Plus size={14} /> Novo rótulo
      </button>
      {comConcluido && <small className="muted er-dica"><CheckCircle2 size={12} /> = conta como concluído (sai das pendências e dos atrasos)</small>}
      <div className="er-acoes">
        <button className="fr-btn" onClick={onFechar}>Cancelar</button>
        <button className="fr-btn btn-primario" onClick={() => { onSalvar(lista.map(x => ({ ...x, texto: x.texto.trim() }))); onFechar(); }}>Aplicar</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pessoa
function CelulaPessoa({ valor, onMudar, usuarios }: CelulaProps) {
  const pop = usePopover<HTMLDivElement>();
  const [busca, setBusca] = useState('');
  const ids = (valor ?? []) as string[];
  const sel = usuarios.filter(u => ids.includes(u.id));
  const alternar = (id: string) => onMudar(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  return (
    <>
      <div ref={pop.ref} className="cel cel-centro cel-pessoa" onClick={pop.alternar}>
        {sel.length ? (
          <span className="avatares">{sel.slice(0, 3).map(u => <Avatar key={u.id} nome={u.nome} cor={u.cor} tamanho={26} />)}{sel.length > 3 && <span className="avatar-mais">+{sel.length - 3}</span>}</span>
        ) : <span className="cel-vazia-pessoa"><UserPlus size={16} /></span>}
      </div>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="centro" largura={260}>
          <div className="pop-pessoa">
            {sel.length > 0 && <div className="chips">{sel.map(u => <span key={u.id} className="chip"><Avatar nome={u.nome} cor={u.cor} tamanho={18} />{u.nome}<button aria-label={`Remover ${u.nome}`} onClick={() => alternar(u.id)}><X size={12} /></button></span>)}</div>}
            <div className="busca-pop"><Search size={14} /><input autoFocus placeholder="Buscar pessoas" value={busca} onChange={e => setBusca(e.target.value)} /></div>
            {usuarios.filter(u => u.ativo && !ids.includes(u.id) && u.nome.toLowerCase().includes(busca.toLowerCase())).map(u => (
              <button key={u.id} className="pop-linha" onClick={() => alternar(u.id)}><Avatar nome={u.nome} cor={u.cor} tamanho={24} />{u.nome}</button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------- data
function CelulaData({ coluna, valor, onMudar, item, colunas }: CelulaProps) {
  const pop = usePopover<HTMLDivElement>();
  const hoje = hojeISO();
  // Atraso e ✓ só em coluna de prazo; com o status principal concluído, o prazo não fica "atrasado".
  const prazo = ehPrazo(coluna);
  const feito = prazo && !!valor && !!item && !!colunas && itemConcluido(item, colunas);
  const atrasada = prazo && !!valor && valor < hoje && !feito;
  const fmt = coluna.config.com_ano ? fmtDataComAno : fmtData;
  return (
    <>
      <div ref={pop.ref} className={`cel cel-centro cel-data${atrasada ? ' passada' : ''}${feito ? ' feita' : ''}`} onClick={pop.alternar}
        title={atrasada ? `Atrasado ${diasEntre(valor, hoje)} dia(s)` : feito ? 'Concluído' : undefined}>
        {valor ? <>{atrasada && <AlertCircle size={13} />}{feito && <CheckCircle2 size={13} />}{fmt(valor)}</> : <CalendarioDica />}
      </div>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="centro" largura={250}>
          <div className="pop-data">
            <input type="date" autoFocus value={valor ?? ''} onChange={e => onMudar(e.target.value || null)} />
            <div className="pop-data-atalhos">
              <button className="fr-btn" onClick={() => { onMudar(hoje); pop.fechar(); }}>Hoje</button>
              <button className="fr-btn" onClick={() => { onMudar(somarDias(hoje, 1)); pop.fechar(); }}>Amanhã</button>
              {valor && <button className="fr-btn" onClick={() => { onMudar(null); pop.fechar(); }}>Limpar</button>}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}
const CalendarioDica = () => <span className="cel-dica-txt">+</span>;

// ---------------------------------------------------------------- período (cronograma)
function CelulaPeriodo({ valor, onMudar, item, colunas }: CelulaProps) {
  const pop = usePopover<HTMLDivElement>();
  const v = (valor ?? {}) as { inicio?: string; fim?: string };
  const hoje = hojeISO();
  const feito = !!item && !!colunas && itemConcluido(item, colunas);
  const atrasado = !feito && !!(v.fim ?? v.inicio) && (v.fim ?? v.inicio)! < hoje;
  let pct = 0;
  if (v.inicio && v.fim) {
    const total = Math.max(1, diasEntre(v.inicio, v.fim) + 1);
    pct = Math.max(0, Math.min(100, ((diasEntre(v.inicio, hoje) + 1) / total) * 100));
  }
  if (feito) pct = 100;
  const set = (campos: Partial<typeof v>) => {
    const n = { ...v, ...campos };
    if (n.inicio && n.fim && n.fim < n.inicio) n.fim = n.inicio;
    onMudar(n.inicio || n.fim ? n : null);
  };
  return (
    <>
      <div ref={pop.ref} className="cel cel-centro" onClick={pop.alternar}>
        {v.inicio || v.fim ? (
          <span className={`periodo${feito ? ' feito' : ''}${atrasado ? ' atrasado' : ''}`} title={feito ? 'Concluído' : atrasado ? 'Atrasado' : undefined}
            style={feito ? undefined : { background: `linear-gradient(90deg, var(--periodo-cheio) ${pct}%, var(--periodo-vazio) ${pct}%)` }}>
            {feito && <Check size={12} />}{atrasado && <AlertCircle size={12} />}{fmtData(v.inicio)} – {fmtData(v.fim)}
          </span>
        ) : <span className="cel-dica-txt">+</span>}
      </div>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="centro" largura={260}>
          <div className="pop-data">
            <label>Início<input type="date" autoFocus value={v.inicio ?? ''} onChange={e => set({ inicio: e.target.value || undefined })} /></label>
            <label>Fim<input type="date" value={v.fim ?? ''} min={v.inicio} onChange={e => set({ fim: e.target.value || undefined })} /></label>
            {v.inicio && v.fim && <small className="muted">{diasEntre(v.inicio, v.fim) + 1} dias</small>}
            {(v.inicio || v.fim) && <button className="fr-btn" onClick={() => { onMudar(null); pop.fechar(); }}>Limpar</button>}
          </div>
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------- lista suspensa
function CelulaLista({ coluna, valor, onMudar, onConfig }: CelulaProps) {
  const pop = usePopover<HTMLDivElement>();
  const [editando, setEditando] = useState(false);
  const [nova, setNova] = useState('');
  const opcoes = (coluna.config.opcoes ?? []) as Rotulo[];
  const ids = (valor ?? []) as string[];
  const sel = opcoes.filter(o => ids.includes(o.id));
  const alternar = (id: string) => onMudar(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const criar = () => {
    const t = nova.trim();
    if (!t) return;
    const id = String(Math.max(0, ...opcoes.map(o => Number(o.id) || 0)) + 1);
    onConfig({ ...coluna.config, opcoes: [...opcoes, { id, texto: t, cor: '#c4c4c4' }] });
    onMudar([...ids, id]);
    setNova('');
  };
  return (
    <>
      <div ref={pop.ref} className="cel cel-centro cel-lista" onClick={pop.alternar}>
        {sel.map(o => <span key={o.id} className="tag">{o.texto}</span>)}
      </div>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={() => { pop.fechar(); setEditando(false); }} alinhar="centro" largura={260}>
          {editando ? (
            <EditorRotulos rotulos={opcoes} semCor protegidos={coluna.oficial?.rotulos} onSalvar={rs => onConfig({ ...coluna.config, opcoes: rs })} onFechar={() => setEditando(false)} />
          ) : (
            <div className="pop-pessoa">
              <div className="busca-pop"><Plus size={14} /><input autoFocus placeholder="Criar ou buscar opção" value={nova} onChange={e => setNova(e.target.value)} onKeyDown={e => e.key === 'Enter' && criar()} /></div>
              {opcoes.filter(o => o.texto.toLowerCase().includes(nova.toLowerCase())).map(o => (
                <button key={o.id} className="pop-linha" onClick={() => alternar(o.id)}>
                  <span className={`marcador${ids.includes(o.id) ? ' on' : ''}`}>{ids.includes(o.id) && <Check size={12} />}</span>{o.texto}
                </button>
              ))}
              {nova.trim() && !opcoes.some(o => o.texto.toLowerCase() === nova.trim().toLowerCase()) && <button className="pop-linha" onClick={criar}><Plus size={14} /> Criar “{nova.trim()}”</button>}
              <button className="fr-btn-link pop-rodape" onClick={() => setEditando(true)}><Pencil size={14} /> Editar opções</button>
            </div>
          )}
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------- avaliação
function CelulaAvaliacao({ coluna, valor, onMudar }: CelulaProps) {
  const max = Number(coluna.config.maximo ?? 5);
  const [hover, setHover] = useState(0);
  const v = Number(valor ?? 0);
  return (
    <div className="cel cel-centro estrelas" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: max }, (_, i) => (
        <button key={i} aria-label={`${i + 1} estrela(s)`} onMouseEnter={() => setHover(i + 1)} onClick={() => onMudar(v === i + 1 ? null : i + 1)}>
          <Star size={15} className={(hover || v) > i ? 'cheia' : ''} />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- texto longo
function CelulaTextoLongo({ valor, onMudar, modo }: CelulaProps) {
  const pop = usePopover<HTMLDivElement>();
  const [texto, setTexto] = useState(valor ?? '');
  useEffect(() => { setTexto(valor ?? ''); }, [valor]);
  if (modo === 'painel') {
    return <textarea className="cel-input" rows={3} value={texto} placeholder="—" onChange={e => setTexto(e.target.value)} onBlur={() => texto !== (valor ?? '') && onMudar(texto.trim() || null)} />;
  }
  return (
    <>
      <div ref={pop.ref} className="cel cel-texto" onClick={pop.alternar} title={valor ?? ''}><span className="cel-valor">{valor}</span></div>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={() => { pop.fechar(); if (texto !== (valor ?? '')) onMudar(texto.trim() || null); }} largura={320}>
          <textarea className="pop-textarea" autoFocus rows={6} value={texto} onChange={e => setTexto(e.target.value)} />
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------- link
function CelulaLink({ valor, onMudar }: CelulaProps) {
  const pop = usePopover<HTMLDivElement>();
  const v = (typeof valor === 'string' ? { url: valor } : valor ?? {}) as { url?: string; texto?: string };
  const [url, setUrl] = useState(v.url ?? '');
  const [texto, setTexto] = useState(v.texto ?? '');
  const href = v.url && !/^https?:\/\//i.test(v.url) ? `https://${v.url}` : v.url;
  return (
    <>
      <div ref={pop.ref} className="cel cel-texto" onClick={() => { setUrl(v.url ?? ''); setTexto(v.texto ?? ''); pop.alternar(); }}>
        {v.url && <a className="cel-valor" href={href} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}><ExternalLink size={12} /> {v.texto || v.url}</a>}
      </div>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={300}>
          <form className="pop-data" onSubmit={e => { e.preventDefault(); onMudar(url.trim() ? { url: url.trim(), texto: texto.trim() || undefined } : null); pop.fechar(); }}>
            <label>Endereço<input autoFocus value={url} placeholder="www.exemplo.com.br" onChange={e => setUrl(e.target.value)} /></label>
            <label>Texto a exibir<input value={texto} onChange={e => setTexto(e.target.value)} /></label>
            <button className="fr-btn btn-primario">Salvar</button>
          </form>
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------- conectar quadros
const cacheItens = new Map<number, Promise<Row[]>>();
export function itensDoQuadro(quadroId: number, renovar = false) {
  if (renovar || !cacheItens.has(quadroId)) cacheItens.set(quadroId, api.list('itens', { quadro_id: quadroId }));
  return cacheItens.get(quadroId)!;
}
function useItensDoQuadro(quadroId: number | null | undefined) {
  const [itens, setItens] = useState<Row[]>([]);
  useEffect(() => { if (quadroId) itensDoQuadro(quadroId).then(setItens); }, [quadroId]);
  return itens;
}

function CelulaLigacao({ coluna, valor, onMudar, onConfig }: CelulaProps) {
  const pop = usePopover<HTMLDivElement>();
  const [busca, setBusca] = useState('');
  const [quadros, setQuadros] = useState<Row[]>([]);
  const alvo = coluna.config.quadro_id as number | null;
  const itens = useItensDoQuadro(alvo);
  const ids = (valor ?? []) as number[];
  const nomes = useMemo(() => new Map(itens.map(i => [i.id, i.nome])), [itens]);
  useEffect(() => { if (pop.aberto && !alvo) api.list('quadros').then(setQuadros); }, [pop.aberto, alvo]);
  const alternar = (id: number) => onMudar(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  return (
    <>
      <div ref={pop.ref} className="cel cel-lista cel-ligacao" onClick={pop.alternar}>
        {ids.map(id => <span key={id} className="tag tag-ligacao">{nomes.get(id) ?? '…'}</span>)}
      </div>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} largura={300}>
          {!alvo ? (
            <div className="pop-pessoa">
              <p className="muted fr-small">Escolha o quadro a conectar:</p>
              {quadros.filter(q => q.id !== coluna.quadro_id && q.tipo !== 'subitens').map(q => <button key={q.id} className="pop-linha" onClick={() => onConfig({ ...coluna.config, quadro_id: q.id })}>{q.nome}</button>)}
            </div>
          ) : (
            <div className="pop-pessoa">
              <div className="busca-pop"><Search size={14} /><input autoFocus placeholder="Buscar item" value={busca} onChange={e => setBusca(e.target.value)} /></div>
              <div className="pop-rolagem">
                {itens.filter(i => i.nome.toLowerCase().includes(busca.toLowerCase())).map(i => (
                  <button key={i.id} className="pop-linha" onClick={() => alternar(i.id)}>
                    <span className={`marcador${ids.includes(i.id) ? ' on' : ''}`}>{ids.includes(i.id) && <Check size={12} />}</span>{i.nome}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------- fórmula (calculada, só leitura)
function CelulaFormula({ coluna, item, colunas, modo }: CelulaProps) {
  const nav = useNav();
  if (!item || !colunas) return <div className="cel" />;
  const r = calcular(coluna, item, { colunas, nomeUsuario: nav.nomeUsuario });
  if (r.erro) {
    // Referência a coluna inexistente: vazio (como no monday), com aviso discreto.
    return <div className={`cel cel-formula erro${modo === 'painel' ? '' : ' cel-centro'}`} title={r.erro}><AlertTriangle size={13} /></div>;
  }
  const txt = textoResultado(r.valor);
  return <div className={`cel cel-formula${typeof r.valor === 'number' ? ' cel-centro' : ''}`} title={txt}><span className="cel-valor">{txt}</span></div>;
}

// ---------------------------------------------------------------- arquivos
// id = anexo guardado no app. Sem id: arquivo que veio do monday e ainda não foi baixado (monday_asset)
// ou link para fora (url, ex.: Google Drive).
type ArquivoCelula = { id?: number; nome: string; mime?: string; tamanho?: number; monday_asset?: number; url?: string };
const pendente = (a: ArquivoCelula) => !a.id && !a.url;
function CelulaArquivos({ coluna, valor, onMudar, item }: CelulaProps) {
  const nav = useNav();
  const pop = usePopover<HTMLDivElement>();
  const [copiando, setCopiando] = useState<string | null>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const lista = (valor ?? []) as ArquivoCelula[];
  const enviar = async (fs: FileList | null) => {
    if (!fs?.length || !item) return;
    setEnviando(true);
    try {
      const novos: ArquivoCelula[] = [];
      for (const f of Array.from(fs)) {
        const a = await enviarArquivo(item.id, f, undefined, coluna.id);
        novos.push({ id: a.id, nome: a.nome, mime: a.mime, tamanho: a.tamanho, url: a.url });
      }
      onMudar([...lista, ...novos]);
    } catch (e) { alert((e as Error).message); } finally { setEnviando(false); }
  };
  // Copia de uma vez os arquivos "no monday" de todo o quadro (e dos subitens), em rodadas até não faltar nada.
  const copiarDoMonday = async () => {
    if (!item) return;
    setCopiando('Copiando…');
    let total = 0;
    const falhas = new Set<string>();
    try {
      for (;;) {
        const r = (await copiarArquivosMonday({ quadroId: item.quadro_id })).data;
        total += r.copiados;
        r.falhas.forEach(f => falhas.add(f));
        setCopiando(`Copiados ${total}; faltam ${r.restantes}…`);
        if (!r.restantes || !r.copiados) break;
      }
      alert(`${total} arquivo(s) copiado(s) do monday.${falhas.size ? `\n\nNão copiados:\n${[...falhas].join('\n')}` : ''}`);
      window.location.reload();
    } catch (e) { alert((e as Error).message); } finally { setCopiando(null); }
  };
  return (
    <>
      <div ref={pop.ref} className={`cel cel-centro cel-arquivos${arrastando ? ' arrastando' : ''}`} onClick={pop.alternar}
        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true); } }}
        onDragLeave={() => setArrastando(false)} onDrop={e => { e.preventDefault(); setArrastando(false); enviar(e.dataTransfer.files); }}>
        {enviando ? <small className="muted">enviando…</small> : lista.length ? (
          <span className="arquivos-mini">
            {lista.slice(0, 3).map((a, k) => (
              <span key={a.id ?? `p${k}`} className={pendente(a) ? 'arquivo-pendente' : ''} title={pendente(a) ? `${a.nome} — ainda no monday (não baixado)` : a.nome}>
                <IconeTipo nome={a.nome} mime={a.mime} tamanho={16} />
              </span>
            ))}
            {lista.length > 3 && <small className="muted">+{lista.length - 3}</small>}
          </span>
        ) : <span className="cel-dica-txt"><Paperclip size={15} /></span>}
      </div>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="centro" largura={320}>
          <div className="pop-pessoa">
            {lista.map((a, k) => (
              <div key={a.id ?? `p${k}`} className={`pop-arquivo${pendente(a) ? ' pendente' : ''}`}>
                <IconeTipo nome={a.nome} mime={a.mime} tamanho={16} />
                {a.id ? <a href={urlArquivo({ ...a, id: a.id })} target="_blank" rel="noreferrer" title={a.nome}>{a.nome}</a>
                  : a.url ? <a href={a.url} target="_blank" rel="noreferrer" title={a.url}>{a.nome} <ExternalLink size={11} /></a>
                  : <span title="Este arquivo ainda está só no monday">{a.nome} <small className="selo-monday">no monday</small></span>}
                {a.id && <a className="btn-icone" href={urlArquivo({ ...a, id: a.id }, true)} title="Baixar"><Download size={14} /></a>}
                <button className="btn-icone" title="Remover da coluna" onClick={async () => {
                  if (a.id) await api.remove('anexos', a.id);
                  onMudar(lista.filter((_, j) => j !== k));
                }}><Trash2 size={14} /></button>
              </div>
            ))}
            {lista.some(pendente) && <small className="muted dica-monday">“no monday”: o arquivo veio na importação só com o nome; ainda não foi baixado para o app.</small>}
            {lista.some(pendente) && nav.usuario?.admin && (
              <button className="fr-btn" onClick={copiarDoMonday} disabled={!!copiando}><Download size={14} /> {copiando ?? 'Copiar do monday (quadro inteiro)'}</button>
            )}
            {!lista.length && <p className="muted fr-small" style={{ margin: '4px 4px 8px' }}>Nenhum arquivo nesta coluna.</p>}
            <button className="fr-btn" onClick={() => seletor.current?.click()} disabled={enviando}><Upload size={14} /> {enviando ? 'Enviando…' : 'Adicionar arquivos'}</button>
            <small className="muted" style={{ marginTop: 6 }}>Dica: arraste arquivos direto para a célula.</small>
            <input ref={seletor} type="file" multiple hidden onChange={e => { enviar(e.target.files); e.target.value = ''; }} />
          </div>
        </Popover>
      )}
    </>
  );
}
