import { useNavigate, useParams } from 'react-router-dom';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import { formatarDocumento } from '../../portal-cliente/portalDominio';
import '../erpElevor.css';
import { data, moeda } from '../estoques/estoquesExemplo';
import { AVISO_TITULOS, nomeEmpresa } from './titulosExemplo';
import { documentoDe, reciboExemplo } from './recibosExemplo';

// /erp/recibos/:numero: o Recibo para imprimir, como o do ERP do Samuel (Recibo em web/src/erp/financeiro/Recibos.tsx):
// empresa, número e valor; "Recebemos de"/"Pagamos a" com o CPF/CNPJ do cadastro; os títulos da baixa (ou o "referente a"
// do avulso), a conta, a data e a assinatura. Demonstração: os recibos de exemplo (recibosExemplo.ts).
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export default function ErpReciboPage() {
  const { numero } = useParams();
  const navigate = useNavigate();
  const r = reciboExemplo(numero);
  useTituloPagina(r ? `Recibo ${r.numero}` : 'Recibo');
  if (!r) {
    return (
      <div className="erp-elevor">
        <div className="mensagem erro">Recibo {numero} não encontrado.</div>
        <div className="botoes"><button className="btn" type="button" onClick={() => navigate('/erp/recibos')}>Consulta de Recibos</button></div>
      </div>
    );
  }
  const doc = documentoDe(r.pessoa)?.documento;
  const empresa = nomeEmpresa(r.empresa);
  const dataExtenso = new Date(`${r.data}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_TITULOS}</div>
      <div className="recibo">
        <div className="recibo-cabeca">
          <div><b>{empresa}</b></div>
          <div className="recibo-numero">RECIBO Nº {r.numero}<br /><span className="destaque">R$ {moeda(r.valor)}</span></div>
        </div>
        <p>
          {r.tipo === 'R' ? 'Recebemos de ' : 'Pagamos a '}<b>{r.pessoa}</b>{doc ? ` (${formatarDocumento(doc)})` : ''} a importância de <b>R$ {moeda(r.valor)}</b>,
          {r.avulso ? <> referente a {r.referente}.</> : ' referente aos títulos abaixo.'}
        </p>
        {!r.avulso && (
          <table className="grade compacta">
            <thead><tr><th>Título</th><th>Vencimento</th><th className="num">Principal</th><th className="num">Juros</th><th className="num">Multa</th><th className="num">Desconto</th><th className="num">Total</th></tr></thead>
            <tbody>
              {r.titulos.map((t) => (
                <tr key={t.id}>
                  <td>{t.numero}/{t.sequencia}{t.parcelas > 1 ? ` de ${t.parcelas}` : ''}</td><td>{data(t.vencimento)}</td><td className="num">{moeda(t.valor)}</td>
                  <td className="num">{moeda(t.juros)}</td><td className="num">{moeda(t.multa)}</td><td className="num">{moeda(t.desconto)}</td>
                  <td className="num">{moeda(t.valor + t.juros + t.multa - t.desconto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!r.avulso && <p>{r.conta} · {r.historico}</p>}
        <p className="recibo-data">{r.avulso ? `${r.cidade ? `${r.cidade}, ` : ''}${dataExtenso}.` : data(r.data)}</p>
        <div className="recibo-assinatura">____________________________________<br />{r.tipo === 'R' ? empresa : r.pessoa}</div>
        <div className="botoes nao-imprimir">
          <button className="btn primario" type="button" onClick={() => window.print()}><PrintOutlinedIcon /> Imprimir</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/recibos')}>Consulta de Recibos</button>
        </div>
      </div>
    </div>
  );
}
