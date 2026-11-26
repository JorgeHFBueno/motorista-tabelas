import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import Paginacao from '../Paginacao';
import { Opcoes } from '../estoques/campos';
import { data, EMPRESAS, moeda } from '../estoques/estoquesExemplo';
import {
  abreviatura, AVISO_TITULOS, BANCOS, CENTROS_CUSTO, FILTRO_TITULOS, filtrarTitulos, PLANOS_TITULOS, SITUACOES_TITULO, TIPOS_DOCUMENTO, TITULOS_EXEMPLO,
  vencido, type FiltroTitulos,
} from './titulosExemplo';

// /erp/titulos: Consulta Contas a Pagar/Receber (FN_LancamentosConsulta do Elevor), como a do ERP do Samuel
// (web/src/erp/financeiro/ConsultaTitulos.tsx): Tipo, Títulos (Geral ou Em aberto), Empresa e Cliente no alto, "Mais Opções"
// na ordem do Elevor, a grade e, embaixo, Novo | Pagar marcados (abre a Baixa com os títulos). Demonstração: filtra os
// títulos de exemplo (titulosExemplo.ts). The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

const SEM_DADO = 'Na demonstração não há esse dado; o filtro não é usado.';
const PESSOAS = [...new Set(TITULOS_EXEMPLO.map((t) => t.pessoa))].sort();

export default function ErpTitulosPage() {
  useTituloPagina('Consulta Contas a Pagar/Receber');
  const navigate = useNavigate();
  const [f, setF] = useState<FiltroTitulos>(FILTRO_TITULOS);
  const [lista, setLista] = useState(() => filtrarTitulos(FILTRO_TITULOS));
  const [mais, setMais] = useState(false);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(50);
  const escolher = (k: keyof FiltroTitulos) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const campo = (k: keyof FiltroTitulos, rotulo: string, classe: string) => (
    <input className={`campo ${classe}`} aria-label={rotulo} value={f[k]} onChange={(e) => escolher(k)(e.target.value)} />
  );
  const lista_ = (k: keyof FiltroTitulos, rotulo: string, opcoes: string[], classe: string) => (
    <select className={`campo ${classe}`} aria-label={rotulo} value={f[k]} onChange={(e) => escolher(k)(e.target.value)}>
      <option value="" />{opcoes.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
  const pesquisar = () => { setLista(filtrarTitulos(f)); setMarcados(new Set()); setPagina(0); };
  const visiveis = lista.slice(pagina * porPagina, (pagina + 1) * porPagina);
  const selecionados = lista.filter((t) => marcados.has(t.id));
  const podeBaixar = selecionados.length > 0 && new Set(selecionados.map((t) => `${t.tipo}${t.empresa}`)).size === 1;
  const marcaveis = visiveis.filter((t) => !t.cancelado && t.saldo > 0);
  const marcar = (id: number, sim: boolean) => setMarcados((m) => { const n = new Set(m); if (sim) n.add(id); else n.delete(id); return n; });

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_TITULOS}</div>
      <form className="consulta-titulos" onSubmit={(e) => { e.preventDefault(); pesquisar(); }}>
        <div className="ct-topo">
          <div className="ct-linha">
            <span className="ct-rotulo">Tipo:</span>
            <Opcoes nome="tipo" valor={f.tipo} onChange={escolher('tipo')} opcoes={[{ valor: 'P', rotulo: 'Pagar' }, { valor: 'R', rotulo: 'Receber' }, { valor: '', rotulo: 'Ambos' }]} />
          </div>
          <div className="ct-linha">
            <span>Títulos:</span>
            <Opcoes nome="abertos" valor={f.abertos} onChange={escolher('abertos')} opcoes={[{ valor: '0', rotulo: 'Geral' }, { valor: '1', rotulo: 'Em aberto' }]} />
          </div>
          <div className="ct-linha">
            <span className="ct-rotulo">Empresa:</span>
            <select className="campo ct-w450" aria-label="Empresa" value={f.empresa} onChange={(e) => escolher('empresa')(e.target.value)}>
              <option value="" />{EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
          <div />
          <div className="ct-linha">
            <span className="ct-rotulo">Cliente:</span>
            <select className="campo ct-w450" aria-label="Cliente" value={f.pessoa} onChange={(e) => escolher('pessoa')(e.target.value)}>
              <option value="" />{PESSOAS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="ct-linha"><button className="btn primario" type="submit">Pesquisar</button></div>
        </div>
        <button type="button" className="link-botao" aria-expanded={mais} onClick={() => setMais((m) => !m)}>Mais Opções {mais ? <ExpandLessIcon /> : <ExpandMoreIcon />}</button>
        {mais && (
          <div className="ct-mais">
            <span className="ct-rot">Nosso Nro/Cod.Barras:</span>
            <div className="ct-ctl"><input className="campo ct-w400" aria-label="Nosso Nro/Cod.Barras" disabled title={SEM_DADO} /></div>
            <span className="ct-rot">Qualquer:</span>
            <div className="ct-ctl">{campo('qualquer', 'Qualquer', 'ct-w150')}</div>

            <span className="ct-rot">Número:</span>
            <div className="ct-ctl">{campo('numero', 'Número', 'ct-w100')}</div>
            <span className="ct-rot">Categoria:</span>
            <div className="ct-ctl"><select className="campo ct-w46" aria-label="Categoria" disabled title={SEM_DADO}><option /></select></div>

            <span className="ct-rot">Valor:</span>
            <div className="ct-ctl ct-resto">{campo('valorDe', 'Valor de', 'ct-w80 num')} a {campo('valorAte', 'Valor até', 'ct-w80 num')}</div>

            <span className="ct-rot">Período:</span>
            <div className="ct-ctl">
              <input type="date" className="campo" aria-label="Período: de" value={f.de} onChange={(e) => escolher('de')(e.target.value)} /> a{' '}
              <input type="date" className="campo" aria-label="Período: até" value={f.ate} onChange={(e) => escolher('ate')(e.target.value)} />
            </div>
            <div className="ct-ctl ct-span2">
              <Opcoes nome="periodo" valor={f.periodo} onChange={escolher('periodo')} opcoes={[{ valor: 'emissao', rotulo: 'Emissão' },
                { valor: 'vencimento', rotulo: 'Vencimento' }, { valor: 'programacao', rotulo: 'Programação' }]} />
            </div>

            <span className="ct-rot">Banco:</span>
            <div className="ct-ctl">{lista_('banco', 'Banco', BANCOS, 'ct-w298')}</div>
            <span className="ct-rot">Situação:</span>
            <div className="ct-ctl">{lista_('situacao', 'Situação', SITUACOES_TITULO, 'ct-w298')}</div>

            <span className="ct-rot">Plano de Contas:</span>
            <div className="ct-ctl">{lista_('plano', 'Plano de Contas', PLANOS_TITULOS, 'ct-w448')}</div>
            <span className="ct-rot">Vendedor:</span>
            <div className="ct-ctl"><select className="campo ct-w298" aria-label="Vendedor" disabled title={SEM_DADO}><option /></select></div>

            <span className="ct-rot">Centro de Custo:</span>
            <div className="ct-ctl">{lista_('centro', 'Centro de Custo', CENTROS_CUSTO, 'ct-w348')}</div>
            <span className="ct-rot">Tipo Doc.:</span>
            <div className="ct-ctl">{lista_('tipoDocumento', 'Tipo Doc.', TIPOS_DOCUMENTO, 'ct-w298')}</div>
          </div>
        )}
      </form>
      <table className="grade titulos-elevor">
        <thead>
          <tr>
            <th>Cod</th><th>Cliente</th><th>Número</th><th>ST</th><th>Hist.</th><th>Seq.</th><th>Emp.</th><th>Doc.</th><th>Emissão</th><th>Dt. Prog.</th>
            <th className="num">Valor</th><th className="num">Saldo</th><th /><th>
              <input type="checkbox" aria-label="Marcar todos" checked={marcaveis.length > 0 && marcaveis.every((t) => marcados.has(t.id))}
                onChange={(e) => setMarcados(e.target.checked ? new Set(marcaveis.map((t) => t.id)) : new Set())} />
            </th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((t) => (
            <tr key={t.id} className={t.cancelado ? 'cancelado' : undefined}>
              <td>{t.pessoaCodigo ?? ''}</td>
              <td><Link className="linha-link" to={`/erp/titulos/${t.id}`}>{t.pessoa}</Link></td>
              <td>{t.numero}{t.tipo === 'R' && !f.tipo ? <span className="etiqueta ok">R</span> : null}</td>
              <td>{t.cancelado ? <span className="etiqueta cancelada">canc.</span> : t.situacao === 'NORMAL' ? '' : t.situacao}</td>
              <td className="icone-hist" title={t.historico}><ChatBubbleOutlineIcon /></td>
              <td>{t.sequencia}{t.parcelas > 1 ? `/${t.parcelas}` : ''}</td>
              <td className="emp">{EMPRESAS.find((e) => e.id === t.empresa)?.nome}</td>
              <td>{abreviatura(t.tipoDocumento)}</td>
              <td>{data(t.emissao)}</td>
              <td className={vencido(t) ? 'negativo' : undefined}>{data(t.programacao || t.vencimento)}</td>
              <td className="num">{moeda(t.valor)}</td>
              <td className="num">{moeda(t.saldo)}</td>
              <td className="ver-pgtos"><Link className="linha-link" to={`/erp/titulos/${t.id}`}>Ver Pgtos</Link></td>
              <td><input type="checkbox" aria-label={`Marcar o título ${t.numero}/${t.sequencia}`} checked={marcados.has(t.id)} disabled={t.cancelado || t.saldo <= 0}
                onChange={(e) => marcar(t.id, e.target.checked)} /></td>
            </tr>
          ))}
          {!lista.length && <tr><td colSpan={14} className="vazio">Nenhum título encontrado.</td></tr>}
        </tbody>
        {lista.length > 0 && (
          <tfoot>
            <tr className="linha-total">
              <td colSpan={10} title={`${lista.length} títulos · valor ${moeda(lista.reduce((s, t) => s + t.valor, 0))}`}>Total Duplicatas ({lista.length})</td>
              <td className="num">{moeda(lista.reduce((s, t) => s + t.valor, 0))}</td>
              <td className="num">{moeda(lista.reduce((s, t) => s + t.saldo, 0))}</td><td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
      <Paginacao total={lista.length} pagina={pagina} porPagina={porPagina} onPagina={setPagina} onPorPagina={(n) => { setPorPagina(n); setPagina(0); }} />
      {/* Ações embaixo da lista, à esquerda, como o "Mostrar Recibo | Mostrar Boleto | ..." do Elevor. */}
      <div className="ct-acoes">
        <button type="button" className="link-botao" onClick={() => navigate('/erp/titulos/novo')}>Novo</button>
        <span className="ct-sep">|</span>
        <button type="button" className="link-botao" disabled={!podeBaixar} onClick={() => navigate(`/erp/baixa?titulos=${selecionados.map((t) => t.id).join(',')}`)}
          title={selecionados.length && !podeBaixar ? 'Marque títulos do mesmo tipo e da mesma empresa' : 'Marque os títulos na lista'}>
          {selecionados[0]?.tipo === 'R' ? 'Receber' : 'Pagar'} marcados{selecionados.length ? ` (${selecionados.length} · ${moeda(selecionados.reduce((s, t) => s + t.saldo, 0))})` : ''}
        </button>
      </div>
    </div>
  );
}
