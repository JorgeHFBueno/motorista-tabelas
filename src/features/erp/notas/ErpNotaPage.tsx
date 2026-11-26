import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import { data, moeda, num, produtoExemplo } from '../estoques/estoquesExemplo';
import { AVISO_NOTAS, naturezaExemplo, nomeEmpresaNota, notaExemplo } from './notasExemplo';

// /erp/notas/:numero: a nota (CL_NotasDetalhe do Elevor), como o detalhe do ERP do Samuel (web/src/erp/fiscal/Notas.tsx):
// cabeçalho, itens com o produto ligado e o custo que entrou no estoque, totais e títulos. Demonstração: "Cancelar
// entrada" só diz o que o ERP faria. The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

const formatarDoc = (d: string) => (d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d);

export default function ErpNotaPage() {
  const { numero } = useParams();
  const navigate = useNavigate();
  const n = notaExemplo(numero);
  const [mensagem, setMensagem] = useState('');
  useTituloPagina(n ? `Nota ${n.numero}` : 'Nota Fiscal');
  if (!n) {
    return (
      <div className="erp-elevor">
        <div className="mensagem">Nota não encontrada.</div>
        <div className="botoes"><button className="btn" type="button" onClick={() => navigate('/erp/notas')}>Consulta de Notas</button></div>
      </div>
    );
  }
  const linha = (rotulo: string, campo: ReactNode) => <div className="form-linha"><div className="form-rotulo">{rotulo}</div><div className="form-controle">{campo}</div></div>;
  const entrada = n.tipo === 'E';
  const cancelar = () => setMensagem(entrada
    ? `Demonstração: nada foi cancelado. No ERP, cancelar a entrada estorna o estoque dos ${n.itens.length} itens e cancela os títulos sem baixa.`
    : 'Demonstração: nada foi cancelado. No ERP, cancelar o lançamento estorna o estoque; o cancelamento na SEFAZ é no emissor.');

  return (
    <div className="erp-elevor nota-detalhe">
      <div className="erp-aviso">{AVISO_NOTAS}</div>
      <div className="duas-colunas">
        <div>
          {linha('Número / Série:', <span><b>{n.numero}</b> / {n.serie} · modelo {n.modelo} · {entrada ? 'Entrada' : 'Saída'}</span>)}
          {linha(entrada ? 'Fornecedor:' : 'Cliente:', (
            <span>{n.pessoaCodigo ? <Link to={`/erp/pessoas/${n.pessoaCodigo}`}>{n.pessoa}</Link> : n.pessoa}{n.documento && ` · ${formatarDoc(n.documento)}`}</span>
          ))}
          {linha('Empresa:', <span>{nomeEmpresaNota(n)}</span>)}
          {linha('Natureza:', <span>{naturezaExemplo(n.natureza)?.descricao}</span>)}
          {linha('Chave:', <span className="small">{n.chave}</span>)}
        </div>
        <div>
          {linha('Emissão:', <span>{data(n.emissao)}</span>)}
          {linha('Entrada:', <span>{data(n.entrada)}</span>)}
          {linha('Estoque:', <span>atualizado</span>)}
          {linha('Plano / Centro:', <span>{[n.planoContas, n.centroCusto].filter(Boolean).join(' · ')}</span>)}
          {linha('Observação:', <span className="small">{n.observacao}</span>)}
        </div>
      </div>
      <div className="secao-titulo">Itens</div>
      <table className="grade compacta">
        <thead>
          <tr>
            <th className="num">Item</th><th>Cód. forn.</th><th>Descrição</th><th>NCM</th><th>CFOP</th><th>UN</th><th className="num">Qtd</th><th className="num">Unitário</th>
            <th className="num">Total</th><th>Produto no ERP</th><th className="num">Fator</th><th className="num">Custo (estoque)</th>
          </tr>
        </thead>
        <tbody>
          {n.itens.map((i) => {
            const p = produtoExemplo(i.produto);
            return (
              <tr key={i.item}>
                <td className="num">{i.item}</td><td>{entrada ? i.codigoFornecedor : ''}</td><td>{i.descricao}</td><td>{i.ncm}</td><td>{i.cfop}</td><td>{i.unidade}</td>
                <td className="num">{num(i.quantidade)}</td><td className="num">{moeda(i.valorUnitario)}</td><td className="num">{moeda(i.valorTotal)}</td>
                <td>{p && <Link className="linha-link" to={`/erp/produtos/${p.codigo}`}>{p.codigo} - {p.descricao}</Link>}</td>
                <td className="num">{num(i.fator)}</td>
                <td className="num">
                  {p && <Link className="linha-link" to={`/erp/estoques/kardex?produto=${p.codigo}&empresa=${n.empresa}`} title="Ver no Kardex">{moeda(i.custoUnitario)}/{p.unidade}</Link>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="totais">
        <span>Produtos: <b>{moeda(n.totais.produtos)}</b></span><span>Frete: <b>{moeda(n.totais.frete)}</b></span><span>IPI: <b>{moeda(n.totais.ipi)}</b></span>
        <span>ICMS: <b>{moeda(n.totais.icms)}</b></span><span>ST: <b>{moeda(n.totais.icmsSt)}</b></span><span>Desconto: <b>{moeda(n.totais.desconto)}</b></span>
        <span className="total-geral">Total: <b>{moeda(n.totais.total)}</b></span>
      </div>
      <div className="secao-titulo">Títulos</div>
      {n.duplicatas.length === 0 ? <p className="muted">A nota não gerou títulos.</p> : (
        <table className="grade compacta titulos-nota">
          <thead><tr><th>Título</th><th>Vencimento</th><th className="num">Valor</th><th className="num">Saldo</th></tr></thead>
          <tbody>
            {n.duplicatas.map((d, k) => (
              <tr key={d.numero}><td>{n.numero}/{k + 1}</td><td>{data(d.vencimento)}</td><td className="num">{moeda(d.valor)}</td><td className="num">{moeda(d.valor)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="secao-titulo">Arquivos</div>
      <p className="muted small">Na demonstração não há arquivos; no ERP, o XML e o PDF ficam com a nota.</p>
      {mensagem && <div className="mensagem">{mensagem}</div>}
      <div className="botoes">
        <button className="btn" type="button" onClick={cancelar}>{entrada ? 'Cancelar entrada' : 'Cancelar lançamento'}</button>
        <button className="btn" type="button" onClick={() => navigate('/erp/notas')}>Consulta de Notas</button>
      </div>
    </div>
  );
}
