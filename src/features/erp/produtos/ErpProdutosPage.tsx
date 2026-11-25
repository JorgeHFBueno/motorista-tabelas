import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SearchIcon from '@mui/icons-material/Search';
import '../erpElevor.css';
import Paginacao from '../Paginacao';
import {
  AVISO_ESTOQUES, CATEGORIAS, EMPRESAS, FORNECEDORES, GRUPOS, MARCAS, moeda, precoNaTabela, PRODUTOS_EXEMPLO, produtoExemplo, SALDOS, TABELAS_PRECO,
  TIPOS_ESTOQUE, TIPOS_PRODUTO, type ProdutoExemplo,
} from '../estoques/estoquesExemplo';

// /erp/produtos: Consulta de Produtos no formato da CL_Produtos do Elevor, como o ERP do Samuel (erp/Produtos.tsx): Empresa,
// Tipo de Estoque e Tabela de Preço no alto, a Pesquisa com Pesquisar e Novo, e o "Mais Filtros" na ordem e nos lugares
// do Elevor (Máquina, Mostrar Imagem e Promoção desligados, como no ERP). Grade com estoque, custos e preço da tabela
// escolhida. Demonstração: produtos e saldos de exemplo.

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const contem = (valor: string | number, busca: string) => semAcento(String(valor)).includes(semAcento(busca.trim()));
const SEM_DADO = 'O ERP não guarda esse dado';
const SINAIS = [{ valor: 'positivo', rotulo: 'Maior que zero' }, { valor: 'zerado', rotulo: 'Igual a zero' }, { valor: 'negativo', rotulo: 'Menor que zero' }];
const sinal = (v: number, s: string) => !s || (s === 'positivo' ? v > 0 : s === 'negativo' ? v < 0 : v === 0);

const PADRAO = {
  empresa: '', tipoEstoque: '1', tabela: '1', busca: '', codigo: '', referencia: '', categoria: '', grupo: '', estoque: '', disponivel: '', marca: '',
  fornecedor: '', similaridade: '', componente: '', situacao: 'ativos',
};
type Filtros = typeof PADRAO;

/** Estoque e custo médio do produto na empresa (todas: soma) e no tipo de estoque; custo de reposição = última compra. */
function posicao(p: ProdutoExemplo, empresa: string, tipoEstoque: string) {
  const saldos = SALDOS.filter((s) => s.produto.codigo === p.codigo && s.tipoEstoque === Number(tipoEstoque) && (!empresa || s.empresa === Number(empresa)));
  const estoque = Math.round(saldos.reduce((t, s) => t + s.saldo, 0) * 10000) / 10000;
  const positivo = saldos.filter((s) => s.saldo > 0);
  const qtd = positivo.reduce((t, s) => t + s.saldo, 0);
  const medio = qtd ? positivo.reduce((t, s) => t + s.saldo * s.custoMedio, 0) / qtd : saldos[0]?.custoMedio;
  return { estoque, medio, reposicao: saldos.find((s) => s.valorUltimaCompra !== undefined)?.valorUltimaCompra };
}

export default function ErpProdutosPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Filtros>(PADRAO);
  const [aplicado, setAplicado] = useState<Filtros>(PADRAO);
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(25);
  const campo = (chave: keyof Filtros) => ({ value: form[chave], onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [chave]: e.target.value })) });
  // Os campos de lista aplicam na hora, como no Elevor; os de texto, no Pesquisar.
  const lista = (chave: keyof Filtros) => ({
    value: form[chave],
    onChange: (e: { target: { value: string } }) => { const f = { ...form, [chave]: e.target.value }; setForm(f); setAplicado(f); setPagina(0); },
  });

  const linhas = useMemo(() => PRODUTOS_EXEMPLO.map((p) => ({ p, ...posicao(p, aplicado.empresa, aplicado.tipoEstoque) })).filter(({ p, estoque }) => {
    const f = aplicado;
    if (f.busca.trim() && ![p.codigo, p.descricao, p.reduzida, p.referencia].some((v) => contem(v, f.busca))) return false;
    if (f.codigo.trim() && !contem(p.codigo, f.codigo)) return false;
    if (f.referencia.trim() && !contem(p.referencia, f.referencia)) return false;
    if (f.categoria && p.categoria !== f.categoria) return false;
    if (f.grupo && p.grupo !== f.grupo) return false;
    // No ERP o disponível é o próprio estoque (não há reserva).
    if (!sinal(estoque, f.estoque) || !sinal(estoque, f.disponivel)) return false;
    if (f.marca && p.marca !== f.marca) return false;
    if (f.fornecedor && p.fornecedor !== f.fornecedor) return false;
    if (f.similaridade && p.similaridade !== f.similaridade) return false;
    if (f.componente.trim() && !(p.componentes ?? []).some(([c]) => contem(c, f.componente) || contem(produtoExemplo(c)?.descricao ?? '', f.componente))) return false;
    if (f.situacao !== 'todos' && p.ativo !== (f.situacao === 'ativos')) return false;
    return true;
  }).sort((a, b) => a.p.descricao.localeCompare(b.p.descricao, 'pt-BR')), [aplicado]);
  const similaridades = [...new Set(PRODUTOS_EXEMPLO.map((p) => p.similaridade).filter(Boolean))].sort();

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_ESTOQUES}</div>
      <div className="consulta-cad largo">
        <form className="filtros-produtos" onSubmit={(e) => { e.preventDefault(); setAplicado(form); setPagina(0); }}>
          <label className="fp-rotulo" htmlFor="produtos-empresa">Empresa:</label>
          <select id="produtos-empresa" className="campo fp-877" {...lista('empresa')}>
            <option value="">Todas</option>{EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <label className="fp-rotulo" htmlFor="produtos-tipo-estoque">Tipo de Estoque:</label>
          <select id="produtos-tipo-estoque" className="campo" {...lista('tipoEstoque')}>
            {Object.entries(TIPOS_ESTOQUE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="fp-rotulo" htmlFor="produtos-tabela">Tabela de Preço:</label>
          <select id="produtos-tabela" className="campo" {...lista('tabela')}>
            {TABELAS_PRECO.map((t) => <option key={t.codigo} value={t.codigo}>{t.descricao}</option>)}
          </select>
          <div />
          <label className="fp-rotulo" htmlFor="produtos-pesquisa">Pesquisa:</label>
          <input id="produtos-pesquisa" className="campo fp-largo" {...campo('busca')} autoFocus />
          <div className="fp-botoes">
            <button className="btn primario" type="submit"><SearchIcon /> Pesquisar</button>
            <button className="btn" type="button" onClick={() => navigate('/erp/produtos/novo')}><AddCircleOutlineIcon /> Novo</button>
          </div>
          <div />
          <div className="fp-resto">
            <button className="btn" type="button" aria-expanded={maisFiltros} onClick={() => setMaisFiltros((m) => !m)}>
              Mais Filtros {maisFiltros ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </button>
          </div>
          {maisFiltros && <>
            <label className="fp-rotulo" htmlFor="produtos-codigo">Código:</label>
            <input id="produtos-codigo" className="campo fp-w359" inputMode="numeric" {...campo('codigo')} />
            <label className="fp-rotulo" htmlFor="produtos-referencia">Referência:</label>
            <input id="produtos-referencia" className="campo" {...campo('referencia')} />
            <div />

            <label className="fp-rotulo" htmlFor="produtos-categoria">Categoria:</label>
            <select id="produtos-categoria" className="campo fp-877" {...lista('categoria')}>
              <option value="" />{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <label className="fp-rotulo" htmlFor="produtos-grupo">Grupo:</label>
            <select id="produtos-grupo" className="campo fp-877" {...lista('grupo')}>
              <option value="" />
              {GRUPOS.map((g) => <option key={g} value={g}>{g} ({PRODUTOS_EXEMPLO.filter((p) => p.grupo === g).length})</option>)}
            </select>

            <label className="fp-rotulo" htmlFor="produtos-estoque">Estoque:</label>
            <select id="produtos-estoque" className="campo fp-w359" {...lista('estoque')}>
              <option value="" />{SINAIS.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
            </select>
            <label className="fp-rotulo" htmlFor="produtos-disponivel">Disponível:</label>
            <select id="produtos-disponivel" className="campo" title="No ERP o disponível é o próprio estoque (não há reserva)" {...lista('disponivel')}>
              <option value="" />{SINAIS.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
            </select>
            <div />

            <label className="fp-rotulo" htmlFor="produtos-marca">Marca:</label>
            <select id="produtos-marca" className="campo fp-877" {...lista('marca')}>
              <option value="" />{MARCAS.map((m) => <option key={m}>{m}</option>)}
            </select>
            <label className="fp-rotulo" htmlFor="produtos-fornecedor">Fornecedor:</label>
            <select id="produtos-fornecedor" className="campo fp-877" {...lista('fornecedor')}>
              <option value="" />{FORNECEDORES.map((f) => <option key={f}>{f}</option>)}
            </select>

            <label className="fp-rotulo" htmlFor="produtos-similaridade">Grupo Similaridade:</label>
            <select id="produtos-similaridade" className="campo fp-w359" {...lista('similaridade')}>
              <option value="" />{similaridades.map((s) => <option key={s}>{s}</option>)}
            </select>
            <span className="fp-rotulo">Máquina:</span>
            <select className="campo" aria-label="Máquina" disabled title={SEM_DADO}><option /></select>
            <div />

            <label className="fp-rotulo" htmlFor="produtos-componente">Componente:</label>
            <input id="produtos-componente" className="campo fp-877" placeholder="código ou descrição do componente" {...campo('componente')} />

            <span className="fp-rotulo">Situação:</span>
            <div className="opcoes">
              {[['todos', 'Todos'], ['ativos', 'Ativos'], ['inativos', 'Inativos']].map(([valor, rotulo]) => (
                <label key={valor} className="opcao">
                  <input type="radio" name="situacao" checked={form.situacao === valor}
                    onChange={() => { const f = { ...form, situacao: valor }; setForm(f); setAplicado(f); setPagina(0); }} /> {rotulo}
                </label>
              ))}
            </div>
            <div />
            <label className="opcao" title={SEM_DADO}><input type="checkbox" disabled /> Mostrar Imagem</label>
            <div />

            <div />
            <label className="opcao fp-resto" title={SEM_DADO}><input type="checkbox" disabled /> Apenas Produtos com Promoção</label>
          </>}
        </form>

        <table className="grade">
          <thead>
            <tr>
              <th className="icone-linha" /><th>Código</th><th>Produto</th><th>NCM</th><th>Locação</th><th>UN</th><th className="num">Estoque</th>
              <th className="num">Disponível</th><th className="num">Custo</th><th className="num">Custo Médio</th><th className="num">Preço Venda</th>
              <th className="num">Custo Reposição</th><th>Similar</th>
            </tr>
          </thead>
          <tbody>
            {linhas.slice(pagina * porPagina, (pagina + 1) * porPagina).map(({ p, estoque, medio, reposicao }) => (
              <tr key={p.codigo}>
                <td className="icone-linha">
                  <Link to={`/erp/produtos/${p.codigo}`} title={`${p.grupo} · ${TIPOS_PRODUTO[p.tipo]}`}><Inventory2OutlinedIcon /></Link>
                </td>
                <td>{p.codigo}</td>
                <td><Link className="linha-link" to={`/erp/produtos/${p.codigo}`}>{p.descricao}</Link>{!p.ativo && <> <span className="etiqueta inativo">inativo</span></>}</td>
                <td>{p.ncm}</td>
                <td />
                <td>{p.unidade}</td>
                <td className={`num${estoque < 0 ? ' negativo' : ''}`}>{moeda(estoque)}</td>
                <td className={`num${estoque < 0 ? ' negativo' : ''}`}>{moeda(estoque)}</td>
                <td className="num">{moeda(p.custo)}</td>
                <td className="num">{moeda(medio)}</td>
                <td className="num">{moeda(precoNaTabela(p, Number(aplicado.tabela)))}</td>
                <td className="num">{moeda(reposicao)}</td>
                <td />
              </tr>
            ))}
            {!linhas.length && <tr><td colSpan={13} className="vazio">Nenhum produto encontrado.</td></tr>}
          </tbody>
        </table>
        <Paginacao total={linhas.length} pagina={pagina} porPagina={porPagina} onPagina={setPagina}
          onPorPagina={(n) => { setPorPagina(n); setPagina(0); }} />
      </div>
    </div>
  );
}
