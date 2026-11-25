import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import '../erpElevor.css';
import { LinhaFicha, ListaFicha } from '../FichaCampos';
import { cols, ehLista, montar, type Item, type Lista } from '../camposFicha';
import {
  AVISO_ESTOQUES, CATEGORIAS, CATEGORIAS_FISCAIS, data, EMPRESAS, FORNECEDORES, GRUPOS, hoje, MARCAS, moeda, MOVIMENTOS, nomeEmpresa, num,
  ORIGENS, precoNaTabela, produtoExemplo, SALDOS, TABELAS_PRECO, TIPOS_ESTOQUE, TIPOS_PRODUTO, UNIDADES, usadoEm, type ProdutoExemplo,
} from '../estoques/estoquesExemplo';

// /erp/produtos/:codigo e /erp/produtos/novo: Cadastro de Produtos no layout da CD_Produtos do Elevor, como o ERP do Samuel
// (server/src/erp/cadastros/produtos.ts e web/src/erp/produtos/AbasProduto.tsx): as 13 abas do Elevor, rótulos em negrito
// à esquerda, larguras medidas no Elevor (Detalhes com três pares por linha), e Preços, Estoques, Indicadores e
// Componentes/Formulações como telas próprias dentro da aba. Botões Gravar, Novo, Consultar e Copiar, como no Elevor (sem
// Excluir). Demonstração: tudo se edita na tela e nada é gravado.

const desligado = (rotulo: string, icone?: ReactNode) => (
  <button key={rotulo} className="btn" type="button" disabled title="Na demonstração, sem esta ação">{icone}{rotulo}</button>
);
const lapis = (rotulo: string) => (
  <button key={`lapis-${rotulo}`} className="btn btn-icone" type="button" disabled title="Na demonstração, sem esta ação" aria-label={`Editar ${rotulo}`}>
    <EditOutlinedIcon />
  </button>
);
const TIPOS = Object.values(TIPOS_PRODUTO);
const CST_IPI_ENTRADA = ['00 - Entrada com Recuperação de Crédito', '01 - Entrada Tributada com Alíquota Zero', '02 - Entrada Isenta',
  '03 - Entrada Não-Tributada', '04 - Entrada Imune', '05 - Entrada com Suspensão', '49 - Outras Entradas'];
const CST_IPI_SAIDA = ['50 - Saída Tributada', '51 - Saída Tributável com Alíquota Zero', '52 - Saída Isenta', '53 - Saída Não-Tributada',
  '54 - Saída Imune', '55 - Saída com Suspensão', '99 - Outras Saídas'];
const CST_CBS_IBS = ['000', '010', '011', '200', '210', '220', '221', '222', '400', '410', '510', '550', '620', '800', '810', '820'];
const REGIOES = ['Interno (Dentro do Estado)', 'Reg (Sul/Sudeste)', 'Reg (Norte/Nordeste)', 'EX'];
const NOMES_EMPRESAS = EMPRESAS.map((e) => e.nome);

const PRINCIPAL: Item[] = [
  { rotulo: 'Descrição', largura: 886 },
  { rotulo: 'Descrição Reduzida', largura: 886 },
  { rotulo: 'Categoria', tipo: 'opcoes', opcoes: CATEGORIAS, largura: 842, botoes: [lapis('Categoria')] },
  { rotulo: 'Grupo', tipo: 'opcoes', opcoes: GRUPOS, largura: 796 },
  { rotulo: 'Marca', tipo: 'opcoes', opcoes: MARCAS, largura: 800, botoes: [lapis('Marca')] },
  { rotulo: 'Referência', largura: 886 },
  { rotulo: 'Unidade Venda', tipo: 'opcoes', opcoes: UNIDADES, largura: 319, botoes: [lapis('Unidade Venda')] },
  { rotulo: 'Unidade Compra', tipo: 'opcoes', opcoes: UNIDADES, largura: 188, junto: true, botoes: [lapis('Unidade Compra')] },
  { rotulo: 'Peso Bruto (Kg)', tipo: 'numero', largura: 363 },
  { rotulo: 'Peso Líquido (Kg)', tipo: 'numero', largura: 232, junto: true },
  { rotulo: 'Permite Venda Fracionada', tipo: 'caixa' },
];

const DETALHES: Item[] = [
  { rotulo: 'Largura', tipo: 'numero', largura: 'medio', secao: 'Características do Produto/Embalagem' },
  { rotulo: 'Altura', tipo: 'numero', largura: 'medio', junto: true },
  { rotulo: 'Comprimento', tipo: 'numero', largura: 'medio', junto: true },
  { rotulo: 'Diâmetro', tipo: 'numero', largura: 'medio' },
  { rotulo: 'Cubagem', tipo: 'numero', largura: 'medio', junto: true },
  { rotulo: 'Volume da Embalagem', tipo: 'numero', largura: 'medio', junto: true },
  { rotulo: 'Unidade da Embalagem', tipo: 'opcoes', opcoes: UNIDADES, largura: 'medio' },
  { rotulo: 'Unidade Tributável', tipo: 'opcoes', opcoes: UNIDADES, largura: 'medio', junto: true },
  { rotulo: 'Conversor de Unidade Tributável', tipo: 'numero', largura: 'medio' },
  { rotulo: 'Tipo do conversor', tipo: 'radio', opcoes: ['Divisor', 'Multiplicador'], anexo: '' },
  { rotulo: 'Garantia', largura: 'medio', junto: true },
  { rotulo: 'Embalagem/Frasco Retornável', tipo: 'caixa' },
  { rotulo: 'Validade em Dias', tipo: 'numero', largura: 'medio', junto: true },
  { rotulo: 'Divisor', tipo: 'numero', largura: 'medio', junto: true },
  { rotulo: 'Multiplicador', tipo: 'numero', largura: 'medio' },
  { rotulo: 'Usar Peso da Balança', tipo: 'caixa', secao: 'Integrações', ajuda: 'Pesa o produto na balança na venda.' },
  { rotulo: 'Código do Produto na Balança', largura: 'medio', junto: true },
  { rotulo: 'Código Externo', largura: 'medio', junto: true },
  { rotulo: 'Exporta para Balança', tipo: 'caixa' },
  { rotulo: 'Grupo Similaridade', largura: 'medio', secao: 'Informações Comerciais' },
  { rotulo: 'Tempo de Reposição', tipo: 'numero', largura: 'medio', junto: true },
  { rotulo: 'Quantidade de Compra', tipo: 'numero', largura: 'medio', junto: true },
  { rotulo: 'Comissão', tipo: 'percentual' },
  { rotulo: 'Campos Específicos para Venda', largura: 'medio', junto: true },
  { rotulo: 'Produto Controlado', tipo: 'caixa', secao: 'Documentos e Observações' },
  { rotulo: 'Número Registro Inmetro', largura: 'medio', junto: true },
  { rotulo: 'Validade Registro Inmetro', tipo: 'data', junto: true },
  { rotulo: 'Imprime Etiquetas', tipo: 'caixa' },
  { rotulo: 'Certificado Inmetro', largura: 'medio', junto: true },
  { rotulo: 'Validade Certificado Inmetro', tipo: 'data', junto: true },
  { rotulo: 'Arquivos Obrigatórios Clientes', largura: 'medio' },
  { rotulo: 'Observações', tipo: 'longo' },
  { rotulo: 'Observações para NF', tipo: 'longo' },
  { rotulo: 'Tipo', tipo: 'opcoes', opcoes: TIPOS, largura: 'medio', secao: 'Dados da peça (pré-moldado, só do ERP)', ajuda: 'Do ERP (o Elevor não tem).' },
  { rotulo: 'Aço frouxo (kg)', tipo: 'numero', largura: 'medio', junto: true },
  { rotulo: 'Aço protendido (kg)', tipo: 'numero', largura: 'medio', junto: true },
];

const FISCAIS: Item[] = [
  { lista: 'ICMS e ICMS ST', botao: 'Adicionar ICMS', inicial: 'icms', colunas: [
    { rotulo: 'Empresa', opcoes: NOMES_EMPRESAS }, { rotulo: 'Região', opcoes: REGIOES }, { rotulo: 'CST' }, { rotulo: 'CSOSN' }, { rotulo: 'Base' },
    { rotulo: 'Aliquota' }, { rotulo: 'MVA' }, { rotulo: 'Benef. Fiscal' }, { rotulo: 'Mensagem' }] },
  { rotulo: 'NCM', largura: 'medio' },
  { rotulo: 'CEST', largura: 'medio' },
  { rotulo: 'Categoria Fiscal', tipo: 'opcoes', opcoes: CATEGORIAS_FISCAIS, largura: 'curto', botoes: [lapis('Categoria Fiscal')] },
  { rotulo: 'Preço Pauta', tipo: 'moeda', junto: true, botoes: [desligado('Preço de Pauta ICMS ST - UF')] },
  { rotulo: 'Origem', tipo: 'opcoes', opcoes: ORIGENS, largura: 'cheio' },
  { lista: 'Fiscais', botao: 'Adicionar Origem por Empresa', colunas: [{ rotulo: 'Origem', opcoes: ORIGENS }, { rotulo: 'Empresa', opcoes: NOMES_EMPRESAS }] },
  { rotulo: 'Alíquota IPI', tipo: 'percentual', secao: 'IPI' },
  { rotulo: 'Código Enquadramento IPI', largura: 'curto', junto: true },
  { rotulo: 'EXTIPI', largura: 'curto' },
  { rotulo: 'CST IPI Entrada', tipo: 'opcoes', opcoes: CST_IPI_ENTRADA, largura: 'medio' },
  { rotulo: 'CST IPI Saída', tipo: 'opcoes', opcoes: CST_IPI_SAIDA, largura: 'medio', junto: true },
  { rotulo: 'Reter IRRF', tipo: 'caixa', secao: 'Serviços' },
  { rotulo: 'Alíquota do IRRF', tipo: 'percentual', junto: true },
  { rotulo: 'Reter CSLL', tipo: 'caixa' },
  { rotulo: 'Considerar como Outras Deduções NFSe', tipo: 'caixa', junto: true },
  { rotulo: 'CST CBS/IBS', tipo: 'opcoes', opcoes: CST_CBS_IBS, largura: 'curto', secao: 'Reforma Tributária' },
  { rotulo: 'Classificação Tributária CBS/IBS', largura: 'curto', junto: true },
];

const ABAS: Array<[string, Item[]]> = [
  ['Principal', PRINCIPAL],
  ['Detalhes', DETALHES],
  ['Imagens', [{ lista: 'Imagens', colunas: cols('Imagem'), estreita: true, botao: 'Adicionar Imagem' }]],
  ['Fornecedores', [{ lista: 'Fornecedores', colunas: [{ rotulo: 'Fornecedor', opcoes: FORNECEDORES }], botao: 'Adicionar Fornecedor', inicial: 'fornecedores' }]],
  ['Preços', []],
  ['Fiscais', FISCAIS],
  ['Codigo de Barras', [
    { rotulo: 'Produto sem GTIN - (Não será transmitido o código de barras para a Sefaz).', tipo: 'caixa' },
    { lista: 'Codigo de Barras', botao: 'Adicionar Código de Barras', inicial: 'codigosBarras',
      colunas: [{ rotulo: 'Código de Barras' }, { rotulo: 'Tipo', opcoes: ['GTIN (Sefaz)', 'Interno', 'Unidade Tributável'] }] },
  ]],
  ['Estoques', []],
  ['Indicadores', []],
  ['Componentes/Formulações', []],
  ['Associações', [{ lista: 'Associações', botao: 'Adicionar Associação', colunas: cols('Fornecedor', 'Produto Fornecedor', 'Código Barras', 'Multiplicador', 'Divisor') }]],
  ['Arquivos', [{ lista: 'Arquivos', botao: 'Adicionar Arquivo', colunas: cols('Título', 'Data', 'Usuário') }]],
  ['Campos Específicos', []],
];

function valoresDe(p: ProdutoExemplo | null): Record<string, string> {
  if (!p) return { 'Tipo do conversor': 'Divisor', Origem: ORIGENS[0], Tipo: TIPOS_PRODUTO.outro };
  const m = p.medidas;
  return {
    Descrição: p.descricao, 'Descrição Reduzida': p.reduzida, Categoria: p.categoria, Grupo: p.grupo, Marca: p.marca, Referência: p.referencia,
    'Unidade Venda': p.unidade, 'Unidade Compra': p.unidadeCompra, 'Peso Bruto (Kg)': num(p.pesoBruto), 'Peso Líquido (Kg)': num(p.pesoLiquido),
    'Permite Venda Fracionada': ['UN', 'PR'].includes(p.unidade) ? '' : 'Sim',
    Largura: num(m?.largura), Altura: num(m?.altura), Comprimento: num(m?.comprimento),
    Cubagem: m ? num(Math.round(m.largura * m.altura * m.comprimento * 1000) / 1000) : '', 'Unidade Tributável': p.unidade, 'Tipo do conversor': 'Divisor',
    'Grupo Similaridade': p.similaridade, 'Quantidade de Compra': num(p.quantidadeCompra), Tipo: TIPOS_PRODUTO[p.tipo],
    'Aço frouxo (kg)': num(m?.acoFrouxo), 'Aço protendido (kg)': num(m?.acoProtendido),
    NCM: p.ncm, 'Categoria Fiscal': 'TRIBUTADO', Origem: ORIGENS[0],
  };
}

// ---------------- Preços: grade estreita no centro (Código | Tabela | Preço | Cod. Regra) e os botões um embaixo do outro
function AbaPrecos({ produto }: { produto: ProdutoExemplo | null }) {
  const [precos, setPrecos] = useState<Record<number, string>>(() => Object.fromEntries(TABELAS_PRECO.map((t) => {
    const preco = produto ? precoNaTabela(produto, t.codigo) : undefined;
    return [t.codigo, preco === undefined ? '' : preco.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })];
  })));
  const [editando, setEditando] = useState<number | null>(null);
  const comPreco = TABELAS_PRECO.filter((t) => precos[t.codigo]);
  return (
    <div className="fc-propria">
      <div className="precos-produto">
        <div className="botoes-direita">
          <button type="button" className="btn" disabled={comPreco.length === TABELAS_PRECO.length}
            onClick={() => setEditando(TABELAS_PRECO.find((t) => !precos[t.codigo])?.codigo ?? null)}><AddCircleOutlineIcon /> Adicionar</button>
        </div>
        <table className="grade compacta">
          <thead><tr><th>Código</th><th>Tabela</th><th className="num">Preço</th><th>Cod. Regra</th><th /></tr></thead>
          <tbody>
            {TABELAS_PRECO.filter((t) => precos[t.codigo] || editando === t.codigo).map((t) => (
              <tr key={t.codigo}>
                <td>{t.codigo}</td><td>{t.descricao}</td>
                <td className="num">{editando === t.codigo
                  ? <input className="campo mini num" aria-label={`Preço na ${t.descricao}`} autoFocus value={precos[t.codigo]}
                      onChange={(e) => setPrecos((x) => ({ ...x, [t.codigo]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setEditando(null); } }} />
                  : precos[t.codigo]}</td>
                <td />
                <td className="acoes-linha">
                  <button type="button" className="link-botao" title="Alterar o preço" aria-label={`Alterar o preço na ${t.descricao}`}
                    onClick={() => setEditando(editando === t.codigo ? null : t.codigo)}><EditOutlinedIcon /></button>
                </td>
              </tr>
            ))}
            {!comPreco.length && editando === null && <tr><td colSpan={5} className="vazio">Nenhum preço cadastrado.</td></tr>}
          </tbody>
        </table>
        <p className="muted small">Na demonstração, o preço de exemplo é o custo mais o percentual da tabela.</p>
        <div className="botoes-coluna">
          {desligado('Formação do Preço de Venda', <EditOutlinedIcon />)}
          {desligado('Mais Opções ▾')}
          {desligado('Histórico de Preços ▾')}
          {desligado('Regras de Atualização ▾')}
        </div>
      </div>
    </div>
  );
}

function SeletorEmpresa({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <div className="fc-propria-linha"><b>Empresa:</b>
      <select className="campo medio" aria-label="Empresa" value={valor} onChange={(e) => onChange(e.target.value)}>
        {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
      </select>
    </div>
  );
}

// ---------------- Estoques: saldo por tipo de estoque da empresa, Valor Comercial, Mínimo/Máximo e Históricos
function AbaEstoques({ produto }: { produto: ProdutoExemplo | null }) {
  const [empresa, setEmpresa] = useState('1');
  const n3 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const linhas = Object.entries(TIPOS_ESTOQUE).map(([tipo, nome]) => {
    const s = produto && SALDOS.find((x) => x.produto.codigo === produto.codigo && x.empresa === Number(empresa) && x.tipoEstoque === Number(tipo));
    return { tipo, nome, estoque: s?.saldo ?? 0, custo: s ? produto.custo : 0, medio: s?.custoMedio ?? 0, reposicao: s?.valorUltimaCompra ?? 0 };
  });
  return (
    <>
      <div className="fc-propria">
        <SeletorEmpresa valor={empresa} onChange={setEmpresa} />
        <div className="estoques-produto">
          <div className="botoes-direita">{desligado('Adicionar Estoque', <AddCircleOutlineIcon />)}</div>
          <table className="grade compacta">
            <thead><tr><th /><th className="num">Estoque</th><th className="num">Custo</th><th className="num">Custo Médio</th><th className="num">Custo Reposição</th><th>Local</th><th /></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.tipo}>
                  <td><b>▸ {l.nome}</b></td>
                  <td className={`num${l.estoque < 0 ? ' negativo' : ''}`}><b>{n3(l.estoque)}</b></td>
                  <td className="num"><b>{moeda(l.custo)}</b></td><td className="num"><b>{moeda(l.medio)}</b></td><td className="num"><b>{moeda(l.reposicao)}</b></td>
                  <td><input className="campo mini" aria-label={`Local do estoque ${l.nome}`} disabled /></td>
                  <td><button type="button" className="link-botao" disabled title="Na demonstração, sem esta ação" aria-label={`Alterar o estoque ${l.nome}`}><EditOutlinedIcon /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ListaFicha lista={{ lista: 'Valor Comercial', botao: 'Adicionar Valor Comercial',
        colunas: [{ rotulo: 'Empresa', opcoes: NOMES_EMPRESAS }, { rotulo: 'Data', data: true }, { rotulo: 'Valor Comercial' }, { rotulo: 'Valor Médio Comercial' }, { rotulo: 'Motivo' }] }} />
      <div className="fc-propria">
        <div className="fc-secao">Estoque Mínimo/Máximo</div>
        {([['Estoque Mínimo', produto?.minimo], ['Estoque Máximo', produto?.maximo]] as const).map(([rotulo, valor]) => (
          <div key={rotulo} className="fc-propria-linha"><b>{rotulo}:</b>
            <input className="campo curto num" aria-label={rotulo} defaultValue={moeda(valor ?? 0)} />
            <select className="campo curto" aria-label={`${rotulo}: base`} disabled><option>Quantidade</option><option>Demanda(Dias)</option></select>
          </div>
        ))}
        <div className="fc-propria-linha"><b />{desligado('Replicar Estoques nas Empresas', <EditOutlinedIcon />)}</div>
        <div className="fc-secao">Históricos</div>
        <div className="fc-propria-linha"><b />
          <div className="botoes-coluna">
            {produto
              ? <Link className="btn" to={`/erp/estoques/kardex?produto=${produto.codigo}&empresa=${empresa}`}>Histórico de Movimentações ▾</Link>
              : desligado('Histórico de Movimentações ▾')}
            {desligado('Histórico de Custo Reposição ▾')}
            {desligado('Histórico de Movimentações Comerciais ▾')}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------- Indicadores: última compra e quadro de compras/vendas por período
function AbaIndicadores({ produto }: { produto: ProdutoExemplo | null }) {
  const [empresa, setEmpresa] = useState('1');
  const movs = MOVIMENTOS.filter((m) => produto && m.produto === produto.codigo && m.empresa === Number(empresa));
  const compras = movs.filter((m) => m.tipo === 'entrada' && m.origem.startsWith('Nota'));
  const vendas = movs.filter((m) => m.tipo === 'saida' && m.origem.startsWith('Expedição'));
  const ultima = compras[compras.length - 1];
  const dia = hoje();
  const ano = Number(dia.slice(0, 4));
  const menos = (meses: number, dias = 0) => {
    const d = new Date(`${dia}T12:00:00`);
    d.setMonth(d.getMonth() - meses);
    d.setDate(d.getDate() - dias);
    return d.toLocaleDateString('sv-SE');
  };
  const periodos: Array<[string, (d: string) => boolean]> = [
    ['Ano Retrasado', (d) => d.startsWith(String(ano - 2))], ['Ano Anterior', (d) => d.startsWith(String(ano - 1))], ['Ano Atual', (d) => d.startsWith(String(ano))],
    ['Ult. 6 Mês', (d) => d >= menos(6) && d <= dia], ['Ult. 3 Mês', (d) => d >= menos(3) && d <= dia], ['Ult. 30 Dias', (d) => d >= menos(0, 30) && d <= dia],
    ['Mês Atual', (d) => d.startsWith(dia.slice(0, 7))],
  ];
  const soma = (lista: typeof movs, f: (d: string) => boolean) => lista.filter((m) => f(m.data)).reduce((t, m) => t + m.quantidade, 0);
  const texto = (rotulo: string, valor: string) => <div className="fc-propria-linha texto"><b>{rotulo}:</b><span>{valor}</span></div>;
  return (
    <div className="fc-propria indicadores-produto">
      <SeletorEmpresa valor={empresa} onChange={setEmpresa} />
      <div className="fc-secao">Última Compra</div>
      {!ultima ? <p className="muted">Nenhuma compra encontrada.</p> : <>
        {texto('Fornecedor', ultima.pessoa)}{texto('Data', data(ultima.data))}{texto('NF', ultima.origem.replace(/^Nota /, ''))}
        {texto('Preço', (ultima.custoUnitario ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 }))}
      </>}
      <div className="fc-secao">Quadro Estatístico Compras/Vendas</div>
      <table className="grade compacta quadro-indicadores">
        <thead><tr><th />{periodos.map(([rotulo]) => <th key={rotulo} className="num">{rotulo}</th>)}</tr></thead>
        <tbody>
          {([['COMPRAS', compras], ['VENDAS', vendas]] as const).map(([linha, lista]) => (
            <tr key={linha}><td><b>{linha}</b></td>{periodos.map(([rotulo, f]) => <td key={rotulo} className="num">{moeda(soma(lista, f))}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Componentes/Formulações: a fórmula padrão da peça e onde o produto entra como componente
function AbaFormulacoes({ produto }: { produto: ProdutoExemplo | null }) {
  const componentes = produto?.componentes ?? [];
  const usado = produto ? usadoEm(produto.codigo) : [];
  return (
    <div className="fc-propria">
      <div className="formulacoes-produto">
        <div className="botoes-direita">{desligado('Nova Formulação', <AddCircleOutlineIcon />)}</div>
        <table className="grade compacta">
          <thead><tr><th className="num">Código</th><th>Descrição</th><th>Padrão</th><th>Observação</th></tr></thead>
          <tbody>
            {componentes.length ? <tr><td className="num">1</td><td>Padrão</td><td>Sim</td><td /></tr>
              : <tr><td colSpan={4} className="vazio">Nenhuma formulação.</td></tr>}
          </tbody>
        </table>
      </div>
      {componentes.length > 0 && <>
        <div className="fc-secao">Componentes: Padrão</div>
        <table className="grade compacta">
          <thead><tr><th className="num">Código</th><th>Componente</th><th className="num">Quantidade</th><th>UN</th><th className="num">Perda %</th></tr></thead>
          <tbody>
            {componentes.map(([codigo, quantidade]) => {
              const c = produtoExemplo(codigo);
              return <tr key={codigo}><td className="num">{codigo}</td><td>{c?.descricao}</td><td className="num">{num(quantidade)}</td><td>{c?.unidade}</td><td className="num" /></tr>;
            })}
          </tbody>
        </table>
      </>}
      <div className="fc-secao">Usado em (formulações em que este produto entra como componente)</div>
      <table className="grade compacta">
        <thead><tr><th className="num">Código</th><th>Produto</th><th className="num">Quantidade</th></tr></thead>
        <tbody>
          {usado.map(([p, quantidade]) => (
            <tr key={p.codigo}><td className="num">{p.codigo}</td><td><Link className="linha-link" to={`/erp/produtos/${p.codigo}`}>{p.descricao}</Link></td><td className="num">{num(quantidade)}</td></tr>
          ))}
          {!usado.length && <tr><td colSpan={3} className="vazio">Nenhuma formulação usa este produto.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Ficha({ produto: p }: { produto: ProdutoExemplo | null }) {
  const navigate = useNavigate();
  const [aba, setAba] = useState(ABAS[0][0]);
  const [mensagem, setMensagem] = useState('');
  const valores = valoresDe(p);
  const iniciais: Record<string, string[][] | undefined> = p ? {
    fornecedores: p.fornecedor ? [[p.fornecedor]] : [],
    codigosBarras: p.codigoBarras ? [[p.codigoBarras, 'GTIN (Sefaz)']] : [],
    icms: [[nomeEmpresa(1), REGIOES[0], '00', '', '100', '17', '', '', '']],
  } : {};
  const listaInicial = (l: Lista) => (l.inicial ? iniciais[l.inicial] : undefined);
  const proprias: Record<string, ReactNode> = {
    Preços: <AbaPrecos produto={p} />,
    Estoques: <AbaEstoques produto={p} />,
    Indicadores: <AbaIndicadores produto={p} />,
    'Componentes/Formulações': <AbaFormulacoes produto={p} />,
  };

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_ESTOQUES}</div>
      {p && <div className="ficha-titulo">{p.codigo} - {p.descricao}</div>}
      <div className="abas" role="tablist" aria-label="Abas do cadastro">
        {ABAS.map(([nome]) => (
          <button key={nome} type="button" role="tab" aria-selected={aba === nome} className={`aba${aba === nome ? ' ativa' : ''}`} onClick={() => setAba(nome)}>{nome}</button>
        ))}
      </div>
      <form className={`ficha-cad negrito${aba === 'Detalhes' ? ' tres' : ''}`} onSubmit={(e) => { e.preventDefault(); setMensagem('Demonstração: nada foi gravado.'); }}>
        {/* Todas as abas ficam montadas (só escondidas), para o que foi digitado não sumir ao trocar de aba. */}
        {ABAS.map(([nome, itens]) => (
          <div key={nome} className="fc-aba" hidden={aba !== nome} role="tabpanel">
            {nome === 'Principal' && (
              <div className="fc-linha">
                <div className="fc-rotulo">Código:</div>
                <div className="fc-controle largo">
                  <input className="campo" style={{ width: 363, maxWidth: '100%', flex: 'none' }} aria-label="Código" value={p ? String(p.codigo) : ''} readOnly />
                  <label className="opcao"><input type="checkbox" defaultChecked={p?.ativo ?? true} /> Ativo</label>
                </div>
              </div>
            )}
            {montar(itens, undefined, nome === 'Detalhes' ? 3 : 2).map((linha, n) => (ehLista(linha)
              ? <ListaFicha key={linha.lista} lista={linha} inicial={listaInicial(linha)} />
              : <LinhaFicha key={linha[0][0].rotulo + n} linha={linha} valores={valores} especiais={{}} />))}
            {proprias[nome]}
          </div>
        ))}
        {mensagem && <div className="mensagem">{mensagem}</div>}
        <div className="botoes">
          <button className="btn primario" type="submit">Gravar</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/produtos/novo')}>Novo</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/produtos')}>Consultar</button>
          {p && <button className="btn" type="button" onClick={() => setMensagem('Demonstração: no ERP, Copiar abre um produto novo com os dados deste.')}>Copiar</button>}
        </div>
      </form>
    </div>
  );
}

export default function ErpProdutoFichaPage() {
  const { codigo = '' } = useParams();
  const navigate = useNavigate();
  const produto = codigo === 'novo' ? null : produtoExemplo(Number(codigo)) ?? null;
  if (codigo !== 'novo' && !produto) {
    return (
      <div className="erp-elevor">
        <div className="mensagem">Produto não encontrado.</div>
        <div className="botoes"><button className="btn" type="button" onClick={() => navigate('/erp/produtos')}>Consultar</button></div>
      </div>
    );
  }
  // key: trocar de produto recomeça a ficha.
  return <Ficha key={codigo} produto={produto} />;
}
