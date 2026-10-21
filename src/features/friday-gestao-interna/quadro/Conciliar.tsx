import { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { conciliarCadastro } from '../api.ts';
import { Modal, useAvisoRapido } from '../ui/base.tsx';
import type { Coluna } from './tipos.ts';

// Cadastros oficiais, modo "existente" (C5): liga o quadro a uma coleção que já existe no sistema (ex.: veiculos-v2).
// 1) cadastro e chave; 2) análise dos itens (casados, ambíguos, sem par, registros sem item); 3) ligação das colunas aos
// campos do contrato; 4) simulação e conciliação. A simulação só lê; a conciliação fica travada por cadastro até ser
// liberada (Function fridayCadastroConciliar, só adm2). Contrato: The Manuscript, 03_APLICACAO_WEB/14_FRIDAY_CADASTROS_OFICIAIS.md.

type CampoContrato = { caminho: string; titulo: string; tipo: 'texto' | 'numero' | 'caixa' | 'opcao' | 'data'; obrigatorio: boolean; nulo: boolean; somente_leitura?: boolean; escala?: number; opcoes?: string[] };
type Cadastro = { colecao: string; nome: string; descricao: string; chaves: string[]; campos: CampoContrato[]; liberado: boolean };
type Analise = {
  casados: { itemId: number; nome: string; registroId: string }[];
  ambiguos: { itemId: number; nome: string; chave: string; registroIds: string[] }[];
  semPar: { itemId: number; nome: string; chave: string }[];
  semItem: { registroId: string; chave: string; nome: string }[];
  jaVinculados: number;
};
type Ligacao = { coluna_id: number | ''; prioridade: 'cadastro' | 'quadro'; rotulos: Record<string, string> };
type RelatorioCampo = { caminho: string; titulo: string; iguais: number; preenchidos: number; divergentes: number; mantidos: number; sobrescritos: number; erros: number };
type Relatorio = {
  vinculados: number; registros_atualizados: number; criados: number; trazidos: number; deixados_fora: number; ambiguos_pendentes: number;
  fora_do_quadro: number; ja_vinculados: number; campos: RelatorioCampo[]; erros: string[]; total_erros: number;
};

// Igual a functions/fridayCadastrosExistentes.ts (COLUNAS_COMPATIVEIS).
const COMPATIVEIS: Record<CampoContrato['tipo'], string[]> = {
  texto: ['texto', 'texto_longo', 'telefone', 'email'], numero: ['numero', 'avaliacao'], caixa: ['caixa'], opcao: ['status'], data: ['data'],
};
const NOME = 'nome';

export function Conciliar({ quadro, colunas, onFechar, onPronto }: {
  quadro: { id?: unknown; oficial?: { modo?: string; colecao?: string; nome?: string } | null }; colunas: Coluna[]; onFechar: () => void; onPronto: () => void;
}) {
  const avisar = useAvisoRapido();
  const fixo = quadro.oficial?.modo === 'existente'; // conciliar de novo: cadastro, chave e campos já registrados
  const [catalogo, setCatalogo] = useState<Cadastro[]>([]);
  const [colecao, setColecao] = useState<string>(fixo ? String(quadro.oficial?.colecao ?? '') : '');
  const cadastro = catalogo.find(c => c.colecao === colecao);
  const [colunaChave, setColunaChave] = useState<string>(NOME);
  const [caminhoChave, setCaminhoChave] = useState('');
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [criar, setCriar] = useState<Set<number>>(new Set());
  const [trazer, setTrazer] = useState<Set<string>>(new Set());
  const [ambiguos, setAmbiguos] = useState<Record<string, string>>({});
  const [ligacoes, setLigacoes] = useState<Record<string, Ligacao>>({});
  const [relatorio, setRelatorio] = useState<{ simulacao: boolean; dados: Relatorio } | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState('');

  useEffect(() => {
    conciliarCadastro({ op: 'catalogo' }).then(r => {
      const lista = (r.cadastros ?? []) as Cadastro[];
      setCatalogo(lista);
      if (!fixo && lista.length === 1) setColecao(lista[0].colecao);
    }).catch(e => setErro((e as Error).message));
  }, [fixo]);
  useEffect(() => { if (cadastro && !caminhoChave) setCaminhoChave(cadastro.chaves[0]); }, [cadastro, caminhoChave]);

  const colunaChaveId = colunaChave === NOME ? null : Number(colunaChave);
  const colunasTexto = colunas.filter(c => COMPATIVEIS.texto.includes(c.tipo));
  // A coluna-chave fica ligada ao campo-chave.
  const ligacoesEfetivas = useMemo(() => {
    const l = { ...ligacoes };
    if (colunaChaveId != null && caminhoChave) l[caminhoChave] = { coluna_id: colunaChaveId, prioridade: l[caminhoChave]?.prioridade ?? 'cadastro', rotulos: {} };
    return l;
  }, [ligacoes, colunaChaveId, caminhoChave]);
  const pedidos = Object.entries(ligacoesEfetivas).filter(([, l]) => l.coluna_id !== '')
    .map(([caminho, l]) => ({ caminho, coluna_id: Number(l.coluna_id), prioridade: l.prioridade, rotulos: l.rotulos }));
  const base = { quadroId: Number(quadro.id), colecao, colunaChave: colunaChaveId, caminhoChave };
  const decisoes = { criar: [...criar], trazer: [...trazer], ambiguos };

  const chamar = async (rotulo: string, f: () => Promise<void>) => {
    setErro(''); setOcupado(rotulo);
    try { await f(); } catch (e) { setErro((e as Error).message); } finally { setOcupado(''); }
  };
  const analisar = () => chamar('Analisando…', async () => {
    const r = await conciliarCadastro({ op: 'analisar', ...base });
    setAnalise(r.analise as Analise); setNomes((r.nomes ?? {}) as Record<string, string>);
    setCriar(new Set()); setTrazer(new Set()); setAmbiguos({}); setRelatorio(null);
  });
  useEffect(() => { if (fixo && cadastro && !analise) void analisar(); }, [fixo, cadastro]); // eslint-disable-line react-hooks/exhaustive-deps
  const simular = () => chamar('Simulando…', async () => {
    const r = await conciliarCadastro({ op: 'simular', ...base, campos: pedidos, decisoes });
    setRelatorio({ simulacao: true, dados: r.relatorio as Relatorio });
  });
  const executar = () => chamar('Conciliando…', async () => {
    const r = await conciliarCadastro({ op: 'executar', ...base, campos: pedidos, decisoes });
    const d = r.relatorio as Relatorio;
    avisar(`Conciliado com ${cadastro?.nome}: ${d.vinculados} vinculados, ${d.criados} criados, ${d.trazidos} trazidos.`);
    onPronto();
  });

  const ligar = (caminho: string, campos: Partial<Ligacao>) => {
    setRelatorio(null);
    setLigacoes(l => {
      const atual: Ligacao = l[caminho] ?? { coluna_id: '', prioridade: 'cadastro', rotulos: {} };
      return { ...l, [caminho]: { ...atual, ...campos } };
    });
  };
  const alternar = <T,>(s: Set<T>, v: T, set: (n: Set<T>) => void) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); set(n); setRelatorio(null); };

  return (
    <Modal titulo={fixo ? `Conciliar de novo com ${quadro.oficial?.nome ?? 'o cadastro'}` : 'Conciliar com um cadastro existente'} largura={780}
      onClose={() => { if (!ocupado) onFechar(); }}
      rodape={<div className="form-acoes">
        <button type="button" className="fr-btn" disabled={!!ocupado} onClick={onFechar}>Fechar</button>
        <button className="fr-btn" disabled={!analise || !!ocupado} onClick={() => void simular()}>Simular</button>
        <button className="fr-btn btn-primario" disabled={!analise || !cadastro?.liberado || !relatorio || !!ocupado}
          title={cadastro?.liberado ? 'Grava a conciliação (simule antes)' : 'A conciliação com este cadastro ainda não está liberada: só simulação'}
          onClick={() => void executar()}>{ocupado === 'Conciliando…' ? ocupado : 'Conciliar'}</button>
      </div>}>
      <p className="muted fr-small">
        Os itens do quadro são casados com os registros que já existem pela chave (sem diferença de maiúsculas, espaços e traços).
        Depois, cada coluna ligada lê e grava no campo do cadastro. A <strong>simulação</strong> não grava nada.
      </p>

      {/* 1. cadastro e chave */}
      <div className="conc-secao">
        <div className="conc-linha">
          <label className="campo-form">Cadastro
            <select className="input-cheio" value={colecao} disabled={fixo || !!analise} onChange={e => { setColecao(e.target.value); setCaminhoChave(''); }}>
              <option value="">Escolha…</option>
              {catalogo.map(c => <option key={c.colecao} value={c.colecao}>{c.nome} ({c.colecao})</option>)}
            </select>
          </label>
          {!fixo && (
            <>
              <label className="campo-form">Chave no quadro
                <select className="input-cheio" value={colunaChave} disabled={!!analise} onChange={e => setColunaChave(e.target.value)}>
                  <option value={NOME}>Nome do item</option>
                  {colunasTexto.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                </select>
              </label>
              <label className="campo-form">Campo-chave do cadastro
                <select className="input-cheio" value={caminhoChave} disabled={!cadastro || !!analise} onChange={e => setCaminhoChave(e.target.value)}>
                  {(cadastro?.chaves ?? []).map(k => <option key={k} value={k}>{cadastro?.campos.find(c => c.caminho === k)?.titulo ?? k}</option>)}
                </select>
              </label>
            </>
          )}
        </div>
        {cadastro && <p className="muted fr-small">{cadastro.descricao}{!cadastro.liberado && <> <strong>Só simulação:</strong> a conciliação com este cadastro ainda não está liberada.</>}</p>}
        {!fixo && (analise
          ? <button className="fr-btn-link" disabled={!!ocupado} onClick={() => { setAnalise(null); setRelatorio(null); }}>Trocar cadastro ou chave</button>
          : <button className="fr-btn" disabled={!cadastro || !caminhoChave || !!ocupado} onClick={() => void analisar()}>{ocupado === 'Analisando…' ? ocupado : 'Analisar'}</button>)}
      </div>

      {/* 2. itens */}
      {analise && (
        <div className="conc-secao">
          <div className="conc-chips">
            <span className="conc-chip ok">{analise.casados.length} casados</span>
            <span className="conc-chip atencao">{analise.ambiguos.length} ambíguos</span>
            <span className="conc-chip">{analise.semPar.length} sem par</span>
            <span className="conc-chip">{analise.semItem.length} registros sem item</span>
            {analise.jaVinculados > 0 && <span className="conc-chip">{analise.jaVinculados} já vinculados</span>}
          </div>
          {analise.ambiguos.length > 0 && (
            <details open>
              <summary>Ambíguos: escolha o registro de cada item (sem escolha, o item fica fora)</summary>
              <div className="conc-lista">
                {analise.ambiguos.map(a => (
                  <div key={a.itemId} className="conc-item">
                    <span>{a.nome}</span>
                    <select className="input-cheio" value={ambiguos[a.itemId] ?? ''} onChange={e => { setAmbiguos(m => ({ ...m, [a.itemId]: e.target.value })); setRelatorio(null); }}>
                      <option value="">Deixar fora</option>
                      {a.registroIds.map(id => <option key={id} value={id}>{nomes[id] ?? id}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </details>
          )}
          {analise.semPar.length > 0 && (
            <details>
              <summary>Sem par: marque os que viram registro novo ({criar.size} de {analise.semPar.length})</summary>
              <button className="fr-btn-link" onClick={() => { setCriar(new Set(criar.size === analise.semPar.length ? [] : analise.semPar.map(s => s.itemId))); setRelatorio(null); }}>
                {criar.size === analise.semPar.length ? 'Desmarcar todos' : 'Marcar todos'}</button>
              <div className="conc-lista">
                {analise.semPar.map(s => (
                  <label key={s.itemId} className="check-form"><input type="checkbox" className="caixa" checked={criar.has(s.itemId)} onChange={() => alternar(criar, s.itemId, setCriar)} />
                    {s.nome}{!s.chave && <small className="texto-alerta"> sem chave</small>}</label>
                ))}
              </div>
            </details>
          )}
          {analise.semItem.length > 0 && (
            <details>
              <summary>Registros sem item: marque os que entram no quadro ({trazer.size} de {analise.semItem.length})</summary>
              <button className="fr-btn-link" onClick={() => { setTrazer(new Set(trazer.size === analise.semItem.length ? [] : analise.semItem.map(s => s.registroId))); setRelatorio(null); }}>
                {trazer.size === analise.semItem.length ? 'Desmarcar todos' : 'Marcar todos'}</button>
              <div className="conc-lista">
                {analise.semItem.map(s => (
                  <label key={s.registroId} className="check-form"><input type="checkbox" className="caixa" checked={trazer.has(s.registroId)} onChange={() => alternar(trazer, s.registroId, setTrazer)} />
                    {s.chave || s.registroId}{s.nome && s.nome !== s.chave && <span className="muted"> · {s.nome}</span>}</label>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* 3. campos */}
      {analise && cadastro && !fixo && (
        <div className="conc-secao">
          <strong className="fr-small">Ligue as colunas aos campos do cadastro</strong>
          <div className="conc-campos">
            {cadastro.campos.map(c => {
              const l = ligacoesEfetivas[c.caminho];
              const ehChave = c.caminho === caminhoChave && colunaChaveId != null;
              const coluna = colunas.find(x => x.id === l?.coluna_id);
              const rotulos = c.tipo === 'opcao' && coluna ? ((coluna.config.rotulos ?? []) as { id: string; texto: string }[]).filter(r => r.id !== '0' && r.texto?.trim()) : [];
              return (
                <div key={c.caminho} className="conc-campo">
                  <span className="conc-campo-nome">
                    {c.somente_leitura && <Lock size={12} />} {c.titulo}
                    <small className="muted"> {c.caminho}{c.escala ? ` (×${c.escala})` : ''}{c.somente_leitura ? ' · só leitura' : c.obrigatorio && !c.nulo ? ' · obrigatório' : ''}</small>
                  </span>
                  <select className="input-cheio" value={l?.coluna_id ?? ''} disabled={ehChave} onChange={e => ligar(c.caminho, { coluna_id: e.target.value === '' ? '' : Number(e.target.value), rotulos: {} })}>
                    <option value="">— não ligar —</option>
                    {colunas.filter(x => COMPATIVEIS[c.tipo].includes(x.tipo)).map(x => <option key={x.id} value={x.id}>{x.titulo}</option>)}
                  </select>
                  <select className="input-cheio" value={l?.prioridade ?? 'cadastro'} disabled={!l || l.coluna_id === '' || c.somente_leitura}
                    title="Quando o item e o registro têm valores diferentes" onChange={e => ligar(c.caminho, { prioridade: e.target.value as Ligacao['prioridade'] })}>
                    <option value="cadastro">vale o cadastro</option>
                    <option value="quadro">vale o quadro</option>
                  </select>
                  {rotulos.length > 0 && (
                    <div className="conc-opcoes">
                      {rotulos.map(r => (
                        <label key={r.id} className="fr-small">{r.texto} →
                          <select value={l?.rotulos[r.id] ?? ''} onChange={e => ligar(c.caminho, { rotulos: { ...(l?.rotulos ?? {}), [r.id]: e.target.value } })}>
                            <option value="">escolha…</option>
                            {(c.opcoes ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. resultado */}
      {relatorio && (
        <div className="conc-secao">
          <strong className="fr-small">{relatorio.simulacao ? 'Simulação (nada foi gravado)' : 'Resultado'}</strong>
          <div className="conc-chips">
            <span className="conc-chip ok">{relatorio.dados.vinculados} vinculados</span>
            <span className="conc-chip">{relatorio.dados.registros_atualizados} registros atualizados</span>
            <span className="conc-chip">{relatorio.dados.criados} criados</span>
            <span className="conc-chip">{relatorio.dados.trazidos} trazidos</span>
            <span className="conc-chip">{relatorio.dados.deixados_fora} itens fora</span>
            {relatorio.dados.ambiguos_pendentes > 0 && <span className="conc-chip atencao">{relatorio.dados.ambiguos_pendentes} ambíguos sem escolha</span>}
          </div>
          {relatorio.dados.campos.length > 0 && (
            <table className="conc-tabela">
              <thead><tr><th>Campo</th><th>iguais</th><th>preenchidos</th><th>divergentes</th><th>vale o cadastro</th><th>vale o quadro</th><th>erros</th></tr></thead>
              <tbody>
                {relatorio.dados.campos.map(c => (
                  <tr key={c.caminho}><td>{c.titulo}</td><td>{c.iguais}</td><td>{c.preenchidos}</td><td>{c.divergentes}</td><td>{c.mantidos}</td><td>{c.sobrescritos}</td><td>{c.erros}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {relatorio.dados.total_erros > 0 && (
            <div className="aviso-erro">
              {relatorio.dados.total_erros} problema(s){relatorio.dados.total_erros > relatorio.dados.erros.length ? ` (primeiros ${relatorio.dados.erros.length})` : ''}:
              <ul>{relatorio.dados.erros.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      {ocupado && ocupado !== 'Analisando…' && ocupado !== 'Conciliando…' && <p className="muted fr-small">{ocupado}</p>}
      {erro && <p className="aviso-erro">{erro}</p>}
    </Modal>
  );
}
