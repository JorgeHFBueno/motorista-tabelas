import { CONTAS_BANCO, MOVIMENTOS_BANCO, PLANOS_BANCO, type MovimentoBanco } from './fluxoExemplo';
import { CENTROS_CUSTO } from './titulosExemplo';

// Conciliação Bancária do ERP em demonstração (2026-11-27): o extrato de exemplo do banco (o que veio no OFX), as
// conciliações já feitas, as regras de lançamento automático e a conta que monta a grade da FN_ConciliacaoBancaria do
// Elevor, como o ERP do Samuel (web/src/erp/financeiro/Conciliacao.tsx). O extrato espelha os movimentos das contas
// correntes, com o histórico do jeito do banco; um rendimento ainda não caiu no banco e há linhas só do banco (tarifa de
// PIX e IOF). Tudo o que se faz na tela vale só até sair dela. The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export type LinhaExtratoBanco = { id: number; conta: string; data: string; documento: string; historico: string; valor: number; fitid: string };
export type Conciliacao = { id: number; ex: number[]; mv: number[] };
export type RegraLancamento = { id: number; documento: string; texto: string; plano: string; centro: string; historico: string };
export type RegraIgnorar = { id: number; documento: string; texto: string };

export const REGRAS_LANCAMENTO: RegraLancamento[] = [
  { id: 1, documento: '', texto: 'TAR MANUT CONTA', plano: PLANOS_BANCO[0], centro: CENTROS_CUSTO[1], historico: 'TARIFA BANCÁRIA' },
  { id: 2, documento: '', texto: 'IOF', plano: PLANOS_BANCO[1], centro: CENTROS_CUSTO[1], historico: 'IOF' },
  { id: 3, documento: '', texto: 'REND APLIC AUT', plano: PLANOS_BANCO[2], centro: CENTROS_CUSTO[1], historico: 'RENDIMENTO DE APLICAÇÃO' },
];
export const REGRAS_IGNORAR: RegraIgnorar[] = [{ id: 1, documento: '', texto: 'SALDO APLIC AUT' }];

/** Contas com extrato de banco (o caixa não tem OFX). */
export const CONTAS_CONCILIACAO = CONTAS_BANCO.filter((c) => c.tipo !== 'caixa');
const SO_NO_SISTEMA = (m: MovimentoBanco) => m.origem === 'lancamento' && m.historico === 'RENDIMENTO DE APLICAÇÃO' && m.data === '2026-11-25';

function historicoDoBanco(m: MovimentoBanco) {
  if (m.origem === 'baixa') return m.valor < 0 ? `PAGTO BOLETO ${m.pessoa.toUpperCase().slice(0, 22)}` : `LIQUIDACAO COBRANCA ${m.pessoa.toUpperCase().slice(0, 18)}`;
  if (m.origem === 'transferencia') return m.valor < 0 ? 'SAQUE TRANSF CAIXA' : 'DEPOSITO';
  if (m.historico === 'TARIFA BANCÁRIA') return 'TAR MANUT CONTA';
  if (m.historico === 'RENDIMENTO DE APLICAÇÃO') return 'REND APLIC AUT';
  return m.historico;
}

function gerar() {
  const contas = new Set(CONTAS_CONCILIACAO.map((c) => c.conta));
  const extrato: LinhaExtratoBanco[] = [];
  const concs: Conciliacao[] = [];
  for (const m of MOVIMENTOS_BANCO) {
    if (m.origem === 'saldo_inicial' || !contas.has(m.conta) || SO_NO_SISTEMA(m)) continue;
    const id = extrato.length + 1;
    extrato.push({ id, conta: m.conta, data: m.data, documento: m.recibo ? String(m.recibo).padStart(6, '0') : m.documento, historico: historicoDoBanco(m), valor: m.valor, fitid: `EX${id}` });
    if (m.conciliado) concs.push({ id: concs.length + 1, ex: [id], mv: [m.id] });
  }
  // Só no banco: a tarifa do PIX (ninguém lançou) e o IOF (a regra lança).
  const soBanco = (conta: string, data: string, historico: string, valor: number) => {
    const id = extrato.length + 1;
    extrato.push({ id, conta, data, documento: '', historico, valor, fitid: `EX${id}` });
  };
  soBanco(CONTAS_CONCILIACAO[0].conta, '2026-11-18', 'TAR PIX ENVIADO', -1.5);
  soBanco(CONTAS_CONCILIACAO[0].conta, '2026-11-26', 'IOF', -3.2);
  return { extrato: extrato.sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id), concs };
}
const INICIAL = gerar();
export const EXTRATO_BANCO: LinhaExtratoBanco[] = INICIAL.extrato;
export const CONCILIACOES_INICIAIS: Conciliacao[] = INICIAL.concs;

// ---------------- a grade ----------------

export type LinhaGrade = {
  tipo: 'conc' | 'sug' | 'regra' | 'ex' | 'mv' | 'saldo';
  ex?: LinhaExtratoBanco | null; mv?: MovimentoBanco | null; cid?: number; regra?: RegraLancamento; dia?: string; saldoEx?: number; saldoMv?: number;
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const maisDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.abs(Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000));

/** Pares sugeridos (mesmo valor, até 3 dias de diferença) e linhas do banco que uma regra lança, entre o que está sem par. */
export function sugestoes(extrato: LinhaExtratoBanco[], movs: MovimentoBanco[], concs: Conciliacao[]) {
  const exConc = new Set(concs.flatMap((c) => c.ex));
  const mvConc = new Set(concs.flatMap((c) => c.mv));
  const usados = new Set<number>();
  const pares = new Map<number, MovimentoBanco>();
  const regras = new Map<number, RegraLancamento>();
  for (const x of extrato.filter((e) => !exConc.has(e.id))) {
    const m = movs.find((v) => !mvConc.has(v.id) && !usados.has(v.id) && v.conta === x.conta && Math.abs(v.valor - x.valor) < 0.005 && diasEntre(v.data, x.data) <= 3);
    if (m) { pares.set(x.id, m); usados.add(m.id); continue; }
    const regra = REGRAS_LANCAMENTO.find((r) => x.historico.toUpperCase().includes(r.texto) && (!r.documento || r.documento === x.documento));
    if (regra) regras.set(x.id, regra);
  }
  return { pares, regras };
}

/** A grade da Conciliação Detalhada: banco e sistema lado a lado, dia a dia, com o "Saldo do Dia" de cada lado. */
export function montarGrade(conta: string, de: string, ate: string, hoje: string, extratoTodo: LinhaExtratoBanco[], movsTodos: MovimentoBanco[], concs: Conciliacao[]) {
  const extrato = extratoTodo.filter((x) => x.conta === conta && x.data <= ate && x.data >= de);
  const movs = movsTodos.filter((m) => m.conta === conta && m.origem !== 'saldo_inicial' && m.data <= ate && m.data >= de);
  const saldoAnterior = r2(movsTodos.filter((m) => m.conta === conta && m.data < de).reduce((s, m) => s + m.valor, 0));
  const { pares, regras } = sugestoes(extrato, movs, concs);
  const comPar = new Set([...pares.values()].map((m) => m.id));
  const doGrupo = new Map<number, Conciliacao>();
  for (const c of concs) { for (const id of c.ex) doGrupo.set(-id, c); for (const id of c.mv) doGrupo.set(id, c); }
  const feitos = new Set<number>();
  const out: LinhaGrade[] = [];
  const grupo = (c: Conciliacao) => {
    if (feitos.has(c.id)) return;
    feitos.add(c.id);
    const ex = c.ex.map((id) => extratoTodo.find((x) => x.id === id)!).filter(Boolean);
    const mv = c.mv.map((id) => movsTodos.find((m) => m.id === id)!).filter(Boolean);
    for (let k = 0; k < Math.max(ex.length, mv.length); k++) out.push({ tipo: 'conc', ex: ex[k] ?? null, mv: mv[k] ?? null, cid: c.id });
  };
  const fim = ate < hoje ? ate : hoje;
  const dias: string[] = [];
  for (let d = de; d <= fim; d = maisDias(d, 1)) dias.push(d);
  let saldoEx = saldoAnterior;
  let saldoMv = saldoAnterior;
  for (const dia of dias) {
    for (const x of extrato.filter((e) => e.data === dia)) {
      const c = doGrupo.get(-x.id);
      if (c) grupo(c);
      else if (pares.has(x.id)) out.push({ tipo: 'sug', ex: x, mv: pares.get(x.id) });
      else if (regras.has(x.id)) out.push({ tipo: 'regra', ex: x, regra: regras.get(x.id) });
      else out.push({ tipo: 'ex', ex: x });
    }
    for (const m of movs.filter((v) => v.data === dia)) {
      const c = doGrupo.get(m.id);
      if (c) grupo(c);
      else if (!comPar.has(m.id)) out.push({ tipo: 'mv', mv: m });
    }
    saldoEx = r2(saldoEx + extrato.filter((e) => e.data === dia).reduce((s, e) => s + e.valor, 0));
    saldoMv = r2(saldoMv + movs.filter((m) => m.data === dia).reduce((s, m) => s + m.valor, 0));
    out.push({ tipo: 'saldo', dia, saldoEx, saldoMv });
  }
  return out;
}

/** Conciliação Resumida: em cada dia, ✓ (tudo conciliado), ✗ (ficou pendência) ou nada (sem movimento). */
export function situacaoDoDia(conta: string, dia: string, extrato: LinhaExtratoBanco[], movs: MovimentoBanco[], concs: Conciliacao[]): 'ok' | 'pendente' | null {
  const ex = extrato.filter((x) => x.conta === conta && x.data === dia);
  const mv = movs.filter((m) => m.conta === conta && m.data === dia && m.origem !== 'saldo_inicial');
  if (!ex.length && !mv.length) return null;
  const exConc = new Set(concs.flatMap((c) => c.ex));
  const mvConc = new Set(concs.flatMap((c) => c.mv));
  return ex.every((x) => exConc.has(x.id)) && mv.every((m) => mvConc.has(m.id)) ? 'ok' : 'pendente';
}

// ---------------- OFX ----------------

/** Lê as transações do OFX do banco (SGML ou XML): data, valor, FITID, número e histórico. O arquivo não sai do navegador. */
export function lerOfx(texto: string): Array<{ data: string; valor: number; fitid: string; documento: string; historico: string }> {
  const blocos = texto.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  if (!blocos.length) throw new Error('O arquivo não é um extrato OFX (não achei <STMTTRN>).');
  const campo = (b: string, nome: string) => (b.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'))?.[1] ?? '').trim();
  return blocos.map((b) => {
    const d = campo(b, 'DTPOSTED');
    const valor = Number(campo(b, 'TRNAMT').replace(',', '.'));
    if (!/^\d{8}/.test(d) || !Number.isFinite(valor)) throw new Error('Transação do OFX sem data ou valor.');
    return {
      data: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, valor, fitid: campo(b, 'FITID'),
      documento: campo(b, 'CHECKNUM') || campo(b, 'REFNUM'), historico: (campo(b, 'MEMO') || campo(b, 'NAME')).toUpperCase(),
    };
  });
}

/** O OFX vem em Windows-1252 nos bancos antigos e em UTF-8 nos novos: decide pelo cabeçalho do próprio arquivo. */
export async function lerArquivoOfx(arquivo: File) {
  const buf = await arquivo.arrayBuffer();
  const cabecalho = new TextDecoder('ascii').decode(buf.slice(0, 400));
  const codificacao = /CHARSET:\s*1252|ENCODING="?USASCII|windows-1252|ISO-8859-1/i.test(cabecalho) ? 'windows-1252' : 'utf-8';
  return new TextDecoder(codificacao).decode(buf);
}
