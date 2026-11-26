import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import { data, EMPRESAS, hoje, lerNumero, moeda } from '../estoques/estoquesExemplo';
import {
  abreviatura, AVISO_TITULOS, BANCOS, bancoDaEmpresa, FILTRO_TITULOS, filtrarTitulos, MEIOS_PAGAMENTO, TITULOS_EXEMPLO, tituloExemplo, type TituloExemplo,
} from './titulosExemplo';

// /erp/baixa: Baixa de Títulos (o "Emitir Recibo" do Elevor), como a do ERP do Samuel (web/src/erp/financeiro/Baixa.tsx).
// Com ?titulos=1,2: paga ou recebe os títulos marcados na Consulta, num recibo só (um título: Parcial ou Total, multa,
// juros e descontos; vários: uma linha por título). Sem títulos: procura pelo tipo, empresa, cliente e número.
// Demonstração: Gravar só diz o recibo e o total que o ERP lançaria. The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

type Item = { titulo: TituloExemplo; valor: string; juros: string; multa: string; desconto: string };
const paraCampo = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (t: string) => lerNumero(t) ?? 0;
const PROXIMO_RECIBO = Math.max(800, ...TITULOS_EXEMPLO.flatMap((t) => t.baixas.map((b) => b.recibo))) + 1;

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div className="form-linha"><div className="form-rotulo">{rotulo}</div><div className="form-controle">{children}</div></div>;
}

function Baixa({ titulos }: { titulos: TituloExemplo[] }) {
  const navigate = useNavigate();
  const [itens, setItens] = useState<Item[]>(() => titulos.map((t) => ({ titulo: t, valor: paraCampo(t.saldo), juros: '', multa: '', desconto: '' })));
  const [cab, setCab] = useState({ data: hoje(), banco: titulos[0].banco || bancoDaEmpresa(titulos[0].empresa), meio: '', historico: '' });
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);
  const tipo = titulos[0].tipo;
  const um = itens.length === 1 ? itens[0] : null;
  const t0 = titulos[0];
  const liquido = (i: Item) => n(i.valor) + n(i.juros) + n(i.multa) - n(i.desconto);
  const total = itens.reduce((s, i) => s + liquido(i), 0);
  const mudar = (k: number, aj: Partial<Item>) => setItens((l) => l.map((x, j) => (j === k ? { ...x, ...aj } : x)));

  const gravar = () => {
    const passou = itens.find((i) => n(i.valor) > i.titulo.saldo + 0.005);
    const problema = !cab.banco ? 'Escolha a conta.' : !cab.data ? 'Informe a data.' : itens.some((i) => !(n(i.valor) > 0)) ? 'Informe o valor de cada título.'
      : passou ? `O valor do título ${passou.titulo.numero}/${passou.titulo.sequencia} passa do saldo (${moeda(passou.titulo.saldo)}).` : '';
    if (problema) return setMensagem({ texto: problema, erro: true });
    const parciais = itens.filter((i) => n(i.valor) < i.titulo.saldo - 0.005).length;
    setMensagem({ texto: `Demonstração: nada foi gravado. O ERP emitiria o recibo ${PROXIMO_RECIBO}, de ${moeda(total)}, lançado em ${cab.banco} em ${data(cab.data)}`
      + `${parciais ? `; ${parciais} título(s) ficariam em aberto com a diferença` : ''}.` });
  };

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_TITULOS}</div>
      <div className="ficha-elevor largo baixa-titulos">
        <Linha rotulo="Tipo:">
          <div className="opcoes">
            {[['P', 'Pagar'], ['R', 'Receber']].map(([v, r]) => (
              <label key={v} className="opcao"><input type="radio" name="tipo-baixa" readOnly checked={tipo === v} disabled={tipo !== v} /> {r}</label>
            ))}
          </div>
        </Linha>
        <Linha rotulo="Empresa:"><input className="campo medio" aria-label="Empresa" readOnly tabIndex={-1} value={EMPRESAS.find((e) => e.id === t0.empresa)?.nome ?? ''} /></Linha>
        <Linha rotulo="Cliente/Fornecedor:">
          <input className="campo cheio" aria-label="Cliente/Fornecedor" readOnly tabIndex={-1}
            value={um ? `${t0.pessoaCodigo ? `${t0.pessoaCodigo} - ` : ''}${t0.pessoa}` : titulos.every((t) => t.pessoa === t0.pessoa) ? t0.pessoa : `${titulos.length} títulos marcados`} />
        </Linha>
        {um && <>
          <Linha rotulo="Número/Seq:">
            <input className="campo curto" aria-label="Número" readOnly tabIndex={-1} value={t0.numero} />
            <input className="campo mini" aria-label="Sequência" readOnly tabIndex={-1} value={`${t0.sequencia}${t0.parcelas > 1 ? `/${t0.parcelas}` : ''}`} />
          </Linha>
          <div className="form-linha dupla">
            <div className="form-rotulo">Valor Documento:</div><div className="form-controle"><input className="campo curto num" aria-label="Valor Documento" readOnly tabIndex={-1} value={moeda(t0.valor)} /></div>
            <div className="form-rotulo">Saldo:</div>
            <div className="form-controle">
              <input className="campo curto num" aria-label="Saldo" readOnly tabIndex={-1} value={moeda(t0.saldo)} />
              <span className="muted">{abreviatura(t0.tipoDocumento)}</span>
            </div>
          </div>
          <div className="form-linha dupla">
            <div className="form-rotulo">Data Emissão:</div><div className="form-controle"><input className="campo curto" aria-label="Data Emissão" readOnly tabIndex={-1} value={data(t0.emissao)} /></div>
            <div className="form-rotulo">Data Vencimento:</div><div className="form-controle"><input className="campo curto" aria-label="Data Vencimento" readOnly tabIndex={-1} value={data(t0.vencimento)} /></div>
          </div>
          <hr className="divisoria" />
          <Linha rotulo="Forma Pagamento:">
            <div className="opcoes">
              <label className="opcao"><input type="radio" name="forma" checked={n(um.valor) < t0.saldo - 0.005} onChange={() => mudar(0, { valor: '' })} /> Parcial</label>
              <label className="opcao"><input type="radio" name="forma" checked={n(um.valor) >= t0.saldo - 0.005} onChange={() => mudar(0, { valor: paraCampo(t0.saldo) })} /> Total</label>
            </div>
          </Linha>
        </>}
        <Linha rotulo="Banco:">
          <select className="campo medio" aria-label="Banco" value={cab.banco} onChange={(e) => setCab((c) => ({ ...c, banco: e.target.value }))}>
            <option value="">Escolha a conta</option>{BANCOS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </Linha>
        {um ? <>
          <div className="form-linha dupla">
            <div className="form-rotulo">Data:</div>
            <div className="form-controle"><input type="date" className="campo curto" aria-label="Data" value={cab.data} onChange={(e) => setCab((c) => ({ ...c, data: e.target.value }))} /></div>
            <div className="form-rotulo">Valor:</div>
            <div className="form-controle"><input className="campo curto num" aria-label="Valor" value={um.valor} onChange={(e) => mudar(0, { valor: e.target.value })} /></div>
          </div>
          <div className="form-linha dupla">
            <div className="form-rotulo">Multa (+):</div>
            <div className="form-controle"><input className="campo curto num" aria-label="Multa" placeholder="0,00" value={um.multa} onChange={(e) => mudar(0, { multa: e.target.value })} /></div>
            <div className="form-rotulo">Juros (+):</div>
            <div className="form-controle"><input className="campo curto num" aria-label="Juros" placeholder="0,00" value={um.juros} onChange={(e) => mudar(0, { juros: e.target.value })} /></div>
          </div>
          <Linha rotulo="Descontos (-):"><input className="campo curto num" aria-label="Descontos" placeholder="0,00" value={um.desconto} onChange={(e) => mudar(0, { desconto: e.target.value })} /></Linha>
          <Linha rotulo="Valor Líq.:"><input className="campo curto num destaque" aria-label="Valor Líquido" readOnly tabIndex={-1} value={moeda(liquido(um))} /></Linha>
        </> : (
          <Linha rotulo="Data:"><input type="date" className="campo curto" aria-label="Data" value={cab.data} onChange={(e) => setCab((c) => ({ ...c, data: e.target.value }))} /></Linha>
        )}
        <Linha rotulo="Meio de pagamento:">
          <select className="campo medio" aria-label="Meio de pagamento" value={cab.meio} onChange={(e) => setCab((c) => ({ ...c, meio: e.target.value }))}>
            <option value="" />{MEIOS_PAGAMENTO.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Histórico:">
          <input className="campo cheio" aria-label="Histórico" value={cab.historico} placeholder="vazio = Pagamento/Recebimento + número do título" onChange={(e) => setCab((c) => ({ ...c, historico: e.target.value }))} />
        </Linha>
      </div>
      {!um && (
        <table className="grade compacta">
          <thead>
            <tr>
              <th>Cliente/Fornecedor</th><th>Título</th><th>Vencimento</th><th className="num">Dias</th><th className="num">Saldo</th><th className="num">Valor (principal)</th>
              <th className="num">Multa (+)</th><th className="num">Juros (+)</th><th className="num">Descontos (-)</th><th className="num">Valor Líq.</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i, k) => {
              const dias = Math.max(0, Math.round((Date.parse(cab.data) - Date.parse(i.titulo.vencimento)) / 86400000));
              const rotulo = `${i.titulo.numero}/${i.titulo.sequencia}`;
              return (
                <tr key={i.titulo.id}>
                  <td>{i.titulo.pessoa}</td>
                  <td><Link className="linha-link" to={`/erp/titulos/${i.titulo.id}`}>{rotulo}</Link></td>
                  <td>{data(i.titulo.vencimento)}</td>
                  <td className={`num${dias > 0 ? ' negativo' : ''}`}>{dias || ''}</td>
                  <td className="num">{moeda(i.titulo.saldo)}</td>
                  <td className="num"><input className="campo curto num" aria-label={`Valor do título ${rotulo}`} value={i.valor} onChange={(e) => mudar(k, { valor: e.target.value })} /></td>
                  <td className="num"><input className="campo mini num" aria-label={`Multa do título ${rotulo}`} value={i.multa} onChange={(e) => mudar(k, { multa: e.target.value })} /></td>
                  <td className="num"><input className="campo mini num" aria-label={`Juros do título ${rotulo}`} value={i.juros} onChange={(e) => mudar(k, { juros: e.target.value })} /></td>
                  <td className="num"><input className="campo mini num" aria-label={`Descontos do título ${rotulo}`} value={i.desconto} onChange={(e) => mudar(k, { desconto: e.target.value })} /></td>
                  <td className="num"><b>{moeda(liquido(i))}</b></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr className="linha-total"><td colSpan={9}>Total {tipo === 'R' ? 'recebido' : 'pago'}</td><td className="num">{moeda(total)}</td></tr></tfoot>
        </table>
      )}
      <div className="ficha-elevor-corpo">
        <p className="muted small">Valor menor que o saldo deixa o título em aberto com a diferença (baixa parcial). Para quitar com abatimento, use Descontos. O recibo é emitido sempre.</p>
        {mensagem && <div className={`mensagem${mensagem.erro ? ' erro' : ''}`}>{mensagem.texto}</div>}
        <div className="botoes">
          <button type="button" className="btn primario" onClick={gravar}>Gravar</button>
          <button type="button" className="btn" onClick={() => navigate('/erp/baixa')}>Novo</button>
          {um && <button type="button" className="btn" onClick={() => navigate(`/erp/titulos/${t0.id}`)}>Editar Título</button>}
          <button type="button" className="btn" onClick={() => navigate('/erp/titulos')}>Consulta</button>
        </div>
      </div>
    </div>
  );
}

/** Baixa aberta pelo menu: procura o título em aberto pelo tipo, empresa, cliente e número, como no Elevor. */
function ProcurarTitulo() {
  const navigate = useNavigate();
  const [f, setF] = useState({ tipo: 'P', empresa: '1', pessoa: '', numero: '' });
  const [lista, setLista] = useState<TituloExemplo[] | null>(null);
  const pessoas = [...new Set(TITULOS_EXEMPLO.filter((t) => t.tipo === f.tipo).map((t) => t.pessoa))].sort();
  const pesquisar = () => {
    const achados = filtrarTitulos({ ...FILTRO_TITULOS, tipo: f.tipo, empresa: f.empresa, pessoa: f.pessoa, numero: f.numero, abertos: '1' });
    if (achados.length === 1) navigate(`/erp/baixa?titulos=${achados[0].id}`);
    else setLista(achados);
  };
  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_TITULOS}</div>
      <form className="ficha-elevor largo" onSubmit={(e) => { e.preventDefault(); pesquisar(); }}>
        <Linha rotulo="Tipo:">
          <div className="opcoes">
            {[['P', 'Pagar'], ['R', 'Receber']].map(([v, r]) => (
              <label key={v} className="opcao"><input type="radio" name="tipo-procura" checked={f.tipo === v} onChange={() => setF((x) => ({ ...x, tipo: v, pessoa: '' }))} /> {r}</label>
            ))}
          </div>
        </Linha>
        <Linha rotulo="Empresa:">
          <select className="campo medio" aria-label="Empresa" value={f.empresa} onChange={(e) => setF((x) => ({ ...x, empresa: e.target.value }))}>
            {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Cliente/Fornecedor:">
          <select className="campo cheio" aria-label="Cliente/Fornecedor" value={f.pessoa} onChange={(e) => setF((x) => ({ ...x, pessoa: e.target.value }))}>
            <option value="" />{pessoas.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Número/Seq:">
          <input className="campo curto" aria-label="Número" value={f.numero} onChange={(e) => setF((x) => ({ ...x, numero: e.target.value }))} />
          <button className="btn" type="submit"><SearchIcon /> Pesquisar</button>
        </Linha>
      </form>
      {lista && (
        <div className="ficha-elevor-corpo">
          {lista.length === 0 ? <p className="muted">Nenhum título em aberto com esses dados.</p> : (
            <table className="grade compacta">
              <thead><tr><th>Cliente/Fornecedor</th><th>Número</th><th className="num">Seq.</th><th>Vencimento</th><th className="num">Saldo</th></tr></thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id}>
                    <td>{t.pessoa}</td><td><Link className="linha-link" to={`/erp/baixa?titulos=${t.id}`}>{t.numero}</Link></td>
                    <td className="num">{t.sequencia}{t.parcelas > 1 ? `/${t.parcelas}` : ''}</td><td>{data(t.vencimento)}</td><td className="num">{moeda(t.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function ErpBaixaPage() {
  useTituloPagina('Baixa de Títulos');
  const [params] = useSearchParams();
  const ids = (params.get('titulos') ?? '').split(',').filter(Boolean);
  const titulos = ids.map((id) => tituloExemplo(id)).filter((t): t is TituloExemplo => Boolean(t && !t.cancelado && t.saldo > 0));
  if (!ids.length) return <ProcurarTitulo />;
  if (!titulos.length || new Set(titulos.map((t) => `${t.tipo}${t.empresa}`)).size > 1) {
    return (
      <div className="erp-elevor">
        <div className="mensagem">Nenhum título em aberto para baixar (ou títulos de tipo ou empresa diferentes).</div>
        <div className="botoes"><Link className="btn" to="/erp/titulos">Consulta</Link></div>
      </div>
    );
  }
  return <Baixa key={ids.join(',')} titulos={titulos} />;
}
