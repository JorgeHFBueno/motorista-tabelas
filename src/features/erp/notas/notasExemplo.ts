import { EMPRESAS, MOVIMENTOS, produtoExemplo, PRODUTOS_EXEMPLO, type ProdutoExemplo } from '../estoques/estoquesExemplo';
import { PESSOAS_EXEMPLO } from '../pessoas/pessoasExemplo';
import { soDigitos, type Nfe } from './nfeXml';

// Notas do ERP em demonstração (2026-11-26): as notas de exemplo saem dos movimentos do Kardex (estoquesExemplo.ts),
// para as telas baterem: cada "Nota 45xx" de compra é uma nota de entrada do fornecedor do produto, e cada remessa para
// obra é uma nota de saída. A quantidade da nota vem na unidade de compra (saco de 50 kg = fator 50), e o valor, do custo
// do movimento. Listas de natureza, centro de custo, plano de contas, banco e tipo de documento são exemplos.
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export const AVISO_NOTAS = 'Demonstração: as notas são exemplos, saídas dos movimentos do Kardex, e nada é gravado. Os dados reais virão do Elevor.';

export type Natureza = { codigo: number; descricao: string; tipo: 'E' | 'S'; compra: boolean; venda: boolean; cfop: string };
export const NATUREZAS: Natureza[] = [
  { codigo: 1, descricao: 'COMPRA PARA INDUSTRIALIZAÇÃO', tipo: 'E', compra: true, venda: false, cfop: '1101' },
  { codigo: 2, descricao: 'COMPRA PARA USO E CONSUMO', tipo: 'E', compra: true, venda: false, cfop: '1556' },
  { codigo: 3, descricao: 'REMESSA PARA OBRA', tipo: 'S', compra: false, venda: false, cfop: '5949' },
  { codigo: 4, descricao: 'VENDA DE PRODUÇÃO DO ESTABELECIMENTO', tipo: 'S', compra: false, venda: true, cfop: '5101' },
];
export const naturezaExemplo = (codigo: number | string) => NATUREZAS.find((n) => n.codigo === Number(codigo));
export const PLANOS_CONTAS = ['2.1.01 - MATÉRIA-PRIMA', '2.1.02 - AÇO PARA ARMAÇÃO', '3.2.05 - MATERIAL DE USO E CONSUMO', '3.2.09 - FRETES SOBRE COMPRAS'];
export const CENTROS_CUSTO = ['FÁBRICA', 'ADMINISTRATIVO', 'OBRAS'];
export const BANCOS = ['CAIXA GERAL', 'CONTA MOVIMENTO 1', 'CONTA MOVIMENTO 2'];
export const TIPOS_DOCUMENTO = ['BOLETO - BOL', 'DUPLICATA - DP', 'PIX - PIX'];

export type ItemNota = {
  item: number; codigoFornecedor: string; descricao: string; ncm: string; cfop: string; unidade: string;
  quantidade: number; valorUnitario: number; valorTotal: number; aliqIcms: number; icms: number; ipi: number;
  /** Produto do ERP ligado ao item, quantas unidades do estoque vêm em 1 da nota e o custo que entrou no estoque. */
  produto: number; fator: number; custoUnitario: number;
};
export type NotaExemplo = {
  numero: number; serie: string; modelo: string; tipo: 'E' | 'S'; empresa: number; pessoa: string; pessoaCodigo: number | null;
  documento: string; cidade: string; uf: string; emissao: string; entrada: string; natureza: number; chave: string;
  itens: ItemNota[];
  totais: { produtos: number; frete: number; desconto: number; ipi: number; icms: number; icmsSt: number; total: number };
  duplicatas: Array<{ numero: string; vencimento: string; valor: number }>;
  situacao: 'lancada' | 'cancelada';
  planoContas: string; centroCusto: string; observacao: string; usuario: string;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const maisDias = (dia: string, dias: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
const pessoaPorNome = (nome: string) => PESSOAS_EXEMPLO.find((p) => p.nome === nome);
const UF_CODIGO: Record<string, string> = { RS: '43', PR: '41', SC: '42', SP: '35' };

/** Chave de acesso de 44 dígitos no formato da NF-e, com o dígito verificador (módulo 11). Fictícia, como os CNPJs. */
export function chaveNfe(uf: string, emissao: string, documento: string, serie: string, numero: number) {
  const base = `${UF_CODIGO[uf] ?? '43'}${emissao.slice(2, 4)}${emissao.slice(5, 7)}${soDigitos(documento).padStart(14, '0').slice(-14)}55`
    + `${serie.padStart(3, '0')}${String(numero).padStart(9, '0')}1${String(numero * 7919).padStart(8, '0').slice(-8)}`;
  let soma = 0;
  for (let i = base.length - 1, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) soma += Number(base[i]) * peso;
  const resto = soma % 11;
  return `${base}${resto < 2 ? 0 : 11 - resto}`;
}

/** Fator de compra do produto: quantas unidades do estoque vêm em 1 unidade da nota (saco de 50 kg = 50). */
export const fatorCompra = (p: ProdutoExemplo) => (p.unidadeCompra !== p.unidade ? p.quantidadeCompra : 1);

function gerarNotas(): NotaExemplo[] {
  const porNumero = new Map<number, NotaExemplo>();
  for (const m of MOVIMENTOS) {
    const achou = m.origem.match(/^Nota (\d+)/);
    if (!achou) continue;
    const numero = Number(achou[1]);
    const p = produtoExemplo(m.produto)!;
    const tipo = m.tipo === 'entrada' ? 'E' : 'S';
    let nota = porNumero.get(numero);
    if (!nota) {
      const pessoa = pessoaPorNome(m.pessoa);
      const uf = pessoa?.uf || 'RS';
      const natureza = tipo === 'S' ? 3 : p.tipo === 'uso_consumo' ? 2 : 1;
      nota = {
        numero, serie: '1', modelo: '55', tipo, empresa: m.empresa, pessoa: m.pessoa, pessoaCodigo: pessoa?.codigo ?? null,
        documento: pessoa?.documento ?? '', cidade: pessoa?.cidade ?? '', uf, emissao: m.data, entrada: m.data, natureza,
        chave: chaveNfe(tipo === 'S' ? 'RS' : uf, m.data, pessoa?.documento ?? '', '1', numero),
        itens: [], totais: { produtos: 0, frete: 0, desconto: 0, ipi: 0, icms: 0, icmsSt: 0, total: 0 }, duplicatas: [], situacao: 'lancada',
        planoContas: tipo === 'S' ? '' : natureza === 2 ? PLANOS_CONTAS[2] : p.grupo === 'Aço' ? PLANOS_CONTAS[1] : PLANOS_CONTAS[0],
        centroCusto: tipo === 'S' ? 'OBRAS' : 'FÁBRICA', observacao: tipo === 'S' ? 'Remessa de material para a obra.' : '', usuario: 'FINANCEIRO',
      };
      porNumero.set(numero, nota);
    }
    // Na unidade de compra quando dá conta inteira (600 sacos de 50 kg); senão, na unidade do estoque (o aço em kg).
    const fator = tipo === 'E' && Number.isInteger(r4(m.quantidade / fatorCompra(p))) ? fatorCompra(p) : 1;
    const custo = m.custoUnitario ?? m.custoMedioApos;
    const quantidade = r4(m.quantidade / fator);
    const valorUnitario = r4(custo * fator);
    const valorTotal = r2(quantidade * valorUnitario);
    const interestadual = tipo === 'E' && nota.uf !== 'RS';
    const aliqIcms = tipo === 'S' || nota.documento.length === 11 ? 0 : interestadual ? 12 : 17;
    const cfopBase = tipo === 'S' ? naturezaExemplo(nota.natureza)!.cfop : p.tipo === 'uso_consumo' ? '1556' : '1101';
    nota.itens.push({
      item: nota.itens.length + 1, codigoFornecedor: p.referencia, descricao: p.descricao, ncm: p.ncm,
      cfop: interestadual ? `2${cfopBase.slice(1)}` : cfopBase, unidade: fator !== 1 ? p.unidadeCompra : p.unidade,
      quantidade, valorUnitario, valorTotal, aliqIcms, icms: r2((valorTotal * aliqIcms) / 100), ipi: 0, produto: p.codigo, fator, custoUnitario: r4(custo),
    });
  }
  const notas = [...porNumero.values()].sort((a, b) => b.numero - a.numero);
  for (const n of notas) {
    const produtos = r2(n.itens.reduce((t, i) => t + i.valorTotal, 0));
    n.totais = { produtos, frete: 0, desconto: 0, ipi: 0, icms: r2(n.itens.reduce((t, i) => t + i.icms, 0)), icmsSt: 0, total: produtos };
    // Compras: boleto em 28 dias; acima de R$ 20 mil, em 28 e 56.
    if (n.tipo === 'E') {
      const parcelas = produtos > 20000 ? 2 : 1;
      const parte = r2(produtos / parcelas);
      n.duplicatas = Array.from({ length: parcelas }, (_, i) => ({
        numero: String(i + 1).padStart(3, '0'), vencimento: maisDias(n.emissao, 28 * (i + 1)),
        valor: i === parcelas - 1 ? r2(produtos - parte * (parcelas - 1)) : parte,
      }));
    }
  }
  return notas;
}

export const NOTAS_EXEMPLO: NotaExemplo[] = gerarNotas();
export const notaExemplo = (numero: string | number | undefined) => NOTAS_EXEMPLO.find((n) => String(n.numero) === String(numero)) ?? null;
export const nomeEmpresaNota = (n: NotaExemplo) => EMPRESAS.find((e) => e.id === n.empresa)?.nome ?? '';

const limpa = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Fornecedor do cadastro pelo CNPJ/CPF do emitente do XML (nos exemplos sem documento, pelo nome). */
export const fornecedorDoEmitente = (documento: string, nome: string) =>
  PESSOAS_EXEMPLO.find((p) => (documento && p.documento === documento) || (!p.documento && limpa(p.nome) === limpa(nome))) ?? null;

/** Produto do ERP para o item do XML: pelo código de barras ou pela descrição igual (o ERP de verdade lembra o código do fornecedor). */
export function produtoDoItem(item: { ean: string | null; descricao: string; codigo: string }): ProdutoExemplo | null {
  return PRODUTOS_EXEMPLO.find((p) => (item.ean && p.codigoBarras === item.ean) || limpa(p.descricao) === limpa(item.descricao)
    || (item.codigo && p.referencia === item.codigo)) ?? null;
}

/**
 * Nota de exemplo para a Entrada de Fornecedor ("Nota de exemplo"): uma compra nova da Concreto Teste com dois itens que
 * o ERP reconhece e um que precisa ser ligado à mão (o desmoldante vem em bombona de 20 L: fator 20).
 */
export function nfeDeExemplo(hojeIso: string): Nfe {
  const fornecedor = pessoaPorNome('Concreto Teste S.A.');
  const item = (n: number, codigo: string, descricao: string, ncm: string, unidade: string, quantidade: number, unitario: number, ean: string | null = null) => {
    const total = r2(quantidade * unitario);
    return {
      item: n, codigo, ean, descricao, ncm, cfop: '6101', unidade, quantidade, valorUnitario: unitario, valorTotal: total, desconto: 0, ipi: 0,
      icms: r2(total * 0.12), icmsSt: 0, cst: '000', baseIcms: total, aliqIcms: 12, aliqIpi: 0, baseSt: 0, aliqSt: 0, baseFcpSt: 0, aliqFcpSt: 0, fcpSt: 0,
      cstPis: '01', aliqPis: 1.65, pis: r2(total * 0.0165), cstCofins: '01', aliqCofins: 7.6, cofins: r2(total * 0.076),
    };
  };
  const itens = [
    item(1, 'CPV-ARI', 'CIMENTO CP V ARI', '25232910', 'SC', 400, 42.5, '7890000000017'),
    item(2, 'AD-SP', 'ADITIVO SUPERPLASTIFICANTE', '38244000', 'L', 300, 10.1),
    item(3, 'DSM-BB20', 'DESMOLD. P/ FORMAS BOMBONA 20L', '34031900', 'BB', 10, 132),
  ];
  const produtos = r2(itens.reduce((t, i) => t + i.valorTotal, 0));
  const numero = 98231;
  return {
    chave: chaveNfe('PR', hojeIso, fornecedor?.documento ?? '', '1', numero), numero, serie: '1', modelo: '55', emissao: hojeIso,
    natureza: 'VENDA DE MERCADORIA',
    emitente: { documento: fornecedor?.documento || '00000000000000', nome: 'CONCRETO TESTE S.A.', municipio: fornecedor?.cidade ?? 'Curitiba', uf: fornecedor?.uf ?? 'PR' },
    destinatario: { documento: null, nome: EMPRESAS[0].nome },
    itens,
    totais: { produtos, frete: 0, seguro: 0, desconto: 0, outros: 0, ipi: 0, icms: r2(itens.reduce((t, i) => t + i.icms, 0)), icmsSt: 0, total: produtos },
    duplicatas: [
      { numero: '001', vencimento: maisDias(hojeIso, 28), valor: r2(produtos / 2) },
      { numero: '002', vencimento: maisDias(hojeIso, 56), valor: r2(produtos - r2(produtos / 2)) },
    ],
    informacoes: 'Pedido do cliente 1234. Nota de exemplo da demonstração.', informacoesFisco: null,
    transporte: { modalidade: '0', documento: null, nome: 'TRANSPORTES DEMONSTRAÇÃO LTDA', placa: 'ABC1D23', uf: 'RS', volumes: 410, pesoBruto: 26200, pesoLiquido: 26000 },
    baseIcms: produtos, baseIcmsSt: 0,
    impostos: { pis: r2(itens.reduce((t, i) => t + i.pis, 0)), cofins: r2(itens.reduce((t, i) => t + i.cofins, 0)) },
  };
}
