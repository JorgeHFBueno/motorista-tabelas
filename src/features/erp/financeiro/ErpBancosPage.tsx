import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import { Opcoes } from '../estoques/campos';
import { data, EMPRESAS, hoje, lerNumero, moeda } from '../estoques/estoquesExemplo';
import { CONTAS_BANCO, extrato, HISTORICOS_PADRAO, MOVIMENTOS_BANCO, PLANOS_BANCO, saldosEm, type FiltroExtrato, type OrigemMovimento } from './fluxoExemplo';
import { AVISO_TITULOS, CENTROS_CUSTO, nomeEmpresa, PLANOS_TITULOS } from './titulosExemplo';

// /erp/bancos: Bancos/Caixa (FN_Bancos do Elevor), como a tela do ERP do Samuel (web/src/erp/financeiro/Bancos.tsx): abas à
// esquerda com a Consulta Extrato (saldo linha a linha quando se escolhe um banco), Lançamentos (direto na conta, sem título),
// Transferências, Troca de Arquivos e Saldos. Demonstração: os movimentos são os de exemplo (fluxoExemplo.ts) e gravar ou
// excluir só diz o que o ERP faria. The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

const ABAS = [
  { id: 'extrato', rotulo: 'Consulta Extrato' }, { id: 'lancamento', rotulo: 'Lançamentos' }, { id: 'transferencia', rotulo: 'Transferências' },
  { id: 'arquivos', rotulo: 'Troca de Arquivos' }, { id: 'saldos', rotulo: 'Saldos' },
];
const ORIGEM: Record<OrigemMovimento, string> = { baixa: 'Baixa', transferencia: 'Transferência', lancamento: 'Lançamento', saldo_inicial: 'Saldo inicial' };
const CONTAS = CONTAS_BANCO.map((c) => c.conta);
const PESSOAS = [...new Set(MOVIMENTOS_BANCO.map((m) => m.pessoa).filter(Boolean))].sort();
const PLANOS = [...PLANOS_TITULOS, ...PLANOS_BANCO];
const linha = (rotulo: string, campo: ReactNode) => <div className="form-linha"><div className="form-rotulo">{rotulo}</div><div className="form-controle">{campo}</div></div>;
const SelConta = ({ valor, onChange, rotulo, vazio = 'Escolha a conta' }: { valor: string; onChange: (v: string) => void; rotulo: string; vazio?: string }) => (
  <select className="campo cheio" aria-label={rotulo} value={valor} onChange={(e) => onChange(e.target.value)}>
    <option value="">{vazio}</option>
    {CONTAS_BANCO.map((c) => <option key={c.conta} value={c.conta}>{c.conta} ({nomeEmpresa(c.empresa)})</option>)}
  </select>
);

export default function ErpBancosPage() {
  useTituloPagina('Bancos/Caixa');
  const [params, setParams] = useSearchParams();
  const aba = params.get('aba') ?? 'extrato';
  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_TITULOS}</div>
      <div className="tela-lateral">
        <nav className="abas-lateral" aria-label="Bancos/Caixa">
          {ABAS.map((a) => (
            <button key={a.id} type="button" className={a.id === aba ? 'ativa' : ''} aria-current={a.id === aba ? 'page' : undefined} onClick={() => setParams({ aba: a.id })}>{a.rotulo}</button>
          ))}
        </nav>
        <div className="tela-lateral-conteudo">
          {aba === 'extrato' && <Extrato />}
          {aba === 'lancamento' && <Lancamento />}
          {aba === 'transferencia' && <Transferencia />}
          {aba === 'arquivos' && <TrocaArquivos />}
          {aba === 'saldos' && <Saldos />}
        </div>
      </div>
    </div>
  );
}

function Extrato() {
  const vazio: FiltroExtrato = {
    empresa: '', conta: CONTAS[1], de: `${hoje().slice(0, 8)}01`, ate: hoje(), pessoa: '', plano: '', centro: '', texto: '', historicoPadrao: '',
    valorDe: '', valorAte: '', tipo: 'ambos',
  };
  const [f, setF] = useState(vazio);
  const [r, setR] = useState(() => extrato(vazio));
  const [mais, setMais] = useState(false);
  const [mostrarCentros, setMostrarCentros] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const set = (k: keyof FiltroExtrato) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const lista = (k: keyof FiltroExtrato, rotulo: string, opcoes: string[], classe = 'campo cheio') => (
    <select className={classe} aria-label={rotulo} value={f[k]} onChange={set(k)}><option value="" />{opcoes.map((o) => <option key={o}>{o}</option>)}</select>
  );
  const contas = CONTAS_BANCO.filter((c) => !f.empresa || c.empresa === Number(f.empresa));
  const colunas = r.comSaldo ? 8 : 7;
  return (
    <>
      <form className="ficha-elevor bancos-filtros" onSubmit={(e) => { e.preventDefault(); setR(extrato(f)); setMensagem(''); }}>
        {linha('Empresa:', (
          <select className="campo cheio" aria-label="Empresa" value={f.empresa} onChange={(e) => setF((x) => ({ ...x, empresa: e.target.value, conta: '' }))}>
            <option value="" />{EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        ))}
        {linha('Banco:', <select className="campo medio" aria-label="Banco" value={f.conta} onChange={set('conta')}><option value="" />{contas.map((c) => <option key={c.conta}>{c.conta}</option>)}</select>)}
        {linha('Período:', <>
          <input type="date" className="campo" aria-label="Período: de" value={f.de} onChange={set('de')} /> à{' '}
          <input type="date" className="campo" aria-label="Período: até" value={f.ate} onChange={set('ate')} />
        </>)}
        {linha('', <button type="button" className="link-botao" aria-expanded={mais} onClick={() => setMais((m) => !m)}>Mais Opções {mais ? <ExpandLessIcon /> : <ExpandMoreIcon />}</button>)}
        {mais && <>
          {linha('Cliente:', lista('pessoa', 'Cliente', PESSOAS))}
          {linha('Funcionário:', <select className="campo medio" aria-label="Funcionário" disabled title="O movimento de banco do ERP não guarda funcionário."><option /></select>)}
          {linha('Plano Contas:', lista('plano', 'Plano Contas', PLANOS))}
          {linha('Centro de Custo:', lista('centro', 'Centro de Custo', CENTROS_CUSTO, 'campo medio'))}
          {linha('Histórico/Número:', <input className="campo medio" aria-label="Histórico/Número" value={f.texto} onChange={set('texto')} />)}
          {linha('Histórico Padrão:', lista('historicoPadrao', 'Histórico Padrão', HISTORICOS_PADRAO))}
          {linha('Valor:', <>
            <input className="campo num bancos-valor" aria-label="Valor de" value={f.valorDe} onChange={set('valorDe')} /> à{' '}
            <input className="campo num bancos-valor" aria-label="Valor até" value={f.valorAte} onChange={set('valorAte')} />
          </>)}
          {linha('Tipo:', <Opcoes nome="tipo-extrato" valor={f.tipo} onChange={(v) => setF((x) => ({ ...x, tipo: v }))}
            opcoes={[{ valor: 'entrada', rotulo: 'Entrada' }, { valor: 'saida', rotulo: 'Saída' }, { valor: 'ambos', rotulo: 'Ambos' }]} />)}
        </>}
        <div className="botoes"><button className="btn primario" type="submit"><SearchIcon /> Pesquisar</button></div>
      </form>
      {mensagem && <div className="mensagem">{mensagem}</div>}
      <table className="grade compacta bancos-extrato">
        <thead>
          <tr><th>Banco</th><th>Data</th><th>Número</th><th>Histórico</th><th>Plano / Pessoa</th><th className="num">Valor</th>{r.comSaldo && <th className="num">Saldo</th>}<th /></tr>
        </thead>
        <tbody>
          {r.comSaldo && <tr className="linha-total"><td colSpan={6}>Saldo anterior a {data(f.de)}</td><td className="num">{moeda(r.saldoAnterior)}</td><td /></tr>}
          {r.linhas.map((m) => (
            <tr key={m.id}>
              <td>{m.conta}</td><td>{data(m.data)}</td>
              <td>{m.tituloId ? <Link className="linha-link" to={`/erp/titulos/${m.tituloId}`} title="Abrir o título da baixa">Recibo {m.recibo}</Link> : m.documento}</td>
              <td>{m.historico}{m.origem !== 'lancamento' && m.origem !== 'baixa' && <span className="muted small"> · {ORIGEM[m.origem]}</span>}</td>
              <td className="small">{m.plano || m.pessoa}{m.plano && m.pessoa ? ` · ${m.pessoa}` : ''}{mostrarCentros && m.centro ? ` · ${m.centro}` : ''}</td>
              <td className={`num${m.valor < 0 ? ' negativo' : ' positivo'}`}>{moeda(m.valor)}</td>
              {r.comSaldo && <td className="num">{moeda(m.saldo)}</td>}
              <td>
                {m.conciliado ? <span className="etiqueta ok" title="Conciliado com o extrato do banco">✓</span>
                  : m.origem !== 'baixa' && (
                    <button type="button" className="btn btn-icone" aria-label={`Excluir o movimento de ${data(m.data)}`}
                      onClick={() => setMensagem(m.origem === 'transferencia'
                        ? 'Demonstração: nada foi excluído. No ERP, excluir a transferência tira o movimento das duas contas.'
                        : 'Demonstração: nada foi excluído. No ERP, o lançamento sairia da conta.')}>
                      <DeleteOutlineIcon />
                    </button>
                  )}
              </td>
            </tr>
          ))}
          {!r.linhas.length && <tr><td colSpan={colunas} className="vazio">Nenhum movimento no período.</td></tr>}
          {r.comSaldo
            ? <tr className="linha-total"><td colSpan={6}>Saldo em {data(f.ate)}</td><td className="num">{moeda(r.saldoFinal)}</td><td /></tr>
            : <tr className="linha-total"><td colSpan={5}>Total ({r.linhas.length} movimento{r.linhas.length === 1 ? '' : 's'})</td><td className="num">{moeda(r.total)}</td><td /></tr>}
        </tbody>
      </table>
      {!r.comSaldo && <p className="muted small">O saldo linha a linha aparece quando se escolhe um banco e nenhum filtro de "Mais Opções".</p>}
      <div className="extrato-rodape">
        <button type="button" className="btn primario" onClick={() => window.print()}><PrintOutlinedIcon /> Imprimir</button>
        <label className="opcao"><input type="checkbox" checked={mostrarCentros} onChange={(e) => setMostrarCentros(e.target.checked)} /> Mostrar Centros Custo</label>
      </div>
    </>
  );
}

function Lancamento() {
  const vazio = { conta: CONTAS[1], data: hoje(), tipo: 'debito', valor: '', historico: '', documento: '', plano: '', centro: '', saldoInicial: false };
  const [f, setF] = useState(vazio);
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);
  const set = (k: 'data' | 'valor' | 'historico' | 'documento' | 'plano' | 'centro') => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const gravar = () => {
    const valor = lerNumero(f.valor);
    const problema = !f.conta ? 'Escolha a conta.' : !f.data ? 'Informe a data.' : !(valor && valor > 0) ? 'Informe o valor.' : !f.historico.trim() ? 'Informe o histórico.' : '';
    if (problema) return setMensagem({ texto: problema, erro: true });
    setMensagem({ texto: `Demonstração: nada foi gravado. O ERP lançaria ${f.tipo === 'credito' ? 'a entrada' : 'a saída'} de ${moeda(valor)} em ${f.conta} em ${data(f.data)}`
      + `${f.saldoInicial ? ', como saldo inicial da conta' : ''}.` });
  };
  return (
    <div className="ficha-elevor bancos-form">
      <p className="muted small">Lançamento direto na conta, sem título: tarifa, rendimento, IOF, saldo inicial. Pagamento de fornecedor e recebimento de cliente vão pelos títulos.</p>
      {linha('Conta:', <SelConta rotulo="Conta" valor={f.conta} onChange={(v) => setF((x) => ({ ...x, conta: v }))} />)}
      {linha('Data:', <input type="date" className="campo curto" aria-label="Data" value={f.data} onChange={set('data')} />)}
      {linha('Tipo:', <Opcoes nome="tipo-lancamento" valor={f.tipo} onChange={(v) => setF((x) => ({ ...x, tipo: v }))}
        opcoes={[{ valor: 'credito', rotulo: 'Crédito (entra)' }, { valor: 'debito', rotulo: 'Débito (sai)' }]} />)}
      {linha('Valor:', <input className="campo curto num" aria-label="Valor" value={f.valor} onChange={set('valor')} />)}
      {linha('Histórico:', <>
        <input className="campo cheio" aria-label="Histórico" value={f.historico} onChange={set('historico')} list="historicos-padrao" />
        <datalist id="historicos-padrao">{HISTORICOS_PADRAO.map((h) => <option key={h} value={h} />)}</datalist>
      </>)}
      {linha('Documento:', <input className="campo medio" aria-label="Documento" value={f.documento} onChange={set('documento')} />)}
      {linha('Plano de contas:', <select className="campo cheio" aria-label="Plano de contas" value={f.plano} onChange={set('plano')}><option value="" />{PLANOS.map((p) => <option key={p}>{p}</option>)}</select>)}
      {linha('Centro de custo:', <select className="campo cheio" aria-label="Centro de custo" value={f.centro} onChange={set('centro')}><option value="" />{CENTROS_CUSTO.map((c) => <option key={c}>{c}</option>)}</select>)}
      {linha('', <label className="opcao"><input type="checkbox" checked={f.saldoInicial} onChange={(e) => setF((x) => ({ ...x, saldoInicial: e.target.checked }))} /> É o saldo inicial da conta</label>)}
      {mensagem && <div className={`mensagem${mensagem.erro ? ' erro' : ''}`}>{mensagem.texto}</div>}
      <div className="botoes"><button type="button" className="btn primario" onClick={gravar}>Gravar lançamento</button></div>
    </div>
  );
}

function Transferencia() {
  const [f, setF] = useState({ data: hoje(), valor: '', origem: '', destino: '', numero: '', historico: 'TRANSFERÊNCIA BANCÁRIA ENTRE BANCOS' });
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);
  const gravar = () => {
    const valor = lerNumero(f.valor);
    const problema = !(valor && valor > 0) ? 'Informe o valor.' : !f.origem || !f.destino ? 'Escolha as duas contas.' : f.origem === f.destino ? 'A origem e o destino são a mesma conta.' : '';
    if (problema) return setMensagem({ texto: problema, erro: true });
    setMensagem({ texto: `Demonstração: nada foi gravado. O ERP tiraria ${moeda(valor)} de ${f.origem} e poria em ${f.destino}, em ${data(f.data)}.` });
  };
  return (
    <div className="ficha-elevor bancos-form">
      <p className="muted small">Mesma data e valor do banco. É o caso da transitória: RESGATE AUTOMATICO CDB = do CDB para a conta corrente; APLICACAO AUTOMATICA CDB = o contrário.</p>
      {linha('Data:', <input type="date" className="campo curto" aria-label="Data" value={f.data} onChange={(e) => setF((x) => ({ ...x, data: e.target.value }))} />)}
      {linha('Valor:', <input className="campo curto num" aria-label="Valor" value={f.valor} onChange={(e) => setF((x) => ({ ...x, valor: e.target.value }))} />)}
      {linha('Sai de:', <SelConta rotulo="Sai de" valor={f.origem} onChange={(v) => setF((x) => ({ ...x, origem: v }))} />)}
      {linha('Entra em:', <SelConta rotulo="Entra em" valor={f.destino} onChange={(v) => setF((x) => ({ ...x, destino: v }))} />)}
      {linha('Número:', <input className="campo medio" aria-label="Número" value={f.numero} onChange={(e) => setF((x) => ({ ...x, numero: e.target.value }))} />)}
      {linha('Histórico:', <input className="campo cheio" aria-label="Histórico" value={f.historico} onChange={(e) => setF((x) => ({ ...x, historico: e.target.value }))} />)}
      {mensagem && <div className={`mensagem${mensagem.erro ? ' erro' : ''}`}>{mensagem.texto}</div>}
      <div className="botoes"><button type="button" className="btn primario" onClick={gravar}>Gravar transferência</button></div>
    </div>
  );
}

// Troca de Arquivos do Elevor: no ERP é a importação do OFX, que fica na Conciliação Bancária.
function TrocaArquivos() {
  return (
    <div className="ficha-elevor bancos-form">
      <p>O extrato do banco (OFX) é importado na <b>Conciliação Bancária</b>: lá ele entra, casa com os lançamentos do ERP e aplica as regras de lançamento automático.</p>
      <div className="botoes"><Link className="btn primario" to="/erp/financeiro/conciliacao">Importar OFX na Conciliação</Link></div>
    </div>
  );
}

function Saldos() {
  const [dia, setDia] = useState(hoje());
  const lista = saldosEm(dia);
  const total = lista.reduce((s, c) => s + c.saldo, 0);
  return (
    <>
      <div className="ficha-elevor bancos-form">{linha('Saldo em:', <input type="date" className="campo curto" aria-label="Saldo em" value={dia} onChange={(e) => setDia(e.target.value)} />)}</div>
      <table className="grade compacta bancos-saldos">
        <thead><tr><th>Conta</th><th>Tipo</th><th>Empresa</th><th>Último movimento</th><th className="num">Saldo</th><th className="num">A conciliar</th></tr></thead>
        <tbody>
          {lista.map((c) => (
            <tr key={c.conta}>
              <td>{c.conta}</td><td>{c.tipo}</td><td>{nomeEmpresa(c.empresa)}</td><td>{data(c.ultimoMovimento)}</td>
              <td className={`num${c.saldo < 0 ? ' negativo' : ''}`}>{moeda(c.saldo)}</td><td className="num">{c.aConciliar || ''}</td>
            </tr>
          ))}
          <tr className="linha-total"><td colSpan={4}>Total</td><td className="num">{moeda(total)}</td><td /></tr>
        </tbody>
      </table>
    </>
  );
}
