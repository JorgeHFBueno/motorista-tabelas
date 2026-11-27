import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SearchIcon from '@mui/icons-material/Search';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import Paginacao from '../Paginacao';
import { Opcoes } from '../estoques/campos';
import { data, moeda } from '../estoques/estoquesExemplo';
import { AVISO_CHEQUES, FILTRO_CHEQUES, filtrarCheques, STATUS_CHEQUES, statusCheque, type FiltroCheques } from './chequesExemplo';

// /erp/cheques: Consulta de Cheques, como a do ERP do Samuel (o cadastro "cheques" do motor de cadastros dele; no Elevor a
// FN_Cheques abre direto a inclusão): Pesquisa (número, titular ou banco), Tipo, Status e Vencimento, e a grade Cod, Tipo,
// Número, Banco, Titular, Valor, Vencimento e Status. Demonstração: os cheques de exemplo (chequesExemplo.ts).
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export default function ErpChequesPage() {
  useTituloPagina('Consulta de Cheques');
  const navigate = useNavigate();
  const [f, setF] = useState<FiltroCheques>(FILTRO_CHEQUES);
  const [lista, setLista] = useState(() => filtrarCheques(FILTRO_CHEQUES));
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(25);
  const escolher = (k: keyof FiltroCheques) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_CHEQUES}</div>
      <div className="consulta-cad largo">
        <form className="consulta-cad-filtros" onSubmit={(e) => { e.preventDefault(); setLista(filtrarCheques(f)); setPagina(0); }}>
          <label className="cc-rotulo" htmlFor="cheques-pesquisa">Pesquisa:</label>
          <div className="cc-controle"><input id="cheques-pesquisa" className="campo cheio" value={f.busca} onChange={(e) => escolher('busca')(e.target.value)} placeholder="número, titular ou banco" /></div>
          <div className="cc-botoes">
            <button className="btn primario" type="submit"><SearchIcon /> Pesquisar</button>
            <button className="btn" type="button" onClick={() => navigate('/erp/cheques/novo')}><AddCircleOutlineIcon /> Novo</button>
          </div>
          <span className="cc-rotulo">Tipo:</span>
          <div className="cc-controle">
            <Opcoes nome="tipo-cheque" valor={f.tipo} onChange={escolher('tipo')} opcoes={[{ valor: '', rotulo: 'Todos' }, { valor: 'E', rotulo: 'Emitido' }, { valor: 'R', rotulo: 'Recebido' }]} />
          </div>
          <div />
          <span className="cc-rotulo">Status:</span>
          <div className="cc-controle">
            <select className="campo medio" aria-label="Status" value={f.status} onChange={(e) => escolher('status')(e.target.value)}>
              <option value="" />{STATUS_CHEQUES.map((s) => <option key={s.id} value={s.id}>{s.descricao}</option>)}
            </select>
          </div>
          <div />
          <span className="cc-rotulo">Vencimento:</span>
          <div className="cc-controle">
            <input type="date" className="campo" aria-label="Vencimento: de" value={f.de} onChange={(e) => escolher('de')(e.target.value)} /> a{' '}
            <input type="date" className="campo" aria-label="Vencimento: até" value={f.ate} onChange={(e) => escolher('ate')(e.target.value)} />
          </div>
          <div />
        </form>
        <table className="grade">
          <thead><tr><th>Cod</th><th>Tipo</th><th>Número</th><th>Banco</th><th>Titular</th><th className="num">Valor</th><th>Vencimento</th><th>Status</th></tr></thead>
          <tbody>
            {lista.slice(pagina * porPagina, (pagina + 1) * porPagina).map((x) => (
              <tr key={x.id}>
                <td><Link className="linha-link" to={`/erp/cheques/${x.id}`}>{x.id}</Link></td>
                <td>{x.tipo === 'E' ? 'Emitido' : 'Recebido'}</td>
                <td><Link className="linha-link" to={`/erp/cheques/${x.id}`}>{x.numero}</Link></td>
                <td>{x.banco}</td><td>{x.titular}</td><td className="num">{moeda(x.valor)}</td><td>{data(x.vencimento)}</td>
                <td>{statusCheque(x.status)?.descricao}</td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={8} className="vazio">Nenhum cheque encontrado.</td></tr>}
          </tbody>
          {lista.length > 0 && (
            <tfoot><tr className="linha-total"><td colSpan={5}>Total ({lista.length})</td><td className="num">{moeda(lista.reduce((s, x) => s + x.valor, 0))}</td><td colSpan={2} /></tr></tfoot>
          )}
        </table>
        <Paginacao total={lista.length} pagina={pagina} porPagina={porPagina} onPagina={setPagina} onPorPagina={(n) => { setPorPagina(n); setPagina(0); }} />
      </div>
    </div>
  );
}
