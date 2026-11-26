import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FILTRO_TITULOS, filtrarTitulos, parcelasDaCondicao, parcelasDoDocumento, TITULOS_EXEMPLO, titulosDaNota, vencido,
} from '../src/features/erp/financeiro/titulosExemplo';
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
