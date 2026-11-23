import { test } from 'node:test';
import assert from 'node:assert/strict';

const d = await import('../lib/combustivelDivergenciaDominio.js');

// Aviso da divergência do montante (chamado "Conflito no Montante" do app). Só dados fictícios.
const CHAMADO = { tipo: 'Conflito no Montante', status: 'ABERTO', mntntInfrmd: 547000, montanteInicial: 546989, dfrncl: 11, motorista: 'FULANO_D.T' };

test('só o chamado "Conflito no Montante" avisa', () => {
  assert.equal(d.ehDivergencia(CHAMADO), true);
  assert.equal(d.ehDivergencia({ tipo: 'Edicao' }), false);
  assert.equal(d.ehDivergencia({}), false);
  assert.equal(d.ehDivergencia(undefined), false);
});

test('aviso: montantes em litros, diferença, motorista pelo nome e a tela do combustível', () => {
  const a = d.avisoDivergencia('ch1', CHAMADO, 'FULANO DE TAL');
  assert.equal(a.area, 'logistica');
  assert.equal(a.tipo, 'combustivel_divergencia');
  assert.equal(a.titulo, 'Divergência no montante da bomba');
  assert.equal(a.mensagem, 'Informado 54.700,0 · sistema 54.698,9 · diferença 1,1 L · FULANO DE TAL');
  assert.equal(a.rota, '/logistica/combustivel/registros');
  assert.deepEqual(a.origem, { colecao: '00-chamados', id: 'ch1' });
  assert.equal(a.lida, false);
  assert.equal('criadoEm' in a, false);
  // Sem funcionário, o login gravado no chamado; diferença negativa sai positiva; campo ausente some.
  const b = d.avisoDivergencia('ch2', { ...CHAMADO, dfrncl: -25, mntntInfrmd: undefined }, null);
  assert.equal(b.mensagem, 'sistema 54.698,9 · diferença 2,5 L · FULANO_D.T');
});

test('destinatários: todo adm2 ativo, e só ele', () => {
  const uids = d.destinatariosDivergencia([
    { id: 'a', data: { ativo: true, perfis: { adm2: true } } },
    { id: 'b', data: { ativo: false, perfis: { adm2: true } } },
    { id: 'c', data: { ativo: true, perfis: { frentista: true } } },
    { id: 'e', data: undefined },
  ]);
  assert.deepEqual(uids, ['a']);
});

test('id do aviso estável por chamado e pessoa', () => {
  assert.equal(d.idAvisoDivergencia('ch1', 'a'), d.idAvisoDivergencia('ch1', 'a'));
  assert.notEqual(d.idAvisoDivergencia('ch1', 'a'), d.idAvisoDivergencia('ch1', 'b'));
  assert.match(d.idAvisoDivergencia('ch1', 'a'), /^cdv_[0-9a-f]{28}$/);
});
