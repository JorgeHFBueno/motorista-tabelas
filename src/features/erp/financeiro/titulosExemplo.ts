import { EMPRESAS, hoje } from '../estoques/estoquesExemplo';
import { BANCOS, CENTROS_CUSTO, NOTAS_EXEMPLO, PLANOS_CONTAS, TIPOS_DOCUMENTO } from '../notas/notasExemplo';
import { PESSOAS_EXEMPLO } from '../pessoas/pessoasExemplo';

// Contas a Pagar/Receber do ERP em demonstração (2026-11-26): os títulos de exemplo. Os a pagar saem das duplicatas das
// notas de entrada (notasExemplo.ts), para as telas baterem; há também fretes e uma manutenção avulsos, um título
// cancelado e alguns a receber de clientes. Venceu até 20/11/2026: pago no vencimento (um deles só em parte).
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export const AVISO_TITULOS = 'Demonstração: os títulos são exemplos, saídos das notas de entrada, e nada é gravado. Os dados reais virão do Elevor.';

export const SITUACOES_TITULO = ['NORMAL', 'EM NEGOCIAÇÃO', 'PROTESTADO'];
export const MEIOS_PAGAMENTO = ['BOLETO', 'PIX', 'TRANSFERÊNCIA', 'DINHEIRO'];
export const PLANOS_TITULOS = [...PLANOS_CONTAS, '3.1.04 - MANUTENÇÃO DE MÁQUINAS', '1.1.01 - VENDAS DE PRÉ-FABRICADOS'];
export const CONDICOES_PAGAMENTO = [
  { id: 1, descricao: 'À VISTA', parcelas: 1, primeira: 0, intervalo: 0 },
  { id: 2, descricao: '28 DIAS', parcelas: 1, primeira: 28, intervalo: 0 },
  { id: 3, descricao: '28/56 DIAS', parcelas: 2, primeira: 28, intervalo: 28 },
  { id: 4, descricao: '30/60/90 DIAS', parcelas: 3, primeira: 30, intervalo: 30 },
];
export { BANCOS, CENTROS_CUSTO, TIPOS_DOCUMENTO };
export const abreviatura = (tipoDocumento: string) => tipoDocumento.split(' - ')[1] ?? '';
export const bancoDaEmpresa = (empresa: number) => BANCOS[empresa] ?? BANCOS[0];

export type BaixaExemplo = { data: string; recibo: number; conta: string; valor: number; juros: number; multa: number; desconto: number; usuario: string };
export type RateioExemplo = { plano: string; centro: string; subcentro: string; valor: number };
export type TituloExemplo = {
  id: number; tipo: 'P' | 'R'; empresa: number; pessoa: string; pessoaCodigo: number | null; numero: string; sequencia: number; parcelas: number;
  tipoDocumento: string; situacao: string; emissao: string; vencimento: string; programacao: string; valor: number; saldo: number;
  historico: string; linhaDigitavel: string; banco: string; meio: string; notaNumero: number | null; rateio: RateioExemplo[]; baixas: BaixaExemplo[];
  cancelado: boolean; motivoCancelamento: string;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
export const maisDias = (dia: string, dias: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
const codigoDe = (nome: string) => PESSOAS_EXEMPLO.find((p) => p.nome === nome)?.codigo ?? null;
const PAGO_ATE = '2026-11-20';

type Base = Omit<TituloExemplo, 'id' | 'saldo' | 'baixas' | 'pessoaCodigo' | 'programacao' | 'linhaDigitavel' | 'cancelado' | 'motivoCancelamento' | 'rateio' | 'meio'>
  & { plano: string; centro: string; subcentro?: string; pago?: number; cancelado?: string };

function gerarTitulos(): TituloExemplo[] {
  const bases: Base[] = [];
  for (const n of NOTAS_EXEMPLO.filter((x) => x.tipo === 'E')) {
    n.duplicatas.forEach((d, k) => bases.push({
      tipo: 'P', empresa: n.empresa, pessoa: n.pessoa, numero: String(n.numero), sequencia: k + 1, parcelas: n.duplicatas.length, tipoDocumento: TIPOS_DOCUMENTO[0],
      situacao: 'NORMAL', emissao: n.emissao, vencimento: d.vencimento, valor: d.valor, historico: `NF ${n.numero} - ${n.pessoa}`, banco: bancoDaEmpresa(n.empresa),
      notaNumero: n.numero, plano: n.planoContas, centro: n.centroCusto,
    }));
  }
  const avulso = (b: Partial<Base> & Pick<Base, 'pessoa' | 'numero' | 'emissao' | 'vencimento' | 'valor' | 'historico' | 'plano' | 'centro'>): Base => ({
    tipo: 'P', empresa: 1, sequencia: 1, parcelas: 1, tipoDocumento: TIPOS_DOCUMENTO[0], situacao: 'NORMAL', banco: BANCOS[1], notaNumero: null, ...b,
  });
  const TRANSP = 'Transportes Demonstração Ltda';
  bases.push(
    avulso({ pessoa: TRANSP, numero: 'CTE-1182', emissao: '2026-10-05', vencimento: '2026-11-04', valor: 1850, historico: 'Frete de areia e brita (CT-e 1182)', plano: PLANOS_CONTAS[3], centro: 'FÁBRICA' }),
    avulso({ pessoa: TRANSP, numero: 'CTE-1240', emissao: '2026-11-10', vencimento: '2026-12-10', valor: 2300, historico: 'Frete de aço (CT-e 1240)', plano: PLANOS_CONTAS[3], centro: 'FÁBRICA' }),
    avulso({ pessoa: 'João Modelo de Souza', numero: 'OS-77', sequencia: 1, parcelas: 2, emissao: '2026-10-16', vencimento: '2026-11-15', valor: 1600, tipoDocumento: TIPOS_DOCUMENTO[2],
      historico: 'Manutenção da ponte rolante (1/2)', plano: PLANOS_TITULOS[4], centro: 'FÁBRICA', subcentro: 'PONTE ROLANTE 1' }),
    avulso({ pessoa: 'João Modelo de Souza', numero: 'OS-77', sequencia: 2, parcelas: 2, emissao: '2026-10-16', vencimento: '2026-12-15', valor: 1600, tipoDocumento: TIPOS_DOCUMENTO[2],
      historico: 'Manutenção da ponte rolante (2/2)', plano: PLANOS_TITULOS[4], centro: 'FÁBRICA', subcentro: 'PONTE ROLANTE 1' }),
    avulso({ pessoa: 'Areia e Brita Modelo Ltda', numero: '4502-D', emissao: '2026-10-02', vencimento: '2026-10-30', valor: 980, historico: 'Lançado em duplicidade',
      plano: PLANOS_CONTAS[0], centro: 'FÁBRICA', cancelado: 'Título lançado em duplicidade com a NF 4502.' }),
  );
  const receber = (pessoa: string, numero: string, emissao: string, vencimento: string, valor: number, obra: string): Base => ({
    tipo: 'R', empresa: 1, pessoa, numero, sequencia: 1, parcelas: 1, tipoDocumento: TIPOS_DOCUMENTO[0], situacao: 'NORMAL', emissao, vencimento, valor,
    historico: `Medição ${numero} - ${obra}`, banco: BANCOS[1], notaNumero: null, plano: PLANOS_TITULOS[5], centro: 'OBRAS', subcentro: obra,
  });
  bases.push(
    receber('Construtora Exemplo Ltda', 'MED-031', '2026-10-20', '2026-11-19', 48500, 'OBRA CENTRO'),
    receber('Construtora Exemplo Ltda', 'MED-032', '2026-11-20', '2026-12-20', 52300, 'OBRA CENTRO'),
    receber('Condomínio Residencial Exemplo', 'MED-014', '2026-11-05', '2026-11-25', 31200, 'RESIDENCIAL EXEMPLO'),
  );

  bases.sort((a, b) => a.emissao.localeCompare(b.emissao) || a.numero.localeCompare(b.numero) || a.sequencia - b.sequencia);
  // Um pagamento parcial: o maior título a pagar que vence logo depois do corte (40% pago no vencimento da véspera).
  const parcial = bases.filter((b) => b.tipo === 'P' && !b.cancelado && b.vencimento > PAGO_ATE && b.vencimento <= '2026-11-25')
    .sort((a, b) => b.valor - a.valor)[0];
  let recibo = 800;
  const baixasPorData: Array<{ base: Base; data: string; valor: number }> = [];
  for (const b of bases) {
    if (b.cancelado) continue;
    if (b.vencimento <= PAGO_ATE) baixasPorData.push({ base: b, data: b.vencimento, valor: b.valor });
    else if (b === parcial) baixasPorData.push({ base: b, data: maisDias(b.vencimento, -1), valor: r2(b.valor * 0.4) });
  }
  baixasPorData.sort((a, b) => a.data.localeCompare(b.data));
  const baixas = new Map(baixasPorData.map((x) => [x.base, {
    data: x.data, recibo: ++recibo, conta: x.base.banco, valor: x.valor, juros: 0, multa: 0, desconto: 0, usuario: 'FINANCEIRO',
  }]));

  return bases.map((b, i) => {
    const baixa = baixas.get(b);
    const { plano, centro, subcentro, cancelado, ...resto } = b;
    return {
      ...resto, id: i + 1, pessoaCodigo: codigoDe(b.pessoa), programacao: '', linhaDigitavel: '', meio: b.tipoDocumento === TIPOS_DOCUMENTO[2] ? 'PIX' : 'BOLETO',
      saldo: cancelado ? 0 : r2(b.valor - (baixa?.valor ?? 0)), baixas: baixa ? [baixa] : [],
      rateio: [{ plano, centro, subcentro: subcentro ?? '', valor: b.valor }], cancelado: Boolean(cancelado), motivoCancelamento: cancelado ?? '',
    };
  });
}

export const TITULOS_EXEMPLO: TituloExemplo[] = gerarTitulos();
export const tituloExemplo = (id: string | number | undefined) => TITULOS_EXEMPLO.find((t) => String(t.id) === String(id)) ?? null;
/** As parcelas do mesmo documento (mesmo tipo, pessoa e número). */
export const parcelasDoDocumento = (t: TituloExemplo) =>
  TITULOS_EXEMPLO.filter((x) => x.tipo === t.tipo && x.pessoa === t.pessoa && x.numero === t.numero).sort((a, b) => a.sequencia - b.sequencia);
export const titulosDaNota = (numero: number) => TITULOS_EXEMPLO.filter((t) => t.notaNumero === numero);
export const nomeEmpresa = (id: number) => EMPRESAS.find((e) => e.id === id)?.nome ?? '';
export const vencido = (t: TituloExemplo, dia = hoje()) => !t.cancelado && t.saldo > 0 && (t.programacao || t.vencimento) < dia;

export type FiltroTitulos = {
  tipo: string; abertos: string; empresa: string; pessoa: string; qualquer: string; numero: string; valorDe: string; valorAte: string;
  de: string; ate: string; periodo: string; banco: string; situacao: string; plano: string; centro: string; tipoDocumento: string;
};
export const FILTRO_TITULOS: FiltroTitulos = {
  tipo: 'P', abertos: '1', empresa: '', pessoa: '', qualquer: '', numero: '', valorDe: '', valorAte: '', de: '', ate: '', periodo: 'vencimento',
  banco: '', situacao: '', plano: '', centro: '', tipoDocumento: '',
};
const lerValor = (t: string) => (t.trim() ? Number(t.replace(/\./g, '').replace(',', '.')) : NaN);
const contem = (texto: string, busca: string) => texto.toLowerCase().includes(busca.trim().toLowerCase());

/** Os títulos da Consulta (FN_LancamentosConsulta), na ordem do vencimento. */
export function filtrarTitulos(f: FiltroTitulos): TituloExemplo[] {
  const de = lerValor(f.valorDe);
  const ate = lerValor(f.valorAte);
  const dataDe = (t: TituloExemplo) => (f.periodo === 'emissao' ? t.emissao : f.periodo === 'programacao' ? t.programacao || t.vencimento : t.vencimento);
  return TITULOS_EXEMPLO.filter((t) => (!f.tipo || t.tipo === f.tipo) && (f.abertos !== '1' || (!t.cancelado && t.saldo > 0))
    && (!f.empresa || t.empresa === Number(f.empresa)) && (!f.pessoa || t.pessoa === f.pessoa)
    && (!f.numero.trim() || t.numero.toLowerCase() === f.numero.trim().toLowerCase())
    && (!f.qualquer.trim() || contem(t.numero, f.qualquer) || contem(t.historico, f.qualquer) || contem(String(t.valor), f.qualquer.replace(',', '.')))
    && (Number.isNaN(de) || t.valor >= de) && (Number.isNaN(ate) || t.valor <= ate)
    && (!f.de || dataDe(t) >= f.de) && (!f.ate || dataDe(t) <= f.ate)
    && (!f.banco || t.banco === f.banco) && (!f.situacao || t.situacao === f.situacao) && (!f.tipoDocumento || t.tipoDocumento === f.tipoDocumento)
    && (!f.plano || t.rateio.some((r) => r.plano === f.plano)) && (!f.centro || t.rateio.some((r) => r.centro === f.centro)))
    .sort((a, b) => (a.programacao || a.vencimento).localeCompare(b.programacao || b.vencimento) || a.id - b.id);
}

/** Parcelas de um título novo pela condição de pagamento (a última leva a diferença dos centavos). */
export function parcelasDaCondicao(condicao: number, total: number, emissao: string) {
  const c = CONDICOES_PAGAMENTO.find((x) => x.id === condicao);
  if (!c || !(total > 0)) return [];
  const base = Math.floor((total / c.parcelas) * 100) / 100;
  return Array.from({ length: c.parcelas }, (_, i) => ({
    vencimento: maisDias(emissao, c.primeira + i * c.intervalo),
    valor: i === c.parcelas - 1 ? r2(total - base * (c.parcelas - 1)) : base,
  }));
}
