import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { CloudDownload, LayoutGrid, Lock, RefreshCw, Search, Square } from 'lucide-react';
import { functions } from '../funcoes.ts';
import { Modal } from '../ui/base.tsx';
import { useAuth } from '../../../contexts/AuthContext';
import { useNav } from '../nav.tsx';
import { useNavigate } from '../rotas.tsx';

// Importação dos quadros do monday (Functions fridayMondayInventario e fridayMondayImportarQuadro, só adm2).
// Um quadro por chamada: dá para acompanhar, parar e continuar depois ("puxar o que falta").

type Situacao = 'novo' | 'importado' | 'atualizar' | 'erro';
type QuadroMonday = {
  id: string; nome: string; itens: number; area: string; pasta: string | null; situacao: Situacao;
  monday_atualizado_em: string | null; importado_em: string | null; quadro_id: number | null; mensagem: string | null;
  /** Quadro que virou cadastro oficial: atualiza só com prévia (fora do lote). */
  oficial?: boolean;
};
type Contagem = { criados: number; atualizados: number; iguais: number; preservados: number; ignorados: number };
type Resultado = Contagem & { quadro_id: number; itens_monday: number; subitens: Contagem; colunas_ignoradas: number };
type Execucao = { id: string; estado: 'fila' | 'importando' | 'ok' | 'erro'; resultado?: Resultado; erro?: string };

const ROTULO: Record<Situacao, string> = { novo: 'Novo', importado: 'Importado', atualizar: 'Com novidades', erro: 'Erro' };

const inventario = httpsCallable<void, { quadros: QuadroMonday[]; gerado_em: string }>(functions, 'fridayMondayInventario', { timeout: 130_000 });
const importarQuadro = httpsCallable<{ boardId: string }, Resultado>(functions, 'fridayMondayImportarQuadro', { timeout: 560_000 });
// Quadro oficial ligado a um cadastro existente (ex.: GESTÃO DE OBRAS → obras-v2): prévia, depois gravação; o monday vale.
type Mudanca = { coluna: string; de: string; para: string; recusa?: string };
type ParteOficial = { novos: string[]; alterados: { nome: string; mudancas: Mudanca[] }[]; iguais: number; sumidos: string[]; colunas_novas: string[] };
type ResultadoOficial = {
  oficial: true; modo: 'previa' | 'aplicar'; nome: string; quadro_id: number; colecao: string;
  itens: ParteOficial; subitens: ParteOficial | null; grupos_novos: string[]; recusados: string[];
};
const importarOficial = httpsCallable<{ boardId: string; modo: 'previa' | 'aplicar' }, ResultadoOficial>(functions, 'fridayMondayImportarQuadro', { timeout: 560_000 });

const mensagemDe = (e: unknown) => (e as { message?: string })?.message?.replace(/^.*?:\s*/, '') || String(e);

export default function ImportarMonday() {
  const { authorizationProfile } = useAuth();
  if (authorizationProfile?.adm2 !== true) return <div className="pagina"><h1>Importar do monday</h1><p className="muted">Disponível só para adm2.</p></div>;
  return <Importador />;
}

function Importador() {
  const nav = useNav();
  const navigate = useNavigate();
  const [quadros, setQuadros] = useState<QuadroMonday[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [execucao, setExecucao] = useState<Map<string, Execucao>>(new Map());
  const [rodando, setRodando] = useState(false);
  const parar = useRef(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try { setQuadros((await inventario()).data.quadros); } catch (e) { setErro(mensagemDe(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (quadros ?? []).filter(q => !t || `${q.nome} ${q.area} ${q.pasta ?? ''}`.toLowerCase().includes(t));
  }, [quadros, busca]);
  const pendentes = (quadros ?? []).filter(q => q.situacao !== 'importado' && !q.oficial);
  const [previa, setPrevia] = useState<QuadroMonday | null>(null);
  const marcar = (id: string) => setMarcados(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Importa em sequência, um quadro por vez; "Parar" termina depois do quadro atual.
  const importar = async (ids: string[]) => {
    if (!ids.length || rodando) return;
    parar.current = false;
    setRodando(true);
    setExecucao(new Map(ids.map(id => [id, { id, estado: 'fila' }])));
    for (const id of ids) {
      if (parar.current) break;
      setExecucao(m => new Map(m).set(id, { id, estado: 'importando' }));
      try {
        const { data } = await importarQuadro({ boardId: id });
        setExecucao(m => new Map(m).set(id, { id, estado: 'ok', resultado: data }));
      } catch (e) {
        setExecucao(m => new Map(m).set(id, { id, estado: 'erro', erro: mensagemDe(e) }));
      }
    }
    setRodando(false);
    setMarcados(new Set());
    await Promise.all([carregar(), nav.recarregar()]);
  };

  const feitos = [...execucao.values()].filter(x => x.estado === 'ok' || x.estado === 'erro').length;
  const somar = (k: keyof Contagem) => [...execucao.values()].reduce((s, x) => s + (x.resultado ? x.resultado[k] + x.resultado.subitens[k] : 0), 0);

  return (
    <div className="pagina pagina-importar">
      <header className="pagina-cab">
        <div>
          <h1><CloudDownload size={22} /> Importar do monday</h1>
          <p className="muted">Traz os quadros do monday para o Friday (o monday só é lido). Repetir é seguro: entra o que falta, itens que ninguém mexeu no Friday são atualizados e os editados aqui são preservados. Quadros oficiais (cadeado) ficam fora do lote: atualize cada um pela prévia, e neles o monday vale.</p>
        </div>
        <div className="importar-acoes">
          <button className="fr-btn" onClick={() => void carregar()} disabled={rodando}><RefreshCw size={15} /> Atualizar lista</button>
          {rodando
            ? <button className="fr-btn" onClick={() => { parar.current = true; }}><Square size={14} /> Parar depois deste</button>
            : <>
              <button className="fr-btn" disabled={!marcados.size} onClick={() => void importar([...marcados])}>Importar selecionados ({marcados.size})</button>
              <button className="fr-btn btn-primario" disabled={!pendentes.length} onClick={() => void importar(pendentes.map(q => q.id))}>Puxar o que falta ({pendentes.length})</button>
            </>}
        </div>
      </header>
      <p className="aviso-leitura">Enquanto não houver permissões por quadro no Friday, todo funcionário ativo vê os quadros importados — inclusive dados pessoais (RH, CRM, currículos).</p>

      {execucao.size > 0 && (
        <div className="importar-progresso">
          <strong>{rodando ? `Importando ${feitos + 1} de ${execucao.size}…` : `Concluído: ${feitos} de ${execucao.size} quadro(s)`}</strong>
          <span className="muted">{somar('criados')} novos · {somar('atualizados')} atualizados · {somar('preservados')} preservados (editados no Friday) · {[...execucao.values()].filter(x => x.estado === 'erro').length} com erro</span>
          <div className="importar-barra"><span style={{ width: `${(feitos / execucao.size) * 100}%` }} /></div>
        </div>
      )}

      <div className="arquivo-barra">
        <label className="busca-barra"><Search size={15} /><input placeholder="Buscar quadro, área ou pasta" value={busca} onChange={e => setBusca(e.target.value)} /></label>
        {quadros && <span className="muted fr-small">{filtrados.length} de {quadros.length} quadros · {pendentes.length} para puxar</span>}
      </div>

      {erro ? <div className="vazio-painel"><CloudDownload size={36} /><p>Não foi possível ler o monday: {erro}</p></div>
        : !quadros ? <p className="muted">Lendo os quadros do monday…</p>
        : !filtrados.length ? <div className="vazio-painel"><LayoutGrid size={36} /><p>Nenhum quadro encontrado.</p></div>
        : (
          <div className="arquivo-lista lista-arquivos">
            {filtrados.map((q, k) => {
              const ex = execucao.get(q.id);
              const titulo = `${q.area}${q.pasta ? ` · ${q.pasta}` : ''}`;
              const anterior = filtrados[k - 1];
              return (
                <div key={q.id}>
                  {(!anterior || `${anterior.area}${anterior.pasta ? ` · ${anterior.pasta}` : ''}` !== titulo) && <div className="importar-secao">{titulo}</div>}
                  <label className="arquivo-linha importar-linha">
                    <input type="checkbox" className="caixa" checked={marcados.has(q.id)} disabled={rodando || q.oficial} onChange={() => marcar(q.id)}
                      title={q.oficial ? 'Quadro oficial: atualize pela prévia' : undefined} />
                    <div className="arquivo-nome">
                      <strong>{q.nome}</strong>
                      <small className="muted">
                        {q.itens} itens no monday{q.importado_em ? ` · importado em ${q.importado_em.slice(0, 16)}` : ''}
                        {q.situacao === 'erro' && q.mensagem ? ` · ${q.mensagem}` : ''}
                      </small>
                      {ex?.estado === 'ok' && ex.resultado && (
                        <small className="importar-resultado">
                          {ex.resultado.criados} novos, {ex.resultado.atualizados} atualizados, {ex.resultado.iguais} sem mudança, {ex.resultado.preservados} preservados
                          {ex.resultado.subitens.criados + ex.resultado.subitens.atualizados > 0 && ` · subitens: ${ex.resultado.subitens.criados} novos, ${ex.resultado.subitens.atualizados} atualizados`}
                          {ex.resultado.colunas_ignoradas > 0 && ` · ${ex.resultado.colunas_ignoradas} coluna(s) sem equivalente`}
                        </small>
                      )}
                      {ex?.estado === 'erro' && <small className="texto-alerta">{ex.erro}</small>}
                    </div>
                    <span className={`importar-selo selo-${ex?.estado === 'importando' ? 'importando' : ex?.estado === 'fila' ? 'fila' : q.situacao}`}>
                      {ex?.estado === 'importando' ? 'Importando…' : ex?.estado === 'fila' ? 'Na fila' : ROTULO[q.situacao]}
                    </span>
                    {q.oficial && <button type="button" className="fr-btn" disabled={rodando} onClick={e => { e.preventDefault(); setPrevia(q); }}><Lock size={13} /> Prévia e atualizar</button>}
                    {q.quadro_id != null && <button type="button" className="fr-btn" onClick={e => { e.preventDefault(); navigate(`/quadros/${q.quadro_id}`); }}>Abrir</button>}
                  </label>
                </div>
              );
            })}
          </div>
        )}
      {previa && <PreviaOficial quadro={previa} onFechar={() => setPrevia(null)} onPronto={() => void Promise.all([carregar(), nav.recarregar()])} />}
    </div>
  );
}

/** Prévia do que muda num quadro oficial e, confirmada, a gravação (o monday vale para o que mudou lá). */
function PreviaOficial({ quadro, onFechar, onPronto }: { quadro: QuadroMonday; onFechar: () => void; onPronto: () => void }) {
  const [r, setR] = useState<ResultadoOficial | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(true);
  useEffect(() => {
    let vivo = true;
    importarOficial({ boardId: quadro.id, modo: 'previa' })
      .then(x => { if (vivo) setR(x.data); }, e => { if (vivo) setErro(mensagemDe(e)); })
      .finally(() => { if (vivo) setOcupado(false); });
    return () => { vivo = false; };
  }, [quadro.id]);
  const aplicar = async () => {
    setOcupado(true); setErro(null);
    try { setR((await importarOficial({ boardId: quadro.id, modo: 'aplicar' })).data); onPronto(); }
    catch (e) { setErro(mensagemDe(e)); }
    finally { setOcupado(false); }
  };
  const feito = r?.modo === 'aplicar';
  const nada = !!r && !r.itens.novos.length && !r.itens.alterados.length && !r.subitens?.novos.length && !r.subitens?.alterados.length;
  return (
    <Modal titulo={`${feito ? 'Atualizado' : 'Prévia'}: “${quadro.nome}”`} largura={720} onClose={() => { if (!ocupado) onFechar(); }}
      rodape={<div className="form-acoes">
        <button type="button" className="fr-btn" disabled={ocupado} onClick={onFechar}>{feito ? 'Fechar' : 'Cancelar'}</button>
        {!feito && <button className="fr-btn btn-primario" disabled={!r || ocupado || nada} onClick={() => void aplicar()}>{ocupado && r ? 'Atualizando…' : 'Atualizar do monday'}</button>}
      </div>}>
      <p className="muted fr-small">
        Quadro oficial ({r?.colecao ?? 'cadastro'}): o monday vale. Itens e subitens que mudaram no monday desde a última importação têm as
        colunas do monday regravadas, mesmo se editados aqui; as colunas ligadas vão para o cadastro. O que existe só no Friday fica.
      </p>
      {erro && <p className="texto-alerta">{erro}</p>}
      {!r && !erro && <p className="muted">Lendo o monday e comparando…</p>}
      {r && (
        <>
          {feito && <p className="importar-resultado">Gravado. {r.recusados.length ? `${r.recusados.length} valor(es) não couberam no cadastro (abaixo).` : 'Nenhum valor recusado.'}</p>}
          {nada && !feito && <p className="muted">Nada mudou no monday desde a última importação.</p>}
          <ParteDaPrevia titulo="Itens" parte={r.itens} />
          {r.subitens && <ParteDaPrevia titulo="Subitens" parte={r.subitens} />}
          {r.grupos_novos.length > 0 && <div className="conc-secao"><strong>Grupos novos</strong><span className="fr-small">{r.grupos_novos.join(' · ')}</span></div>}
          {r.recusados.length > 0 && (
            <div className="conc-secao"><strong className="texto-alerta">Valores que não cabem no cadastro (não são gravados)</strong>
              <div className="conc-lista">{r.recusados.map((x, k) => <span key={k} className="fr-small">{x}</span>)}</div></div>
          )}
        </>
      )}
    </Modal>
  );
}

function ParteDaPrevia({ titulo, parte }: { titulo: string; parte: ParteOficial }) {
  return (
    <div className="conc-secao">
      <strong>{titulo}</strong>
      <div className="conc-chips">
        <span className="conc-chip ok">{parte.novos.length} novos</span>
        <span className="conc-chip ok">{parte.alterados.length} alterados</span>
        <span className="conc-chip">{parte.iguais} sem mudança</span>
        {parte.sumidos.length > 0 && <span className="conc-chip atencao">{parte.sumidos.length} não vieram do monday</span>}
        {parte.colunas_novas.length > 0 && <span className="conc-chip">{parte.colunas_novas.length} coluna(s) nova(s)</span>}
      </div>
      {parte.novos.length > 0 && <details><summary>Novos</summary><div className="conc-lista">{parte.novos.map((x, k) => <span key={k} className="fr-small">{x}</span>)}</div></details>}
      {parte.alterados.length > 0 && (
        <details open={parte.alterados.length <= 10}><summary>Alterados</summary>
          <div className="conc-lista">{parte.alterados.map((a, k) => (
            <div key={k} className="fr-small"><strong>{a.nome}</strong>
              {a.mudancas.map((m, j) => <div key={j} className={m.recusa ? 'texto-alerta' : 'muted'}>{m.coluna}: {m.de} → {m.para}{m.recusa ? ` (não grava: ${m.recusa})` : ''}</div>)}
            </div>
          ))}</div>
        </details>
      )}
      {parte.sumidos.length > 0 && <details><summary>Não vieram do monday (arquivados ou apagados lá; ficam como estão)</summary><div className="conc-lista">{parte.sumidos.map((x, k) => <span key={k} className="fr-small">{x}</span>)}</div></details>}
      {parte.colunas_novas.length > 0 && <details><summary>Colunas novas (entram livres)</summary><div className="conc-lista">{parte.colunas_novas.map((x, k) => <span key={k} className="fr-small">{x}</span>)}</div></details>}
    </div>
  );
}
