// Estoques do ERP (2026-11-24): telas de demonstração, sem gravação. Produtos, movimentos (Kardex), saldos e contagens
// abaixo são exemplos para ver as telas funcionando; os dados reais virão do Elevor, pela API, e a gravação, em coleções
// `erp-`, chega quando a persistência for ligada. Telas e regras copiadas do ERP do Samuel (RL_Estoques, RL_Kardex,
// CL_Volumes e CD_Volumes do Elevor). The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export const AVISO_ESTOQUES = 'Demonstração: produtos, saldos e movimentos são exemplos e nada é gravado. Os dados reais virão do Elevor.';

export const EMPRESAS = [
  { id: 1, nome: 'LEDUR ENGENHARIA E CONSTRUCOES' },
  { id: 2, nome: 'ARTEBASE CONSTRUTORA' },
];
export const nomeEmpresa = (id: number) => EMPRESAS.find((e) => e.id === id)?.nome ?? '';
export const TIPOS_ESTOQUE: Record<number, string> = { 1: 'Próprio', 2: 'Fábrica', 3: 'Retirado' };
export type TipoProduto = 'peca' | 'insumo' | 'uso_consumo' | 'servico' | 'outro';
export const TIPOS_PRODUTO: Record<TipoProduto, string> = { peca: 'Peça', insumo: 'Insumo', uso_consumo: 'Uso e consumo', servico: 'Serviço', outro: 'Outro' };
// Motivos de acerto de estoque (Cadastros > Motivos), os do ERP do Samuel.
export const MOTIVOS_ACERTO = ['Inventário / contagem', 'Perda ou quebra', 'Correção de lançamento'];

// Formatos do ERP: quantidade com até 4 casas, valor com 2, data dd/mm/aaaa (as datas ficam em texto AAAA-MM-DD, sem fuso).
const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
const fmtMoeda = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (v: number | undefined) => (v === undefined ? '' : fmtNum.format(v));
export const moeda = (v: number | undefined) => (v === undefined ? '' : fmtMoeda.format(v));
export const data = (v: string | undefined) => (v ? v.split('-').reverse().join('/') : '');
/** "1.234,5" ou "-12,5" digitado → número; vazio ou inválido → undefined. */
export const lerNumero = (t: string) => {
  const n = Number(t.trim().replace(/\./g, '').replace(',', '.'));
  return t.trim() && Number.isFinite(n) ? n : undefined;
};
export const hoje = () => new Date().toLocaleDateString('sv-SE');
/** Largura fixa do campo, como as medidas do Elevor (sem passar da tela). */
export const largura = (px: number) => ({ width: px, maxWidth: '100%', flex: 'none' as const });

export type ProdutoExemplo = {
  codigo: number;
  descricao: string;
  reduzida: string;
  referencia: string;
  /** MP matéria-prima, PA produto acabado, UC uso e consumo. */
  categoria: string;
  grupo: string;
  marca: string;
  similaridade: string;
  unidade: string;
  unidadeCompra: string;
  quantidadeCompra: number;
  ncm: string;
  tipo: TipoProduto;
  ativo: boolean;
  /** Custo do cadastro (R$ por unidade). */
  custo: number;
  pesoBruto?: number;
  pesoLiquido?: number;
  fornecedor: string;
  /** Peças: a fórmula padrão, [código do insumo, quantidade por peça] (filtro "Componente" e aba Componentes/Formulações). */
  componentes?: Array<[number, number]>;
  /** Peças: medidas (m) e aço (kg), da aba Detalhes. */
  medidas?: { largura: number; altura: number; comprimento: number; acoFrouxo: number; acoProtendido: number };
  codigoBarras?: string;
  minimo?: number;
  maximo?: number;
  aEntregar?: number;
  aReceber?: number;
  emProducao?: number;
  /** Só para gerar os movimentos de exemplo: tamanho do estoque e ritmo das saídas (1 = normal). */
  base: number;
  ritmo: number;
  empresas: number[];
};

const AREIAL = 'Areia e Brita Modelo Ltda';
const CONCRETO = 'Concreto Teste S.A.';
const FERRAGENS = 'Ferragens Fictícia ME';
const JOAO = 'João Modelo de Souza';
const CLIENTES = ['Construtora Exemplo Ltda', 'Condomínio Residencial Exemplo', 'Maria Exemplo da Silva'];

const INSUMOS = 'Insumos de concreto';
const ACO = 'Aço';
const PECAS = 'Peças pré-moldadas';
const LEDUR_E_ARTEBASE = [1, 2];

export const PRODUTOS_EXEMPLO: ProdutoExemplo[] = [
  { codigo: 1001, descricao: 'CIMENTO CP V ARI', reduzida: 'CIMENTO CPV', referencia: 'CPV-ARI', categoria: 'MP', grupo: INSUMOS, marca: 'DIVERSAS', similaridade: '',
    unidade: 'KG', unidadeCompra: 'SC', quantidadeCompra: 50, ncm: '25232910', tipo: 'insumo', ativo: true, custo: 0.85, pesoBruto: 1, pesoLiquido: 1,
    fornecedor: CONCRETO, codigoBarras: '7890000000017', minimo: 12000, maximo: 60000, aReceber: 20000, base: 30000, ritmo: 1, empresas: LEDUR_E_ARTEBASE },
  { codigo: 1002, descricao: 'AREIA MÉDIA LAVADA', reduzida: 'AREIA MÉDIA', referencia: 'AR-MED', categoria: 'MP', grupo: INSUMOS, marca: 'DIVERSAS', similaridade: '',
    unidade: 'M3', unidadeCompra: 'M3', quantidadeCompra: 1, ncm: '25059000', tipo: 'insumo', ativo: true, custo: 120, fornecedor: AREIAL,
    minimo: 32, maximo: 160, base: 80, ritmo: 1.2, empresas: LEDUR_E_ARTEBASE },
  { codigo: 1003, descricao: 'BRITA 1', reduzida: 'BRITA 1', referencia: 'BR-1', categoria: 'MP', grupo: INSUMOS, marca: 'DIVERSAS', similaridade: '',
    unidade: 'M3', unidadeCompra: 'M3', quantidadeCompra: 1, ncm: '25171000', tipo: 'insumo', ativo: true, custo: 140, fornecedor: AREIAL,
    minimo: 40, maximo: 200, base: 100, ritmo: 1, empresas: LEDUR_E_ARTEBASE },
  { codigo: 1004, descricao: 'ADITIVO SUPERPLASTIFICANTE', reduzida: 'ADITIVO SP', referencia: 'AD-SP', categoria: 'MP', grupo: INSUMOS, marca: 'DIVERSAS', similaridade: '',
    unidade: 'L', unidadeCompra: 'L', quantidadeCompra: 1, ncm: '38244000', tipo: 'insumo', ativo: true, custo: 9.8, fornecedor: CONCRETO,
    minimo: 600, maximo: 3000, aReceber: 1000, base: 1500, ritmo: 1.6, empresas: [1] },
  { codigo: 1005, descricao: 'DESMOLDANTE PARA FÔRMAS', reduzida: 'DESMOLDANTE', referencia: 'DSM-20', categoria: 'MP', grupo: INSUMOS, marca: 'DIVERSAS', similaridade: '',
    unidade: 'L', unidadeCompra: 'BD', quantidadeCompra: 20, ncm: '34031900', tipo: 'insumo', ativo: true, custo: 6.4, fornecedor: CONCRETO,
    minimo: 200, maximo: 1000, base: 500, ritmo: 0.2, empresas: [1] },
  { codigo: 1010, descricao: 'AÇO CA-50 10MM', reduzida: 'CA-50 10MM', referencia: 'CA50-10', categoria: 'MP', grupo: ACO, marca: 'DIVERSAS', similaridade: 'AÇO CA',
    unidade: 'KG', unidadeCompra: 'BR', quantidadeCompra: 7.4, ncm: '72142000', tipo: 'insumo', ativo: true, custo: 7.9, pesoBruto: 1, pesoLiquido: 1,
    fornecedor: FERRAGENS, minimo: 4000, maximo: 20000, aReceber: 3000, base: 10000, ritmo: 1, empresas: LEDUR_E_ARTEBASE },
  { codigo: 1011, descricao: 'AÇO CA-60 5MM', reduzida: 'CA-60 5MM', referencia: 'CA60-5', categoria: 'MP', grupo: ACO, marca: 'DIVERSAS', similaridade: 'AÇO CA',
    unidade: 'KG', unidadeCompra: 'RL', quantidadeCompra: 170, ncm: '72171090', tipo: 'insumo', ativo: true, custo: 8.3, pesoBruto: 1, pesoLiquido: 1,
    fornecedor: FERRAGENS, minimo: 1600, maximo: 8000, base: 4000, ritmo: 1.2, empresas: [1] },
  { codigo: 1012, descricao: 'CORDOALHA CP-190 12,7MM', reduzida: 'CORDOALHA 12,7', referencia: 'CP190-127', categoria: 'MP', grupo: ACO, marca: 'DIVERSAS', similaridade: '',
    unidade: 'KG', unidadeCompra: 'KG', quantidadeCompra: 1, ncm: '73121090', tipo: 'insumo', ativo: true, custo: 11.5, pesoBruto: 1, pesoLiquido: 1,
    fornecedor: FERRAGENS, minimo: 2000, maximo: 10000, base: 5000, ritmo: 1, empresas: [1] },
  { codigo: 1013, descricao: 'ARAME RECOZIDO 18', reduzida: 'ARAME 18', referencia: 'AR-18', categoria: 'UC', grupo: ACO, marca: 'DIVERSAS', similaridade: '',
    unidade: 'KG', unidadeCompra: 'KG', quantidadeCompra: 1, ncm: '72171090', tipo: 'uso_consumo', ativo: true, custo: 14.2, fornecedor: FERRAGENS,
    minimo: 100, maximo: 500, base: 250, ritmo: 1, empresas: [1] },
  { codigo: 2001, descricao: 'PILAR 30X30 - 6M', reduzida: 'PILAR 30X30', referencia: 'P3030-6', categoria: 'PA', grupo: PECAS, marca: 'LEDUR', similaridade: 'PILARES',
    unidade: 'UN', unidadeCompra: 'UN', quantidadeCompra: 1, ncm: '68109100', tipo: 'peca', ativo: true, custo: 1850, pesoBruto: 1350, pesoLiquido: 1350,
    fornecedor: '', componentes: [[1001, 380], [1002, 0.45], [1003, 0.65], [1010, 60]],
    medidas: { largura: 0.3, altura: 0.3, comprimento: 6, acoFrouxo: 60, acoProtendido: 0 }, aEntregar: 8, emProducao: 6, base: 20, ritmo: 1.2, empresas: [1] },
  { codigo: 2002, descricao: 'VIGA PROTENDIDA 20X50 - 8M', reduzida: 'VIGA 20X50', referencia: 'V2050-8', categoria: 'PA', grupo: PECAS, marca: 'LEDUR', similaridade: 'VIGAS',
    unidade: 'UN', unidadeCompra: 'UN', quantidadeCompra: 1, ncm: '68109100', tipo: 'peca', ativo: true, custo: 3400, pesoBruto: 2000, pesoLiquido: 2000,
    fornecedor: '', componentes: [[1001, 420], [1002, 0.5], [1003, 0.7], [1010, 40], [1012, 45]],
    medidas: { largura: 0.2, altura: 0.5, comprimento: 8, acoFrouxo: 40, acoProtendido: 45 }, aEntregar: 4, emProducao: 2, base: 12, ritmo: 1.9, empresas: [1] },
  { codigo: 2003, descricao: 'LAJE ALVEOLAR LA20 - 1,25X10M', reduzida: 'LAJE LA20', referencia: 'LA20-10', categoria: 'PA', grupo: PECAS, marca: 'LEDUR', similaridade: 'LAJES',
    unidade: 'UN', unidadeCompra: 'UN', quantidadeCompra: 1, ncm: '68109100', tipo: 'peca', ativo: true, custo: 3950, pesoBruto: 3300, pesoLiquido: 3300,
    fornecedor: '', componentes: [[1001, 420], [1002, 0.6], [1003, 0.9], [1012, 55]],
    medidas: { largura: 1.25, altura: 0.2, comprimento: 10, acoFrouxo: 0, acoProtendido: 55 }, aEntregar: 12, emProducao: 10, base: 30, ritmo: 1, empresas: [1] },
  { codigo: 3001, descricao: 'DISCO DE CORTE 7"', reduzida: 'DISCO CORTE 7', referencia: 'DC-7', categoria: 'UC', grupo: 'Ferramentas e consumíveis', marca: 'DIVERSAS', similaridade: '',
    unidade: 'UN', unidadeCompra: 'CX', quantidadeCompra: 10, ncm: '68042211', tipo: 'uso_consumo', ativo: true, custo: 18.5, fornecedor: FERRAGENS,
    minimo: 20, maximo: 100, base: 50, ritmo: 1, empresas: LEDUR_E_ARTEBASE },
  { codigo: 3002, descricao: 'LUVA DE RASPA', reduzida: 'LUVA RASPA', referencia: 'EPI-LR', categoria: 'UC', grupo: 'EPI', marca: 'DIVERSAS', similaridade: '',
    unidade: 'PR', unidadeCompra: 'PR', quantidadeCompra: 1, ncm: '42032900', tipo: 'uso_consumo', ativo: true, custo: 12.9, fornecedor: JOAO,
    minimo: 24, maximo: 120, base: 60, ritmo: 1, empresas: LEDUR_E_ARTEBASE },
  { codigo: 3003, descricao: 'ÓLEO HIDRÁULICO 68', reduzida: 'ÓLEO HIDR. 68', referencia: 'OH-68', categoria: 'UC', grupo: 'Lubrificantes', marca: 'DIVERSAS', similaridade: '',
    unidade: 'L', unidadeCompra: 'BD', quantidadeCompra: 20, ncm: '27101932', tipo: 'uso_consumo', ativo: true, custo: 16.7, fornecedor: JOAO,
    minimo: 80, maximo: 400, base: 200, ritmo: 1.2, empresas: [1] },
  { codigo: 3004, descricao: 'FILTRO DE ÓLEO DO MOTOR', reduzida: 'FILTRO ÓLEO', referencia: 'FO-MOT', categoria: 'UC', grupo: 'Peças de manutenção', marca: 'DIVERSAS', similaridade: '',
    unidade: 'UN', unidadeCompra: 'UN', quantidadeCompra: 1, ncm: '84212300', tipo: 'uso_consumo', ativo: true, custo: 48, fornecedor: JOAO,
    minimo: 10, maximo: 60, base: 24, ritmo: 0, empresas: [1] },
  { codigo: 3005, descricao: 'LONA PLÁSTICA PRETA 4M', reduzida: 'LONA PRETA 4M', referencia: 'LN-4', categoria: 'UC', grupo: 'Ferramentas e consumíveis', marca: 'DIVERSAS', similaridade: '',
    unidade: 'M', unidadeCompra: 'RL', quantidadeCompra: 100, ncm: '39201099', tipo: 'uso_consumo', ativo: false, custo: 4.6, fornecedor: JOAO,
    base: 100, ritmo: 0, empresas: [1] },
];
export const produtoExemplo = (codigo: number) => PRODUTOS_EXEMPLO.find((p) => p.codigo === codigo);
/** Formulações em que o produto entra como componente: [peça, quantidade por peça]. */
export const usadoEm = (codigo: number) => PRODUTOS_EXEMPLO.flatMap((p) => (p.componentes ?? []).filter(([c]) => c === codigo).map(([, q]) => [p, q] as const));

// Tabelas de preço de exemplo: o preço de cada produto é o custo do cadastro mais o percentual da tabela.
export const TABELAS_PRECO = [{ codigo: 1, descricao: 'TABELA OBRAS', percentual: 35 }, { codigo: 2, descricao: 'TABELA BALCÃO', percentual: 50 }];
export const precoNaTabela = (p: ProdutoExemplo, tabela: number) => {
  const t = TABELAS_PRECO.find((x) => x.codigo === tabela);
  return t ? Math.round(p.custo * (1 + t.percentual / 100) * 100) / 100 : undefined;
};
// Dados fiscais de exemplo, por tipo de produto (no ERP vêm do cadastro).
export const CATEGORIAS_FISCAIS = ['DIFERIDO', 'ISENTO', 'OUTROS', 'ST', 'TRIBUTADO'];
export const ORIGENS = ['0 - Nacional, exceto as indicadas nos códigos 3, 4, 5 e 8', '1 - Estrangeira - Importação direta, exceto a indicada no código 6',
  '2 - Estrangeira - Adquirida no mercado interno, exceto a indicada no código 7', '3 - Nacional, conteúdo de importação superior a 40% e inferior ou igual a 70%',
  '4 - Nacional, produção conforme processos produtivos básicos', '5 - Nacional, conteúdo de importação inferior ou igual a 40%',
  '6 - Estrangeira - Importação direta, sem similar nacional (lista CAMEX) e gás natural',
  '7 - Estrangeira - Adquirida no mercado interno, sem similar nacional (lista CAMEX) e gás natural', '8 - Nacional, conteúdo de importação superior a 70%'];
export const UNIDADES = ['BD', 'BR', 'CX', 'JG', 'KG', 'L', 'M', 'M3', 'PR', 'RL', 'SC', 'TON', 'UN'];
export const GRUPOS = [...new Set(PRODUTOS_EXEMPLO.map((p) => p.grupo))].sort();
export const CATEGORIAS = [...new Set(PRODUTOS_EXEMPLO.map((p) => p.categoria))].sort();
export const MARCAS = [...new Set(PRODUTOS_EXEMPLO.map((p) => p.marca))].sort();
export const FORNECEDORES = [...new Set(PRODUTOS_EXEMPLO.map((p) => p.fornecedor).filter(Boolean))].sort();

// ---------------- movimentos (Kardex) ----------------

export type TipoMovimento = 'entrada' | 'saida' | 'acerto';
export type Movimento = {
  seq: number;
  empresa: number;
  tipoEstoque: number;
  produto: number;
  data: string;
  tipo: TipoMovimento;
  /** Entrada e saída positivas; acerto com sinal. */
  quantidade: number;
  custoUnitario?: number;
  origem: string;
  pessoa: string;
  /** Quem lançou o acerto (os outros movimentos vêm de nota, OP ou expedição). */
  usuario: string;
  saldoApos: number;
  custoMedioApos: number;
};

// Os mesmos passos para todos os produtos, na escala de cada um: implantação, compras (ou produção), consumos (ou
// expedições) e o acerto da Contagem 12. O "ritmo" acelera as saídas: abaixo do mínimo, acima do máximo e negativo.
const PASSOS: Array<{ dia: string; tipo: TipoMovimento; fator: number; custo: number }> = [
  { dia: '2026-09-30', tipo: 'acerto', fator: 0.6, custo: 0.95 },
  { dia: '2026-10-02', tipo: 'entrada', fator: 1, custo: 0.97 },
  { dia: '2026-10-09', tipo: 'saida', fator: 0.35, custo: 0 },
  { dia: '2026-10-20', tipo: 'saida', fator: 0.3, custo: 0 },
  { dia: '2026-10-28', tipo: 'entrada', fator: 0.8, custo: 1.04 },
  { dia: '2026-11-06', tipo: 'saida', fator: 0.4, custo: 0 },
  { dia: '2026-11-13', tipo: 'acerto', fator: -0.02, custo: 0 },
  { dia: '2026-11-19', tipo: 'saida', fator: 0.25, custo: 0 },
];
const CONTAGEM_ATUALIZADA = { codigo: 12, data: '2026-11-13', produtos: [1001, 1002, 1003, 1010] };
const arredonda = (v: number, unidade: string) => (['UN', 'PR'].includes(unidade) ? Math.round(v) : Math.round(v * 10) / 10);

function gerarMovimentos(): Movimento[] {
  type Bruto = Omit<Movimento, 'seq' | 'origem' | 'pessoa' | 'usuario' | 'saldoApos' | 'custoMedioApos'>;
  const brutos: Bruto[] = [];
  for (const p of PRODUTOS_EXEMPLO) {
    for (const empresa of p.empresas) {
      const escala = p.base * (empresa === 1 ? 1 : 0.5);
      for (const passo of PASSOS) {
        const quantidade = arredonda(escala * passo.fator * (passo.tipo === 'saida' ? p.ritmo : 1), p.unidade);
        if (!quantidade) continue;
        const custoUnitario = passo.custo ? Math.round(p.custo * (p.tipo === 'peca' ? 1 : passo.custo) * 10000) / 10000 : undefined;
        brutos.push({ empresa, tipoEstoque: 1, produto: p.codigo, data: passo.dia, tipo: passo.tipo, quantidade, custoUnitario });
      }
    }
  }
  brutos.sort((a, b) => a.data.localeCompare(b.data) || a.empresa - b.empresa || a.produto - b.produto);

  // Um documento por dia e empresa (e fornecedor, nas notas de compra), numerado na ordem das datas.
  const contadores: Record<string, number> = { nota: 4500, op: 1200, expedicao: 300 };
  const documentos = new Map<string, number>();
  const documento = (tipo: keyof typeof contadores, chave: string) => {
    const k = `${tipo}|${chave}`;
    if (!documentos.has(k)) documentos.set(k, ++contadores[tipo]);
    return documentos.get(k)!;
  };
  const saldos = new Map<string, { saldo: number; medio: number }>();

  return brutos.map((m, seq) => {
    const p = produtoExemplo(m.produto)!;
    const dia = `${m.data}|${m.empresa}`;
    let origem = '';
    let pessoa = '';
    if (m.tipo === 'entrada' && p.tipo === 'peca') origem = `Produção OP ${documento('op', dia)}`;
    else if (m.tipo === 'entrada') { pessoa = p.fornecedor; origem = `Nota ${documento('nota', `${dia}|${pessoa}`)}`; }
    else if (m.tipo === 'saida' && p.tipo === 'peca') {
      pessoa = CLIENTES[documento('expedicao', dia) % CLIENTES.length];
      origem = `Expedição ${documento('expedicao', dia)}`;
    } else if (m.tipo === 'saida' && p.tipo === 'insumo') origem = `Produção OP ${documento('op', dia)}`;
    else if (m.tipo === 'saida') { pessoa = CLIENTES[0]; origem = `Nota ${documento('nota', `${dia}|remessa`)} (remessa para obra)`; }
    else if (m.data === CONTAGEM_ATUALIZADA.data && m.empresa === 1 && CONTAGEM_ATUALIZADA.produtos.includes(m.produto)) origem = `Contagem ${CONTAGEM_ATUALIZADA.codigo}`;
    else origem = `Acerto: ${m.quantidade > 0 ? 'Inventário / contagem' : 'Perda ou quebra'}`;
    const usuario = m.tipo !== 'acerto' ? '' : m.quantidade > 0 ? 'FINANCEIRO' : 'ALMOXARIFADO';

    // Custo médio ponderado, recalculado só em entrada com custo; saldo negativo não entra na conta (regra do ERP).
    const chave = `${m.empresa}|${m.tipoEstoque}|${m.produto}`;
    const atual = saldos.get(chave) ?? { saldo: 0, medio: 0 };
    const delta = m.tipo === 'saida' ? -m.quantidade : m.quantidade;
    let medio = atual.medio;
    if (delta > 0 && m.custoUnitario !== undefined) {
      const antes = Math.max(atual.saldo, 0);
      medio = (antes * atual.medio + delta * m.custoUnitario) / (antes + delta);
    }
    const saldo = Math.round((atual.saldo + delta) * 10000) / 10000;
    saldos.set(chave, { saldo, medio });
    return { ...m, seq, origem, pessoa, usuario, saldoApos: saldo, custoMedioApos: medio };
  });
}

export const MOVIMENTOS: Movimento[] = gerarMovimentos();

// ---------------- saldos ----------------

export type SaldoExemplo = {
  empresa: number;
  tipoEstoque: number;
  produto: ProdutoExemplo;
  saldo: number;
  custoMedio: number;
  ultimaEntrada: string;
  ultimaSaida: string;
  ultimaCompra: string;
  valorUltimaCompra?: number;
};

export const SALDOS: SaldoExemplo[] = (() => {
  const mapa = new Map<string, SaldoExemplo>();
  for (const m of MOVIMENTOS) {
    const chave = `${m.empresa}|${m.tipoEstoque}|${m.produto}`;
    const s = mapa.get(chave) ?? { empresa: m.empresa, tipoEstoque: m.tipoEstoque, produto: produtoExemplo(m.produto)!, saldo: 0, custoMedio: 0, ultimaEntrada: '', ultimaSaida: '', ultimaCompra: '' };
    s.saldo = m.saldoApos;
    s.custoMedio = m.custoMedioApos;
    if (m.tipo === 'entrada') s.ultimaEntrada = m.data;
    if (m.tipo === 'saida') s.ultimaSaida = m.data;
    if (m.tipo === 'entrada' && m.origem.startsWith('Nota')) { s.ultimaCompra = m.data; s.valorUltimaCompra = m.custoUnitario; }
    mapa.set(chave, s);
  }
  return [...mapa.values()];
})();

/** Saldo do produto no fim do dia `ate` (sem data: o atual). */
export function saldoEm(empresa: number, tipoEstoque: number, produto: number, ate?: string) {
  let saldo = 0;
  for (const m of MOVIMENTOS) {
    if (m.empresa === empresa && m.tipoEstoque === tipoEstoque && m.produto === produto && (!ate || m.data <= ate)) saldo = m.saldoApos;
  }
  return saldo;
}
export const custoMedioAtual = (empresa: number, tipoEstoque: number, produto: number) =>
  SALDOS.find((s) => s.empresa === empresa && s.tipoEstoque === tipoEstoque && s.produto.codigo === produto)?.custoMedio;

// ---------------- contagens (CL_Volumes / CD_Volumes) ----------------

export const STATUS_CONTAGEM = ['Aberto', 'Enviado', 'Listado Divergentes', 'Estoque Atualizado'] as const;
export type StatusContagem = (typeof STATUS_CONTAGEM)[number];
export type ItemContagem = { produto: number; quantidade: number; data: string };
export type ContagemExemplo = { codigo: number; empresa: number; tipoEstoque: number; data: string; status: StatusContagem; usuario: string; itens: ItemContagem[] };
export const USUARIOS_CONTAGEM = ['ALMOXARIFADO', 'FINANCEIRO'];

// Itens contados = saldo do sistema no dia, mais a diferença encontrada.
const contados = (empresa: number, dia: string, diferencas: Array<[number, number]>): ItemContagem[] => diferencas.map(([produto, diferenca]) => ({
  produto, data: dia, quantidade: Math.round((saldoEm(empresa, 1, produto, dia) + diferenca) * 10) / 10,
}));

export const CONTAGENS_EXEMPLO: ContagemExemplo[] = [
  { codigo: 12, empresa: 1, tipoEstoque: 1, data: CONTAGEM_ATUALIZADA.data, status: 'Estoque Atualizado', usuario: 'ALMOXARIFADO',
    itens: contados(1, CONTAGEM_ATUALIZADA.data, CONTAGEM_ATUALIZADA.produtos.map((p) => [p, 0])) },
  { codigo: 14, empresa: 2, tipoEstoque: 1, data: '2026-11-18', status: 'Enviado', usuario: 'FINANCEIRO',
    itens: contados(2, '2026-11-18', [[1001, 0], [1002, -1.5], [3002, 0]]) },
  { codigo: 15, empresa: 1, tipoEstoque: 1, data: '2026-11-21', status: 'Listado Divergentes', usuario: 'FINANCEIRO',
    itens: contados(1, '2026-11-21', [[1011, -35], [1012, 0], [1013, 12], [3001, -4]]) },
  { codigo: 16, empresa: 1, tipoEstoque: 1, data: '2026-11-24', status: 'Aberto', usuario: 'ALMOXARIFADO',
    itens: contados(1, '2026-11-24', [[3002, -2], [3003, 0], [3004, -1]]) },
];
export const contagemExemplo = (codigo: string | undefined) => CONTAGENS_EXEMPLO.find((c) => String(c.codigo) === codigo) ?? null;

/** Itens da contagem com o saldo do sistema na data e a diferença (contado − sistema). */
export function divergencias(c: Pick<ContagemExemplo, 'empresa' | 'tipoEstoque' | 'data' | 'itens'>) {
  return c.itens.map((i) => {
    const sistema = saldoEm(c.empresa, c.tipoEstoque, i.produto, c.data);
    return { ...i, sistema, diferenca: Math.round((i.quantidade - sistema) * 10000) / 10000 };
  });
}
