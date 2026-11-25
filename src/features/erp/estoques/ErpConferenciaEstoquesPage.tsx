import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SearchIcon from '@mui/icons-material/Search';
import '../erpElevor.css';
import Paginacao from '../Paginacao';
import { EtiquetaTipo, Linha, Opcoes } from './campos';
import {
  AVISO_ESTOQUES, CATEGORIAS, largura, EMPRESAS, FORNECEDORES, GRUPOS, nomeEmpresa, num, moeda, data, produtoExemplo, SALDOS, TIPOS_ESTOQUE, TIPOS_PRODUTO,
  type SaldoExemplo,
} from './estoquesExemplo';

// /erp/estoques: Conferência de Estoques, na disposição da RL_Estoques do Elevor como o ERP do Samuel a fez: filtros, grade
// "DESCRIÇÃO / FILTRO" com as colunas a mostrar, Agrupamento, Situação dos produtos e Ordem; "Gerar" mostra os saldos
// embaixo. Larguras dos campos = as do ERP do Samuel. Os botões Kardex, Contagem e Acerto (não existem nesta tela do
// Elevor, que tem o menu lateral) levam às outras telas de Estoques. Demonstração: saldos de exemplo, nada é gravado.

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const contem = (valor: string | number, busca: string) => semAcento(String(valor)).includes(semAcento(busca.trim()));

type Filtro = 'texto' | 'saldo' | 'tipo';
type Coluna = { chave: string; rotulo: string; cabeca?: string; num?: boolean; filtro?: Filtro; secao?: boolean; erp?: boolean; valor: (s: SaldoExemplo) => ReactNode };

// Colunas da "Configuração de colunas" da RL_Estoques, na ordem do Elevor; as do fim são do ERP do Samuel.
const COLUNAS: Coluna[] = [
  { chave: 'codigo', rotulo: 'Código do Produto', cabeca: 'Cod', num: true, filtro: 'texto', valor: (s) => s.produto.codigo },
  { chave: 'referencia', rotulo: 'Referência', filtro: 'texto', valor: (s) => s.produto.referencia },
  { chave: 'categoria', rotulo: 'Categoria', valor: (s) => s.produto.categoria },
  { chave: 'grupo', rotulo: 'Grupo', valor: (s) => s.produto.grupo },
  { chave: 'marca', rotulo: 'Marca', valor: (s) => s.produto.marca },
  { chave: 'descricao', rotulo: 'Descrição do Produto', cabeca: 'Produto', filtro: 'texto',
    valor: (s) => <Link className="linha-link" to={`/erp/produtos/${s.produto.codigo}`}>{s.produto.descricao}</Link> },
  { chave: 'descricao_reduzida', rotulo: 'Descrição Reduzida do Produto', cabeca: 'Descrição Reduzida', filtro: 'texto', valor: (s) => s.produto.reduzida },
  { chave: 'unidade', rotulo: 'Unidade de Venda', cabeca: 'UN', valor: (s) => s.produto.unidade },
  { chave: 'unidade_compra', rotulo: 'Unidade Compra', cabeca: 'UN Compra', valor: (s) => s.produto.unidadeCompra },
  { chave: 'quantidade_compra', rotulo: 'Quantidade Compra', cabeca: 'Qtd Compra', num: true, valor: (s) => num(s.produto.quantidadeCompra) },
  { chave: 'ncm', rotulo: 'NCM', filtro: 'texto', valor: (s) => s.produto.ncm },
  { chave: 'peso_bruto', rotulo: 'Peso Bruto', num: true, valor: (s) => num(s.produto.pesoBruto) },
  { chave: 'peso_liquido', rotulo: 'Peso Líquido', num: true, valor: (s) => num(s.produto.pesoLiquido) },
  { chave: 'grupo_similaridade', rotulo: 'Grupo Similaridade', valor: (s) => s.produto.similaridade },
  { chave: 'estoque', rotulo: 'Estoque', num: true, filtro: 'saldo', secao: true,
    valor: (s) => <span className={s.saldo < 0 ? 'negativo' : undefined}>{num(s.saldo)}</span> },
  { chave: 'custo', rotulo: 'Custo', num: true, valor: (s) => moeda(s.produto.custo) },
  { chave: 'custo_medio', rotulo: 'Custo Médio', num: true, valor: (s) => moeda(s.custoMedio) },
  { chave: 'total_custo', rotulo: 'Total Custo', num: true, valor: (s) => moeda(s.saldo * s.produto.custo) },
  { chave: 'total', rotulo: 'Total Custo Médio', cabeca: 'Total', num: true, valor: (s) => moeda(s.saldo * s.custoMedio) },
  { chave: 'estoque_minimo', rotulo: 'Estoque Mínimo', cabeca: 'Mínimo', num: true, valor: (s) => num(s.produto.minimo) },
  { chave: 'estoque_maximo', rotulo: 'Estoque Máximo', cabeca: 'Máximo', num: true, valor: (s) => num(s.produto.maximo) },
  { chave: 'valor_ultima_compra', rotulo: 'Valor Unitário Última Compra', cabeca: 'Últ. Compra (unit.)', num: true, valor: (s) => moeda(s.valorUltimaCompra) },
  { chave: 'pedidos_entregar', rotulo: 'Saldo de Pedidos a Entregar (Pedidos de Venda)', cabeca: 'A Entregar', num: true, valor: (s) => num(s.produto.aEntregar) },
  { chave: 'pedidos_receber', rotulo: 'Saldo de Pedidos a Receber (Pedidos de Compra)', cabeca: 'A Receber', num: true, valor: (s) => num(s.produto.aReceber) },
  { chave: 'producoes', rotulo: 'Quantidade em Produções não Finalizadas (Produto Acabado)', cabeca: 'Em Produção', num: true, valor: (s) => num(s.produto.emProducao) },
  { chave: 'ultima_compra', rotulo: 'Mostrar data da última compra', cabeca: 'Últ. compra', valor: (s) => data(s.ultimaCompra) },
  { chave: 'tipo', rotulo: 'Tipo do Produto', cabeca: 'Tipo', filtro: 'tipo', erp: true, valor: (s) => <EtiquetaTipo produto={s.produto} /> },
  { chave: 'empresa', rotulo: 'Empresa', erp: true, valor: (s) => nomeEmpresa(s.empresa) },
  { chave: 'ultima_entrada', rotulo: 'Data Última Entrada', cabeca: 'Últ. entrada', erp: true, valor: (s) => data(s.ultimaEntrada) },
  { chave: 'ultima_saida', rotulo: 'Data Última Saída', cabeca: 'Últ. saída', erp: true, valor: (s) => data(s.ultimaSaida) },
];
// As colunas que a Conferência do ERP mostra de início.
const COLUNAS_PADRAO = ['codigo', 'descricao', 'unidade', 'estoque', 'custo_medio', 'total', 'estoque_minimo', 'tipo', 'empresa', 'ultima_entrada', 'ultima_saida'];

const PADRAO = {
  empresa: '', tipoEstoque: '1', categoria: '', grupo: '', produto: '', fornecedor: '', qualquer: '', similaridade: '', componente: '',
  codigo: '', referencia: '', descricao: '', descricao_reduzida: '', ncm: '', saldo: '', tipoProduto: '', abaixoMinimo: false, acimaMaximo: false,
  agrupamento: 'nenhum', situacao: 'ativos', ordem: 'descricao', colunas: COLUNAS_PADRAO,
};
type Filtros = typeof PADRAO;
type FiltroTexto = 'codigo' | 'referencia' | 'descricao' | 'descricao_reduzida' | 'ncm';
const SEM_DADO = 'O ERP não guarda local de estoque, lote nem data de fabricação; essas ordens ficam paradas.';
const VARIOS = (
  <button type="button" className="btn rel-varios" disabled title="No Elevor o » escolhe vários; no ERP este filtro é um de cada vez.">
    <KeyboardDoubleArrowRightIcon />
  </button>
);

const ORDENS: Record<string, (s: SaldoExemplo) => string | number> = {
  codigo: (s) => s.produto.codigo, marca: (s) => s.produto.marca, ultima_compra: (s) => s.ultimaCompra, descricao: (s) => s.produto.descricao,
  referencia: (s) => s.produto.referencia, descricao_reduzida: (s) => s.produto.reduzida, categoria: (s) => s.produto.categoria,
};
const comparar = (a: string | number, b: string | number) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'pt-BR'));
const agrupador = (f: Filtros, s: SaldoExemplo) => (f.agrupamento === 'grupo' ? s.produto.grupo
  : f.agrupamento === 'similaridade' ? s.produto.similaridade || '(sem grupo de similaridade)' : null);

function filtrar(f: Filtros): SaldoExemplo[] {
  const textos: FiltroTexto[] = ['codigo', 'referencia', 'descricao', 'descricao_reduzida', 'ncm'];
  const campoTexto: Record<FiltroTexto, (s: SaldoExemplo) => string | number> = {
    codigo: (s) => s.produto.codigo, referencia: (s) => s.produto.referencia, descricao: (s) => s.produto.descricao,
    descricao_reduzida: (s) => s.produto.reduzida, ncm: (s) => s.produto.ncm,
  };
  const lista = SALDOS.filter((s) => {
    const p = s.produto;
    if (f.empresa && s.empresa !== Number(f.empresa)) return false;
    if (s.tipoEstoque !== Number(f.tipoEstoque)) return false;
    if (f.categoria && p.categoria !== f.categoria) return false;
    if (f.grupo && p.grupo !== f.grupo) return false;
    if (f.produto.trim() && !contem(p.codigo, f.produto) && !contem(p.descricao, f.produto)) return false;
    if (f.fornecedor && p.fornecedor !== f.fornecedor) return false;
    if (f.qualquer.trim() && ![p.codigo, p.descricao, p.reduzida, p.referencia, p.ncm, p.grupo, p.marca].some((v) => contem(v, f.qualquer))) return false;
    if (f.similaridade.trim() && !contem(p.similaridade, f.similaridade)) return false;
    if (f.componente.trim() && !(p.componentes ?? []).some(([c]) => contem(c, f.componente) || contem(produtoExemplo(c)?.descricao ?? '', f.componente))) return false;
    if (textos.some((k) => f[k].trim() && !contem(campoTexto[k](s), f[k]))) return false;
    if (f.saldo === 'positivo' && !(s.saldo > 0)) return false;
    if (f.saldo === 'negativo' && !(s.saldo < 0)) return false;
    if (f.saldo === 'zero' && s.saldo !== 0) return false;
    if (f.saldo === 'diferente' && s.saldo === 0) return false;
    if (f.tipoProduto && p.tipo !== f.tipoProduto) return false;
    if (f.abaixoMinimo && !(p.minimo !== undefined && s.saldo < p.minimo)) return false;
    if (f.acimaMaximo && !(p.maximo !== undefined && s.saldo > p.maximo)) return false;
    if (f.situacao !== 'todos' && p.ativo !== (f.situacao === 'ativos')) return false;
    return true;
  });
  const ordem = ORDENS[f.ordem] ?? ORDENS.descricao;
  return lista.sort((a, b) => comparar(agrupador(f, a) ?? '', agrupador(f, b) ?? '') || comparar(ordem(a), ordem(b))
    || comparar(a.produto.descricao, b.produto.descricao) || a.empresa - b.empresa);
}

export default function ErpConferenciaEstoquesPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Filtros>(PADRAO);
  const [aplicado, setAplicado] = useState<Filtros>(PADRAO);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(50);
  const muda = <K extends keyof Filtros>(chave: K) => (valor: Filtros[K]) => setForm((f) => ({ ...f, [chave]: valor }));
  const campo = (chave: Exclude<keyof Filtros, 'abaixoMinimo' | 'acimaMaximo' | 'colunas'>) => ({
    value: form[chave], onChange: (e: { target: { value: string } }) => muda(chave)(e.target.value),
  });

  const linhas = useMemo(() => filtrar(aplicado), [aplicado]);
  const negativos = linhas.filter((s) => s.saldo < 0).length;
  const valor = linhas.reduce((t, s) => t + Math.max(s.saldo, 0) * s.custoMedio, 0);
  const visiveis = COLUNAS.filter((c) => aplicado.colunas.includes(c.chave));
  const marcar = (chave: string, sim: boolean) => muda('colunas')(COLUNAS.map((c) => c.chave).filter((k) => (k === chave ? sim : form.colunas.includes(k))));

  const filtroDaColuna = (c: Coluna) => {
    if (c.filtro === 'texto') return <input className="campo" aria-label={`Filtro: ${c.rotulo}`} {...campo(c.chave as FiltroTexto)} />;
    if (c.filtro === 'saldo') return (
      <select className="campo" aria-label="Filtro: Estoque" {...campo('saldo')}>
        <option value="" /><option value="positivo">Positivo</option><option value="negativo">Negativo</option>
        <option value="zero">Zerado</option><option value="diferente">Diferente de Zero</option>
      </select>
    );
    if (c.filtro === 'tipo') return (
      <select className="campo" aria-label="Filtro: Tipo do Produto" {...campo('tipoProduto')}>
        <option value="" />{Object.entries(TIPOS_PRODUTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    );
    return null;
  };
  const caixa = (chave: 'abaixoMinimo' | 'acimaMaximo', rotulo: string) => (
    <tr><td colSpan={2}><label className="opcao"><input type="checkbox" checked={form[chave]} onChange={(e) => muda(chave)(e.target.checked)} /> {rotulo}</label></td></tr>
  );
  const ordem = (valorOrdem: string, rotulo: string, semDado = false) => (
    <label className="opcao" title={semDado ? SEM_DADO : undefined}>
      <input type="radio" name="ordem" checked={form.ordem === valorOrdem} disabled={semDado} onChange={() => muda('ordem')(valorOrdem)} /> {rotulo}
    </label>
  );
  let grupoAnterior: string | null = null;

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_ESTOQUES}</div>
      <form className="relatorio-elevor" onSubmit={(e) => { e.preventDefault(); setAplicado(form); setPagina(0); }}>
        <Linha rotulo="Empresa:" id="conf-empresa">
          <select id="conf-empresa" className="campo" style={largura(448)} {...campo('empresa')}>
            <option value="">Todas</option>
            {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Tipo Estoque:" id="conf-tipo-estoque">
          <select id="conf-tipo-estoque" className="campo" style={largura(198)} {...campo('tipoEstoque')}>
            {Object.entries(TIPOS_ESTOQUE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Categoria:" id="conf-categoria">
          <select id="conf-categoria" className="campo" style={largura(128)} {...campo('categoria')}>
            <option value="" />{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Grupo:" id="conf-grupo">
          <select id="conf-grupo" className="campo" style={largura(448)} {...campo('grupo')}>
            <option value="" />{GRUPOS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Produto:" id="conf-produto">
          <input id="conf-produto" className="campo" style={largura(448)} placeholder="código ou descrição" {...campo('produto')} />{VARIOS}
        </Linha>
        <Linha rotulo="Fornecedor Prod.:" id="conf-fornecedor">
          <select id="conf-fornecedor" className="campo" style={largura(448)} {...campo('fornecedor')}>
            <option value="" />{FORNECEDORES.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Configuração:">
          <select className="campo" aria-label="Configuração" style={largura(159)} disabled><option value="" /></select>
          <button type="button" className="btn primario rel-varios" disabled title="Gravar a configuração de colunas"><AddIcon /></button>
          <span className="fc-ajuda rel-ajuda-campo" title="O ERP ainda não grava configurações de colunas com nome; marque as colunas na lista abaixo.">
            <HelpOutlineIcon />
          </span>
        </Linha>
        <Linha rotulo="Qualquer:" id="conf-qualquer"><input id="conf-qualquer" className="campo" style={largura(204)} {...campo('qualquer')} /></Linha>
        <Linha rotulo="Grupo Similaridade:" id="conf-similaridade">
          <input id="conf-similaridade" className="campo" style={largura(464)} {...campo('similaridade')} />
        </Linha>
        <Linha rotulo="Componente:" id="conf-componente">
          <input id="conf-componente" className="campo" style={largura(448)} placeholder="código ou descrição do componente da fórmula" {...campo('componente')} />{VARIOS}
        </Linha>

        <table className="conf-colunas">
          <thead><tr><th>DESCRIÇÃO</th><th className="filtro">FILTRO</th></tr></thead>
          <tbody>
            {COLUNAS.map((c, i) => (
              <Fragment key={c.chave}>
                {c.secao && <tr className="conf-secao"><td colSpan={2}>{TIPOS_ESTOQUE[Number(form.tipoEstoque)]}</td></tr>}
                {c.chave === 'ultima_compra' && (
                  <>
                    {caixa('abaixoMinimo', 'Listar Somente produtos que estão abaixo do estoque Mínimo')}
                    {caixa('acimaMaximo', 'Listar Somente produtos que estão acima do estoque Máximo')}
                  </>
                )}
                {c.erp && !COLUNAS[i - 1]?.erp && <tr className="conf-secao"><td colSpan={2}>Do ERP (o Elevor não tem)</td></tr>}
                <tr>
                  <td><label className="opcao"><input type="checkbox" checked={form.colunas.includes(c.chave)} onChange={(e) => marcar(c.chave, e.target.checked)} /> {c.rotulo}</label></td>
                  <td className="filtro">{filtroDaColuna(c)}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>

        <Linha rotulo="Agrupamento:">
          <Opcoes nome="agrupamento" valor={form.agrupamento} onChange={muda('agrupamento')}
            opcoes={[{ valor: 'nenhum', rotulo: 'Nenhum' }, { valor: 'grupo', rotulo: 'Por Grupo de Produtos' }, { valor: 'similaridade', rotulo: 'Por Grupo de Similaridades' }]} />
        </Linha>
        <Linha rotulo="Situação dos produtos:">
          <Opcoes nome="situacao" valor={form.situacao} onChange={muda('situacao')}
            opcoes={[{ valor: 'todos', rotulo: 'Todos' }, { valor: 'ativos', rotulo: 'Ativos' }, { valor: 'inativos', rotulo: 'Inativos' }]} />
        </Linha>
        <Linha rotulo="Ordem:">
          <div className="conf-ordem" role="radiogroup">
            {ordem('codigo', 'Código')}{ordem('marca', 'Marca')}{ordem('local', 'Local Estoque', true)}{ordem('ultima_compra', 'Data Última Compra')}
            {ordem('descricao', 'Descrição')}{ordem('referencia', 'Referência')}{ordem('validade', 'Validade Lote', true)}{ordem('fabricacao', 'Fabricação', true)}
            {ordem('descricao_reduzida', 'Descrição Reduzida')}{ordem('categoria', 'Categoria')}
          </div>
          <span className="fc-ajuda rel-ajuda-campo" title={SEM_DADO}><HelpOutlineIcon /></span>
        </Linha>
        <div className="botoes">
          <button className="btn primario" type="submit"><SearchIcon /> Gerar</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/estoques/kardex')}>Kardex</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/estoques/contagens')}>Contagem de Produtos</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/estoques/acerto')}>Acerto de Estoque</button>
        </div>
      </form>

      <div className="resumo-linha">
        <span><b>{linhas.length.toLocaleString('pt-BR')}</b> saldos</span>
        <span><b className={negativos ? 'negativo' : undefined}>{negativos.toLocaleString('pt-BR')}</b> negativos</span>
        <span>Valor do estoque positivo (custo médio): <b>R$ {moeda(valor)}</b></span>
      </div>
      <table className="grade">
        <thead>
          <tr>
            <th className="icone-linha" />
            {visiveis.map((c) => <th key={c.chave} className={c.num ? 'num' : undefined}>{c.cabeca ?? c.rotulo}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.slice(pagina * porPagina, (pagina + 1) * porPagina).map((s) => {
            const grupo = agrupador(aplicado, s);
            const quebra = grupo !== null && grupo !== grupoAnterior;
            grupoAnterior = grupo;
            return (
              <Fragment key={`${s.empresa}-${s.tipoEstoque}-${s.produto.codigo}`}>
                {quebra && <tr className="linha-quebra"><td colSpan={visiveis.length + 1}>{grupo}</td></tr>}
                <tr>
                  <td className="icone-linha">
                    <Link to={`/erp/estoques/kardex?produto=${s.produto.codigo}&empresa=${s.empresa}`} title="Ver Kardex"><ReceiptLongOutlinedIcon /></Link>
                  </td>
                  {visiveis.map((c) => <td key={c.chave} className={c.num ? 'num' : undefined}>{c.valor(s)}</td>)}
                </tr>
              </Fragment>
            );
          })}
          {!linhas.length && <tr><td colSpan={visiveis.length + 1} className="vazio">Nenhum saldo encontrado.</td></tr>}
        </tbody>
      </table>
      <Paginacao total={linhas.length} pagina={pagina} porPagina={porPagina} onPagina={setPagina}
        onPorPagina={(n) => { setPorPagina(n); setPagina(0); }} />
    </div>
  );
}
