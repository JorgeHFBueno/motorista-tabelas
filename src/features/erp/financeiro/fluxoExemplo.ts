import { BANCOS, CENTROS_CUSTO, PLANOS_TITULOS, TITULOS_EXEMPLO } from './titulosExemplo';

// Bancos/Caixa e Fluxo de Caixa do ERP em demonstração (2026-11-27): as contas, os movimentos de exemplo de cada uma (saldo
// inicial em 30/09/2026, as baixas dos títulos com o recibo, tarifas, IOF, rendimentos e uma transferência; o saldo de um
// dia é a soma dos movimentos até a véspera) e as projeções de exemplo (FN_Projecoes do
// Elevor): o que se espera pagar ou receber sem título lançado, como folha, energia e impostos. Projeção efetivada já virou
// título e não entra mais no fluxo. The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export const SALDO_INICIAL_EM = '2026-09-30';
export const CONTAS_BANCO: Array<{ conta: string; empresa: number; tipo: 'caixa' | 'corrente'; saldoInicial: number }> = [
  { conta: BANCOS[0], empresa: 1, tipo: 'caixa', saldoInicial: 8500 },
  { conta: BANCOS[1], empresa: 1, tipo: 'corrente', saldoInicial: 520000 },
  { conta: BANCOS[2], empresa: 2, tipo: 'corrente', saldoInicial: 140000 },
];

// ---------------- movimentos do Bancos/Caixa (FN_Bancos) ----------------

export type OrigemMovimento = 'saldo_inicial' | 'baixa' | 'lancamento' | 'transferencia';
export type MovimentoBanco = {
  id: number; conta: string; data: string; valor: number; origem: OrigemMovimento; documento: string; historico: string;
  plano: string; pessoa: string; centro: string; recibo: number | null; tituloId: number | null; transferencia: number | null; conciliado: boolean;
};
export const PLANOS_BANCO = ['4.4.01 - TARIFAS BANCÁRIAS', '4.4.02 - IOF', '1.2.01 - RENDIMENTOS DE APLICAÇÃO'];
export const HISTORICOS_PADRAO = ['TARIFA BANCÁRIA', 'RENDIMENTO DE APLICAÇÃO', 'IOF', 'TRANSFERÊNCIA BANCÁRIA ENTRE BANCOS', 'SUPRIMENTO DE CAIXA'];
/** Conciliado com o extrato do banco até esta data (a Conciliação Bancária ainda não chegou ao painel). */
const CONCILIADO_ATE = '2026-10-31';

function gerarMovimentos(): MovimentoBanco[] {
  type Bruto = Omit<MovimentoBanco, 'id' | 'conciliado'>;
  const brutos: Bruto[] = [];
  const vazio = { documento: '', plano: '', pessoa: '', centro: '', recibo: null, tituloId: null, transferencia: null };
  for (const c of CONTAS_BANCO) {
    brutos.push({ ...vazio, conta: c.conta, data: SALDO_INICIAL_EM, valor: c.saldoInicial, origem: 'saldo_inicial', historico: 'SALDO INICIAL' });
  }
  for (const t of TITULOS_EXEMPLO) {
    for (const b of t.baixas) {
      brutos.push({
        ...vazio, conta: b.conta, data: b.data, valor: (t.tipo === 'R' ? 1 : -1) * Math.round((b.valor + b.juros + b.multa - b.desconto) * 100) / 100,
        origem: 'baixa', documento: `${t.numero}/${t.sequencia}`, historico: `${t.tipo === 'R' ? 'Recebimento' : 'Pagamento'} ${t.numero}/${t.sequencia}`,
        plano: t.rateio[0]?.plano ?? '', pessoa: t.pessoa, centro: t.rateio[0]?.centro ?? '', recibo: b.recibo, tituloId: t.id,
      });
    }
  }
  const lanc = (conta: string, data: string, valor: number, historico: string, plano: string, documento = '') =>
    brutos.push({ ...vazio, conta, data, valor, origem: 'lancamento', historico, plano, documento, centro: CENTROS_CUSTO[1] });
  for (const mes of ['2026-10', '2026-11']) {
    lanc(BANCOS[1], `${mes}-05`, -89.9, 'TARIFA BANCÁRIA', PLANOS_BANCO[0]);
    lanc(BANCOS[2], `${mes}-05`, -54.9, 'TARIFA BANCÁRIA', PLANOS_BANCO[0]);
    lanc(BANCOS[1], `${mes}-${mes === '2026-10' ? '31' : '25'}`, mes === '2026-10' ? 1240.55 : 1198.32, 'RENDIMENTO DE APLICAÇÃO', PLANOS_BANCO[2]);
  }
  lanc(BANCOS[1], '2026-10-14', -12.3, 'IOF', PLANOS_BANCO[1]);
  // Transferência: suprimento de caixa (sai da conta movimento, entra no caixa).
  brutos.push({ ...vazio, conta: BANCOS[1], data: '2026-11-03', valor: -2000, origem: 'transferencia', historico: 'SUPRIMENTO DE CAIXA', documento: 'TRF-0011', transferencia: 1 });
  brutos.push({ ...vazio, conta: BANCOS[0], data: '2026-11-03', valor: 2000, origem: 'transferencia', historico: 'SUPRIMENTO DE CAIXA', documento: 'TRF-0011', transferencia: 1 });
  return brutos.sort((a, b) => a.data.localeCompare(b.data) || (a.origem === 'saldo_inicial' ? -1 : 0) - (b.origem === 'saldo_inicial' ? -1 : 0) || (a.recibo ?? 0) - (b.recibo ?? 0))
    .map((m, i) => ({ ...m, id: i + 1, conciliado: m.origem !== 'saldo_inicial' && m.data <= CONCILIADO_ATE }));
}

export const MOVIMENTOS_BANCO: MovimentoBanco[] = gerarMovimentos();

/** Saldo da conta no fim do dia anterior a `dia`: a soma dos movimentos até a véspera. */
export function saldoDaConta(conta: string, dia: string) {
  return Math.round(MOVIMENTOS_BANCO.filter((m) => m.conta === conta && m.data < dia).reduce((s, m) => s + m.valor, 0) * 100) / 100;
}

export type FiltroExtrato = {
  empresa: string; conta: string; de: string; ate: string; pessoa: string; plano: string; centro: string; texto: string; historicoPadrao: string;
  valorDe: string; valorAte: string; tipo: string;
};
const valorDe = (t: string) => (t.trim() ? Number(t.replace(/\./g, '').replace(',', '.')) : NaN);

/** O extrato (Consulta Extrato do FN_Bancos): com um banco escolhido e sem filtros de Mais Opções, o saldo linha a linha. */
export function extrato(f: FiltroExtrato) {
  const de = valorDe(f.valorDe);
  const ate = valorDe(f.valorAte);
  const comSaldo = Boolean(f.conta) && !f.pessoa && !f.plano && !f.centro && !f.texto.trim() && !f.historicoPadrao && Number.isNaN(de) && Number.isNaN(ate) && f.tipo === 'ambos';
  const contas = CONTAS_BANCO.filter((c) => (!f.empresa || c.empresa === Number(f.empresa)) && (!f.conta || c.conta === f.conta)).map((c) => c.conta);
  const texto = f.texto.trim().toLowerCase();
  const movimentos = MOVIMENTOS_BANCO.filter((m) => contas.includes(m.conta) && (!f.de || m.data >= f.de) && (!f.ate || m.data <= f.ate)
    && (!f.pessoa || m.pessoa === f.pessoa) && (!f.plano || m.plano === f.plano) && (!f.centro || m.centro === f.centro)
    && (!texto || m.historico.toLowerCase().includes(texto) || m.documento.toLowerCase().includes(texto)) && (!f.historicoPadrao || m.historico === f.historicoPadrao)
    && (Number.isNaN(de) || Math.abs(m.valor) >= de) && (Number.isNaN(ate) || Math.abs(m.valor) <= ate)
    && (f.tipo === 'ambos' || (f.tipo === 'entrada' ? m.valor > 0 : m.valor < 0)));
  const saldoAnterior = comSaldo ? saldoDaConta(f.conta, f.de || '0000-00-00') : 0;
  let saldo = saldoAnterior;
  const linhas = movimentos.map((m) => { saldo = Math.round((saldo + m.valor) * 100) / 100; return { ...m, saldo }; });
  return { comSaldo, saldoAnterior, saldoFinal: saldo, total: Math.round(movimentos.reduce((s, m) => s + m.valor, 0) * 100) / 100, linhas };
}

/** Saldos (aba Saldos do FN_Bancos) no fim do dia: o saldo, o último movimento e quantos movimentos faltam conciliar. */
export function saldosEm(dia: string) {
  const amanha = new Date(Date.parse(`${dia}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return CONTAS_BANCO.map((c) => {
    const movs = MOVIMENTOS_BANCO.filter((m) => m.conta === c.conta && m.data <= dia);
    return { ...c, saldo: saldoDaConta(c.conta, amanha), ultimoMovimento: movs[movs.length - 1]?.data ?? '', aConciliar: movs.filter((m) => m.origem !== 'saldo_inicial' && !m.conciliado).length };
  });
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
