import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FILTRO_TITULOS, filtrarTitulos, parcelasDaCondicao, parcelasDoDocumento, TITULOS_EXEMPLO, titulosDaNota, vencido,
} from '../src/features/erp/financeiro/titulosExemplo';
import { relatorioFinanceiro } from '../src/features/erp/financeiro/relatoriosFinanceiro';
import { NOTAS_EXEMPLO } from '../src/features/erp/notas/notasExemplo';

// Contas a Pagar/Receber do ERP em demonstração (The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp).

test('every purchase note duplicate is a título a pagar with the same value', () => {
  for (const n of NOTAS_EXEMPLO.filter((x) => x.tipo === 'E')) {
    const titulos = titulosDaNota(n.numero);
    assert.equal(titulos.length, n.duplicatas.length, `nota ${n.numero}`);
    titulos.forEach((t, k) => {
      assert.equal(t.tipo, 'P');
      assert.equal(t.valor, n.duplicatas[k].valor);
      assert.equal(t.vencimento, n.duplicatas[k].vencimento);
      assert.equal(t.parcelas, n.duplicatas.length);
    });
  }
});

test('saldo = valor minus payments; cancelled has no saldo; one partial payment', () => {
  for (const t of TITULOS_EXEMPLO) {
    const pago = t.baixas.reduce((s, b) => s + b.valor, 0);
    if (t.cancelado) assert.equal(t.saldo, 0);
    else assert.ok(Math.abs(t.saldo - (t.valor - pago)) < 0.005, `título ${t.id}`);
    if (t.vencimento <= '2026-11-20' && !t.cancelado) assert.equal(t.saldo, 0, `vencido até 20/11 está pago: ${t.id}`);
  }
  assert.equal(TITULOS_EXEMPLO.filter((t) => t.saldo > 0 && t.baixas.length).length, 1);
  assert.equal(TITULOS_EXEMPLO.filter((t) => t.cancelado).length, 1);
  const recibos = TITULOS_EXEMPLO.flatMap((t) => t.baixas.map((b) => b.recibo));
  assert.equal(new Set(recibos).size, recibos.length);
});

test('Consulta: a pagar em aberto by default; receber, ambos and geral', () => {
  const padrao = filtrarTitulos(FILTRO_TITULOS);
  assert.ok(padrao.length > 0);
  assert.ok(padrao.every((t) => t.tipo === 'P' && t.saldo > 0 && !t.cancelado));
  assert.ok(filtrarTitulos({ ...FILTRO_TITULOS, tipo: 'R' }).every((t) => t.tipo === 'R'));
  const geral = filtrarTitulos({ ...FILTRO_TITULOS, tipo: '', abertos: '0' });
  assert.equal(geral.length, TITULOS_EXEMPLO.length);
  assert.deepEqual(filtrarTitulos({ ...FILTRO_TITULOS, abertos: '0', numero: 'os-77' }).map((t) => t.sequencia), [1, 2]);
  assert.ok(filtrarTitulos({ ...FILTRO_TITULOS, abertos: '0', valorDe: '2.000', valorAte: '3.000' }).every((t) => t.valor >= 2000 && t.valor <= 3000));
  const os = TITULOS_EXEMPLO.find((t) => t.numero === 'OS-77')!;
  assert.equal(parcelasDoDocumento(os).length, 2);
  assert.equal(vencido({ ...os, saldo: 10, vencimento: '2026-11-01', programacao: '' }, '2026-11-26'), true);
  assert.equal(vencido({ ...os, saldo: 0, vencimento: '2026-11-01', programacao: '' }, '2026-11-26'), false);
});

test('parcelas by payment condition; the last one takes the cents', () => {
  assert.deepEqual(parcelasDaCondicao(4, 1000, '2026-11-26'), [
    { vencimento: '2026-12-26', valor: 333.33 }, { vencimento: '2027-01-25', valor: 333.33 }, { vencimento: '2027-02-24', valor: 333.34 },
  ]);
  assert.deepEqual(parcelasDaCondicao(1, 50, '2026-11-26'), [{ vencimento: '2026-11-26', valor: 50 }]);
  assert.deepEqual(parcelasDaCondicao(3, 0, '2026-11-26'), []);
});

const BASE = { empresa: '', tipo: 'P', periodo: 'vencimento', de: '2026-01-01', ate: '2026-12-31', titulos: 'abertos', pessoa: '', uf: '', cidade: '',
  situacao: '', banco: '', taxa: '', multa: '', descAntec: '', descPont: '', baseJuros: '2026-11-27', basePosicao: '', plano: '', centro: '', numero: '' };

test('Relatórios de Contas a Pagar/Receber: by client, summary, monthly and totals add up', () => {
  const def = relatorioFinanceiro('contas-pagar-receber')!;
  const abertos = TITULOS_EXEMPLO.filter((t) => t.tipo === 'P' && !t.cancelado && t.saldo > 0);
  const soma = (l: Array<Record<string, unknown>>, k: string) => Math.round(l.reduce((s, x) => s + Number(x[k]), 0) * 100) / 100;
  const cliente = def.gerar({ ...BASE, analise: 'cliente' });
  assert.equal(cliente.length, abertos.length);
  assert.equal(soma(cliente, 'saldo'), Math.round(abertos.reduce((s, t) => s + t.saldo, 0) * 100) / 100);
  for (const analise of ['sintetica', 'mensal', 'totais']) {
    const l = def.gerar({ ...BASE, analise });
    assert.equal(soma(l, 'qtde'), abertos.length, analise);
    assert.equal(soma(l, 'saldo'), soma(cliente, 'saldo'), analise);
  }
  assert.deepEqual(def.gerar({ ...BASE, analise: 'totais' }).map((l) => l.resumo), ['A vencer', 'Vencidos']);
  assert.equal(typeof def.quebra === 'function' && def.quebra({ ...BASE, analise: 'cliente' }), 'grupo');
  // Correção: 2% ao mês de juros e 2% de multa sobre o vencido; nada no que vence depois da data base.
  const corrigido = def.gerar({ ...BASE, analise: 'cliente', taxa: '2', multa: '2' });
  for (const l of corrigido) {
    if (String(l.vencimento) < '2026-11-27') assert.ok(Number(l.juros) > 0 && Number(l.multa) > 0);
    else assert.equal(Number(l.juros) + Number(l.multa), 0);
  }
  // Posição em 20/11: o título pago em parte em 24/11 ainda estava inteiro.
  const parcial = TITULOS_EXEMPLO.find((t) => t.saldo > 0 && t.baixas.length)!;
  const naPosicao = def.gerar({ ...BASE, analise: 'cliente', basePosicao: '2026-11-20' }).find((l) => l.id === parcial.id)!;
  assert.equal(naPosicao.saldo, parcial.valor);
});

test('Pagamentos e Recebimentos do Período: one line per payment, grouped by account', () => {
  const def = relatorioFinanceiro('pagamentos-recebimentos')!;
  const baixas = TITULOS_EXEMPLO.filter((t) => t.tipo === 'P').flatMap((t) => t.baixas);
  const l = def.gerar({ empresa: '', tipo: 'P', de: '2026-01-01', ate: '2026-12-31', conta: '', pessoa: '', quebra: 'conta' });
  assert.equal(l.length, baixas.length);
  assert.ok(l.every((x) => typeof x.grupo === 'string' && String(x.grupo).startsWith('CONTA MOVIMENTO') && typeof x.recibo === 'number'));
  assert.equal(Math.round(l.reduce((s, x) => s + Number(x.pago), 0) * 100) / 100, Math.round(baixas.reduce((s, b) => s + b.valor, 0) * 100) / 100);
  assert.ok(def.gerar({ empresa: '', tipo: 'R', de: '', ate: '', conta: '', pessoa: '', quebra: 'dia' }).length > 0);
});
