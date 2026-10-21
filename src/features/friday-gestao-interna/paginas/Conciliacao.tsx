import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { conciliarCadastro } from '../api.ts';
import { useNavigate } from '../rotas.tsx';
import { useAvisoRapido } from '../ui/base.tsx';
import { useQuadro } from '../quadro/useQuadro.ts';
import {
  COMPATIVEIS, NOME, NOME_PREFIXO, sugerirChave, TIPOS_LIVRES, type Analise, type Cadastro, type Ligacao, type Relatorio,
} from '../quadro/conciliacao.ts';

// Página da conciliação com um cadastro existente (C5): aberta pelo "Analisar" do diálogo (ou por "Conciliar de novo…").
// Parte 1: casados | ambíguos | sem par | registros sem item. Parte 2: colunas ligadas aos campos do cadastro e colunas
// ainda não ligadas. Simular só lê; Conciliar fica travado por cadastro até ser liberado (Function fridayCadastroConciliar,
// só adm2). Endereço: /friday/quadros/:id/conciliar?colecao=…&chave=…&campo=…
// Contrato: The Manuscript, 03_APLICACAO_WEB/14_FRIDAY_CADASTROS_OFICIAIS.md.
export default function ConciliacaoPagina() {
  const adm2 = useAuth().authorizationProfile?.adm2 === true;
  if (!adm2) return <div className="pagina"><h1>Conciliação</h1><p className="muted">Disponível só para adm2.</p></div>;
  return <Conciliacao />;
}

function Conciliacao() {
  const quadroId = Number(useParams().id);
  const [busca] = useSearchParams();
  const navigate = useNavigate();
  const avisar = useAvisoRapido();
  const q = useQuadro(quadroId);
  const quadro = q.dados?.quadro;
  const colunas = useMemo(() => q.dados?.colunas ?? [], [q.dados]);
  const fixo = quadro?.oficial?.modo === 'existente'; // conciliar de novo: cadastro, chave e campos já registrados
  const colecao = fixo ? String(quadro?.oficial?.colecao ?? '') : busca.get('colecao') ?? '';
  const colunaChave = busca.get('chave') ?? NOME_PREFIXO;
  const [catalogo, setCatalogo] = useState<Cadastro[]>([]);
  const cadastro = catalogo.find(c => c.colecao === colecao);
  const caminhoChave = busca.get('campo') ?? cadastro?.chaves[0] ?? '';
  const [livresColunas, setLivresColunas] = useState<Record<number, string>>({}); // coluna → chave em <grupo_livre>.<chave>
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [criar, setCriar] = useState<Set<number>>(new Set());
  const [trazer, setTrazer] = useState<Set<string>>(new Set());
  const [ambiguos, setAmbiguos] = useState<Record<string, string>>({});
  const [desfazer, setDesfazer] = useState<Set<number>>(new Set());          // casados que não devem ser vinculados
  const [manuais, setManuais] = useState<Record<string, string>>({});        // item → registro escolhido à mão
  const [duplicados, setDuplicados] = useState<Set<number>>(new Set());      // ambíguos que são cópia (arquivados)
  const [ligacoes, setLigacoes] = useState<Record<string, Ligacao>>({});
  const [relatorio, setRelatorio] = useState<{ simulacao: boolean; dados: Relatorio } | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState('');

  useEffect(() => {
    conciliarCadastro({ op: 'catalogo' }).then(r => setCatalogo((r.cadastros ?? []) as Cadastro[])).catch(e => setErro((e as Error).message));
  }, []);

  const colunaChaveId = colunaChave === NOME || colunaChave === NOME_PREFIXO ? null : Number(colunaChave);
  // A coluna-chave fica ligada ao campo-chave.
  const ligacoesEfetivas = useMemo(() => {
    const l = { ...ligacoes };
    if (colunaChaveId != null && caminhoChave) l[caminhoChave] = { coluna_id: colunaChaveId, prioridade: l[caminhoChave]?.prioridade ?? 'cadastro', rotulos: {} };
    return l;
  }, [ligacoes, colunaChaveId, caminhoChave]);
  const opcaoFixa = (caminho: string) => { const c = cadastro?.campos.find(x => x.caminho === caminho); return c?.tipo === 'opcao' && !c.opcoes_abertas; };
  const principalDa = new Map(Object.entries(ligacoesEfetivas).filter(([caminho, l]) => l.coluna_id !== '' && !opcaoFixa(caminho)).map(([caminho, l]) => [Number(l.coluna_id), caminho]));
  const ehSecundario = (caminho: string, l?: Ligacao) => !!l && l.coluna_id !== '' && opcaoFixa(caminho) && principalDa.has(Number(l.coluna_id));
  const pedidos = [
    ...Object.entries(ligacoesEfetivas).filter(([, l]) => l.coluna_id !== '')
      .map(([caminho, l]) => ({ caminho, coluna_id: Number(l.coluna_id), prioridade: l.prioridade, rotulos: l.rotulos, ...(ehSecundario(caminho, l) ? { secundario: true } : {}) })),
    ...Object.entries(livresColunas).map(([id, k]) => ({ caminho: `${cadastro?.grupo_livre ?? 'friday'}.${k}`, coluna_id: Number(id), prioridade: 'quadro' as const, rotulos: {} })),
  ];
  const ligadas = new Set(pedidos.map(p => p.coluna_id));
  const base = { quadroId, colecao, colunaChave: colunaChaveId, caminhoChave, modoChave: colunaChave === NOME_PREFIXO ? 'prefixo' : 'igual' };
  const decisoes = { criar: [...criar], trazer: [...trazer], ambiguos, desfazer: [...desfazer], manuais, duplicados: [...duplicados] };
  // Registros livres para ligar à mão: sem item, os de casados desfeitos e os ambíguos não escolhidos.
  const escolhidosAmb = new Set(Object.values(ambiguos));
  const livres = analise ? [
    ...analise.semItem.map(s => ({ id: s.registroId, rotulo: nomes[s.registroId] ?? (s.nome || s.chave || s.registroId) })),
    ...analise.casados.filter(c => desfazer.has(c.itemId)).map(c => ({ id: c.registroId, rotulo: nomes[c.registroId] ?? c.registroId })),
    ...[...new Set(analise.ambiguos.flatMap(a => a.registroIds))].filter(id => !escolhidosAmb.has(id)).map(id => ({ id, rotulo: nomes[id] ?? id })),
  ].sort((a, b) => a.rotulo.localeCompare(b.rotulo)) : [];
  const usadosAMao = new Map(Object.entries(manuais).map(([item, reg]) => [reg, Number(item)]));

  const chamar = async (rotulo: string, f: () => Promise<void>) => {
    setErro(''); setOcupado(rotulo);
    try { await f(); } catch (e) { setErro((e as Error).message); } finally { setOcupado(''); }
  };
  const analisar = () => chamar('Analisando…', async () => {
    const r = await conciliarCadastro({ op: 'analisar', ...base });
    setAnalise(r.analise as Analise); setNomes((r.nomes ?? {}) as Record<string, string>);
    setCriar(new Set()); setTrazer(new Set()); setAmbiguos({}); setDesfazer(new Set()); setManuais({}); setDuplicados(new Set()); setRelatorio(null);
  });
  // A análise roda ao abrir a página (quando o quadro e o catálogo chegam).
  useEffect(() => { if (cadastro && quadro && caminhoChave && !analise && !ocupado) void analisar(); }, [cadastro, quadro, caminhoChave]); // eslint-disable-line react-hooks/exhaustive-deps
  const simular = () => chamar('Simulando…', async () => {
    const r = await conciliarCadastro({ op: 'simular', ...base, campos: pedidos, decisoes });
    setRelatorio({ simulacao: true, dados: r.relatorio as Relatorio });
    setTimeout(() => document.getElementById('conc-resultado')?.scrollIntoView({ behavior: 'smooth' }), 50);
  });
  const executar = () => chamar('Conciliando…', async () => {
    const r = await conciliarCadastro({ op: 'executar', ...base, campos: pedidos, decisoes });
    const d = r.relatorio as Relatorio;
    avisar(`Conciliado com ${cadastro?.nome}: ${d.vinculados} vinculados, ${d.criados} criados, ${d.trazidos} trazidos${d.arquivados ? `, ${d.arquivados} duplicados arquivados` : ''}.`);
    navigate(`/quadros/${quadroId}`);
  });

  const ligar = (caminho: string, campos: Partial<Ligacao>) => {
    setRelatorio(null);
    setLigacoes(l => {
      const atual: Ligacao = l[caminho] ?? { coluna_id: '', prioridade: 'cadastro', rotulos: {} };
      return { ...l, [caminho]: { ...atual, ...campos } };
    });
  };
  const alternar = <T,>(s: Set<T>, v: T, set: (n: Set<T>) => void) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); set(n); setRelatorio(null); };
  const ligarAMao = (itemId: number, registroId: string) => {
    setRelatorio(null);
    setManuais(m => { const n = { ...m }; if (registroId) n[itemId] = registroId; else delete n[itemId]; return n; });
    if (registroId) { setTrazer(t => { const n = new Set(t); n.delete(registroId); return n; }); setCriar(c => { const n = new Set(c); n.delete(itemId); return n; }); }
  };
  const seletorManual = (itemId: number, extra?: { valor: string; rotulo: string }[], valorAtual?: string, aoMudar?: (v: string) => void) => (
    <select className="input-cheio" value={valorAtual ?? manuais[itemId] ?? ''} onChange={e => (aoMudar ?? (v => ligarAMao(itemId, v)))(e.target.value)}>
      {extra?.map(x => <option key={x.valor} value={x.valor}>{x.rotulo}</option>) ?? <option value="">Deixar fora</option>}
      {livres.filter(r => !usadosAMao.has(r.id) || usadosAMao.get(r.id) === itemId).map(r => <option key={r.id} value={r.id}>Ligar a {r.rotulo}</option>)}
    </select>
  );

  if (q.erro) return <div className="pagina"><p className="aviso-erro">{q.erro}</p></div>;
  if (!quadro) return <div className="carregando">Carregando…</div>;
  const nomeChave = colunaChave === NOME_PREFIXO ? 'nome do item começa com a chave' : colunaChave === NOME ? 'nome do item (igual)'
    : `coluna “${colunas.find(c => c.id === colunaChaveId)?.titulo ?? colunaChave}”`;
  // Com a chave no nome do item, os campos que saem do nome não têm coluna para ligar.
  const doNome: Record<string, string> = colunaChaveId != null ? {} : {
    [caminhoChave]: 'Vem do nome do item.',
    ...(colunaChave === NOME_PREFIXO && cadastro?.dividir_nome ? {
      [cadastro.dividir_nome.identificador]: 'Vem do nome do item: casa pelo início do nome; num registro novo, é a 1ª palavra.',
      [cadastro.dividir_nome.resto]: 'Vem do nome do item: num registro novo, é o que vem depois da 1ª palavra.',
    } : {}),
  };
  const ligadosAMaoSemPar =analise ? Object.keys(manuais).filter(k => analise.semPar.some(s => String(s.itemId) === k)).length : 0;

  return (
    <div className="pagina conc-pagina">
      {/* cabeçalho e ações (fixos no topo ao rolar) */}
      <div className="conc-topo">
        <div className="conc-topo-titulo">
          <button className="fr-btn-link" onClick={() => navigate(`/quadros/${quadroId}`)}><ArrowLeft size={15} /> Voltar ao quadro</button>
          <h1>{fixo ? 'Conciliar de novo' : 'Conciliar'} “{String(quadro.nome ?? '')}” com {cadastro?.nome ?? colecao}</h1>
          <p className="muted fr-small">
            {fixo ? 'Valem a chave e os campos já registrados na primeira conciliação.'
              : <>Chave: {nomeChave} ↔ {cadastro?.campos.find(c => c.caminho === caminhoChave)?.titulo ?? caminhoChave}.</>}
            {' '}A <strong>simulação</strong> não grava nada.{cadastro && !cadastro.liberado && <> <strong>Só simulação:</strong> a conciliação com este cadastro ainda não está liberada.</>}
          </p>
        </div>
        <div className="conc-topo-acoes">
          {!fixo && analise && <button className="fr-btn" disabled={!!ocupado} onClick={() => void analisar()}>Analisar de novo</button>}
          <button className="fr-btn" disabled={!analise || !!ocupado} onClick={() => void simular()}>{ocupado === 'Simulando…' ? ocupado : 'Simular'}</button>
          <button className="fr-btn btn-primario" disabled={!analise || !cadastro?.liberado || !relatorio || !!ocupado}
            title={cadastro?.liberado ? 'Grava a conciliação (simule antes)' : 'A conciliação com este cadastro ainda não está liberada: só simulação'}
            onClick={() => void executar()}>{ocupado === 'Conciliando…' ? ocupado : 'Conciliar'}</button>
        </div>
      </div>
      {erro && <p className="aviso-erro">{erro}</p>}
      {!analise && <p className="muted">{ocupado || 'Carregando a análise…'}</p>}

      {analise && (
        <>
          {/* Parte 1: itens e registros */}
          <section className="conc-parte">
            <h2>Parte 1 — Itens e registros</h2>
            <div className="conc-grade4">
              <div className="conc-cartao">
                <div className="conc-cartao-cab"><span className="conc-chip ok">{analise.casados.length}</span> Casados <small className="muted">{desfazer.size ? `${desfazer.size} desfeitos` : 'confira e desfaça os errados'}</small></div>
                <div className="conc-cartao-lista">
                  {analise.casados.map(c => (
                    <div key={c.itemId} className="conc-linha-item">
                      <label className="check-form" title="Desfazer: o item não é vinculado a este registro">
                        <input type="checkbox" className="caixa" checked={desfazer.has(c.itemId)}
                          onChange={() => { alternar(desfazer, c.itemId, setDesfazer); if (desfazer.has(c.itemId)) ligarAMao(c.itemId, ''); }} />
                        <span className={desfazer.has(c.itemId) ? 'conc-riscado' : ''}>{c.nome}<br /><small className="muted">→ {nomes[c.registroId] ?? c.registroId}</small></span>
                      </label>
                      {desfazer.has(c.itemId) && seletorManual(c.itemId)}
                    </div>
                  ))}
                  {!analise.casados.length && <p className="muted fr-small">Nenhum.</p>}
                </div>
              </div>
              <div className="conc-cartao">
                <div className="conc-cartao-cab"><span className="conc-chip atencao">{analise.ambiguos.length}</span> Ambíguos <small className="muted">escolha, deixe fora ou marque duplicado</small></div>
                <div className="conc-cartao-lista">
                  {analise.ambiguos.map(a => (
                    <div key={a.itemId} className="conc-linha-item">
                      <span>{a.nome}</span>
                      <select className="input-cheio" value={duplicados.has(a.itemId) ? '__duplicado' : ambiguos[a.itemId] ?? ''} onChange={e => {
                        const v = e.target.value;
                        setRelatorio(null);
                        setDuplicados(d => { const n = new Set(d); if (v === '__duplicado') n.add(a.itemId); else n.delete(a.itemId); return n; });
                        setAmbiguos(m => { const n = { ...m }; if (v && v !== '__duplicado') n[a.itemId] = v; else delete n[a.itemId]; return n; });
                      }}>
                        <option value="">Deixar fora</option>
                        {a.registroIds.map(id => <option key={id} value={id}>{nomes[id] ?? id}</option>)}
                        <option value="__duplicado">Duplicado: arquivar este item</option>
                      </select>
                    </div>
                  ))}
                  {!analise.ambiguos.length && <p className="muted fr-small">Nenhum.</p>}
                </div>
              </div>
              <div className="conc-cartao">
                <div className="conc-cartao-cab"><span className="conc-chip">{analise.semPar.length}</span> Sem par <small className="muted">{ligadosAMaoSemPar} ligados à mão, {criar.size} a criar</small></div>
                <div className="conc-cartao-lista">
                  {analise.semPar.map(s => (
                    <div key={s.itemId} className="conc-linha-item">
                      <span>{s.nome}{!s.chave && <small className="texto-alerta"> sem chave</small>}</span>
                      {seletorManual(s.itemId, [{ valor: '', rotulo: 'Deixar fora' }, { valor: '__criar', rotulo: 'Criar registro novo' }],
                        manuais[s.itemId] ?? (criar.has(s.itemId) ? '__criar' : ''),
                        v => {
                          if (v === '__criar') { ligarAMao(s.itemId, ''); setCriar(c => new Set(c).add(s.itemId)); }
                          else { setCriar(c => { const n = new Set(c); n.delete(s.itemId); return n; }); ligarAMao(s.itemId, v); }
                        })}
                    </div>
                  ))}
                  {!analise.semPar.length && <p className="muted fr-small">Nenhum.</p>}
                </div>
              </div>
              <div className="conc-cartao">
                <div className="conc-cartao-cab"><span className="conc-chip">{analise.semItem.length}</span> Registros sem item <small className="muted">{trazer.size} entram no quadro</small>
                  {analise.semItem.length > 0 && (
                    <button className="fr-btn-link" onClick={() => { setTrazer(new Set(trazer.size ? [] : analise.semItem.map(s => s.registroId).filter(id => !usadosAMao.has(id)))); setRelatorio(null); }}>
                      {trazer.size ? 'Desmarcar todos' : 'Marcar todos'}</button>
                  )}
                </div>
                <div className="conc-cartao-lista">
                  {analise.semItem.map(s => {
                    const aMao = usadosAMao.get(s.registroId);
                    return (
                      <label key={s.registroId} className="check-form conc-linha-item"><input type="checkbox" className="caixa" disabled={aMao != null} checked={aMao == null && trazer.has(s.registroId)} onChange={() => alternar(trazer, s.registroId, setTrazer)} />
                        <span>{nomes[s.registroId] ?? (s.nome || s.chave || s.registroId)}
                          {aMao != null && <><br /><small className="muted">ligado à mão a {analise.semPar.find(x => x.itemId === aMao)?.nome ?? analise.casados.find(x => x.itemId === aMao)?.nome ?? aMao}</small></>}</span></label>
                    );
                  })}
                  {!analise.semItem.length && <p className="muted fr-small">Nenhum.</p>}
                </div>
              </div>
            </div>
            {analise.jaVinculados > 0 && <p className="muted fr-small">{analise.jaVinculados} itens já estão vinculados e não entram na análise.</p>}
          </section>

          {/* Parte 2: campos */}
          {cadastro && !fixo && (
            <section className="conc-parte">
              <h2>Parte 2 — Campos</h2>
              <div className="conc-grade2">
                <div className="conc-cartao">
                  <div className="conc-cartao-cab">Ligue as colunas aos campos do cadastro</div>
                  <div className="conc-cartao-lista conc-campos">
                    {cadastro.campos.filter(c => !c.derivado).map(c => {
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
                          {doNome[c.caminho] ? <span className="conc-do-nome muted fr-small">{doNome[c.caminho]}</span> : <>
                          <select className="input-cheio" value={l?.coluna_id ?? ''} disabled={ehChave} onChange={e => ligar(c.caminho, { coluna_id: e.target.value === '' ? '' : Number(e.target.value), rotulos: {} })}>
                            <option value="">— não ligar —</option>
                            {colunas.filter(x => COMPATIVEIS[c.tipo].includes(x.tipo) && (x.id === l?.coluna_id || !(x.id in livresColunas))).map(x => <option key={x.id} value={x.id}>{x.titulo}{opcaoFixa(c.caminho) && principalDa.has(x.id) ? ' (também alimenta este campo)' : ''}</option>)}
                          </select>
                          <select className="input-cheio" value={l?.prioridade ?? 'cadastro'} disabled={!l || l.coluna_id === '' || c.somente_leitura}
                            title="Quando o item e o registro têm valores diferentes" onChange={e => ligar(c.caminho, { prioridade: e.target.value as Ligacao['prioridade'] })}>
                            <option value="cadastro">vale o cadastro</option>
                            <option value="quadro">vale o quadro</option>
                          </select></>}
                          {coluna && c.opcoes_abertas && (
                            <div className="conc-opcoes muted fr-small">
                              Códigos: {rotulos.map(r => `${r.texto} → ${sugerirChave(r.texto)}`).join(' · ')}
                              {c.deriva && <> · <strong>{c.deriva.caminho}</strong> fica calculado: sim quando a situação é <code>{c.deriva.verdadeiro_quando}</code></>}
                            </div>
                          )}
                          {coluna && c.tipo === 'texto' && coluna.tipo === 'status' && <div className="conc-opcoes muted fr-small">Grava o texto do rótulo; textos do cadastro que não forem rótulo viram rótulos novos.</div>}
                          {ehSecundario(c.caminho, l) && coluna && <div className="conc-opcoes muted fr-small">Também gravado a partir de “{coluna.titulo}”, que continua mostrando {cadastro.campos.find(x => x.caminho === principalDa.get(coluna.id))?.titulo ?? 'o outro campo'}. Ligue cada rótulo a uma opção:</div>}
                          {rotulos.length > 0 && !c.opcoes_abertas && c.tipo === 'opcao' && (
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
                <div className="conc-cartao">
                  <div className="conc-cartao-cab">Colunas ainda não ligadas <small className="muted">opcional: marque as que também viram campos oficiais, em <code>{cadastro.grupo_livre}.&lt;chave&gt;</code></small></div>
                  <div className="conc-cartao-lista">
                    {colunas.filter(x => TIPOS_LIVRES.has(x.tipo) && (x.id in livresColunas || !ligadas.has(x.id))).map(x => (
                      <div key={x.id} className="oficial-coluna">
                        <label className="check-form">
                          <input type="checkbox" className="caixa" checked={x.id in livresColunas}
                            onChange={e => { setRelatorio(null); setLivresColunas(m => { const n = { ...m }; if (e.target.checked) n[x.id] = sugerirChave(x.titulo); else delete n[x.id]; return n; }); }} />
                          {x.titulo} <small className="muted">({x.tipo})</small>
                        </label>
                        {x.id in livresColunas && <input className="input-cheio oficial-chave" value={livresColunas[x.id]} onChange={e => { setRelatorio(null); setLivresColunas(m => ({ ...m, [x.id]: e.target.value })); }} />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* resultado da simulação */}
          {relatorio && (
            <section className="conc-parte" id="conc-resultado">
              <h2>{relatorio.simulacao ? 'Resultado da simulação (nada foi gravado)' : 'Resultado'}</h2>
              <div className="conc-chips">
                <span className="conc-chip ok">{relatorio.dados.vinculados} vinculados</span>
                <span className="conc-chip">{relatorio.dados.registros_atualizados} registros atualizados</span>
                <span className="conc-chip">{relatorio.dados.criados} criados</span>
                <span className="conc-chip">{relatorio.dados.trazidos} trazidos</span>
                <span className="conc-chip">{relatorio.dados.deixados_fora} itens fora</span>
                {relatorio.dados.ambiguos_pendentes > 0 && <span className="conc-chip atencao">{relatorio.dados.ambiguos_pendentes} ambíguos sem escolha</span>}
                {!!relatorio.dados.manuais && <span className="conc-chip">{relatorio.dados.manuais} ligados à mão</span>}
                {!!relatorio.dados.desfeitos && <span className="conc-chip">{relatorio.dados.desfeitos} casados desfeitos</span>}
                {!!relatorio.dados.arquivados && <span className="conc-chip atencao">{relatorio.dados.arquivados} duplicados a arquivar</span>}
                {(relatorio.dados.rotulos_novos ?? []).map(r => (
                  <span key={r.coluna_id} className="conc-chip" title={r.textos.join(', ')}>{r.textos.length} rótulo(s) novo(s) em “{colunas.find(c => c.id === r.coluna_id)?.titulo}”</span>
                ))}
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
            </section>
          )}
        </>
      )}
    </div>
  );
}
