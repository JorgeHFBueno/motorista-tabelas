import { useCallback, useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { RefreshCw, Search, UserRound, UserPlus } from 'lucide-react';
import { functions } from '../funcoes.ts';
import { useNav } from '../nav.tsx';
import { CREDENCIAIS, semCredenciais, type Credencial } from '../../../services/credenciais';

// Pessoas do monday → funcionários do sistema (Function fridayMondayPessoas, só adm2). Quem é novo ganha conta sem
// senha e define a dela pelo "Primeiro acesso" do login; quem já é funcionário só é ligado ao monday. A ligação
// (funcionarios.mondayId) faz a importação dos quadros preencher as colunas de pessoa.

type Situacao = 'novo' | 'funcionario' | 'vinculado' | 'fora';
type Pessoa = { id: string; nome: string; email: string; situacao: Situacao; uid: string | null; funcionario: string | null; motivo: string | null };
type Resultado = { id: string; nome: string; resultado: 'criado' | 'vinculado' | 'erro'; mensagem?: string };

const listar = httpsCallable<{ modo: 'listar' }, { pessoas: Pessoa[] }>(functions, 'fridayMondayPessoas', { timeout: 310_000 });
const criar = httpsCallable<{ modo: 'criar'; ids: string[]; credenciais: Record<string, boolean> }, { resultados: Resultado[] }>(functions, 'fridayMondayPessoas', { timeout: 310_000 });

const ROTULO: Record<Situacao, string> = { novo: 'Novo', funcionario: 'Já é funcionário', vinculado: 'Ligado', fora: 'Fora' };
const SELO: Record<Situacao, string> = { novo: 'novo', funcionario: 'atualizar', vinculado: 'importado', fora: 'erro' };
const ORDEM: Record<Situacao, number> = { novo: 0, funcionario: 1, vinculado: 2, fora: 3 };
const mensagemDe = (e: unknown) => (e as { message?: string })?.message?.replace(/^.*?:\s*/, '') || String(e);

export default function ImportarPessoas() {
  const nav = useNav();
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [credenciais, setCredenciais] = useState(() => ({ ...semCredenciais(), escritorio: true }));
  const [rodando, setRodando] = useState(false);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try { setPessoas((await listar({ modo: 'listar' })).data.pessoas); } catch (e) { setErro(mensagemDe(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (pessoas ?? []).filter(p => !t || `${p.nome} ${p.email} ${p.funcionario ?? ''}`.toLowerCase().includes(t))
      .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao]);
  }, [pessoas, busca]);
  const conta = (s: Situacao) => (pessoas ?? []).filter(p => p.situacao === s).length;
  const marcaveis = (pessoas ?? []).filter(p => p.situacao === 'novo' || p.situacao === 'funcionario');
  const novosMarcados = marcaveis.filter(p => marcados.has(p.id) && p.situacao === 'novo').length;
  const semCredencial = novosMarcados > 0 && !CREDENCIAIS.some(c => credenciais[c.chave]);
  const marcar = (id: string) => setMarcados(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const executar = async () => {
    if (!marcados.size || rodando || semCredencial) return;
    setRodando(true); setResultados(null); setErro(null);
    try {
      const { data } = await criar({ modo: 'criar', ids: [...marcados], credenciais });
      setResultados(data.resultados);
      setMarcados(new Set());
      await Promise.all([carregar(), nav.recarregar()]);
    } catch (e) { setErro(mensagemDe(e)); }
    setRodando(false);
  };

  return (
    <>
      <p className="muted">Traz as pessoas do monday como funcionários do sistema. Quem é <b>novo</b> ganha uma conta <b>sem senha</b>: no login, em “Primeiro acesso ou esqueci minha senha”, a pessoa recebe no e-mail o link para criar a senha. Quem <b>já é funcionário</b> (mesmo e-mail) só é ligado ao monday, sem mudar as credenciais. Com a ligação, reimportar um quadro preenche as colunas de pessoa.</p>

      <div className="importar-progresso">
        <strong>Credenciais das contas novas</strong>
        <div className="seletor-tipos">
          {CREDENCIAIS.map(c => (
            <button key={c.chave} type="button" title={c.descricao} className={`chip-sub${credenciais[c.chave] ? ' on' : ''}`} disabled={rodando}
              onClick={() => setCredenciais(x => ({ ...x, [c.chave]: !x[c.chave as Credencial] }))}>{c.rotulo}</button>
          ))}
        </div>
        {semCredencial && <small className="texto-alerta">Marque ao menos uma credencial para criar as contas novas.</small>}
      </div>

      <div className="arquivo-barra pessoas-barra">
        <label className="busca-barra"><Search size={15} /><input placeholder="Buscar nome ou e-mail" value={busca} onChange={e => setBusca(e.target.value)} /></label>
        {pessoas && <span className="muted fr-small">{conta('novo')} novas · {conta('funcionario')} já funcionários · {conta('vinculado')} ligadas · {conta('fora')} fora</span>}
        <span className="espaco" />
        <button className="fr-btn" onClick={() => void carregar()} disabled={rodando}><RefreshCw size={15} /> Atualizar lista</button>
        <button className="fr-btn" disabled={rodando || !marcaveis.length} onClick={() => setMarcados(new Set(marcaveis.map(p => p.id)))}>Marcar todas ({marcaveis.length})</button>
        <button className="fr-btn btn-primario" disabled={rodando || !marcados.size || semCredencial} onClick={() => void executar()}>
          <UserPlus size={15} /> {rodando ? 'Gravando…' : `Criar e ligar (${marcados.size})`}
        </button>
      </div>

      {resultados && (
        <div className="importar-progresso">
          <strong>{resultados.filter(r => r.resultado === 'criado').length} conta(s) criada(s) · {resultados.filter(r => r.resultado === 'vinculado').length} ligada(s) · {resultados.filter(r => r.resultado === 'erro').length} com erro</strong>
          {resultados.filter(r => r.resultado === 'erro').map(r => <small key={r.id} className="texto-alerta">{r.nome}: {r.mensagem}</small>)}
          {resultados.some(r => r.resultado === 'criado') && <small className="muted">Avise as pessoas novas: no login, “Primeiro acesso ou esqueci minha senha”, com o e-mail do monday.</small>}
        </div>
      )}

      {erro ? <div className="vazio-painel"><UserRound size={36} /><p>Não foi possível ler as pessoas do monday: {erro}</p></div>
        : !pessoas ? <p className="muted">Lendo as pessoas do monday…</p>
        : !filtradas.length ? <div className="vazio-painel"><UserRound size={36} /><p>Ninguém encontrado.</p></div>
        : (
          <div className="arquivo-lista lista-arquivos">
            {filtradas.map(p => {
              const pode = p.situacao === 'novo' || p.situacao === 'funcionario';
              return (
                <label key={p.id} className="arquivo-linha importar-linha">
                  <input type="checkbox" className="caixa" checked={marcados.has(p.id)} disabled={rodando || !pode} onChange={() => marcar(p.id)} />
                  <div className="arquivo-nome">
                    <strong>{p.nome || p.email}</strong>
                    <small className="muted">
                      {p.email || 'sem e-mail'}
                      {p.funcionario && p.funcionario !== p.nome ? ` · funcionário: ${p.funcionario}` : ''}
                      {p.situacao === 'novo' && p.uid ? ' · já há uma conta com este e-mail, sem funcionário: ela é reaproveitada e a senha antiga deixa de valer' : ''}
                      {p.motivo ? ` · ${p.motivo}` : ''}
                    </small>
                  </div>
                  <span className={`importar-selo selo-${SELO[p.situacao]}`}>{ROTULO[p.situacao]}</span>
                </label>
              );
            })}
          </div>
        )}
    </>
  );
}
