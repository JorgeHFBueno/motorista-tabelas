import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  EntradaInvalida, StatusFora, aindaPedeNota, alteracaoComNota, conferirPdf, formatoChaveCronoLog, hashChaveCronoLog, idEmViagem, marcadosDoErro,
  nomeDoPdf, passoDoPedidoNota, pedidoParaRobo, pessoaDaChaveCronoLog, programacaoIdValido, textoDoErro,
} from '../lib/cronoLogApiDominio.js';

const CHAVE = `lgcr_${'A1b2C3d4E5'.repeat(4)}`;

test('CronoLog key: format lgcr_ + 40 and SHA-256 equal to the browser hash', () => {
  assert.equal(formatoChaveCronoLog(CHAVE), true);
  assert.equal(formatoChaveCronoLog(`encr_${'a'.repeat(40)}`), false);
  assert.equal(formatoChaveCronoLog(`lgcr_${'a'.repeat(39)}`), false);
  assert.equal(formatoChaveCronoLog(undefined), false);
  assert.equal(hashChaveCronoLog(CHAVE), createHash('sha256').update(CHAVE).digest('hex'));
});

test('CronoLog key person: not revoked, active employee who sees the Logística area (or adm2)', () => {
  const registro = { uid: 'u1', nome: 'Robô', revogada_em: null };
  const logistica = { ativo: true, nome: 'Samuel', areas: { logistica: 'ver' } };
  assert.deepEqual(pessoaDaChaveCronoLog(registro, logistica), { uid: 'u1', nome: 'Samuel', adm2: false });
  assert.deepEqual(pessoaDaChaveCronoLog(registro, { ativo: true, nome: 'Jorge', perfis: { adm2: true } }), { uid: 'u1', nome: 'Jorge', adm2: true });
  assert.equal(pessoaDaChaveCronoLog(registro, { ativo: true, areas: { engenharia: 'editar' } }), null, 'sem a área Logística');
  assert.equal(pessoaDaChaveCronoLog({ ...registro, revogada_em: '2026-11-27 10:00:00' }, logistica), null);
  assert.equal(pessoaDaChaveCronoLog(registro, { ...logistica, ativo: false }), null);
  assert.equal(pessoaDaChaveCronoLog(undefined, logistica), null);
});

test('robot steps: pedido → gerando, erro (with the reason) from pedido or gerando; nothing after the end', () => {
  assert.deepEqual(passoDoPedidoNota('pedido', { status: 'gerando' }), { status: 'gerando' });
  assert.deepEqual(passoDoPedidoNota('pedido', { status: 'erro', mensagem: ' cliente sem CNPJ ' }), { status: 'erro', mensagem: 'cliente sem CNPJ' });
  assert.deepEqual(passoDoPedidoNota('gerando', { status: 'erro', mensagem: 'ERP fora do ar' }), { status: 'erro', mensagem: 'ERP fora do ar' });
  assert.throws(() => passoDoPedidoNota('gerando', { status: 'gerando' }), StatusFora, 'outro robô já assumiu');
  for (const fim of ['concluido', 'erro', 'cancelado']) assert.throws(() => passoDoPedidoNota(fim, { status: 'erro', mensagem: 'x' }), StatusFora, fim);
  assert.throws(() => passoDoPedidoNota('pedido', undefined), EntradaInvalida);
  assert.throws(() => passoDoPedidoNota('pedido', { status: 'concluido' }), EntradaInvalida, 'concluir é mandar o PDF');
  assert.throws(() => passoDoPedidoNota('pedido', { status: 'erro' }), EntradaInvalida, 'erro sem motivo');
  assert.throws(() => passoDoPedidoNota('pedido', { status: 'gerando', mensagem: 'oi' }), EntradaInvalida);
  assert.throws(() => passoDoPedidoNota('pedido', { status: 'gerando', nota: 1 }), EntradaInvalida, 'campo desconhecido');
  assert.throws(() => passoDoPedidoNota('pedido', { status: 'erro', mensagem: 'x'.repeat(1501) }), EntradaInvalida);
  assert.equal(programacaoIdValido('AbC_12-x'), true);
  assert.equal(programacaoIdValido('../x'), false);
});

test('the row still asks for a nota: Ag. NF (id, default or old name) and no PDF', () => {
  const etiquetas = [{ id: '7', nome: 'Ag. NF' }, { id: '8', nome: 'Em viagem' }];
  assert.equal(aindaPedeNota({ status: '7' }, etiquetas), true);
  assert.equal(aindaPedeNota({ status: '2' }, undefined), true, 'id padrão sem lista salva');
  assert.equal(aindaPedeNota({ status: 'Ag. NF' }, etiquetas), true, 'linha de antes, pelo nome');
  assert.equal(aindaPedeNota({ status: '8' }, etiquetas), false, 'saiu de Ag. NF');
  assert.equal(aindaPedeNota({ status: '7', notas: [{ caminho: 'a', url: 'u' }] }, etiquetas), false, 'já tem nota');
  assert.equal(aindaPedeNota({ status: '7', nota: { caminho: 'a', url: 'u' } }, etiquetas), false, 'nota de antes');
  assert.equal(aindaPedeNota(undefined, etiquetas), false, 'excluída');
});

test('what the robot receives', () => {
  const quando = { toDate: () => new Date('2026-11-27T18:00:00Z') };
  assert.deepEqual(pedidoParaRobo('p1', { status: 'pedido', pedidoPor: { uid: 'u', nome: 'Mateus' }, pedidoEm: quando, atualizadoEm: quando }, {
    cod: 482601, item: 'Entrega de vigas', expedicao: ' 4512 ', obra: { id: 'o', nome: 'COQ - Coqueiros' }, inicio: '2026-11-30', fim: null,
  }), {
    id: 'p1', status: 'pedido', expedicao: '4512', cod: 482601, item: 'Entrega de vigas', obra: 'COQ - Coqueiros', inicio: '2026-11-30', fim: null,
    pedidoPor: 'Mateus', pedidoEm: '2026-11-27T18:00:00.000Z', atualizadoEm: '2026-11-27T18:00:00.000Z', mensagem: null,
  });
});

test('the PDF: body checked, file name from the route or the Expedição', () => {
  assert.equal(conferirPdf(Buffer.from('%PDF-1.4 x')).length, 10);
  assert.throws(() => conferirPdf(Buffer.from('<html>')), EntradaInvalida);
  assert.throws(() => conferirPdf(Buffer.alloc(0)), EntradaInvalida);
  assert.throws(() => conferirPdf({ status: 'x' }), EntradaInvalida, 'JSON no lugar do PDF');
  assert.throws(() => conferirPdf(Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(25 * 1024 * 1024)])), EntradaInvalida);
  assert.equal(nomeDoPdf('NF 1234.pdf', '4512'), 'NF 1234.pdf');
  assert.equal(nomeDoPdf('../NF 1234', '4512'), '.._NF 1234.pdf');
  assert.equal(nomeDoPdf(undefined, ' 4512 '), 'NF Expedição 4512.pdf');
  assert.equal(nomeDoPdf('', ''), 'NF Expedição sem número.pdf');
});

test('the PDF enters "notas"; the first one moves the Status to Em viagem, like the screen automation', () => {
  const nota = { caminho: 'logistica/notas/p1/1-NF.pdf', url: 'https://x', nome: 'NF.pdf', tamanho: 10 };
  const etiquetas = [{ id: '7', nome: 'Ag. NF' }, { id: '8', nome: 'Em viagem' }];
  assert.deepEqual(alteracaoComNota({ status: '7' }, nota, etiquetas), { notas: [nota], status: '8' });
  assert.deepEqual(alteracaoComNota({ status: '7' }, nota, undefined), { notas: [nota], status: '1' }, 'id padrão sem lista');
  assert.deepEqual(alteracaoComNota({ status: '7' }, nota, [{ id: '7', nome: 'Ag. NF' }]), { notas: [nota] }, 'sem a etiqueta Em viagem');
  const antes = { caminho: 'a', url: 'u', nome: 'a.pdf', tamanho: 1, antiga: true };
  assert.deepEqual(alteracaoComNota({ status: '7', notas: [antes] }, nota, etiquetas), { notas: [{ caminho: 'a', url: 'u', nome: 'a.pdf', tamanho: 1 }, nota] }, 'já tinha PDF: status fica');
  assert.deepEqual(alteracaoComNota({ status: '7', nota: antes }, nota, etiquetas), { notas: [nota] }, 'nota de antes conta como PDF');
  const dez = Array.from({ length: 10 }, (_, i) => ({ caminho: `c${i}`, url: 'u', nome: 'n', tamanho: 1 }));
  assert.throws(() => alteracaoComNota({ notas: dez }, nota, etiquetas), StatusFora);
  assert.throws(() => alteracaoComNota({ notas: dez.slice(1), nota: { caminho: 'velha', url: 'u' } }, nota, etiquetas), StatusFora);
  assert.equal(idEmViagem([{ id: '3', nome: ' em VIAGEM ' }]), '3');
});

test('the error note marks the ADMINISTRATIVO (minus the key person) and fits the 2000 characters', () => {
  assert.deepEqual(marcadosDoErro(['a', 'robo', 'b', 'a', '', 'x/y'], 'robo'), ['a', 'b']);
  assert.equal(marcadosDoErro(Array.from({ length: 30 }, (_, i) => `u${i}`), 'robo').length, 20);
  assert.deepEqual(marcadosDoErro(undefined, 'robo'), []);
  assert.equal(textoDoErro('cliente sem CNPJ', ['a', 'b']), 'Robô do ERP não gerou a nota: cliente sem CNPJ\n\n@{a} @{b}');
  assert.equal(textoDoErro('ERP fora do ar', []), 'Robô do ERP não gerou a nota: ERP fora do ar');
  const longo = textoDoErro('x'.repeat(1500), Array.from({ length: 20 }, (_, i) => `uid-bem-comprido-${i}`));
  assert.ok(longo.length <= 2000);
  assert.ok(longo.endsWith('@{uid-bem-comprido-19}'));
});
