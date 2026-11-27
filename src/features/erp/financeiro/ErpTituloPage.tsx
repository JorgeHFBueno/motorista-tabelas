import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import { data, EMPRESAS, hoje, lerNumero, moeda } from '../estoques/estoquesExemplo';
import { PESSOAS_EXEMPLO } from '../pessoas/pessoasExemplo';
import {
  abreviatura, AVISO_TITULOS, BANCOS, CENTROS_CUSTO, CONDICOES_PAGAMENTO, MEIOS_PAGAMENTO, parcelasDaCondicao, parcelasDoDocumento, PLANOS_TITULOS,
  SITUACOES_TITULO, TIPOS_DOCUMENTO, tituloExemplo, type TituloExemplo,
} from './titulosExemplo';

// /erp/titulos/:id: Lançamento de Títulos (FN_Lancamentos do Elevor), como o do ERP do Samuel (web/src/erp/financeiro/Titulo.tsx):
// título a pagar ou a receber, com as seções recolhidas do Elevor (Outros Dados, Pagamento, Referenciar Documento, Arquivos),
// o rateio por centro de custo e, no título gravado, as baixas e as parcelas do documento. `novo` abre vazio; com condição
// de pagamento, mostra as parcelas; ?tipo= e ?situacao= preenchem o novo. Demonstração: Gravar, Excluir e Cancelar só dizem o que o ERP faria.
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

type Linha = { plano: string; centro: string; subcentro: string; valor: string };
const LINHA_VAZIA: Linha = { plano: '', centro: '', subcentro: '', valor: '' };
const paraCampo = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const VAZIO = {
  tipo: 'P', empresa: '1', linhaDigitavel: '', pessoa: '', numero: '', tipoDocumento: TIPOS_DOCUMENTO[0], situacao: SITUACOES_TITULO[0], emissao: hoje(),
  vencimento: '', programacao: '', valor: '', historico: '', banco: '', condicao: '', meio: '', referenciarTipo: 'NF', referenciarNumero: '',
  descontoPontual: '', multa: '', juros: '', competencia: '',
};
type Formulario = typeof VAZIO;
const PESSOAS = [...PESSOAS_EXEMPLO].sort((a, b) => a.nome.localeCompare(b.nome));

function doTitulo(t: TituloExemplo): { f: Formulario; rateio: Linha[] } {
  return {
    f: {
      ...VAZIO, tipo: t.tipo, empresa: String(t.empresa), linhaDigitavel: t.linhaDigitavel, pessoa: t.pessoa, numero: t.numero, tipoDocumento: t.tipoDocumento,
      situacao: t.situacao, emissao: t.emissao, vencimento: t.vencimento, programacao: t.programacao, valor: paraCampo(t.valor), historico: t.historico,
      banco: t.banco, meio: t.meio, referenciarNumero: t.notaNumero ? String(t.notaNumero) : '',
    },
    rateio: t.rateio.map((r) => ({ ...r, valor: paraCampo(r.valor) })),
  };
}

function Ficha({ t, copia, padrao }: { t: TituloExemplo | null; copia?: { f: Formulario; rateio: Linha[] }; padrao?: Partial<Formulario> }) {
  const navigate = useNavigate();
  const novo = !t;
  const inicial = copia ?? (t ? doTitulo(t) : { f: { ...VAZIO, ...padrao }, rateio: [LINHA_VAZIA] });
  const [f, setF] = useState<Formulario>(inicial.f);
  const [rateio, setRateio] = useState<Linha[]>(inicial.rateio);
  const [secao, setSecao] = useState<Record<string, boolean>>({ outros: false, pagamento: novo, referenciar: true, arquivos: false });
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);
  useTituloPagina(t ? `Título ${t.numero}/${t.sequencia}` : 'Lançamento de Títulos');

  const ro = Boolean(t?.cancelado);
  const pago = t ? t.valor - t.saldo : 0;
  const total = lerNumero(f.valor) ?? 0;
  const somaRateio = rateio.reduce((s, r) => s + (lerNumero(r.valor) ?? 0), 0);
  const falta = Math.round((total - somaRateio) * 100) / 100;
  const parcelas = novo && f.condicao ? parcelasDaCondicao(Number(f.condicao), total, f.emissao || hoje()) : [];
  const pessoa = PESSOAS_EXEMPLO.find((p) => p.nome === f.pessoa);
  const set = (k: keyof Formulario) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const mudarValor = (v: string) => {
    setF((x) => ({ ...x, valor: v }));
    // Rateio de uma linha só acompanha o valor do título.
    if (rateio.length === 1) setRateio((l) => [{ ...l[0], valor: v }]);
  };

  const gravar = () => {
    const problema = !f.pessoa ? 'Escolha o cliente/fornecedor.' : !f.numero.trim() ? 'Informe o número do título.' : !(total > 0) ? 'Informe o valor do documento.'
      : !f.vencimento && !parcelas.length ? 'Informe o vencimento ou a condição de pagamento.' : !rateio[0]?.plano ? 'Escolha o plano de contas.'
        : Math.abs(falta) > 0.005 ? 'Os centros de custo não somam o valor do documento.' : '';
    if (problema) return setMensagem({ texto: problema, erro: true });
    setMensagem({ texto: novo
      ? `Demonstração: nada foi gravado. O ERP gravaria ${parcelas.length > 1 ? `${parcelas.length} parcelas` : 'o título'} a ${f.tipo === 'R' ? 'receber' : 'pagar'} de ${moeda(total)} para ${f.pessoa}.`
      : 'Demonstração: nada foi gravado. O ERP gravaria as mudanças do título.' });
  };
  const aviso = (texto: string) => setMensagem({ texto });
  const linha = (rotulo: string, campo: ReactNode) => <div className="form-linha"><div className="form-rotulo">{rotulo}</div><div className="form-controle">{campo}</div></div>;
  const dupla = (r1: string, c1: ReactNode, r2: string, c2: ReactNode) => (
    <div className="form-linha dupla"><div className="form-rotulo">{r1}</div><div className="form-controle">{c1}</div><div className="form-rotulo">{r2}</div><div className="form-controle">{c2}</div></div>
  );
  const recolhida = (k: string, rotulo: string) => (
    <div className="secao-recolhida">
      <button type="button" className="link-botao" aria-expanded={secao[k]} onClick={() => setSecao((x) => ({ ...x, [k]: !x[k] }))}>
        {rotulo} {secao[k] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      </button>
    </div>
  );
  const lista = (k: keyof Formulario, rotulo: string, opcoes: string[], classe = 'campo medio', vazio = true) => (
    <select className={classe} aria-label={rotulo} value={f[k]} onChange={set(k)} disabled={ro}>
      {vazio && <option value="" />}{opcoes.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
  const numero = (k: keyof Formulario, rotulo: string) => <input className="campo mini num" aria-label={rotulo} value={f[k]} onChange={set(k)} disabled={ro} />;
  const dataCampo = (k: keyof Formulario, rotulo: string) => <input type="date" className="campo curto" aria-label={rotulo} value={f[k]} onChange={set(k)} disabled={ro} />;

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_TITULOS}</div>
      {t?.cancelado && <div className="mensagem erro">Título cancelado{t.motivoCancelamento ? `: ${t.motivoCancelamento}` : ''}.</div>}
      <div className="ficha-elevor largo lanc-titulo">
        {linha('Tipo:', novo ? (
          <div className="opcoes">
            {[['P', 'Pagar'], ['R', 'Receber']].map(([v, r]) => (
              <label key={v} className="opcao"><input type="radio" name="tipo-titulo" checked={f.tipo === v} onChange={() => setF((x) => ({ ...x, tipo: v }))} /> {r}</label>
            ))}
          </div>
        ) : <input className="campo curto destaque" aria-label="Tipo" readOnly value={f.tipo === 'R' ? 'Receber' : 'Pagar'} />)}
        {linha('Empresa:', (
          <select className="campo medio" aria-label="Empresa" value={f.empresa} onChange={set('empresa')} disabled={ro || pago > 0}>
            {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        ))}
        {linha('Linha Digitável:', <input className="campo lt-linha" aria-label="Linha Digitável" value={f.linhaDigitavel} onChange={set('linhaDigitavel')} disabled={ro} placeholder="código de barras do boleto" />)}
        {linha('Cliente/Fornecedor:', <span className="lt-pessoa">
          <input className="campo lt-pessoa-cod" aria-label="Código do cliente/fornecedor" readOnly tabIndex={-1} value={pessoa?.codigo ?? ''} />
          <select className="campo lt-pessoa-nome" aria-label="Cliente/Fornecedor" value={f.pessoa} onChange={set('pessoa')} disabled={ro || pago > 0}>
            <option value="" />{PESSOAS.map((p) => <option key={p.codigo} value={p.nome}>{p.codigo} - {p.nome}</option>)}
          </select>
          {pessoa && <Link to={`/erp/pessoas/${pessoa.codigo}`} title="Abrir o cadastro">ficha</Link>}
        </span>)}
        {dupla('Número Título:', <input className="campo lt-curto" aria-label="Número Título" value={f.numero} onChange={set('numero')} disabled={ro} />,
          'Sequência:', <input className="campo mini" aria-label="Sequência" readOnly tabIndex={-1}
            value={novo ? (parcelas.length > 1 ? `1/${parcelas.length}` : '1') : `${t.sequencia}${t.parcelas > 1 ? `/${t.parcelas}` : ''}`} />)}
        {linha('Tipo Documento:', <>{lista('tipoDocumento', 'Tipo Documento', TIPOS_DOCUMENTO, 'campo medio', false)}
          <input className="campo mini" aria-label="Abreviatura" readOnly tabIndex={-1} value={abreviatura(f.tipoDocumento)} /></>)}
        {linha('Situação:', lista('situacao', 'Situação', SITUACOES_TITULO, 'campo curto-medio', false))}
        {dupla('Data Emissão:', dataCampo('emissao', 'Data Emissão'),
          'Data Vencimento:', novo && parcelas.length ? <span className="muted small">pela condição (Pagamento)</span> : dataCampo('vencimento', 'Data Vencimento'))}
        {dupla('Valor Documento:', <input className="campo curto num destaque lt-curto" aria-label="Valor Documento" value={f.valor} onChange={(e) => mudarValor(e.target.value)} disabled={ro || pago > 0} />,
          'Data Programação:', novo && parcelas.length ? <span className="muted small">pelas parcelas, abaixo</span> : dataCampo('programacao', 'Data Programação'))}
        {t && linha('Saldo:', <input className="campo curto num" aria-label="Saldo" readOnly tabIndex={-1} value={moeda(t.saldo)} />)}
        {rateio.length <= 1 && linha('Plano de Contas:', (
          <select className="campo lt-plano" aria-label="Plano de Contas" value={rateio[0]?.plano ?? ''} disabled={ro}
            onChange={(e) => setRateio((l) => [{ ...(l[0] ?? LINHA_VAZIA), plano: e.target.value }])}>
            <option value="" />{PLANOS_TITULOS.map((p) => <option key={p}>{p}</option>)}
          </select>
        ))}
        {linha('Histórico:', <input className="campo lt-historico" aria-label="Histórico" value={f.historico} onChange={set('historico')} disabled={ro} />)}
        {recolhida('outros', 'Outros Dados')}
        {secao.outros && <>
          {dupla('Desconto Pontual.$:', numero('descontoPontual', 'Desconto Pontual'), 'Multa:', numero('multa', 'Multa'))}
          {dupla('Taxa Correção Juros %:', numero('juros', 'Taxa Correção Juros'), 'Competência:', (
            <input className="campo curto" type="month" aria-label="Competência" value={f.competencia} onChange={set('competencia')} disabled={ro}
              title="Mês da DRE por competência (vazio = mês da emissão)" />
          ))}
        </>}
        {recolhida('pagamento', 'Pagamento')}
        {secao.pagamento && <>
          {linha('Banco:', lista('banco', 'Banco', BANCOS))}
          {novo && linha('Condição Pagamento:', (
            <select className="campo medio" aria-label="Condição Pagamento" value={f.condicao} onChange={set('condicao')}>
              <option value="">Parcela única (vencimento acima)</option>
              {CONDICOES_PAGAMENTO.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
            </select>
          ))}
          {linha('Meio de pagamento:', lista('meio', 'Meio de pagamento', MEIOS_PAGAMENTO))}
        </>}
        {recolhida('referenciar', 'Referenciar Documento')}
        {secao.referenciar && <>
          {linha('Referenciar:', (
            <div className="opcoes">
              {['NF', 'CTe', 'CTeOS'].map((v) => (
                <label key={v} className="opcao"><input type="radio" name="referenciar" checked={f.referenciarTipo === v} disabled={ro} onChange={() => setF((x) => ({ ...x, referenciarTipo: v }))} /> {v}</label>
              ))}
            </div>
          ))}
          {linha('Número Documento:', <>
            <input className="campo lt-ref-numero" aria-label="Número Documento" value={f.referenciarNumero} onChange={set('referenciarNumero')} disabled={ro} />
            {t?.notaNumero ? <Link className="btn" to={`/erp/notas/${t.notaNumero}`}>Abrir a nota</Link>
              : <button type="button" className="btn" disabled={ro} onClick={() => aviso('O número fica no título ao gravar; ligar à nota ainda não existe no ERP.')}>Referenciar</button>}
          </>)}
        </>}
        {recolhida('arquivos', 'Arquivos')}
        {secao.arquivos && <p className="muted small lt-arquivos">Na demonstração não se anexam arquivos; no ERP, o boleto e o comprovante ficam com o título.</p>}
      </div>

      <div className="ficha-elevor-corpo">
        {parcelas.length > 0 && (
          <>
            <div className="secao-titulo">Parcelas</div>
            <table className="grade compacta">
              <thead><tr><th className="num">Parcela</th><th>Vencimento</th><th className="num">Valor</th></tr></thead>
              <tbody>{parcelas.map((p, i) => <tr key={i}><td className="num">{i + 1}/{parcelas.length}</td><td>{data(p.vencimento)}</td><td className="num">{moeda(p.valor)}</td></tr>)}</tbody>
            </table>
          </>
        )}
        <div className="secao-titulo">Centros de Custo</div>
        <table className="grade compacta">
          <thead><tr>{rateio.length > 1 && <th>Plano de contas</th>}<th>Centro de Custo</th><th>Subcentro (obra)</th><th className="num">Valor</th>{!ro && <th />}</tr></thead>
          <tbody>
            {rateio.map((r, i) => {
              const mudar = (aj: Partial<Linha>) => setRateio((l) => l.map((x, j) => (j === i ? { ...x, ...aj } : x)));
              return (
                <tr key={i}>
                  {rateio.length > 1 && (
                    <td><select className="campo cheio" aria-label={`Plano de contas da linha ${i + 1}`} value={r.plano} disabled={ro} onChange={(e) => mudar({ plano: e.target.value })}>
                      <option value="" />{PLANOS_TITULOS.map((p) => <option key={p}>{p}</option>)}
                    </select></td>
                  )}
                  <td><select className="campo cheio" aria-label={`Centro de custo da linha ${i + 1}`} value={r.centro} disabled={ro} onChange={(e) => mudar({ centro: e.target.value })}>
                    <option value="" />{CENTROS_CUSTO.map((c) => <option key={c}>{c}</option>)}
                  </select></td>
                  <td><input className="campo cheio" aria-label={`Subcentro da linha ${i + 1}`} value={r.subcentro} disabled={ro} onChange={(e) => mudar({ subcentro: e.target.value })} placeholder="obra" /></td>
                  <td className="num">{ro ? moeda(lerNumero(r.valor)) : <input className="campo curto num" aria-label={`Valor da linha ${i + 1}`} value={r.valor} onChange={(e) => mudar({ valor: e.target.value })} />}</td>
                  {!ro && <td><button type="button" className="btn btn-icone" aria-label={`Tirar a linha ${i + 1}`} disabled={rateio.length === 1} onClick={() => setRateio((l) => l.filter((_, j) => j !== i))}><DeleteOutlineIcon /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!ro && (
          <div className="linha-entrada">
            <button type="button" className="btn" onClick={() => setRateio((l) => [...l, { ...LINHA_VAZIA, plano: l[0]?.plano ?? '', valor: falta > 0 ? paraCampo(falta) : '' }])}>
              <AddIcon /> Centro de custo
            </button>
            {Math.abs(falta) > 0.005 && <span className={falta < 0 ? 'negativo' : 'muted'}>{falta > 0 ? `Falta distribuir ${moeda(falta)}` : `Passou ${moeda(-falta)} do valor`}</span>}
          </div>
        )}
        <div className="total-centros"><b>Total Centros de Custo</b><span>{moeda(somaRateio)}</span></div>

        {mensagem && <div className={`mensagem${mensagem.erro ? ' erro' : ''}`}>{mensagem.texto}</div>}
        <div className="botoes">
          <button type="button" className="btn primario" disabled={ro} onClick={gravar}>Gravar</button>
          <button type="button" className="btn" onClick={() => navigate('/erp/titulos/novo')}>Novo</button>
          <button type="button" className="btn" disabled={novo || ro || pago > 0}
            onClick={() => aviso('Demonstração: nada foi excluído. No ERP, título sem baixa pode ser excluído.')}>Excluir</button>
          <button type="button" className="btn" disabled={novo}
            onClick={() => navigate('/erp/titulos/novo', { state: { copia: { f: { ...f, numero: '', emissao: hoje(), vencimento: '', programacao: '' }, rateio } } })}>Copiar</button>
          {t && <button type="button" className="btn" disabled={ro || pago > 0}
            onClick={() => aviso('Demonstração: nada foi cancelado. No ERP, o título cancelado sai do saldo e pede o motivo.')}>Cancelar título</button>}
          {t && <button type="button" className="btn" disabled={ro || t.saldo <= 0} onClick={() => navigate(`/erp/baixa?titulos=${t.id}`)}>
            <PaymentsOutlinedIcon /> {t.tipo === 'R' ? 'Receber' : 'Pagar'}
          </button>}
          <button type="button" className="btn" onClick={() => navigate('/erp/titulos')}>Consulta</button>
        </div>
      </div>

      {t && (
        <div className="ficha-elevor-corpo">
          <div className="secao-titulo">Pagamentos / recebimentos (baixas)</div>
          {t.baixas.length === 0 ? <p className="muted">Nenhuma baixa.</p> : (
            <table className="grade compacta">
              <thead><tr><th>Data</th><th className="num">Recibo</th><th>Conta</th><th className="num">Principal</th><th className="num">Juros</th><th className="num">Multa</th><th className="num">Desconto</th><th>Usuário</th></tr></thead>
              <tbody>
                {t.baixas.map((b) => (
                  <tr key={b.recibo}>
                    <td>{data(b.data)}</td><td className="num"><Link className="linha-link" to={`/erp/recibos/${b.recibo}`} title="Abrir o recibo">{b.recibo}</Link></td><td>{b.conta}</td><td className="num">{moeda(b.valor)}</td><td className="num">{moeda(b.juros)}</td>
                    <td className="num">{moeda(b.multa)}</td><td className="num">{moeda(b.desconto)}</td><td>{b.usuario}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {t.parcelas > 1 && (
            <>
              <div className="secao-titulo">Parcelas deste documento</div>
              <table className="grade compacta">
                <thead><tr><th className="num">Parcela</th><th>Vencimento</th><th className="num">Valor</th><th className="num">Saldo</th></tr></thead>
                <tbody>
                  {parcelasDoDocumento(t).map((p) => (
                    <tr key={p.id} className={p.id === t.id ? 'selecionada' : undefined}>
                      <td className="num"><Link className="linha-link" to={`/erp/titulos/${p.id}`}>{p.sequencia}/{p.parcelas}</Link></td>
                      <td>{data(p.vencimento)}</td><td className="num">{moeda(p.valor)}</td><td className="num">{p.cancelado ? 'cancelado' : moeda(p.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ErpTituloPage() {
  const { id = 'novo' } = useParams();
  const navigate = useNavigate();
  const copia = (useLocation().state as { copia?: { f: Formulario; rateio: Linha[] } } | null)?.copia;
  // Novo já com tipo e situação (o Novo da Consulta de Adiantamentos/Empréstimos: ?tipo=R&situacao=CRÉDITO/ADIANTAMENTO).
  const [params] = useSearchParams();
  const padrao: Partial<Formulario> = {};
  if (params.get('tipo') === 'P' || params.get('tipo') === 'R') padrao.tipo = params.get('tipo')!;
  if (SITUACOES_TITULO.includes(params.get('situacao') ?? '')) padrao.situacao = params.get('situacao')!;
  const t = id === 'novo' ? null : tituloExemplo(id);
  if (id !== 'novo' && !t) {
    return (
      <div className="erp-elevor">
        <div className="mensagem">Título não encontrado.</div>
        <div className="botoes"><button className="btn" type="button" onClick={() => navigate('/erp/titulos')}>Consulta</button></div>
      </div>
    );
  }
  // key: trocar de título (ou Copiar para um novo) recomeça a ficha.
  return <Ficha key={`${id}-${copia ? 'copia' : ''}-${params.toString()}`} t={t} copia={copia} padrao={padrao} />;
}
