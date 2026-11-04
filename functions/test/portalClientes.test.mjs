import assert from 'node:assert/strict';
import test from 'node:test';
import { lerDocumentos, lerNovoCliente, normalizarDocumento } from '../lib/portalClientes.js';

const CNPJ = '11222333000181';
const CPF = '52998224725';

test('CNPJ/CPF is stored as digits only, with valid check digits', () => {
  assert.equal(normalizarDocumento('11.222.333/0001-81'), CNPJ);
  assert.equal(normalizarDocumento(CNPJ), CNPJ);
  assert.equal(normalizarDocumento('529.982.247-25'), CPF);
  assert.equal(normalizarDocumento('11.222.333/0001-82'), null);
  assert.equal(normalizarDocumento('529.982.247-24'), null);
  assert.equal(normalizarDocumento('111.111.111-11'), null);
  assert.equal(normalizarDocumento('00000000000000'), null);
  assert.equal(normalizarDocumento('1234567890'), null);
  assert.equal(normalizarDocumento(''), null);
  assert.equal(normalizarDocumento(52998224725), null);
  assert.equal(normalizarDocumento(null), null);
});

test('documentos: normalized, without repeats; empty or any invalid value refuses the list', () => {
  assert.deepEqual(lerDocumentos(['11.222.333/0001-81', CPF, CNPJ]), [CNPJ, CPF]);
  assert.equal(lerDocumentos([]), null);
  assert.equal(lerDocumentos(undefined), null);
  assert.equal(lerDocumentos(CNPJ), null);
  assert.equal(lerDocumentos([CNPJ, '123']), null);
});

test('new client: nome, login, password with 6+ characters and at least one CNPJ/CPF', () => {
  const ok = { nome: '  Construtora X ', email: ' Obra@Cliente.com ', password: ' segredo ', documentos: ['11.222.333/0001-81'] };
  assert.deepEqual(lerNovoCliente(ok), {
    cliente: { nome: 'Construtora X', email: 'obra@cliente.com', password: 'segredo', documentos: [CNPJ] },
  });
  assert.deepEqual(lerNovoCliente(undefined), { erro: 'missing_nome' });
  assert.deepEqual(lerNovoCliente({ ...ok, nome: '  ' }), { erro: 'missing_nome' });
  assert.deepEqual(lerNovoCliente({ ...ok, email: 'sem-arroba' }), { erro: 'missing_email' });
  assert.deepEqual(lerNovoCliente({ ...ok, password: '12345' }), { erro: 'invalid_password' });
  assert.deepEqual(lerNovoCliente({ ...ok, documentos: [] }), { erro: 'invalid_documentos' });
  assert.deepEqual(lerNovoCliente({ ...ok, documentos: ['11.222.333/0001-82'] }), { erro: 'invalid_documentos' });
});
