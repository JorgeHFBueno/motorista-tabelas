import { Fragment, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import Paginacao from '../Paginacao';
import { Opcoes } from '../estoques/campos';
import { data, EMPRESAS, moeda } from '../estoques/estoquesExemplo';
import {
  AVISO_TITULOS, FILTRO_ADIANTAMENTOS, filtrarAdiantamentos, nomeEmpresa, SITUACAO_ADIANTAMENTO, TITULOS_EXEMPLO, ehAdiantamento,
  type FiltroAdiantamentos, type TituloExemplo,
} from './titulosExemplo';

// /erp/adiantamentos: Consulta de Adiantamentos/Empréstimos (FN_AdiantamentosConsulta do Elevor), como a do ERP do Samuel
// (web/src/erp/financeiro/Adiantamentos.tsx). No ERP o adiantamento é um título com a situação Crédito/Adiantamento: a
// pagar = adiantamento recebido (de cliente), a receber = adiantamento concedido ou empréstimo. Novo abre o Lançamento de
// Títulos com essa situação; a lixeira cancela (só avisa); o ▶ mostra os detalhes. Demonstração: os títulos de exemplo.
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

const TIPOS = [{ valor: 'P', rotulo: 'Pagar(Adiantamento Recebido)' }, { valor: 'R', rotulo: 'Receber(Adiantamento Concedido)' }, { valor: 'A', rotulo: 'Ambos' }];
const SITUACOES = [{ valor: 'abertos', rotulo: 'Abertos' }, { valor: 'cancelados', rotulo: 'Cancelados' }, { valor: 'ambos', rotulo: 'Ambos' }];
const PESSOAS = [...new Set(TITULOS_EXEMPLO.filter(ehAdiantamento).map((t) => t.pessoa))].sort();
const linha = (rotulo: string, campo: ReactNode) => <div className="form-linha"><div className="form-rotulo">{rotulo}</div><div className="form-controle">{campo}</div></div>;

export default function ErpAdiantamentosPage() {
  useTituloPagina('Consulta de Adiantamentos/Empréstimos');
  const navigate = useNavigate();
  const [f, setF] = useState<FiltroAdiantamentos>(FILTRO_ADIANTAMENTOS);
  const [lista, setLista] = useState(() => filtrarAdiantamentos(FILTRO_ADIANTAMENTOS));
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(50);
  const [mensagem, setMensagem] = useState('');
  const escolher = (k: keyof FiltroAdiantamentos) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const abrir = (id: number) => setAbertos((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bloqueio = (t: TituloExemplo) => (t.cancelado ? 'Já cancelado' : t.saldo < t.valor ? 'Adiantamento já usado (tem baixa): exclua a baixa antes' : '');
  const novo = () => navigate(`/erp/titulos/novo?tipo=${f.tipo === 'P' ? 'P' : 'R'}&situacao=${encodeURIComponent(SITUACAO_ADIANTAMENTO)}`);
  const visiveis = lista.slice(pagina * porPagina, (pagina + 1) * porPagina);

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_TITULOS}</div>
      <form className="ficha-elevor largo adiantamentos-filtros" onSubmit={(e) => { e.preventDefault(); setLista(filtrarAdiantamentos(f)); setPagina(0); setMensagem(''); }}>
        {linha('Empresa:', (
          <select className="campo cheio" aria-label="Empresa" value={f.empresa} onChange={(e) => escolher('empresa')(e.target.value)}>
            <option value="" />{EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        ))}
        {linha('Cliente:', (
          <select className="campo cheio" aria-label="Cliente" value={f.pessoa} onChange={(e) => escolher('pessoa')(e.target.value)}>
            <option value="" />{PESSOAS.map((p) => <option key={p}>{p}</option>)}
          </select>
        ))}
        <div className="form-linha dupla">
          <div className="form-rotulo">Período:</div>
          <div className="form-controle">
            <input type="date" className="campo" aria-label="Período: de" value={f.de} onChange={(e) => escolher('de')(e.target.value)} /> a{' '}
            <input type="date" className="campo" aria-label="Período: até" value={f.ate} onChange={(e) => escolher('ate')(e.target.value)} />
          </div>
          <div className="form-rotulo">Número:</div>
          <div className="form-controle"><input className="campo cheio" aria-label="Número" value={f.numero} onChange={(e) => escolher('numero')(e.target.value)} /></div>
        </div>
        {linha('Tipo:', <Opcoes nome="tipo-adto" valor={f.tipo} onChange={escolher('tipo')} opcoes={TIPOS} />)}
        {linha('Situação:', <Opcoes nome="situacao-adto" valor={f.situacao} onChange={escolher('situacao')} opcoes={SITUACOES} />)}
        <div className="botoes">
          <button className="btn primario" type="submit"><SearchIcon /> Pesquisar</button>
          <button className="btn" type="button" onClick={novo} title="Lançamento de Títulos com a situação Crédito/Adiantamento"><AddCircleOutlineIcon /> Novo</button>
        </div>
      </form>
      {mensagem && <div className="mensagem">{mensagem}</div>}
      <table className="grade adiantamentos-elevor">
        <thead>
          <tr>
            <th className="seta" /><th>Número</th><th>Data</th><th className="num">Código</th><th>Cliente</th><th className="num">Valor</th><th className="num">Saldo</th>
            <th>Usuário</th><th>Data Criação</th><th /><th /><th /><th />
          </tr>
        </thead>
        <tbody>
          {visiveis.map((t) => {
            const motivo = bloqueio(t);
            return (
              <Fragment key={t.id}>
                <tr className={t.cancelado ? 'cancelado' : undefined}>
                  <td className="seta">
                    <button type="button" className="link-botao" aria-expanded={abertos.has(t.id)} aria-label="Detalhes do adiantamento" onClick={() => abrir(t.id)}>{abertos.has(t.id) ? '▼' : '▶'}</button>
                  </td>
                  <td><Link className="linha-link" to={`/erp/titulos/${t.id}`}>{t.numero}</Link></td>
                  <td>{data(t.emissao)}</td><td className="num">{t.pessoaCodigo ?? ''}</td><td>{t.pessoa}</td>
                  <td className="num">{moeda(t.valor)}</td><td className="num">{moeda(t.saldo)}</td>
                  <td>FINANCEIRO</td><td>{data(t.emissao)} 09:00</td>
                  <td className="tipo-adto">{t.tipo === 'P' ? 'Adiant. Recebido' : 'Adiant. Concedido'}</td>
                  <td><span className={`selo-situacao${t.cancelado ? ' cancelado' : ''}`} title={t.cancelado ? `Motivo: ${t.motivoCancelamento}` : undefined}>{t.cancelado ? 'Cancelado' : 'Normal'}</span></td>
                  <td>
                    <button type="button" className="link-botao lixeira" disabled={Boolean(motivo)} title={motivo || 'Cancelar o adiantamento'} aria-label="Cancelar o adiantamento"
                      onClick={() => setMensagem(`Demonstração: nada foi cancelado. No ERP, cancelar o adiantamento ${t.numero} pede o motivo e cancela o título.`)}>
                      <DeleteOutlineIcon />
                    </button>
                  </td>
                  <td>
                    <span className="btn-dividido" title="O comprovante do adiantamento (PDF) ainda não existe no ERP">
                      <button type="button" className="btn" disabled><DescriptionOutlinedIcon /> Gerar</button>
                      <button type="button" className="btn seta" disabled aria-label="Mais opções"><ExpandMoreIcon /></button>
                    </span>
                  </td>
                </tr>
                {abertos.has(t.id) && (
                  <tr className="linha-detalhe">
                    <td /><td colSpan={12}>
                      Empresa: {nomeEmpresa(t.empresa)} · Título: <Link className="linha-link" to={`/erp/titulos/${t.id}`}>{t.numero}/{t.sequencia}</Link>
                      {' '}· Vencimento: {data(t.vencimento)} · Usado: {moeda(t.cancelado ? 0 : t.valor - t.saldo)}
                      {t.historico ? ` · ${t.historico}` : ''}{t.cancelado ? ` · Motivo do cancelamento: ${t.motivoCancelamento}` : ''}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {!lista.length && <tr><td colSpan={13} className="vazio">Nenhum adiantamento.</td></tr>}
        </tbody>
        {lista.length > 0 && (
          <tfoot><tr className="linha-total"><td colSpan={6} className="num">Total Saldo:</td><td className="num">{moeda(lista.reduce((s, t) => s + t.saldo, 0))}</td><td colSpan={6} /></tr></tfoot>
        )}
      </table>
      <Paginacao total={lista.length} pagina={pagina} porPagina={porPagina} onPagina={setPagina} onPorPagina={(n) => { setPorPagina(n); setPagina(0); }} />
    </div>
  );
}
