import test from 'node:test';
import assert from 'node:assert/strict';
import { despesaDasLinhas, documentoDoResultado, hojeEmBrasilia, placaDoIdentificador } from '../lib/erpVeiculos.js';

test('placa do identificador: sem hífen e sem sufixo; EXTRA não tem placa', () => {
  assert.equal(placaDoIdentificador('ILW-2A23 - MICRO'), 'ILW2A23');
  assert.equal(placaDoIdentificador('APG-6A02'), 'APG6A02');
  assert.equal(placaDoIdentificador('GERADOR 991'), null);
});

test('despesa soma só DESPESA, em centavos', () => {
  assert.equal(despesaDasLinhas([{ tipo_movimento: 'DESPESA', valor_rateio: 10.105 }, { tipo_movimento: 'despesa ', valor_rateio: '1,2' }, { tipo_movimento: 'RECEITA', valor_rateio: 99 }]), 11.31);
});

test('documento: sucesso grava linhas e despesa; falha guarda o erro e não apaga as linhas', () => {
  const ok = documentoDoResultado('APG6A02', '2026-11-02', { linhas: [{ tipo_movimento: 'DESPESA', valor_rateio: 5 }] });
  assert.equal(ok.status, 'ok'); assert.equal(ok.quantidade, 1); assert.equal(ok.despesa, 5); assert.equal(ok.dataInicial, '2025-01-01'); assert.equal(ok.erro, null);
  const erro = documentoDoResultado('APG6A02', '2026-11-02', { erro: { codigo: 'ERP_HTTP_ERROR', mensagem: 'ERP_HTTP_ERROR', detalhe: { status: 500 } } });
  assert.equal(erro.status, 'erro'); assert.equal('linhas' in erro, false); assert.deepEqual(erro.erro.detalhe, { status: 500 });
  const grande = documentoDoResultado('X', '2026-11-02', { linhas: Array.from({ length: 5000 }, () => ({ texto: 'x'.repeat(200) })) });
  assert.equal(grande.status, 'erro'); assert.equal(grande.erro.codigo, 'GRANDE_DEMAIS');
});

test('hoje em Brasília (UTC-3)', () => {
  assert.equal(hojeEmBrasilia(new Date('2026-11-02T02:30:00Z')), '2026-11-01');
  assert.equal(hojeEmBrasilia(new Date('2026-11-02T03:30:00Z')), '2026-11-02');
});
