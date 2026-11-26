import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CodeIcon from '@mui/icons-material/Code';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import SearchIcon from '@mui/icons-material/Search';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import Paginacao from '../Paginacao';
import { Opcoes } from '../estoques/campos';
import { data, EMPRESAS, moeda, produtoExemplo } from '../estoques/estoquesExemplo';
import { AVISO_NOTAS, CENTROS_CUSTO, NATUREZAS, naturezaExemplo, NOTAS_EXEMPLO, type NotaExemplo } from './notasExemplo';

// /erp/notas: Consulta de Notas (CL_Notas do Elevor), como a do ERP do Samuel (web/src/erp/fiscal/Notas.tsx): filtros
// na disposição do Elevor e a grade das notas. Demonstração: filtra as notas de exemplo (notasExemplo.ts) no navegador.
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

const PADRAO = {
  tipo: '', empresa: '', numero: '', pessoa: '', de: '', ate: '', situacao: 'lancada', modelo: 'nf', serie: '', produto: '', descricaoProduto: '',
  natureza: '', compras: '1', vendas: '1', periodo: 'emissao', cfop: '', mensagem: '', centro: '',
};
type Filtro = typeof PADRAO;
const contem = (texto: string, busca: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .includes(busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim());

function filtrar(f: Filtro): NotaExemplo[] {
  return NOTAS_EXEMPLO.filter((n) => {
    const nat = naturezaExemplo(n.natureza)!;
    const dia = n.emissao;
    return (!f.empresa || n.empresa === Number(f.empresa)) && (!f.pessoa || contem(n.pessoa, f.pessoa))
      && (!f.numero || String(n.numero) === f.numero.trim()) && (!f.serie || n.serie === f.serie.trim())
      && (f.modelo === '' || f.modelo === 'nf') && (!f.tipo || n.tipo === f.tipo) && (!f.situacao || n.situacao === f.situacao)
      && (!f.natureza || n.natureza === Number(f.natureza))
      && (f.compras === '1' || !nat.compra) && (f.vendas === '1' || !nat.venda)
      && (!f.de || dia >= f.de) && (!f.ate || dia <= f.ate)
      && (!f.cfop || n.itens.some((i) => i.cfop === f.cfop.trim())) && (!f.centro || n.centroCusto === f.centro)
      && (!f.mensagem || contem(n.observacao, f.mensagem))
      && (!f.produto || n.itens.some((i) => String(i.produto) === f.produto.trim() || contem(produtoExemplo(i.produto)?.descricao ?? '', f.produto)))
      && (!f.descricaoProduto || n.itens.some((i) => contem(i.descricao, f.descricaoProduto)));
  });
}

export default function ErpNotasPage() {
  useTituloPagina('Consulta de Notas');
  const navigate = useNavigate();
  const [f, setF] = useState<Filtro>(PADRAO);
  const [lista, setLista] = useState<NotaExemplo[]>(() => filtrar(PADRAO));
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(50);
  const campo = (k: keyof Filtro, rotulo: string, classe = 'campo cheio') => (
    <input className={classe} aria-label={rotulo} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
  );
  const escolher = (k: keyof Filtro) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const marca = (k: 'compras' | 'vendas', rotulo: string) => (
    <label className="opcao caixa-borda"><input type="checkbox" checked={f[k] === '1'} onChange={(e) => escolher(k)(e.target.checked ? '1' : '')} /> {rotulo}</label>
  );
  const dupla = (r1: string, c1: ReactNode, r2: string, c2: ReactNode) => (
    <div className="form-linha dupla">
      <div className="form-rotulo">{r1}</div><div className="form-controle">{c1}</div>
      <div className="form-rotulo">{r2}</div><div className="form-controle">{c2}</div>
    </div>
  );
  const linha = (r: string, c: ReactNode) => <div className="form-linha"><div className="form-rotulo">{r}</div><div className="form-controle">{c}</div></div>;
  const visiveis = lista.slice(pagina * porPagina, (pagina + 1) * porPagina);

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_NOTAS}</div>
      <form className="consulta-notas" onSubmit={(e) => { e.preventDefault(); setLista(filtrar(f)); setPagina(0); }}>
        {dupla('Empresa:', (
          <select className="campo cheio" aria-label="Empresa" value={f.empresa} onChange={(e) => escolher('empresa')(e.target.value)}>
            <option value="">Todas</option>{EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        ), 'Cliente:', campo('pessoa', 'Cliente', 'campo cheio cn-cliente'))}
        {dupla('Número:', campo('numero', 'Número'), '', (
          <Opcoes nome="modelo" valor={f.modelo} onChange={escolher('modelo')}
            opcoes={[{ valor: '', rotulo: 'Todos' }, { valor: 'nf', rotulo: 'NF' }, { valor: 'nfse', rotulo: 'NFS-e' }, { valor: 'referenciada', rotulo: 'Referenciada' }]} />
        ))}
        {dupla('Série:', campo('serie', 'Série'), '', null)}
        {linha('Produto:', campo('produto', 'Produto'))}
        {linha('Descrição Produto:', campo('descricaoProduto', 'Descrição Produto'))}
        {linha('Naturezas:', <>
          <select className="campo cheio" aria-label="Naturezas" value={f.natureza} onChange={(e) => escolher('natureza')(e.target.value)}>
            <option value="" />{NATUREZAS.map((n) => <option key={n.codigo} value={n.codigo}>{n.descricao}</option>)}
          </select>
          {marca('compras', 'Compras')}{marca('vendas', 'Vendas')}
        </>)}
        {dupla('Tipo:', <Opcoes nome="tipo" valor={f.tipo} onChange={escolher('tipo')} opcoes={[{ valor: '', rotulo: 'Todas' }, { valor: 'E', rotulo: 'Entrada' }, { valor: 'S', rotulo: 'Saída' }]} />,
          'Situação:', <Opcoes nome="situacao" valor={f.situacao} onChange={escolher('situacao')} opcoes={[{ valor: '', rotulo: 'Todas' }, { valor: 'lancada', rotulo: 'Normal' }, { valor: 'cancelada', rotulo: 'Canceladas' }]} />)}
        {dupla('Período:', (
          <div className="coluna-campo">
            <Opcoes nome="periodo" valor={f.periodo} onChange={escolher('periodo')} opcoes={[{ valor: 'emissao', rotulo: 'Data Emissão' }, { valor: 'lancamento', rotulo: 'Data/Hora Lançamento' }]} />
            <div className="linha-datas">
              <input type="date" className="campo curto" aria-label="Período: de" value={f.de} onChange={(e) => escolher('de')(e.target.value)} /> a{' '}
              <input type="date" className="campo curto" aria-label="Período: até" value={f.ate} onChange={(e) => escolher('ate')(e.target.value)} />
            </div>
          </div>
        ), 'CFOP:', campo('cfop', 'CFOP', 'campo curto'))}
        {linha('Vendedor:', <select className="campo cheio" aria-label="Vendedor" disabled title="A nota não guarda vendedor: vale o do pedido ligado, e os pedidos ainda não chegaram"><option /></select>)}
        {linha('Mensagem:', campo('mensagem', 'Mensagem'))}
        {linha('Centros de Custo:', (
          <select className="campo cheio" aria-label="Centros de Custo" value={f.centro} onChange={(e) => escolher('centro')(e.target.value)}>
            <option value="" />{CENTROS_CUSTO.map((c) => <option key={c}>{c}</option>)}
          </select>
        ))}
        <div className="botoes">
          <button className="btn primario" type="submit"><SearchIcon /> Pesquisar</button>
          <button className="btn" type="button" disabled title="Ainda não chegou ao painel"><AddCircleOutlineIcon /> Emissão de Nota Fiscal</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/notas/entrada')}><AddCircleOutlineIcon /> Entrada de Fornecedor (XML)</button>
        </div>
      </form>
      <table className="grade notas-elevor">
        <thead>
          <tr>
            <th>Número</th><th>Data Emissão</th><th>Série</th><th>Cod.</th><th>Cliente</th><th>Natureza</th><th className="num">Valor Total</th><th>Situação</th>
            <th>E-mail</th><th>Danfe</th><th>XML</th><th>CC-e</th><th><input type="checkbox" aria-label="Marcar todas" disabled /></th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((n) => (
            <tr key={n.numero} title={`${n.tipo === 'E' ? 'Entrada' : 'Saída'} · ${EMPRESAS.find((e) => e.id === n.empresa)?.nome} · entrada em ${data(n.entrada)} · ${n.itens.length} itens`}>
              <td><Link className="linha-link" to={`/erp/notas/${n.numero}`}>{n.numero}</Link></td><td>{data(n.emissao)}</td><td>{n.serie}</td>
              <td>{n.pessoaCodigo ?? ''}</td><td><Link className="linha-link" to={`/erp/notas/${n.numero}`}>{n.pessoa}</Link></td>
              <td className="natureza">{naturezaExemplo(n.natureza)?.descricao}</td><td className="num">{moeda(n.totais.total)}</td>
              <td><span className={`selo-situacao${n.situacao === 'cancelada' ? ' cancelado' : ''}`}>{n.situacao === 'cancelada' ? 'Cancelada' : 'Normal'}</span></td>
              <td className="icone-nota"><MailOutlineIcon /></td><td /><td className="icone-nota">{n.tipo === 'E' && <CodeIcon />}</td><td />
              <td><input type="checkbox" aria-label={`Marcar a nota ${n.numero}`} disabled /></td>
            </tr>
          ))}
          {!lista.length && <tr><td colSpan={13} className="vazio">Nenhuma nota com esses filtros.</td></tr>}
        </tbody>
      </table>
      <Paginacao total={lista.length} pagina={pagina} porPagina={porPagina} onPagina={setPagina} onPorPagina={(n) => { setPorPagina(n); setPagina(0); }} />
    </div>
  );
}
