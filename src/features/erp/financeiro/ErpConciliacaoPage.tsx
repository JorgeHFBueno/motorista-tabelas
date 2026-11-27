import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import CheckIcon from '@mui/icons-material/Check';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import LoginIcon from '@mui/icons-material/Login';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import { data, EMPRESAS, hoje, moeda } from '../estoques/estoquesExemplo';
import {
  CONCILIACOES_INICIAIS, CONTAS_CONCILIACAO, EXTRATO_BANCO, lerArquivoOfx, lerOfx, montarGrade, REGRAS_IGNORAR, REGRAS_LANCAMENTO, situacaoDoDia,
  type Conciliacao, type LinhaExtratoBanco, type LinhaGrade,
} from './conciliacaoExemplo';
import { MOVIMENTOS_BANCO, PLANOS_BANCO, type MovimentoBanco } from './fluxoExemplo';
import { CENTROS_CUSTO, PLANOS_TITULOS } from './titulosExemplo';

// /erp/financeiro/conciliacao: Conciliação Bancária (FN_ConciliacaoBancaria do Elevor), como a do ERP do Samuel
// (web/src/erp/financeiro/Conciliacao.tsx): o extrato do banco e o do sistema lado a lado, linha a linha, com as cores do
// Elevor; Aceitar (par sugerido ou regra), Vincular Selecionados, Lançar a partir do extrato, Arquivo (OFX lido no
// navegador), Conciliação Resumida e as regras de lançamento automático. Demonstração: o que se faz aqui vale só até sair
// da tela (nada é gravado). The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

const POR_PAGINA = 50;
const DIAS_RESUMO = 10;
const AVISO = 'Demonstração: o extrato do banco e os lançamentos são exemplos; conciliar, lançar e importar valem só até sair desta tela.';
const ABAS = [{ id: 'detalhada', rotulo: 'Conciliação Detalhada' }, { id: 'resumida', rotulo: 'Conciliação Resumida' }, { id: 'config', rotulo: 'Configurações para Lançamentos Automáticos' }];
const maisDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** ?aba= escolhe a aba de entrada (o menu abre as Regras e as Pendências); trocar pelo menu recomeça a tela nela. */
export default function ErpConciliacaoPage() {
  const [params] = useSearchParams();
  const aba = params.get('aba') ?? 'detalhada';
  return <Conciliacao key={aba} abaInicial={aba} />;
}

function Conciliacao({ abaInicial }: { abaInicial: string }) {
  useTituloPagina('Conciliação Bancária');
  const [aba, setAba] = useState(abaInicial);
  const [empresa, setEmpresa] = useState(String(CONTAS_CONCILIACAO[0].empresa));
  const [filtro, setFiltro] = useState({ conta: CONTAS_CONCILIACAO[0].conta, de: `${hoje().slice(0, 8)}01`, ate: hoje() });
  const [aplicado, setAplicado] = useState(filtro);
  // O estado da demonstração: o extrato (com o OFX importado), os lançamentos (com os feitos aqui) e as conciliações.
  const [extrato, setExtrato] = useState<LinhaExtratoBanco[]>(EXTRATO_BANCO);
  const [movs, setMovs] = useState<MovimentoBanco[]>(MOVIMENTOS_BANCO);
  const [concs, setConcs] = useState<Conciliacao[]>(CONCILIACOES_INICIAIS);
  const [selEx, setSelEx] = useState<Set<number>>(new Set());
  const [selMv, setSelMv] = useState<Set<number>>(new Set());
  const [pagina, setPagina] = useState(0);
  const [todos, setTodos] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [lancando, setLancando] = useState<LinhaExtratoBanco | null>(null);
  const [arquivo, setArquivo] = useState(false);

  const linhas = useMemo(() => montarGrade(aplicado.conta, aplicado.de, aplicado.ate, hoje(), extrato, movs, concs), [aplicado, extrato, movs, concs]);
  const paginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const visiveis = todos ? linhas : linhas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const somaEx = extrato.filter((x) => selEx.has(x.id)).reduce((s, x) => s + x.valor, 0);
  const somaMv = movs.filter((m) => selMv.has(m.id)).reduce((s, m) => s + m.valor, 0);
  const algum = selEx.size > 0 || selMv.size > 0;
  const bate = selEx.size > 0 && selMv.size > 0 && Math.abs(somaEx - somaMv) < 0.005;
  const soltosMv = linhas.filter((l) => l.tipo === 'mv' && l.mv).map((l) => l.mv!);
  const todosMv = soltosMv.length > 0 && soltosMv.every((m) => selMv.has(m.id));

  const proximoId = (lista: Array<{ id: number }>) => Math.max(0, ...lista.map((x) => x.id)) + 1;
  const conciliar = (ex: number[], mv: number[], texto?: string) => {
    setConcs((c) => [...c, { id: proximoId(c), ex, mv }]);
    setSelEx(new Set()); setSelMv(new Set());
    setMensagem(texto ? { texto } : null);
  };
  const lancar = (x: LinhaExtratoBanco, plano: string, centro: string, historico: string) => {
    const id = proximoId(movs);
    const mv: MovimentoBanco = { id, conta: x.conta, data: x.data, valor: x.valor, origem: 'lancamento', documento: x.documento, historico, plano, pessoa: '', centro,
      recibo: null, tituloId: null, transferencia: null, conciliado: true };
    setMovs((l) => [...l, mv]);
    conciliar([x.id], [id], 'Lançamento criado e conciliado (só nesta tela).');
  };
  const aceitar = (l: LinhaGrade) => {
    if (l.tipo === 'regra' && l.ex && l.regra) lancar(l.ex, l.regra.plano, l.regra.centro, l.regra.historico);
    else if (l.ex && l.mv) conciliar([l.ex.id], [l.mv.id]);
  };
  const desfazer = (cid: number) => { setConcs((c) => c.filter((x) => x.id !== cid)); setMensagem({ texto: 'Conciliação desfeita (só nesta tela).' }); };
  const tirar = (id: number) => { setExtrato((l) => l.filter((x) => x.id !== id)); setMensagem({ texto: 'Linha do extrato excluída (só nesta tela).' }); };
  const alternar = (s: Set<number>, set: (x: Set<number>) => void, id: number) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); set(n); };
  const importar = async (arq: File) => {
    try {
      const transacoes = lerOfx(await lerArquivoOfx(arq));
      const existentes = new Set(extrato.filter((x) => x.conta === aplicado.conta).map((x) => x.fitid));
      const novas = transacoes.filter((t) => !t.fitid || !existentes.has(t.fitid));
      let id = proximoId(extrato);
      setExtrato((l) => [...l, ...novas.map((t) => ({ id: id++, conta: aplicado.conta, ...t }))]);
      const datas = transacoes.map((t) => t.data).sort();
      if (datas.length) {
        const de = datas[0] < aplicado.de ? datas[0] : aplicado.de;
        const ate = datas[datas.length - 1] > aplicado.ate ? datas[datas.length - 1] : aplicado.ate;
        setFiltro((f) => ({ ...f, de, ate }));
        setAplicado((f) => ({ ...f, de, ate }));
      }
      setArquivo(false);
      setMensagem({ texto: `Extrato importado (só nesta tela): ${novas.length} linha(s) nova(s)${transacoes.length - novas.length ? `, ${transacoes.length - novas.length} já estavam` : ''}.` });
    } catch (e) {
      setMensagem({ texto: (e as Error).message, erro: true });
    }
  };

  const marcaEx = (x: LinhaExtratoBanco) => <input type="checkbox" aria-label={`Selecionar a linha do banco de ${data(x.data)}`} checked={selEx.has(x.id)} onChange={() => alternar(selEx, setSelEx, x.id)} />;
  const marcaMv = (m: MovimentoBanco) => <input type="checkbox" aria-label={`Selecionar o lançamento de ${data(m.data)}`} checked={selMv.has(m.id)} onChange={() => alternar(selMv, setSelMv, m.id)} />;
  const botaoOk = (cid: number) => <button type="button" className="conc-ok" title="Desfazer a conciliação" aria-label="Desfazer a conciliação" onClick={() => desfazer(cid)}><CheckIcon /></button>;
  const conciliado = new Set(concs.flatMap((c) => c.ex));

  const ladoBanco = (l: LinhaGrade) => {
    if (l.tipo === 'saldo') return <><td /><td /><td className="conc-saldo-rot">Saldo do Dia {data(l.dia)}</td><td className="num conc-saldo-val">{moeda(l.saldoEx)}</td><td /></>;
    const x = l.ex;
    if (!x) return <><td /><td /><td /><td /><td /></>;
    return <>
      <td>{data(x.data)}</td><td>{x.documento}</td><td>{x.historico}</td><td className="num">{moeda(x.valor)}</td>
      <td className="conc-acoes">{!conciliado.has(x.id) && <>
        <button type="button" className="conc-icone" title="Lançar no sistema a partir desta linha" aria-label="Lançar a partir desta linha" onClick={() => setLancando(x)}><LoginIcon /></button>
        <button type="button" className="conc-icone" title="Excluir a linha do extrato" aria-label="Excluir a linha do extrato" onClick={() => tirar(x.id)}><DeleteOutlineIcon /></button>
        {marcaEx(x)}
      </>}</td>
    </>;
  };
  const ladoSistema = (l: LinhaGrade) => {
    if (l.tipo === 'saldo') return <><td /><td className="conc-saldo-rot">Saldo do Dia {data(l.dia)}</td><td /><td /><td className="num conc-saldo-val">{moeda(l.saldoMv)}</td><td /></>;
    if (l.tipo === 'regra' && l.ex && l.regra) return <>
      <td>{data(l.ex.data)}</td><td>{l.regra.historico}</td><td>{l.ex.documento}</td><td className="small">{l.regra.plano}</td><td className="num">{moeda(l.ex.valor)}</td>
      <td className="conc-fim"><button type="button" className="btn conc-aceitar" title="Lançar pela regra e conciliar" onClick={() => aceitar(l)}>Aceitar</button></td>
    </>;
    const m = l.mv;
    if (!m) return <><td /><td /><td /><td /><td /><td className="conc-fim">{l.tipo === 'conc' && l.cid && botaoOk(l.cid)}</td></>;
    return <>
      <td>{data(m.data)}</td><td>{m.historico}{m.pessoa ? ` - ${m.pessoa}` : ''}</td><td>{m.recibo ? `Recibo ${m.recibo}` : m.documento}</td><td className="small">{m.plano}</td>
      <td className="num">{moeda(m.valor)}</td>
      <td className="conc-fim">
        {l.tipo === 'conc' && l.cid && botaoOk(l.cid)}
        {l.tipo === 'sug' && <button type="button" className="btn conc-aceitar" title="Conciliar este par" onClick={() => aceitar(l)}>Aceitar</button>}
        {l.tipo === 'mv' && marcaMv(m)}
      </td>
    </>;
  };

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO}</div>
      <form className="conciliacao-cabeca" onSubmit={(e) => { e.preventDefault(); setAplicado(filtro); setPagina(0); setTodos(false); setSelEx(new Set()); setSelMv(new Set()); setMensagem(null); }}>
        <div className="conc-cabeca-linha">
          <span>Empresa:</span>
          <select className="campo conc-empresa" aria-label="Empresa" value={empresa}
            onChange={(e) => { setEmpresa(e.target.value); const c = CONTAS_CONCILIACAO.find((x) => !e.target.value || String(x.empresa) === e.target.value); setFiltro((f) => ({ ...f, conta: c?.conta ?? '' })); }}>
            <option value="" />{EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <span>Banco:</span>
          <select className="campo conc-banco" aria-label="Banco" value={filtro.conta} onChange={(e) => setFiltro((f) => ({ ...f, conta: e.target.value }))}>
            <option value="" />{CONTAS_CONCILIACAO.filter((c) => !empresa || String(c.empresa) === empresa).map((c) => <option key={c.conta}>{c.conta}</option>)}
          </select>
        </div>
        <div className="conc-cabeca-linha">
          <span>Período:</span>
          <input type="date" className="campo" aria-label="Período: de" value={filtro.de} onChange={(e) => setFiltro((f) => ({ ...f, de: e.target.value }))} /> a{' '}
          <input type="date" className="campo" aria-label="Período: até" value={filtro.ate} onChange={(e) => setFiltro((f) => ({ ...f, ate: e.target.value }))} />
          <button className="btn primario" type="submit" disabled={!filtro.conta}>Carregar</button>
          <button className="btn" type="button" disabled={!aplicado.conta} onClick={() => setArquivo(true)}><FileUploadOutlinedIcon /> Arquivo</button>
        </div>
      </form>
      <div className="abas" role="tablist">
        {ABAS.map((a) => <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={`aba${aba === a.id ? ' ativa' : ''}`} onClick={() => setAba(a.id)}>{a.rotulo}</button>)}
      </div>
      {mensagem && <div className={`mensagem${mensagem.erro ? ' erro' : ''}`}>{mensagem.texto}</div>}
      {aba === 'resumida' && <Resumida empresa={empresa} de={aplicado.de} ate={aplicado.ate} extrato={extrato} movs={movs} concs={concs} />}
      {aba === 'config' && <Configuracoes />}
      {aba === 'detalhada' && (
        <div className="conc-quadro">
          <div className="conc-titulos">
            <div className="conc-titulo">Extrato do Banco · {aplicado.conta}</div>
            <div className="conc-titulo">Extrato do Sistema</div>
            <button type="button" className="btn" onClick={() => window.print()}><PrintOutlinedIcon /> Imprimir</button>
          </div>
          {algum && (
            <div className="conc-selecionados">
              <div>Valores Selecionados: <b>{moeda(somaEx)}</b></div>
              <div>Valores Selecionados: <b>{moeda(somaMv)}</b>{!bate && <span className="negativo small"> as somas precisam ser iguais</span>}</div>
              <button className="btn primario" type="button" disabled={!bate} onClick={() => conciliar([...selEx], [...selMv], 'Conciliado (só nesta tela).')}>Vincular Selecionados</button>
            </div>
          )}
          <div className="conc-rolagem">
            <table className="conc-grade">
              <thead>
                <tr>
                  <th>Data</th><th>Documento</th><th>Histórico</th><th className="num">Valor</th><th />
                  <th className="conc-vao" />
                  <th>Data</th><th>Histórico</th><th>Documento</th><th>Plano Contas</th><th className="num">Valor</th>
                  <th className="conc-fim">
                    <input type="checkbox" aria-label="Marcar todos os lançamentos sem par" disabled={!soltosMv.length} checked={todosMv}
                      onChange={() => setSelMv(todosMv ? new Set() : new Set(soltosMv.map((m) => m.id)))} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l, i) => <tr key={i} className={`conc-${l.tipo}`}>{ladoBanco(l)}<td className="conc-vao" />{ladoSistema(l)}</tr>)}
                {!linhas.length && <tr><td colSpan={12} className="vazio">Nada no período. Use "Arquivo" para importar o OFX.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="conc-legenda">
            <span className="conc-conc">conciliado</span><span className="conc-sug">sugestão</span><span className="conc-regra">regra automática</span>
            <span className="conc-ex">só no banco</span><span className="conc-mv">só no sistema</span><span className="conc-saldo">saldo do dia</span>
          </div>
          {!todos && paginas > 1 && (
            <div className="conc-rodape">
              <button type="button" className="link-botao" onClick={() => setTodos(true)}>Mostrar Todos</button>
              <div className="conc-paginas">
                {Array.from({ length: paginas }, (_, p) => <button key={p} type="button" className={`btn${p === pagina ? ' primario' : ''}`} onClick={() => setPagina(p)}>{p + 1}</button>)}
              </div>
            </div>
          )}
        </div>
      )}
      {arquivo && <ModalArquivo fechar={() => setArquivo(false)} carregar={importar} />}
      {lancando && <LancarDoExtrato linha={lancando} fechar={() => setLancando(null)} lancar={(plano, centro, historico) => { lancar(lancando, plano, centro, historico); setLancando(null); }} />}
    </div>
  );
}

function ModalArquivo({ fechar, carregar }: { fechar: () => void; carregar: (a: File) => void }) {
  const [arq, setArq] = useState<File | null>(null);
  return (
    <div className="modal-fundo" onClick={fechar}>
      <div className="modal" role="dialog" aria-label="Arquivo" onClick={(e) => e.stopPropagation()}>
        <h3>Arquivo</h3>
        <label className="btn"><FileUploadOutlinedIcon /> Selecionar arquivos
          <input type="file" accept=".ofx,.OFX" hidden onChange={(e) => setArq(e.target.files?.[0] ?? null)} />
        </label>
        <p className="small">{arq ? arq.name : 'Extrato OFX do banco. Na demonstração, o arquivo é lido no navegador e não é enviado.'}</p>
        <div className="botoes">
          <button className="btn primario" type="button" disabled={!arq} onClick={() => arq && carregar(arq)}>Carregar</button>
          <button className="btn" type="button" onClick={fechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function Resumida({ empresa, de, ate, extrato, movs, concs }: {
  empresa: string; de: string; ate: string; extrato: LinhaExtratoBanco[]; movs: MovimentoBanco[]; concs: Conciliacao[];
}) {
  const [inicio, setInicio] = useState(0);
  const dias: string[] = [];
  for (let d = de; d <= ate && dias.length < 400; d = maisDias(d, 1)) dias.push(d);
  const vista = dias.slice(inicio, inicio + DIAS_RESUMO);
  const contas = CONTAS_CONCILIACAO.filter((c) => !empresa || String(c.empresa) === empresa);
  return (
    <table className="conc-resumo">
      <thead>
        <tr>
          <th className="conc-resumo-seta"><button type="button" aria-label="Dias anteriores" disabled={inicio === 0} onClick={() => setInicio(Math.max(0, inicio - DIAS_RESUMO))}><ChevronLeftIcon /></button></th>
          {vista.map((dia) => <th key={dia}>{data(dia).slice(0, 5)}</th>)}
          <th className="conc-resumo-seta"><button type="button" aria-label="Próximos dias" disabled={inicio + DIAS_RESUMO >= dias.length} onClick={() => setInicio(inicio + DIAS_RESUMO)}><ChevronRightIcon /></button></th>
        </tr>
      </thead>
      <tbody>
        {contas.map((c) => (
          <tr key={c.conta}>
            <td className="conc-resumo-conta"><AccountBalanceOutlinedIcon /> {c.conta}</td>
            {vista.map((dia) => {
              const s = situacaoDoDia(c.conta, dia, extrato, movs, concs);
              return <td key={dia} className="centro">{s === 'ok' && <CheckIcon className="texto-ok" />}{s === 'pendente' && <CloseIcon className="negativo" />}</td>;
            })}
            <td />
          </tr>
        ))}
        {!contas.length && <tr><td colSpan={vista.length + 2} className="vazio">Nenhuma conta da empresa com extrato.</td></tr>}
      </tbody>
    </table>
  );
}

function Configuracoes() {
  return (
    <div className="conc-config">
      <div className="secao-titulo">Lançamentos Automáticos</div>
      <p className="muted small">Linha do extrato cujo histórico tem o texto da regra vira um lançamento com o plano de contas, o centro de custo e o histórico dela (Aceitar, na grade). Adicionar e editar regras chegam com a gravação.</p>
      <table className="grade compacta">
        <thead><tr><th>Documento</th><th>Histórico Extrato</th><th>Plano de Contas</th><th>Centro de Custo</th><th>Histórico</th></tr></thead>
        <tbody>{REGRAS_LANCAMENTO.map((r) => <tr key={r.id}><td>{r.documento || '—'}</td><td>{r.texto}</td><td>{r.plano}</td><td>{r.centro}</td><td>{r.historico}</td></tr>)}</tbody>
      </table>
      <div className="secao-titulo">Ignorar Lançamentos Automáticos</div>
      <table className="grade compacta">
        <thead><tr><th>Documento</th><th>Histórico</th></tr></thead>
        <tbody>{REGRAS_IGNORAR.map((r) => <tr key={r.id}><td>{r.documento || '—'}</td><td>{r.texto}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function LancarDoExtrato({ linha, fechar, lancar }: { linha: LinhaExtratoBanco; fechar: () => void; lancar: (plano: string, centro: string, historico: string) => void }) {
  const [f, setF] = useState({ plano: '', centro: '', historico: linha.historico });
  return (
    <div className="modal-fundo" onClick={fechar}>
      <div className="modal" role="dialog" aria-label="Lançar a partir do extrato" onClick={(e) => e.stopPropagation()}>
        <h3>Lançar a partir do extrato</h3>
        <p>{data(linha.data)} · {linha.historico} · <b>{moeda(linha.valor)}</b></p>
        <div className="form-linha"><div className="form-rotulo">Plano de contas:</div><div className="form-controle">
          <select className="campo cheio" aria-label="Plano de contas" value={f.plano} onChange={(e) => setF((x) => ({ ...x, plano: e.target.value }))} autoFocus>
            <option value="" />{[...PLANOS_BANCO, ...PLANOS_TITULOS].map((p) => <option key={p}>{p}</option>)}
          </select>
        </div></div>
        <div className="form-linha"><div className="form-rotulo">Centro de custo:</div><div className="form-controle">
          <select className="campo cheio" aria-label="Centro de custo" value={f.centro} onChange={(e) => setF((x) => ({ ...x, centro: e.target.value }))}>
            <option value="" />{CENTROS_CUSTO.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div></div>
        <div className="form-linha"><div className="form-rotulo">Histórico:</div><div className="form-controle">
          <input className="campo cheio" aria-label="Histórico" value={f.historico} onChange={(e) => setF((x) => ({ ...x, historico: e.target.value }))} />
        </div></div>
        <div className="botoes">
          <button className="btn primario" type="button" disabled={!f.plano} onClick={() => lancar(f.plano, f.centro, f.historico)}>Lançar e conciliar</button>
          <button className="btn" type="button" onClick={fechar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

