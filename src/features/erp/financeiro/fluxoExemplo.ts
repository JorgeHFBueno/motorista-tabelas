import { BANCOS, CENTROS_CUSTO, PLANOS_TITULOS, TITULOS_EXEMPLO } from './titulosExemplo';

// Fluxo de Caixa do ERP em demonstração (2026-11-27): o saldo de exemplo de cada conta em 30/09/2026 (o saldo de um dia é
// esse mais os recebimentos e menos os pagamentos das baixas até a véspera) e as projeções de exemplo (FN_Projecoes do
// Elevor): o que se espera pagar ou receber sem título lançado, como folha, energia e impostos. Projeção efetivada já virou
// título e não entra mais no fluxo. The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export const SALDO_INICIAL_EM = '2026-09-30';
export const CONTAS_BANCO: Array<{ conta: string; empresa: number; saldoInicial: number }> = [
  { conta: BANCOS[0], empresa: 1, saldoInicial: 8500 },
  { conta: BANCOS[1], empresa: 1, saldoInicial: 520000 },
  { conta: BANCOS[2], empresa: 2, saldoInicial: 140000 },
];

/** Saldo da conta no fim do dia anterior a `dia`: o inicial mais o recebido e menos o pago até a véspera. */
export function saldoDaConta(conta: string, dia: string) {
  const c = CONTAS_BANCO.find((x) => x.conta === conta);
  if (!c) return 0;
  const movimento = TITULOS_EXEMPLO.flatMap((t) => t.baixas.filter((b) => b.conta === conta && b.data < dia)
    .map((b) => (t.tipo === 'R' ? 1 : -1) * (b.valor + b.juros + b.multa - b.desconto)));
  return Math.round((c.saldoInicial + movimento.reduce((s, v) => s + v, 0)) * 100) / 100;
}

export type ProjecaoExemplo = {
  id: number; tipo: 'P' | 'R'; empresa: number; pessoa: string; numero: string; sequencia: number | null; vencimento: string; valor: number;
  plano: string; centro: string; descricao: string; efetivada: boolean;
};
const p = (id: number, tipo: 'P' | 'R', vencimento: string, valor: number, descricao: string, plano: string, extra: Partial<ProjecaoExemplo> = {}): ProjecaoExemplo => ({
  id, tipo, empresa: 1, pessoa: '', numero: '', sequencia: null, vencimento, valor, plano, centro: CENTROS_CUSTO[1], descricao, efetivada: false, ...extra,
});
const FOLHA = '4.1.01 - SALÁRIOS E ENCARGOS';
const ENERGIA = '4.2.03 - ENERGIA ELÉTRICA';
const IMPOSTOS = '4.3.01 - IMPOSTOS SOBRE VENDAS';
export const PLANOS_PROJECAO = [...PLANOS_TITULOS, FOLHA, ENERGIA, IMPOSTOS];

export const PROJECOES_EXEMPLO: ProjecaoExemplo[] = [
  p(1, 'P', '2026-11-05', 178000, 'Folha de outubro', FOLHA, { efetivada: true }),
  p(2, 'P', '2026-12-05', 182500, 'Folha de novembro', FOLHA),
  p(3, 'P', '2026-12-10', 23800, 'Energia elétrica da fábrica', ENERGIA, { centro: CENTROS_CUSTO[0] }),
  p(4, 'P', '2026-12-20', 41200, 'Impostos de novembro (DAS/ICMS)', IMPOSTOS),
  p(5, 'R', '2026-12-15', 64000, 'Medição 4 - Residencial Exemplo (prevista)', PLANOS_TITULOS[5],
    { pessoa: 'Condomínio Residencial Exemplo', numero: 'MED-015', sequencia: 1, centro: CENTROS_CUSTO[2] }),
  p(6, 'R', '2026-12-22', 38500, 'Venda de pilares - Construtora Exemplo (prevista)', PLANOS_TITULOS[5],
    { pessoa: 'Construtora Exemplo Ltda', numero: 'PED-221', sequencia: 1, centro: CENTROS_CUSTO[2] }),
  p(7, 'P', '2026-12-12', 9600, 'Manutenção preventiva das fôrmas', PLANOS_TITULOS[4], { empresa: 2, centro: CENTROS_CUSTO[0] }),
];

export type FiltroProjecoes = { empresa: string; de: string; ate: string; efetivada: string; tipo: string; pessoa: string; plano: string; centro: string; valorDe: string; valorAte: string };
export const FILTRO_PROJECOES: FiltroProjecoes = { empresa: '', de: '', ate: '', efetivada: 'nao', tipo: '', pessoa: '', plano: '', centro: '', valorDe: '', valorAte: '' };
const lerValor = (t: string) => (t.trim() ? Number(t.replace(/\./g, '').replace(',', '.')) : NaN);

/** As projeções da consulta (FN_Projecoes), pela data. */
export function filtrarProjecoes(f: FiltroProjecoes) {
  const de = lerValor(f.valorDe);
  const ate = lerValor(f.valorAte);
  return PROJECOES_EXEMPLO.filter((x) => (!f.empresa || x.empresa === Number(f.empresa)) && (!f.de || x.vencimento >= f.de) && (!f.ate || x.vencimento <= f.ate)
    && (f.efetivada === 'sim' ? x.efetivada : !x.efetivada) && (!f.tipo || x.tipo === f.tipo) && (!f.pessoa || x.pessoa === f.pessoa)
    && (!f.plano || x.plano === f.plano) && (!f.centro || x.centro === f.centro) && (Number.isNaN(de) || x.valor >= de) && (Number.isNaN(ate) || x.valor <= ate))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.id - b.id);
}
