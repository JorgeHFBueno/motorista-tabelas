import assert from 'node:assert/strict';
import test from 'node:test';
import {
  caminhosPortal,
  centavosParaTexto,
  formatarDataIso,
  formatarDocumento,
  normalizarDocumento,
  reaisParaCentavos,
} from '../src/features/portal-cliente/portalDominio';

// Client portal, team side: CNPJ/CPF is the client link (Manuscript portal.md, "Vínculo do cliente").
test('CNPJ/CPF: só dígitos, com dígitos verificadores válidos', () => {
  assert.equal(normalizarDocumento('12.345.678/0001-95'), '12345678000195');
  assert.equal(normalizarDocumento(' 12345678000195 '), '12345678000195');
  assert.equal(normalizarDocumento('123.456.789-09'), '12345678909');
  assert.equal(normalizarDocumento('12.345.678/0001-96'), null);
  assert.equal(normalizarDocumento('111.111.111-11'), null);
  assert.equal(normalizarDocumento('00000000000000'), null);
  assert.equal(normalizarDocumento('1234'), null);
  assert.equal(normalizarDocumento(''), null);
  assert.equal(normalizarDocumento(null), null);
});

test('CNPJ/CPF formatado para leitura', () => {
  assert.equal(formatarDocumento('12345678000195'), '12.345.678/0001-95');
  assert.equal(formatarDocumento('12345678909'), '123.456.789-09');
  assert.equal(formatarDocumento('abc'), 'abc');
});

test('valores em centavos (convenção do Firestore) a partir do texto digitado', () => {
  assert.equal(reaisParaCentavos('1.234,56'), 123456);
  assert.equal(reaisParaCentavos('R$ 75.000,50'), 7500050);
  assert.equal(reaisParaCentavos('1234.5'), 123450);
  assert.equal(reaisParaCentavos('10'), 1000);
  assert.equal(reaisParaCentavos(''), null);
  assert.equal(reaisParaCentavos('abc'), null);
  assert.equal(reaisParaCentavos('1,234'), null);
  assert.equal(centavosParaTexto(123456), '1234,56');
  assert.equal(centavosParaTexto(null), '');
});

test('datas AAAA-MM-DD exibidas como DD/MM/AAAA', () => {
  assert.equal(formatarDataIso('2026-12-10'), '10/12/2026');
  assert.equal(formatarDataIso(null), '—');
  assert.equal(formatarDataIso('10/12/2026'), '—');
});

test('caminhos no Storage seguem as Storage Rules do portal', () => {
  assert.match(caminhosPortal.documento('ob1', 'd1', 'Contrato Assinado.pdf'), /^portal\/obras\/ob1\/documentos\/d1\/\d+_Contrato-Assinado\.pdf$/);
  assert.match(caminhosPortal.foto('ob1', 'f1', 'fundação.jpg'), /^portal\/obras\/ob1\/fotos\/f1\/\d+_fundacao\.jpg$/);
  assert.match(caminhosPortal.boleto('ob1', 'p1', 'b.pdf'), /^portal\/obras\/ob1\/parcelas\/p1\/boleto\/\d+_b\.pdf$/);
  assert.match(caminhosPortal.anexoAtendimento('a1', 'm1', 'x.png'), /^portal\/atendimentos\/a1\/m1\/\d+_x\.png$/);
  assert.match(caminhosPortal.imagemNoticia('n1', 'capa.png'), /^portal\/noticias\/n1\/\d+_capa\.png$/);
});
