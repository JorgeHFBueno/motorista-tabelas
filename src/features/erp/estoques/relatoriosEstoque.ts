import {
  CATEGORIAS, EMPRESAS, FORNECEDORES, GRUPOS, hoje, MARCAS, MOVIMENTOS, precoNaTabela, PRODUTOS_EXEMPLO, produtoExemplo, SALDOS, TIPOS_ESTOQUE,
  TIPOS_PRODUTO, type Movimento, type ProdutoExemplo,
} from './estoquesExemplo';

// Relatórios de Estoques do ERP (2026-11-25): as definições do ERP do Samuel (server/src/erp/relatorios/estoque.ts, telas
// RL_AcertoEstoque, RL_GiroEstoque, RL_ProdutosSemGiro e RL_CurvaABC do Elevor, e a Posição de Estoque dele) com os
// mesmos filtros, na ordem e nas larguras do Elevor, e as mesmas colunas. A conta, que lá é SQL, aqui roda sobre os
// dados de exemplo. Filtro sem dado na demonstração aparece desligado, como no ERP.
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export type Valores = Record<string, string>;
export type FiltroRel = {
  nome: string;
  rotulo: string;
  tipo: 'empresa' | 'tipoEstoque' | 'grupo' | 'categoria' | 'marca' | 'produto' | 'fornecedor' | 'pessoa' | 'tipoProduto' | 'data' | 'opcoes'
    | 'caixa' | 'texto' | 'inteiro';
  opcoes?: Array<{ valor: string; rotulo: string }>;
  /** 'hoje', 'inicio_mes', 'fim_mes', 'inicio_ano' ou o valor. */
  padrao?: string;
  /** Sem "Todos" nas opções. */
  obrigatorio?: true;
  largura?: number;
  /** Filtro que vai na mesma linha (a data final ao lado da inicial). */
  par?: string;
  /** Escondido em "Mais Opções", como no Elevor. */
  mais?: true;
  desabilitado?: true;
  ajuda?: string;
};
export type ColunaRel = {
  nome: string;
  rotulo: string;
  tipo?: 'texto' | 'moeda' | 'decimal' | 'inteiro' | 'data' | 'percentual';
  total?: true;
  link?: (l: LinhaRel) => string;
  soSe?: (f: Valores) => boolean;
};
export type LinhaRel = Record<string, string | number | null>;
export type RelatorioDef = {
  id: string;
  titulo: string;
  elevor: string;
  ajuda: string;
  filtros: FiltroRel[];
  colunas: ColunaRel[];
  /** Coluna que agrupa as linhas, com subtotal. */
  quebra?: string;
  gerar: (f: Valores) => LinhaRel[];
};

const SEM_DADO = 'Na demonstração não há esse dado; o filtro não é usado.';
const EMPRESA: FiltroRel = { nome: 'empresa', rotulo: 'Empresa', tipo: 'empresa', largura: 448 };
const TIPO_ESTOQUE: FiltroRel = { nome: 'tipoEstoque', rotulo: 'Tipo Estoque', tipo: 'tipoEstoque', padrao: '1', obrigatorio: true, largura: 104 };
const GRUPO: FiltroRel = { nome: 'grupo', rotulo: 'Grupo', tipo: 'grupo', largura: 448 };
const CATEGORIA: FiltroRel = { nome: 'categoria', rotulo: 'Categoria', tipo: 'categoria', largura: 128 };
const MARCA: FiltroRel = { nome: 'marca', rotulo: 'Marca', tipo: 'marca', largura: 248 };
const PRODUTO: FiltroRel = { nome: 'produto', rotulo: 'Produto', tipo: 'produto', largura: 448 };
const FORNECEDOR: FiltroRel = { nome: 'fornecedor', rotulo: 'Fornecedor do Produto', tipo: 'fornecedor', largura: 448 };
const TIPO_PRODUTO: FiltroRel = { nome: 'tipoProduto', rotulo: 'Tipo de produto', tipo: 'tipoProduto', largura: 198 };
const PERIODO = (de = 'inicio_mes', ate = 'fim_mes'): FiltroRel[] => [
  { nome: 'de', rotulo: 'Período', tipo: 'data', padrao: de, par: 'ate' },
  { nome: 'ate', rotulo: 'a', tipo: 'data', padrao: ate },
];
const ops = (...pares: Array<[string, string]>) => pares.map(([valor, rotulo]) => ({ valor, rotulo }));

/** Valor inicial do filtro (datas relativas a hoje). */
export function padraoDoFiltro(f: FiltroRel): string {
  const dia = hoje();
  const [ano, mes] = [Number(dia.slice(0, 4)), Number(dia.slice(5, 7))];
  switch (f.padrao) {
    case 'hoje': return dia;
    case 'inicio_mes': return `${dia.slice(0, 7)}-01`;
    case 'fim_mes': return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
    case 'inicio_ano': return `${ano}-01-01`;
    default: return f.padrao ?? '';
  }
}

// Opções das listas de cada tipo de filtro.
export function opcoesDoFiltro(f: FiltroRel): Array<{ valor: string; rotulo: string }> {
  switch (f.tipo) {
    case 'empresa': return EMPRESAS.map((e) => ({ valor: String(e.id), rotulo: e.nome }));
    case 'tipoEstoque': return Object.entries(TIPOS_ESTOQUE).map(([valor, rotulo]) => ({ valor, rotulo }));
    case 'grupo': return GRUPOS.map((g) => ({ valor: g, rotulo: g }));
    case 'categoria': return CATEGORIAS.map((c) => ({ valor: c, rotulo: c }));
    case 'marca': return MARCAS.map((m) => ({ valor: m, rotulo: m }));
    case 'fornecedor': return FORNECEDORES.map((n) => ({ valor: n, rotulo: n }));
    case 'produto': return PRODUTOS_EXEMPLO.map((p) => ({ valor: String(p.codigo), rotulo: `${p.codigo} - ${p.descricao}` }));
    case 'pessoa': return [...new Set(MOVIMENTOS.map((m) => m.pessoa).filter(Boolean))].sort().map((n) => ({ valor: n, rotulo: n }));
    case 'tipoProduto': return Object.entries(TIPOS_PRODUTO).map(([valor, rotulo]) => ({ valor, rotulo }));
    default: return f.opcoes ?? [];
  }
}

// ---------------- contas comuns ----------------

const passaProduto = (p: ProdutoExemplo, f: Valores) => (!f.categoria || p.categoria === f.categoria) && (!f.grupo || p.grupo === f.grupo)
  && (!f.marca || p.marca === f.marca) && (!f.fornecedor || p.fornecedor === f.fornecedor) && (!f.produto || p.codigo === Number(f.produto))
  && (!f.tipoProduto || p.tipo === f.tipoProduto);
const noPeriodo = (d: string, f: Valores) => (!f.de || d >= f.de) && (!f.ate || d <= f.ate);
const daEmpresa = (empresa: number, f: Valores) => !f.empresa || empresa === Number(f.empresa);
const tipoEstoque = (f: Valores) => Number(f.tipoEstoque || 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const base = (p: ProdutoExemplo): LinhaRel => ({ produto_id: p.codigo, codigo: p.codigo, produto: p.descricao, unidade: p.unidade });
const motivo = (m: Movimento) => (m.origem.startsWith('Acerto: ') ? m.origem.slice(8) : 'Inventário / contagem');

/** Saldo e custo médio do produto somando as empresas do filtro (custo médio ponderado pelos saldos positivos). */
function posicao(p: ProdutoExemplo, f: Valores, ate?: string) {
  const chaves = SALDOS.filter((s) => s.produto.codigo === p.codigo && s.tipoEstoque === tipoEstoque(f) && daEmpresa(s.empresa, f));
  let saldo = 0;
  let qtdPositiva = 0;
  let valorPositivo = 0;
  let ultimoMedio: number | null = null;
  for (const s of chaves) {
    const movs = MOVIMENTOS.filter((m) => m.produto === p.codigo && m.empresa === s.empresa && m.tipoEstoque === s.tipoEstoque && (!ate || m.data <= ate));
    const ultimo = movs[movs.length - 1];
    const sal = ultimo?.saldoApos ?? 0;
    const medio = ultimo?.custoMedioApos ?? s.custoMedio;
    saldo += sal;
    ultimoMedio = medio;
    if (sal > 0) { qtdPositiva += sal; valorPositivo += sal * medio; }
  }
  return { existe: chaves.length > 0, saldo: r4(saldo), medio: qtdPositiva ? valorPositivo / qtdPositiva : ultimoMedio, saldos: chaves };
}

// ---------------- os relatórios ----------------

export const RELATORIOS_ESTOQUE: RelatorioDef[] = [
  {
    id: 'acertos', titulo: 'Relação de Acertos', elevor: 'RL_AcertoEstoque',
    ajuda: 'Acertos avulsos e ajustes de contagem lançados no período, com quem lançou e o motivo; ou os produtos com saldo que não tiveram acerto no período.',
    filtros: [{ ...EMPRESA, largura: 300 }, GRUPO, PRODUTO, ...PERIODO(), TIPO_ESTOQUE,
      { nome: 'tipo', rotulo: '', tipo: 'opcoes', padrao: 'acertos', obrigatorio: true,
        opcoes: ops(['acertos', 'Acertos de estoque no período'], ['sem_acerto', 'Produtos sem acerto no período']) }],
    colunas: [
      { nome: 'data', rotulo: 'Data', tipo: 'data', soSe: (f) => f.tipo === 'acertos' }, { nome: 'codigo', rotulo: 'Cod', tipo: 'inteiro' },
      { nome: 'produto', rotulo: 'Produto', link: (l) => `/erp/estoques/kardex?produto=${l.produto_id}` }, { nome: 'unidade', rotulo: 'UN' },
      { nome: 'quantidade', rotulo: 'Quantidade', tipo: 'decimal', soSe: (f) => f.tipo === 'acertos' },
      { nome: 'saldo', rotulo: 'Saldo', tipo: 'decimal' }, { nome: 'custo', rotulo: 'Custo', tipo: 'moeda' },
      { nome: 'valor', rotulo: 'Valor', tipo: 'moeda', total: true },
      { nome: 'origem', rotulo: 'Origem', soSe: (f) => f.tipo === 'acertos' }, { nome: 'motivo', rotulo: 'Motivo', soSe: (f) => f.tipo === 'acertos' },
      { nome: 'usuario', rotulo: 'Usuário', soSe: (f) => f.tipo === 'acertos' },
      { nome: 'ultimo_acerto', rotulo: 'Último acerto', tipo: 'data', soSe: (f) => f.tipo === 'sem_acerto' },
    ],
    gerar: (f) => {
      const acerto = (m: Movimento) => m.tipo === 'acerto' && m.tipoEstoque === tipoEstoque(f) && daEmpresa(m.empresa, f)
        && passaProduto(produtoExemplo(m.produto)!, f);
      if (f.tipo === 'sem_acerto') {
        return SALDOS.filter((s) => s.tipoEstoque === tipoEstoque(f) && daEmpresa(s.empresa, f) && s.saldo !== 0 && passaProduto(s.produto, f)
          && !MOVIMENTOS.some((m) => acerto(m) && m.empresa === s.empresa && m.produto === s.produto.codigo && noPeriodo(m.data, f)))
          .sort((a, b) => a.produto.descricao.localeCompare(b.produto.descricao, 'pt-BR'))
          .map((s) => ({
            ...base(s.produto), saldo: s.saldo, custo: s.custoMedio, valor: r2(s.saldo * s.custoMedio),
            ultimo_acerto: MOVIMENTOS.filter((m) => acerto(m) && m.empresa === s.empresa && m.produto === s.produto.codigo).map((m) => m.data).pop() ?? null,
          }));
      }
      return MOVIMENTOS.filter((m) => acerto(m) && noPeriodo(m.data, f)).map((m) => ({
        ...base(produtoExemplo(m.produto)!), data: m.data, quantidade: m.quantidade, saldo: m.saldoApos, custo: m.custoMedioApos,
        valor: r2(m.quantidade * m.custoMedioApos), origem: m.origem.startsWith('Contagem') ? m.origem : 'Acerto', motivo: motivo(m), usuario: m.usuario,
      }));
    },
  },
  {
    id: 'posicao', titulo: 'Posição de Estoque (valor)', elevor: 'RL_Estoques',
    ajuda: 'Saldo atual × custo médio, por grupo. Saldo negativo entra com valor zero.',
    filtros: [EMPRESA, { ...TIPO_ESTOQUE, largura: 198 }, GRUPO, TIPO_PRODUTO,
      { nome: 'saldo', rotulo: 'Saldo', tipo: 'opcoes', padrao: 'positivo', opcoes: ops(['positivo', 'Positivo'], ['negativo', 'Negativo'], ['zero', 'Zerado']) }],
    quebra: 'grupo',
    colunas: [
      { nome: 'grupo', rotulo: 'Grupo' }, { nome: 'codigo', rotulo: 'Cod', tipo: 'inteiro' },
      { nome: 'produto', rotulo: 'Produto', link: (l) => `/erp/produtos/${l.produto_id}` }, { nome: 'unidade', rotulo: 'UN' },
      { nome: 'saldo', rotulo: 'Saldo', tipo: 'decimal' }, { nome: 'custo_medio', rotulo: 'Custo Médio', tipo: 'moeda' },
      { nome: 'valor', rotulo: 'Valor', tipo: 'moeda', total: true }, { nome: 'ultima_entrada', rotulo: 'Últ. entrada', tipo: 'data' },
      { nome: 'ultima_saida', rotulo: 'Últ. saída', tipo: 'data' },
    ],
    gerar: (f) => PRODUTOS_EXEMPLO.filter((p) => passaProduto(p, f)).map((p) => ({ p, pos: posicao(p, f) }))
      .filter(({ pos }) => pos.existe && (f.saldo === 'positivo' ? pos.saldo > 0 : f.saldo === 'negativo' ? pos.saldo < 0 : f.saldo === 'zero' ? pos.saldo === 0 : true))
      .sort((a, b) => a.p.grupo.localeCompare(b.p.grupo, 'pt-BR') || a.p.descricao.localeCompare(b.p.descricao, 'pt-BR'))
      .map(({ p, pos }) => ({
        ...base(p), grupo: p.grupo, saldo: pos.saldo, custo_medio: pos.medio, valor: r2(Math.max(pos.saldo, 0) * (pos.medio ?? 0)),
        ultima_entrada: pos.saldos.map((s) => s.ultimaEntrada).sort().pop() || null, ultima_saida: pos.saldos.map((s) => s.ultimaSaida).sort().pop() || null,
      })),
  },
  {
    id: 'giro', titulo: 'Giro de Estoque', elevor: 'RL_GiroEstoque',
    ajuda: 'Giro Produtos: saídas do período ÷ saldo atual (giro alto = sai rápido; zero = parado). Compras/Vendas: só as entradas por nota (compras) e as saídas por expedição ou nota (vendas).',
    filtros: [EMPRESA, ...PERIODO('inicio_ano', 'hoje'), { ...CATEGORIA, largura: 448 }, GRUPO, MARCA, PRODUTO,
      { nome: 'analise', rotulo: 'Análise', tipo: 'opcoes', padrao: 'giro', obrigatorio: true, opcoes: ops(['giro', 'Giro Produtos'], ['compras_vendas', 'Compras/Vendas']) },
      { nome: 'ordem', rotulo: 'Ordem', tipo: 'opcoes', padrao: 'saidas', obrigatorio: true, opcoes: ops(['saidas', 'Quantidade Vendida'], ['giro', 'Giro']) },
      { nome: 'mostrarCategoria', rotulo: 'Mostrar Categorias', tipo: 'caixa' },
      { ...TIPO_ESTOQUE, mais: true }, { ...TIPO_PRODUTO, mais: true }],
    colunas: [
      { nome: 'codigo', rotulo: 'Cod', tipo: 'inteiro' }, { nome: 'produto', rotulo: 'Produto', link: (l) => `/erp/estoques/kardex?produto=${l.produto_id}` },
      { nome: 'categoria', rotulo: 'Categoria', soSe: (f) => f.mostrarCategoria === 'true' },
      { nome: 'unidade', rotulo: 'UN' }, { nome: 'entradas', rotulo: 'Entradas', tipo: 'decimal', total: true },
      { nome: 'saidas', rotulo: 'Saídas', tipo: 'decimal', total: true }, { nome: 'saldo', rotulo: 'Saldo atual', tipo: 'decimal' },
      { nome: 'giro', rotulo: 'Giro', tipo: 'decimal' },
    ],
    gerar: (f) => {
      const conta = (m: Movimento) => m.tipo !== 'acerto' && (f.analise !== 'compras_vendas'
        || (m.tipo === 'entrada' && m.origem.startsWith('Nota')) || (m.tipo === 'saida' && (m.origem.startsWith('Expedição') || m.origem.startsWith('Nota'))));
      return PRODUTOS_EXEMPLO.filter((p) => passaProduto(p, f)).map((p) => {
        const movs = MOVIMENTOS.filter((m) => m.produto === p.codigo && m.tipoEstoque === tipoEstoque(f) && daEmpresa(m.empresa, f) && noPeriodo(m.data, f) && conta(m));
        const entradas = r4(movs.filter((m) => m.tipo === 'entrada').reduce((t, m) => t + m.quantidade, 0));
        const saidas = r4(movs.filter((m) => m.tipo === 'saida').reduce((t, m) => t + m.quantidade, 0));
        const saldo = posicao(p, f).saldo;
        return { movs: movs.length, linha: { ...base(p), categoria: p.categoria, entradas, saidas, saldo, giro: saldo > 0 ? r2(saidas / saldo) : null } as LinhaRel };
      }).filter((x) => x.movs > 0).map((x) => x.linha)
        .sort((a, b) => (f.ordem === 'giro' ? Number(b.giro ?? -1) - Number(a.giro ?? -1) : Number(b.saidas) - Number(a.saidas)));
    },
  },
  {
    id: 'sem-giro', titulo: 'Relatório de Produtos sem Giro', elevor: 'RL_ProdutosSemGiro',
    ajuda: 'Sem Giro: produtos que não tiveram nenhuma saída no período (capital parado). Com Giro: os que tiveram. Data Final Período: saldo e custo como estavam no fim do período.',
    filtros: [EMPRESA, CATEGORIA, GRUPO, MARCA, FORNECEDOR, PRODUTO, ...PERIODO('inicio_ano', 'hoje'),
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'opcoes', padrao: 'sem', obrigatorio: true, opcoes: ops(['sem', 'Sem Giro'], ['com', 'Com Giro'], ['todos', 'Todos']) },
      { nome: 'posicao', rotulo: 'Data Posição Estoque/Custos', tipo: 'opcoes', padrao: 'atual', obrigatorio: true, opcoes: ops(['atual', 'Data Atual'], ['final', 'Data Final Período']) },
      { nome: 'estoque', rotulo: 'Estoque', tipo: 'opcoes', padrao: 'positivo', obrigatorio: true, opcoes: ops(['positivo', 'Positivo'], ['todos', 'Todos']) },
      { ...TIPO_ESTOQUE, mais: true }, { ...TIPO_PRODUTO, mais: true }],
    colunas: [
      { nome: 'codigo', rotulo: 'Cod', tipo: 'inteiro' }, { nome: 'produto', rotulo: 'Produto', link: (l) => `/erp/estoques/kardex?produto=${l.produto_id}` },
      { nome: 'unidade', rotulo: 'UN' }, { nome: 'saldo', rotulo: 'Saldo', tipo: 'decimal' }, { nome: 'custo_medio', rotulo: 'Custo Médio', tipo: 'moeda' },
      { nome: 'valor', rotulo: 'Valor', tipo: 'moeda', total: true }, { nome: 'saidas', rotulo: 'Saídas no período', tipo: 'decimal', total: true },
      { nome: 'ultima_saida', rotulo: 'Última saída', tipo: 'data' },
    ],
    gerar: (f) => PRODUTOS_EXEMPLO.filter((p) => passaProduto(p, f)).map((p) => {
      const pos = posicao(p, f, f.posicao === 'final' ? f.ate : undefined);
      const saidas = MOVIMENTOS.filter((m) => m.produto === p.codigo && m.tipo === 'saida' && m.tipoEstoque === tipoEstoque(f) && daEmpresa(m.empresa, f));
      const noPer = r4(saidas.filter((m) => noPeriodo(m.data, f)).reduce((t, m) => t + m.quantidade, 0));
      return { p, pos, noPer, ultima: saidas.map((m) => m.data).pop() ?? null };
    }).filter(({ pos, noPer }) => pos.existe && (f.tipo === 'sem' ? noPer === 0 : f.tipo === 'com' ? noPer > 0 : true) && (f.estoque !== 'positivo' || pos.saldo > 0))
      .sort((a, b) => a.p.descricao.localeCompare(b.p.descricao, 'pt-BR'))
      .map(({ p, pos, noPer, ultima }) => ({
        ...base(p), saldo: pos.saldo, custo_medio: pos.medio, valor: r2(pos.saldo * (pos.medio ?? 0)), saidas: noPer, ultima_saida: ultima,
      })),
  },
  {
    id: 'curva-abc', titulo: 'Relatório de Curva ABC', elevor: 'RL_CurvaABC',
    ajuda: 'Vendas = expedições do período, pelo preço da TABELA OBRAS (até os pedidos e as notas de saída entrarem); Compras = notas de entrada. A = o que soma 80% do valor, B = os 15% seguintes, C = o resto. Resultados limita a quantidade de linhas.',
    filtros: [EMPRESA, ...PERIODO('inicio_ano', 'hoje'),
      { nome: 'pessoa', rotulo: 'Cliente/Fornecedor', tipo: 'pessoa', largura: 448 },
      { nome: 'tipoPessoa', rotulo: 'Tipo Pessoa', tipo: 'opcoes', opcoes: ops(['ambos', 'Ambos'], ['F', 'Física'], ['J', 'Jurídica']), padrao: 'ambos', obrigatorio: true, largura: 100, desabilitado: true, ajuda: SEM_DADO },
      { nome: 'atividade', rotulo: 'Atividade Cliente', tipo: 'texto', largura: 84, desabilitado: true, ajuda: SEM_DADO },
      { nome: 'atividadeFiscal', rotulo: 'Atividade Fiscal Cliente', tipo: 'texto', largura: 163, desabilitado: true, ajuda: SEM_DADO },
      { nome: 'categoriaCliente', rotulo: 'Categoria Cliente', tipo: 'texto', largura: 448, desabilitado: true, ajuda: SEM_DADO },
      { nome: 'regiao', rotulo: 'Região', tipo: 'texto', largura: 448, desabilitado: true, ajuda: SEM_DADO },
      { ...FORNECEDOR, rotulo: 'Fornecedor do Prod' },
      { nome: 'vendedor', rotulo: 'Vendedor', tipo: 'texto', largura: 448, desabilitado: true, ajuda: SEM_DADO },
      { nome: 'gerente', rotulo: 'Gerente', tipo: 'texto', largura: 448, desabilitado: true, ajuda: 'O ERP ainda não guarda o gerente do vendedor; este filtro não é usado.' },
      { ...CATEGORIA, rotulo: 'Categoria Produto' }, GRUPO, MARCA, PRODUTO,
      { nome: 'similaridade', rotulo: 'Grupo Similaridade', tipo: 'texto', largura: 464 },
      { nome: 'resultados', rotulo: 'Resultados', tipo: 'inteiro', largura: 59 },
      { nome: 'dados', rotulo: 'Dados', tipo: 'opcoes', padrao: 'vendas', obrigatorio: true, opcoes: ops(['vendas', 'Vendas'], ['compras', 'Compras']) },
      { nome: 'analise', rotulo: 'Análise', tipo: 'opcoes', padrao: 'produto', obrigatorio: true,
        opcoes: ops(['cliente', 'Cliente'], ['produto', 'Produto'], ['similaridade', 'Grupo Similaridade'], ['grupoEconomico', 'Grupo Econômico'], ['grupo', 'Grupo de Produtos']) },
    ],
    colunas: [
      { nome: 'classe', rotulo: 'Classe' }, { nome: 'nome', rotulo: 'Cliente / Produto / Grupo' }, { nome: 'quantidade', rotulo: 'Quantidade', tipo: 'decimal' },
      { nome: 'valor', rotulo: 'Valor', tipo: 'moeda', total: true }, { nome: 'percentual', rotulo: '% do total', tipo: 'percentual' },
      { nome: 'acumulado', rotulo: '% acumulado', tipo: 'percentual' },
    ],
    gerar: (f) => {
      const compras = f.dados === 'compras';
      const movs = MOVIMENTOS.filter((m) => (compras ? m.tipo === 'entrada' && m.origem.startsWith('Nota') : m.tipo === 'saida' && m.origem.startsWith('Expedição'))
        && daEmpresa(m.empresa, f) && noPeriodo(m.data, f) && (!f.pessoa || m.pessoa === f.pessoa)).filter((m) => {
        const p = produtoExemplo(m.produto)!;
        return passaProduto(p, f) && (!f.similaridade?.trim() || p.similaridade.toLowerCase().includes(f.similaridade.trim().toLowerCase()));
      });
      const chave = (m: Movimento) => {
        const p = produtoExemplo(m.produto)!;
        if (f.analise === 'cliente') return m.pessoa || '(sem cliente)';
        if (f.analise === 'grupo') return p.grupo || '(sem grupo)';
        if (f.analise === 'similaridade') return p.similaridade || '(sem grupo de similaridade)';
        if (f.analise === 'grupoEconomico') return '(sem grupo econômico)';
        return `${p.codigo} - ${p.descricao}`;
      };
      const grupos = new Map<string, { quantidade: number; valor: number }>();
      for (const m of movs) {
        const p = produtoExemplo(m.produto)!;
        const valor = m.quantidade * (compras ? m.custoUnitario ?? 0 : precoNaTabela(p, 1) ?? 0);
        const g = grupos.get(chave(m)) ?? { quantidade: 0, valor: 0 };
        grupos.set(chave(m), { quantidade: g.quantidade + m.quantidade, valor: g.valor + valor });
      }
      const total = [...grupos.values()].reduce((t, g) => t + g.valor, 0);
      let acumulado = 0;
      const linhas = [...grupos.entries()].sort((a, b) => b[1].valor - a[1].valor).map(([nome, g]) => {
        const antes = acumulado;
        const percentual = total ? (g.valor / total) * 100 : 0;
        acumulado += percentual;
        return { classe: antes < 80 ? 'A' : antes < 95 ? 'B' : 'C', nome, quantidade: r4(g.quantidade), valor: r2(g.valor), percentual: r2(percentual), acumulado: r2(acumulado) };
      });
      const limite = Number(f.resultados);
      return limite > 0 ? linhas.slice(0, limite) : linhas;
    },
  },
];

export const relatorioEstoque = (id: string | undefined) => RELATORIOS_ESTOQUE.find((r) => r.id === id) ?? null;
