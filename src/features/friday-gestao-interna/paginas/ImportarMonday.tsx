import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { CloudDownload, LayoutGrid, RefreshCw, Search, Square } from 'lucide-react';
import { functions } from '../funcoes.ts';
import { useAuth } from '../../../contexts/AuthContext';
import { useNav } from '../nav.tsx';
import { useNavigate } from '../rotas.tsx';

// Importação dos quadros do monday (Functions fridayMondayInventario e fridayMondayImportarQuadro, só adm2).
// Um quadro por chamada: dá para acompanhar, parar e continuar depois ("puxar o que falta").

type Situacao = 'novo' | 'importado' | 'atualizar' | 'erro';
type QuadroMonday = {
  id: string; nome: string; itens: number; area: string; pasta: string | null; situacao: Situacao;
  monday_atualizado_em: string | null; importado_em: string | null; quadro_id: number | null; mensagem: string | null;
};
type Contagem = { criados: number; atualizados: number; iguais: number; preservados: number; ignorados: number };
type Resultado = Contagem & { quadro_id: number; itens_monday: number; subitens: Contagem; colunas_ignoradas: number; pessoas_criadas: number };
type Execucao = { id: string; estado: 'fila' | 'importando' | 'ok' | 'erro'; resultado?: Resultado; erro?: string };

const ROTULO: Record<Situacao, string> = { novo: 'Novo', importado: 'Importado', atualizar: 'Com novidades', erro: 'Erro' };

const inventario = httpsCallable<void, { quadros: QuadroMonday[]; gerado_em: string }>(functions, 'fridayMondayInventario', { timeout: 130_000 });
const importarQuadro = httpsCallable<{ boardId: string }, Resultado>(functions, 'fridayMondayImportarQuadro', { timeout: 560_000 });

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
  const pendentes = (quadros ?? []).filter(q => q.situacao !== 'importado');
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
          <p className="muted">Traz os quadros do monday para o Friday (o monday só é lido). Repetir é seguro: entra o que falta, itens que ninguém mexeu no Friday são atualizados e os editados aqui são preservados.</p>
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
                    <input type="checkbox" className="caixa" checked={marcados.has(q.id)} disabled={rodando} onChange={() => marcar(q.id)} />
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
                    {q.quadro_id != null && <button type="button" className="fr-btn" onClick={e => { e.preventDefault(); navigate(`/quadros/${q.quadro_id}`); }}>Abrir</button>}
                  </label>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
