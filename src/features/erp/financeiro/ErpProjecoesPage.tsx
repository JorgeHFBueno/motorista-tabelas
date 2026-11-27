import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import { Opcoes } from '../estoques/campos';
import { data, EMPRESAS, moeda } from '../estoques/estoquesExemplo';
import { FILTRO_PROJECOES, filtrarProjecoes, PLANOS_PROJECAO, PROJECOES_EXEMPLO, type FiltroProjecoes } from './fluxoExemplo';
import { AVISO_TITULOS, CENTROS_CUSTO } from './titulosExemplo';

// /erp/financeiro/projecoes: Projeções Fluxo de Caixa (FN_Projecoes do Elevor), como a consulta do ERP do Samuel
// (web/src/erp/financeiro/Projecoes.tsx): o que se espera pagar ou receber sem título lançado (folha, energia, impostos,
// medições previstas). Pendentes entram no Fluxo de Caixa; Efetivados já viraram título. Demonstração: Novo, Gerar
// Títulos, Gerar Bancos/Caixa e Excluir só dizem o que o ERP faria. The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

const PESSOAS = [...new Set(PROJECOES_EXEMPLO.map((p) => p.pessoa).filter(Boolean))].sort();

export default function ErpProjecoesPage() {
  useTituloPagina('Projeções Fluxo de Caixa');
  const navigate = useNavigate();
  const [f, setF] = useState<FiltroProjecoes>(FILTRO_PROJECOES);
  const [lista, setLista] = useState(() => filtrarProjecoes(FILTRO_PROJECOES));
  const [mais, setMais] = useState(false);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [mensagem, setMensagem] = useState('');
  const escolher = (k: keyof FiltroProjecoes) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const selecionados = lista.filter((p) => marcados.has(p.id));
  const pendentes = selecionados.filter((p) => !p.efetivada);
  const total = (l: typeof lista) => moeda(l.reduce((s, p) => s + p.valor, 0));
  const marcar = (id: number, sim: boolean) => setMarcados((m) => { const n = new Set(m); if (sim) n.add(id); else n.delete(id); return n; });
  const pesquisar = () => { setLista(filtrarProjecoes(f)); setMarcados(new Set()); setMensagem(''); };
  const lista_ = (k: keyof FiltroProjecoes, rotulo: string, opcoes: string[], classe: string) => (
    <select className={`campo ${classe}`} aria-label={rotulo} value={f[k]} onChange={(e) => escolher(k)(e.target.value)}>
      <option value="" />{opcoes.map((o) => <option key={o}>{o}</option>)}
    </select>
  );

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_TITULOS}</div>
      <form className="prj-filtros" onSubmit={(e) => { e.preventDefault(); pesquisar(); }}>
        <div className="prj-linha">
          <span className="prj-rotulo">Empresa:</span>
          <select className="campo prj-empresa" aria-label="Empresa" value={f.empresa} onChange={(e) => escolher('empresa')(e.target.value)}>
            <option value="" />{EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <span className="prj-rotulo">Período:</span>
          <input type="date" className="campo" aria-label="Período: de" value={f.de} onChange={(e) => escolher('de')(e.target.value)} /> à{' '}
          <input type="date" className="campo" aria-label="Período: até" value={f.ate} onChange={(e) => escolher('ate')(e.target.value)} />
          <Opcoes nome="efetivada" valor={f.efetivada} onChange={escolher('efetivada')} opcoes={[{ valor: 'nao', rotulo: 'Pendentes' }, { valor: 'sim', rotulo: 'Efetivados' }]} />
          <div className="prj-botoes">
            <button className="btn primario" type="submit">Pesquisar</button>
            <button className="btn" type="button" onClick={() => setMensagem('Demonstração: a ficha da projeção (Lançamento de Projeções) chega com a gravação.')}>Novo</button>
            <button className="btn" type="button" onClick={() => window.print()}><PrintOutlinedIcon /> Imprimir</button>
            <button className="btn primario" type="button" onClick={() => navigate('/erp/financeiro/relatorios/fluxo-caixa')}>Fluxo de Caixa</button>
          </div>
        </div>
        <button type="button" className="link-botao" aria-expanded={mais} onClick={() => setMais((m) => !m)}>Mais Opções: {mais ? <ExpandLessIcon /> : <ExpandMoreIcon />}</button>
        {mais && (
          <div className="prj-mais">
            <div className="prj-linha"><span className="prj-rotulo">Tipo:</span>
              <Opcoes nome="tipo-projecao" valor={f.tipo} onChange={escolher('tipo')} opcoes={[{ valor: '', rotulo: 'Todos' }, { valor: 'P', rotulo: 'Pagar' }, { valor: 'R', rotulo: 'Receber' }]} />
            </div>
            <div className="prj-linha"><span className="prj-rotulo">Cliente:</span>{lista_('pessoa', 'Cliente', PESSOAS, 'prj-w348')}</div>
            <div className="prj-linha"><span className="prj-rotulo">Conta:</span>{lista_('plano', 'Conta', PLANOS_PROJECAO, 'prj-w448')}</div>
            <div className="prj-linha"><span className="prj-rotulo">Centro de Custo:</span>{lista_('centro', 'Centro de Custo', CENTROS_CUSTO, 'prj-w185')}</div>
            <div className="prj-linha"><span className="prj-rotulo">Valor:</span>
              <input className="campo prj-valor num" aria-label="Valor de" inputMode="decimal" value={f.valorDe} onChange={(e) => escolher('valorDe')(e.target.value)} /> a{' '}
              <input className="campo prj-valor num" aria-label="Valor até" inputMode="decimal" value={f.valorAte} onChange={(e) => escolher('valorAte')(e.target.value)} />
            </div>
          </div>
        )}
      </form>
      {mensagem && <div className="mensagem">{mensagem}</div>}
      <table className="grade prj-grade">
        <thead>
          <tr>
            <th className="prj-icone" /><th>Cod</th><th>Cliente</th><th>Número</th><th>Seq.</th><th>Data</th><th>Conta</th><th>Histórico</th><th className="num">Valor</th>
            <th className="prj-marca">
              <input type="checkbox" aria-label="Marcar todas" checked={lista.length > 0 && lista.every((p) => marcados.has(p.id))}
                onChange={(e) => setMarcados(e.target.checked ? new Set(lista.map((p) => p.id)) : new Set())} />
            </th>
          </tr>
        </thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.id}>
              <td className="prj-icone"><span className={`prj-tipo ${p.tipo === 'R' ? 'receber' : 'pagar'}`} title={p.tipo === 'R' ? 'Receber' : 'Pagar'}>{p.tipo}</span></td>
              <td>{p.id}</td><td>{p.pessoa}</td><td>{p.numero}</td><td>{p.sequencia ?? ''}</td><td>{data(p.vencimento)}</td><td>{p.plano}</td><td>{p.descricao}</td>
              <td className="num">{moeda(p.valor)}</td>
              <td className="prj-marca"><input type="checkbox" aria-label={`Marcar a projeção ${p.id}`} checked={marcados.has(p.id)} onChange={(e) => marcar(p.id, e.target.checked)} /></td>
            </tr>
          ))}
          {!lista.length && <tr><td colSpan={10} className="vazio">Nenhuma projeção encontrada.</td></tr>}
        </tbody>
        {lista.length > 0 && (
          <tfoot><tr className="linha-total"><td colSpan={8}>Total ({lista.length})</td><td className="num">{total(lista)}</td><td /></tr></tfoot>
        )}
      </table>
      <div className="prj-acoes">
        <button className="btn" type="button" disabled={!pendentes.length}
          onClick={() => setMensagem(`Demonstração: nada foi gravado. O ERP geraria ${pendentes.length} título(s) a pagar/receber (${total(pendentes)}), que saem da projeção e entram no Contas a Pagar/Receber.`)}>
          Gerar Títulos
        </button>
        <button className="btn" type="button" disabled={!pendentes.length}
          onClick={() => setMensagem(`Demonstração: nada foi gravado. O ERP lançaria ${pendentes.length} projeção(ões) (${total(pendentes)}) direto no Bancos/Caixa, na data de cada uma.`)}>
          Gerar Bancos/Caixa
        </button>
        <button className="btn" type="button" disabled={!selecionados.length}
          onClick={() => setMensagem(`Demonstração: nada foi excluído. O ERP excluiria ${selecionados.length} projeção(ões).`)}>Excluir Projeções</button>
      </div>
    </div>
  );
}
