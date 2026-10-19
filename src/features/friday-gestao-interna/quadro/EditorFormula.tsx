import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { useNav } from '../nav.tsx';
import { Modal } from '../ui/base.tsx';
import { analisar, calcular, COLUNAS_DO_ITEM, FUNCOES, paraIds, paraTitulos, textoResultado } from './formula.ts';
import { infoTipo, type Coluna, type Item } from './tipos.ts';

// Editor de fórmula: o usuário escreve com {Título da coluna}; o app guarda com os ids.
export function EditorFormula({ coluna, colunas, itens, onSalvar, onFechar }: {
  coluna: Coluna; colunas: Coluna[]; itens: Item[]; onSalvar: (formula: string, titulo: string) => void; onFechar: () => void;
}) {
  const nav = useNav();
  const area = useRef<HTMLTextAreaElement>(null);
  const [texto, setTexto] = useState(() => paraTitulos(String(coluna.config.formula ?? ''), colunas));
  const [titulo, setTitulo] = useState(coluna.titulo);
  const [busca, setBusca] = useState('');
  const outras = colunas.filter(c => c.id !== coluna.id);

  const comIds = useMemo(() => paraIds(texto, colunas), [texto, colunas]);
  const validacao = useMemo(() => {
    try {
      analisar(comIds);
      const faltando = [...comIds.matchAll(/\{\?([^}]+)\}/g)].map(m => m[1]);
      return faltando.length ? { erro: `Coluna não encontrada: ${faltando.map(f => `{${f}}`).join(', ')}` } : { ok: true };
    } catch (e) { return { erro: (e as Error).message }; }
  }, [comIds]);
  const previa = useMemo(() => {
    if (!('ok' in validacao)) return [];
    const temp = { ...coluna, config: { ...coluna.config, formula: comIds } };
    const cols = colunas.map(c => (c.id === coluna.id ? temp : c));
    return itens.slice(0, 6).map(it => ({ item: it, r: calcular(temp, it, { colunas: cols, nomeUsuario: nav.nomeUsuario }) }));
  }, [validacao, comIds, coluna, colunas, itens, nav.nomeUsuario]);

  const inserir = (trecho: string, recuo = 0) => {
    const el = area.current;
    if (!el) return;
    const ini = el.selectionStart, fim = el.selectionEnd;
    const novo = texto.slice(0, ini) + trecho + texto.slice(fim);
    setTexto(novo);
    requestAnimationFrame(() => { el.focus(); const p = ini + trecho.length - recuo; el.setSelectionRange(p, p); });
  };

  const b = busca.trim().toLowerCase();
  const funcoes = Object.entries(FUNCOES).filter(([n, f]) => !b || n.toLowerCase().includes(b) || f.descricao.toLowerCase().includes(b));
  const grupos = [...new Set(funcoes.map(([, f]) => f.grupo))];

  return (
    <Modal titulo="Fórmula" largura={980} onClose={onFechar}
      rodape={<>
        <span className="muted fr-small rodape-dica">Use {'{Nome da coluna}'} para pegar valores do item. Textos entre aspas. Separe argumentos com vírgula.</span>
        <button className="fr-btn" onClick={onFechar}>Cancelar</button>
        <button className="fr-btn btn-primario" disabled={!('ok' in validacao) || !titulo.trim()} onClick={() => { onSalvar(comIds, titulo.trim()); onFechar(); }}>Salvar fórmula</button>
      </>}>
      <div className="editor-formula">
        <div className="ef-principal">
          <label className="campo-form">Nome da coluna<input className="input-cheio" value={titulo} onChange={e => setTitulo(e.target.value)} /></label>
          <textarea ref={area} className="ef-texto" spellCheck={false} rows={12} value={texto} onChange={e => setTexto(e.target.value)}
            placeholder={'Ex.: IF({Status} = "Feito", "Concluído", "Pendente")'} />
          <div className={`ef-validacao${'ok' in validacao ? ' ok' : ' erro'}`}>
            {'ok' in validacao ? <><CheckCircle2 size={15} /> Fórmula válida</> : <><AlertTriangle size={15} /> {validacao.erro}</>}
          </div>
          {previa.length > 0 && (
            <div className="ef-previa">
              <div className="menu-titulo">Prévia nos primeiros itens</div>
              {previa.map(({ item, r }) => (
                <div key={item.id} className="ef-previa-linha">
                  <span className="ef-item" title={item.nome}>{item.nome}</span>
                  <span className={r.erro ? 'texto-alerta' : ''}>{r.erro ? r.erro : textoResultado(r.valor) || <span className="muted">(vazio)</span>}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className="ef-lateral">
          <div className="menu-titulo">Colunas — clique para inserir</div>
          <div className="ef-colunas">
            {outras.map(c => {
              const Ic = infoTipo(c.tipo).icone;
              return (
                <span key={c.id} className="ef-col">
                  <button onClick={() => inserir(`{${c.titulo}}`)} title={`Inserir {${c.titulo}}`}><Ic size={13} /> {c.titulo}</button>
                  {c.tipo === 'periodo' && <><button className="ef-mod" onClick={() => inserir(`{${c.titulo}#Start}`)}>início</button><button className="ef-mod" onClick={() => inserir(`{${c.titulo}#End}`)}>fim</button></>}
                </span>
              );
            })}
            {COLUNAS_DO_ITEM.map(c => <span key={c.ref} className="ef-col"><button onClick={() => inserir(`{${c.titulo}}`)}>{c.titulo}</button></span>)}
          </div>
          <div className="menu-titulo">Funções</div>
          <label className="busca-pop"><Search size={14} /><input placeholder="Buscar função" value={busca} onChange={e => setBusca(e.target.value)} /></label>
          <div className="ef-funcoes">
            {grupos.map(g => (
              <div key={g}>
                <div className="ef-grupo">{g}</div>
                {funcoes.filter(([, f]) => f.grupo === g).map(([nome, f]) => (
                  <button key={nome} className="ef-funcao" onClick={() => inserir(`${nome}()`, 1)} title={f.descricao}>
                    <code>{f.sintaxe}</code><small>{f.descricao}</small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
