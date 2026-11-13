import { Fragment, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  AtSign, Download, ExternalLink, File as IconeArquivo, FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo,
  Lock, MessageCircle, MoreHorizontal, Paperclip, Pencil, Reply, Trash2, Upload, X,
} from 'lucide-react';
import { marcadosSemAcesso } from '../avisos.ts';
import { atualizar, criar, enviarArquivo, excluir, listar, marcarAtualizacoesLidas, obter, type Pessoa, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { Avatar, Menu, Popover, useAvisoRapido, useConfirmar, usePopover } from '../ui/base.tsx';
import type { Item } from './tipos.ts';
import type { Acoes } from './useQuadro.ts';

// ---------------------------------------------------------------- utilidades
// Anexos guardam a URL do Firebase Storage (etapa de anexos).
export const urlArquivo = (a: Row, baixar = false) => { void baixar; return String(a.url ?? '#'); };
const eImagem = (a: Record<string, any>) => /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/i.test(a.mime ?? '');

export function fmtTamanho(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function IconeTipo({ nome, mime, tamanho = 18 }: { nome: string; mime?: string; tamanho?: number }) {
  const ext = nome.split('.').pop()?.toLowerCase() ?? '';
  if (/^image\//.test(mime ?? '')) return <FileImage size={tamanho} className="ic-img" />;
  if (/^video\//.test(mime ?? '')) return <FileVideo size={tamanho} className="ic-video" />;
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return <FileSpreadsheet size={tamanho} className="ic-planilha" />;
  if (['zip', 'rar', '7z'].includes(ext)) return <FileArchive size={tamanho} className="ic-zip" />;
  if (['pdf', 'doc', 'docx', 'txt', 'odt', 'rtf'].includes(ext)) return <FileText size={tamanho} className={ext === 'pdf' ? 'ic-pdf' : 'ic-doc'} />;
  return <IconeArquivo size={tamanho} />;
}

// "agora", "há 5 min", "há 3 h", "ontem 14:20", "12 out 09:15"
export function tempoRelativo(data: string) {
  const d = new Date(data.replace(' ', 'T'));
  const seg = (Date.now() - d.getTime()) / 1000;
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return `há ${Math.floor(seg / 3600)} h`;
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `ontem ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: d.getFullYear() !== hoje.getFullYear() ? 'numeric' : undefined }).replace('.', '')} ${hora}`;
}

// Texto da atualização: @{uid} vira a menção destacada; endereços viram links.
function TextoAtualizacao({ texto }: { texto: string }) {
  const nav = useNav();
  const partes = texto.trim().split(/(@\{[^{}\s]+\}|https?:\/\/[^\s]+)/g);
  return (
    <p className="at-texto">
      {partes.map((p, i) => {
        const m = p.match(/^@\{([^{}\s]+)\}$/);
        if (m) return <span key={i} className={`mencao${m[1] === nav.usuario?.id ? ' eu' : ''}`}>@{nav.nomeUsuario(m[1])}</span>;
        if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </p>
  );
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------------------------------------------------------------- caixa de escrita (com @ e anexos)
// edicao: editar uma atualização já publicada (texto atual, sem anexos); onSalvar grava o texto e as menções.
export function Composer({ item, respostaDe, compacto, onPublicado, onCancelar, edicao, onSalvar }: {
  item: Item; respostaDe?: number; compacto?: boolean; onPublicado?: (a: Row, anexos: Row[]) => void; onCancelar?: () => void;
  edicao?: string; onSalvar?: (texto: string, mencoes: string[]) => Promise<void>;
}) {
  const nav = useNav();
  const avisar = useAvisoRapido();
  const area = useRef<HTMLTextAreaElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  // Na edição, as marcas @{uid} voltam a ser "@Nome" na caixa (e de novo @{uid} ao salvar).
  const mencoesIniciais = () => [...new Set([...(edicao ?? '').matchAll(/@\{([^{}\s]+)\}/g)].map(m => m[1]))].map(id => ({ id, nome: nav.nomeUsuario(id) }));
  const [texto, setTexto] = useState(() => (edicao ?? '').replace(/@\{([^{}\s]+)\}/g, (_, id: string) => `@${nav.nomeUsuario(id)}`).trim());
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [mencoes, setMencoes] = useState<{ id: string; nome: string }[]>(mencoesIniciais);
  const [busca, setBusca] = useState<{ termo: string; inicio: number } | null>(null);
  const [indice, setIndice] = useState(0);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const candidatos = useMemo(() => !busca ? [] : nav.usuarios.filter(u => u.ativo && semAcento(u.nome).includes(semAcento(busca.termo))).slice(0, 8), [busca, nav.usuarios]);

  // Quadro do item, para avisar quem escreve que um marcado não vê o quadro (restrito): ele recebe o aviso com o
  // trecho, mas não abre o item.
  const [quadro, setQuadro] = useState<Row | null>(null);
  useEffect(() => {
    let vivo = true;
    obter('quadros', item.quadro_id).then(q => { if (vivo) setQuadro(q); }, () => { if (vivo) setQuadro(null); });
    return () => { vivo = false; };
  }, [item.quadro_id]);
  const semAcesso = marcadosSemAcesso(quadro, mencoes
    .filter(m => m.id !== nav.usuario?.id && texto.includes(`@${m.nome}`))
    .map(m => ({ id: m.id, adm2: nav.usuarios.find(u => u.id === m.id)?.adm2 })));
  const nomesSemAcesso = semAcesso.map(id => nav.nomeUsuario(id));

  const detectar = (valor: string, cursor: number) => {
    const antes = valor.slice(0, cursor);
    const m = antes.match(/(^|\s)@([^\s@]{0,30})$/);
    if (m) { setBusca({ termo: m[2], inicio: cursor - m[2].length - 1 }); setIndice(0); } else setBusca(null);
  };
  const escolher = (u: Pessoa) => {
    if (!busca || !area.current) return;
    const cursor = area.current.selectionStart;
    const novo = `${texto.slice(0, busca.inicio)}@${u.nome} ${texto.slice(cursor)}`;
    setTexto(novo);
    setMencoes(ms => (ms.some(x => x.id === u.id) ? ms : [...ms, { id: u.id, nome: u.nome }]));
    setBusca(null);
    const pos = busca.inicio + u.nome.length + 2;
    requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(pos, pos); });
  };
  const teclas = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (busca && candidatos.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setIndice(i => (i + 1) % candidatos.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIndice(i => (i - 1 + candidatos.length) % candidatos.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); escolher(candidatos[indice]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); setBusca(null); return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) publicar();
  };
  // Na edição não há anexos (os arquivos da atualização ficam como estão).
  const adicionar = (fs: FileList | File[] | null) => { if (fs?.length && !onSalvar) setArquivos(a => [...a, ...Array.from(fs)]); };
  const colar = (e: ClipboardEvent) => { if (e.clipboardData.files.length) { e.preventDefault(); adicionar(e.clipboardData.files); } };
  const soltar = (e: DragEvent) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files); };

  const publicar = async () => {
    if (enviando || (!texto.trim() && !arquivos.length)) return;
    // "@Nome" das pessoas escolhidas vira a marca @{uid} guardada no banco.
    let final = texto.trim();
    const ids: string[] = [];
    for (const m of [...mencoes].sort((a, b) => b.nome.length - a.nome.length)) {
      if (final.includes(`@${m.nome}`)) { final = final.split(`@${m.nome}`).join(`@{${m.id}}`); ids.push(m.id); }
    }
    try {
      if (onSalvar) {
        if (!final) return;
        setEnviando('Salvando…');
        await onSalvar(final, ids);
        return;
      }
      setEnviando('Publicando…');
      const a = await criar('atualizacoes', { item_id: item.id, usuario_id: nav.usuario?.id, texto: final || ' ', mencoes: ids, resposta_de: respostaDe ?? null });
      const anexos: Row[] = [];
      for (const [i, f] of arquivos.entries()) {
        setEnviando(`Enviando arquivo ${i + 1} de ${arquivos.length}…`);
        anexos.push(await enviarArquivo(item.id, f, a.id));
      }
      onPublicado?.(a, anexos);
      setTexto(''); setArquivos([]); setMencoes([]);
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className={`composer${compacto ? ' compacto' : ''}${arrastando ? ' arrastando' : ''}`}
      onDragOver={e => { if (!onSalvar && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true); } }}
      onDragLeave={() => setArrastando(false)} onDrop={soltar}>
      <textarea ref={area} rows={compacto ? 2 : 3} autoFocus={compacto || !!onSalvar}
        placeholder={respostaDe ? 'Escreva uma resposta… use @ para marcar alguém' : 'Escreva uma atualização… use @ para marcar alguém'}
        value={texto} onChange={e => { setTexto(e.target.value); detectar(e.target.value, e.target.selectionStart); }}
        onKeyDown={teclas} onPaste={colar} onClick={e => detectar(texto, e.currentTarget.selectionStart)} />
      {busca && candidatos.length > 0 && (
        <div className="mencao-lista" role="listbox">
          {candidatos.map((u, i) => (
            <button key={u.id} role="option" aria-selected={i === indice} className={i === indice ? 'on' : ''} onMouseDown={e => { e.preventDefault(); escolher(u); }}>
              <Avatar nome={u.nome} cor={u.cor} tamanho={24} /><span>{u.nome}</span>
            </button>
          ))}
        </div>
      )}
      {nomesSemAcesso.length > 0 && (
        <p className="composer-sem-acesso" role="status">
          <Lock size={14} />
          <span>
            {nomesSemAcesso.join(', ')} {nomesSemAcesso.length === 1
              ? 'não tem acesso a este quadro: recebe o aviso com o trecho, mas não consegue abrir o item.'
              : 'não têm acesso a este quadro: recebem o aviso com o trecho, mas não conseguem abrir o item.'}
          </span>
        </p>
      )}
      {arquivos.length > 0 && (
        <div className="anexos-pendentes">
          {arquivos.map((f, i) => (
            <span key={i} className="anexo-chip"><IconeTipo nome={f.name} mime={f.type} tamanho={15} />{f.name}<small>{fmtTamanho(f.size)}</small>
              <button aria-label={`Remover ${f.name}`} onClick={() => setArquivos(a => a.filter((_, k) => k !== i))}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-barra">
        {!onSalvar && <button className="btn-icone" title="Anexar arquivos" aria-label="Anexar arquivos" onClick={() => seletor.current?.click()}><Paperclip size={16} /></button>}
        <button className="btn-icone" title="Marcar pessoa" aria-label="Marcar pessoa" onClick={() => {
          const el = area.current; if (!el) return;
          const c = el.selectionStart; const prefixo = c > 0 && !/\s/.test(texto[c - 1]) ? ' @' : '@';
          const novo = texto.slice(0, c) + prefixo + texto.slice(c);
          setTexto(novo);
          requestAnimationFrame(() => { el.focus(); el.setSelectionRange(c + prefixo.length, c + prefixo.length); detectar(novo, c + prefixo.length); });
        }}><AtSign size={16} /></button>
        <input ref={seletor} type="file" multiple hidden onChange={e => { adicionar(e.target.files); e.target.value = ''; }} />
        <small className="muted">{enviando ?? (arrastando ? 'Solte os arquivos aqui' : onSalvar ? 'Ctrl+Enter para salvar' : 'Ctrl+Enter para publicar')}</small>
        <span className="espaco" />
        {onCancelar && <button className="fr-btn" onClick={onCancelar}>Cancelar</button>}
        <button className="fr-btn btn-primario" onClick={publicar} disabled={!!enviando || (!texto.trim() && !arquivos.length)}>{onSalvar ? 'Salvar' : respostaDe ? 'Responder' : 'Atualizar'}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- arquivos anexados (grade)
export function GradeAnexos({ anexos, onExcluir }: { anexos: Row[]; onExcluir?: (a: Row) => void }) {
  if (!anexos.length) return null;
  return (
    <div className="grade-anexos">
      {anexos.map(a => (
        <div key={a.id} className="anexo">
          <a href={urlArquivo(a)} target="_blank" rel="noreferrer" className="anexo-visual" title={`Abrir ${a.nome}`}>
            {eImagem(a) ? <img src={urlArquivo(a)} alt={a.nome} loading="lazy" /> : <IconeTipo nome={a.nome} mime={a.mime} tamanho={30} />}
          </a>
          <div className="anexo-info">
            <span className="anexo-nome" title={a.nome}>{a.nome}</span>
            <small className="muted">{fmtTamanho(a.tamanho ?? 0)}</small>
          </div>
          <div className="anexo-acoes">
            <a className="btn-icone" href={urlArquivo(a)} target="_blank" rel="noreferrer" title="Abrir"><ExternalLink size={14} /></a>
            <a className="btn-icone" href={urlArquivo(a, true)} title="Baixar"><Download size={14} /></a>
            {onExcluir && <button className="btn-icone" title="Excluir" onClick={() => onExcluir(a)}><Trash2 size={14} /></button>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- aba Atualizações
export function Atualizacoes({ item, acoes }: { item: Item; acoes: Acoes }) {
  const [lista, setLista] = useState<Row[] | null>(null);
  const [anexos, setAnexos] = useState<Row[]>([]);
  useEffect(() => {
    const filtro = { quadro_id: item.quadro_id, item_id: item.id };
    Promise.all([listar('atualizacoes', filtro), listar('anexos', filtro)]).then(([a, x]) => {
      setLista(a); setAnexos(x);
      // Abriu as atualizações: tudo lido (a bolha do item fica cinza).
      const ultima = Math.max(0, ...a.map(u => Number(u.id)));
      if (ultima) {
        acoes.ajustarItem(item.id, { atualizacoes_novas: false });
        marcarAtualizacoesLidas(item.id, ultima).catch(e => console.warn('[friday] não foi possível marcar como lidas', e));
      }
    });
  }, [item.id, item.quadro_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const publicado = (a: Row, novos: Row[]) => {
    setLista(l => [a, ...(l ?? [])]);
    setAnexos(x => [...novos, ...x]);
    acoes.contarAtualizacao(item.id, 1);
    if (novos.length) acoes.ajustarItem(item.id, { n_anexos: (item.n_anexos ?? 0) + novos.length });
  };
  const principais = (lista ?? []).filter(a => !a.resposta_de);
  const respostas = (id: number) => (lista ?? []).filter(a => a.resposta_de === id).sort((a, b) => a.id - b.id);
  const removido = (ids: number[]) => { setLista(l => l && l.filter(a => !ids.includes(a.id))); setAnexos(x => x.filter(a => !ids.includes(a.atualizacao_id))); acoes.contarAtualizacao(item.id, -ids.length); };
  const editado = (a: Row) => setLista(l => l && l.map(x => (x.id === a.id ? a : x)));

  return (
    <div className="atualizacoes">
      <Composer item={item} onPublicado={publicado} />
      {lista?.length === 0 && (
        <div className="vazio-painel"><MessageCircle size={36} /><p>Nenhuma atualização ainda.</p>
          <small>Registre o andamento, marque pessoas com @ e anexe documentos (arraste para cá ou cole uma imagem).</small></div>
      )}
      {principais.map(a => (
        <CartaoAtualizacao key={a.id} a={a} item={item} anexos={anexos.filter(x => x.atualizacao_id === a.id)}
          respostas={respostas(a.id)} anexosDe={id => anexos.filter(x => x.atualizacao_id === id)}
          onPublicado={publicado} onRemovido={removido} onEditado={editado} />
      ))}
    </div>
  );
}

// Texto da atualização ou, editando, a caixa de edição (Salvar grava o texto novo e marca "editado").
function TextoOuEdicao({ a, item, editando, onFim, onEditado }: { a: Row; item: Item; editando: boolean; onFim: () => void; onEditado: (a: Row) => void }) {
  if (!editando) return <TextoAtualizacao texto={a.texto} />;
  return (
    <Composer item={item} compacto edicao={a.texto} onCancelar={onFim}
      onSalvar={async (texto, mencoes) => { onEditado(await atualizar('atualizacoes', a.id, { texto, mencoes })); onFim(); }} />
  );
}

function CartaoAtualizacao({ a, item, anexos, respostas, anexosDe, onPublicado, onRemovido, onEditado }: {
  a: Row; item: Item; anexos: Row[]; respostas: Row[]; anexosDe: (id: number) => Row[]; onPublicado: (a: Row, anexos: Row[]) => void; onRemovido: (ids: number[]) => void;
  onEditado: (a: Row) => void;
}) {
  const [responder, setResponder] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  return (
    <article className="atualizacao">
      <Cabecalho a={a} onRemovido={() => onRemovido([a.id, ...respostas.map(r => r.id)])} onEditar={() => setEditando(a.id)} />
      <TextoOuEdicao a={a} item={item} editando={editando === a.id} onFim={() => setEditando(null)} onEditado={onEditado} />
      <GradeAnexos anexos={anexos} />
      <footer className="at-rodape">
        <button className="fr-btn-link" onClick={() => setResponder(true)}><Reply size={14} /> Responder</button>
        {respostas.length > 0 && <small className="muted">{respostas.length} {respostas.length === 1 ? 'resposta' : 'respostas'}</small>}
      </footer>
      {(respostas.length > 0 || responder) && (
        <div className="respostas">
          {respostas.map(r => (
            <div key={r.id} className="resposta">
              <Cabecalho a={r} pequeno onRemovido={() => onRemovido([r.id])} onEditar={() => setEditando(r.id)} />
              <TextoOuEdicao a={r} item={item} editando={editando === r.id} onFim={() => setEditando(null)} onEditado={onEditado} />
              <GradeAnexos anexos={anexosDe(r.id)} />
            </div>
          ))}
          {responder && <Composer item={item} respostaDe={a.id} compacto onPublicado={(n, x) => { onPublicado(n, x); setResponder(false); }} onCancelar={() => setResponder(false)} />}
        </div>
      )}
    </article>
  );
}

function Cabecalho({ a, pequeno, onRemovido, onEditar }: { a: Row; pequeno?: boolean; onRemovido: () => void; onEditar: () => void }) {
  const nav = useNav();
  const confirmar = useConfirmar();
  const menu = usePopover<HTMLButtonElement>();
  const u = nav.usuarios.find(x => x.id === a.usuario_id);
  // Trazida do monday: autor é o funcionário ligado ou, sem vínculo, o nome que tinha lá.
  const nome = u?.nome ?? a.autor_monday ?? '—';
  return (
    <header className="at-cab">
      <Avatar nome={u?.nome ?? a.autor_monday ?? '?'} cor={u?.cor} tamanho={pequeno ? 26 : 32} />
      <strong>{nome}</strong>
      <small className="muted" title={a.criado_em}>{tempoRelativo(a.criado_em)}</small>
      {a.via === 'api' && <span className="selo-api" title={`Publicada pela API em nome de ${u?.nome ?? '?'} (chave ${a.chave_api ?? '?'})`}>API</span>}
      {String(a.origem_id ?? '').startsWith('monday:') && <span className="selo-monday" title={`Copiada do monday${u ? '' : ' (autor sem funcionário ligado)'}`}>monday</span>}
      {/* Editada: só a marca e quando (não há histórico das versões). */}
      {a.editado_em && <small className="muted at-editado" title={`Editado em ${String(a.editado_em).slice(8, 10)}/${String(a.editado_em).slice(5, 7)}/${String(a.editado_em).slice(0, 4)} às ${String(a.editado_em).slice(11, 16)}`}>· editado {tempoRelativo(a.editado_em)}</small>}
      <span className="espaco" />
      {a.usuario_id === nav.usuario?.id && (
        <>
          <button ref={menu.ref} className="btn-icone" aria-label="Opções da atualização" onClick={menu.alternar}><MoreHorizontal size={15} /></button>
          {menu.aberto && (
            <Popover ancora={menu.ref.current} onClose={menu.fechar} alinhar="fim" largura={200}>
              <Menu onEscolher={menu.fechar} itens={[{ rotulo: 'Editar', icone: <Pencil size={15} />, onClick: onEditar }, { rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onClick: async () => {
                if (await confirmar('Excluir esta atualização, as respostas e os arquivos dela?')) { await excluir('atualizacoes', a.id); onRemovido(); }
              } }]} />
            </Popover>
          )}
        </>
      )}
    </header>
  );
}

// ---------------------------------------------------------------- aba Arquivos
export function Arquivos({ item, onContagem }: { item: Item; onContagem?: (n: number) => void }) {
  const nav = useNav();
  const confirmar = useConfirmar();
  const avisarErro = useAvisoRapido();
  const seletor = useRef<HTMLInputElement>(null);
  const [anexos, setAnexos] = useState<Row[] | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  useEffect(() => { listar('anexos', { quadro_id: item.quadro_id, item_id: item.id }).then(setAnexos); }, [item.id, item.quadro_id]);
  const avisar = useRef(onContagem);
  avisar.current = onContagem;
  useEffect(() => { if (anexos) avisar.current?.(anexos.length); }, [anexos]);

  const enviar = async (fs: FileList | null) => {
    if (!fs?.length) return;
    try {
      for (const [i, f] of Array.from(fs).entries()) {
        setEnviando(`Enviando ${i + 1} de ${fs.length}…`);
        const a = await enviarArquivo(item.id, f);
        setAnexos(x => [a, ...(x ?? [])]);
      }
    } catch (e) { avisarErro((e as Error).message); } finally { setEnviando(null); }
  };
  const quem = (id: unknown) => nav.nomeUsuario(id);

  let conteudo: ReactNode = <p className="muted">Carregando…</p>;
  if (anexos) conteudo = anexos.length ? (
    <div className="lista-arquivos">
      {anexos.map(a => (
        <div key={a.id} className="arquivo-linha">
          <a className="arquivo-mini" href={urlArquivo(a)} target="_blank" rel="noreferrer">
            {eImagem(a) ? <img src={urlArquivo(a)} alt="" loading="lazy" /> : <IconeTipo nome={a.nome} mime={a.mime} tamanho={22} />}
          </a>
          <div className="arquivo-desc">
            <a href={urlArquivo(a)} target="_blank" rel="noreferrer" className="anexo-nome">{a.nome}</a>
            <small className="muted">{fmtTamanho(a.tamanho ?? 0)} · {quem(a.usuario_id)} · {tempoRelativo(a.criado_em)}{a.atualizacao_id ? ' · em uma atualização' : ''}</small>
          </div>
          <a className="btn-icone" href={urlArquivo(a, true)} title="Baixar"><Download size={15} /></a>
          <button className="btn-icone" title="Excluir" onClick={async () => { if (await confirmar(`Excluir o arquivo “${a.nome}”?`)) { await excluir('anexos', a.id); setAnexos(x => x && x.filter(y => y.id !== a.id)); } }}><Trash2 size={15} /></button>
        </div>
      ))}
    </div>
  ) : <div className="vazio-painel"><Paperclip size={36} /><p>Nenhum arquivo.</p><small>Projetos, contratos, ARTs, fotos da obra…</small></div>;

  return (
    <div className={`arquivos${arrastando ? ' arrastando' : ''}`}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true); } }}
      onDragLeave={() => setArrastando(false)} onDrop={e => { e.preventDefault(); setArrastando(false); enviar(e.dataTransfer.files); }}>
      <div className="zona-envio" onClick={() => seletor.current?.click()}>
        <Upload size={18} /> {enviando ?? (arrastando ? 'Solte para enviar' : 'Arraste arquivos aqui ou clique para escolher')}
        <input ref={seletor} type="file" multiple hidden onChange={e => { enviar(e.target.files); e.target.value = ''; }} />
      </div>
      {conteudo}
    </div>
  );
}
