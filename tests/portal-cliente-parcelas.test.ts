import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filtrarLixeira,
  lerArquivo,
  lerData,
  lerPessoa,
  lerStatusParcela,
  mensagemDeErro,
  proximoNumeroParcela,
  resumirParcelas,
  validarFormParcela,
  type FormParcela,
} from '../src/features/portal-cliente/contratoConteudoDominio';

// Client portal, team side: documents, photos and installments of a contract (Manuscript portal.md).
const form = (parcial: Partial<FormParcela>): FormParcela => ({
  numero: '1',
  descricao: '',
  valor: '1.234,56',
  vencimento: '2026-12-10',
  observacaoAdmin: '',
  ...parcial,
});

test('parcela: valor em centavos, vencimento AAAA-MM-DD, textos vazios como null', () => {
  assert.deepEqual(validarFormParcela(form({ numero: ' 3 ', descricao: '  Entrada ' })), {
    ok: true,
    dados: { numero: 3, descricao: 'Entrada', valor: 123456, vencimento: '2026-12-10', observacaoAdmin: null },
  });
  const resultado = validarFormParcela(form({ valor: 'R$ 10,5', observacaoAdmin: ' Pagar no Pix ' }));
  assert.ok(resultado.ok);
  assert.equal(resultado.dados.valor, 1050);
  assert.equal(Number.isInteger(resultado.dados.valor), true);
  assert.equal(resultado.dados.observacaoAdmin, 'Pagar no Pix');
});

test('parcela: recusa número, valor e vencimento inválidos', () => {
  for (const numero of ['', '0', '1.5', '-2', 'a']) assert.equal(validarFormParcela(form({ numero })).ok, false, numero);
  for (const valor of ['', '0', '0,00', 'abc', '1,234']) assert.equal(validarFormParcela(form({ valor })).ok, false, valor);
  for (const vencimento of ['', '10/12/2026', '2026-02-30', '2026-13-01']) {
    assert.equal(validarFormParcela(form({ vencimento })).ok, false, vencimento);
  }
});

const parcela = (numero: number, valor: number, status: 'pendente' | 'comprovante_enviado' | 'pago' | 'rejeitado', lixeira = false) => ({
  numero,
  valor,
  status,
  excluidoEm: lixeira ? new Date('2026-11-01T12:00:00Z') : null,
});

test('totais: valor do contrato informado, sem as parcelas da lixeira', () => {
  const parcelas = [parcela(1, 50000, 'pago'), parcela(2, 30000, 'comprovante_enviado'), parcela(3, 20000, 'pendente'), parcela(4, 99999, 'pago', true)];
  assert.deepEqual(resumirParcelas(parcelas, 120000), {
    valorContrato: 120000,
    somaParcelas: 100000,
    totalContrato: 120000,
    pago: 50000,
    emAberto: 70000,
    quantidade: 3,
    pagas: 1,
    aConferir: 1,
    diferenca: 20000,
  });
});

test('totais: sem valor do contrato vale a soma das parcelas (como o portal mostra)', () => {
  const resumo = resumirParcelas([parcela(1, 50000, 'pago'), parcela(2, 30000, 'rejeitado')], null);
  assert.equal(resumo.totalContrato, 80000);
  assert.equal(resumo.emAberto, 30000);
  assert.equal(resumo.diferenca, null);
  assert.equal(resumirParcelas([], null).emAberto, 0);
});

test('próximo número ignora a lixeira', () => {
  assert.equal(proximoNumeroParcela([]), 1);
  assert.equal(proximoNumeroParcela([parcela(1, 1, 'pago'), parcela(4, 1, 'pendente'), parcela(9, 1, 'pendente', true)]), 5);
});

test('lixeira: excluidoEm preenchido', () => {
  const itens = [{ id: 'a', excluidoEm: null }, { id: 'b', excluidoEm: new Date() }];
  assert.deepEqual(filtrarLixeira(itens, false).map((item) => item.id), ['a']);
  assert.deepEqual(filtrarLixeira(itens, true).map((item) => item.id), ['b']);
});

test('leitura tolerante dos dados gravados', () => {
  assert.deepEqual(lerArquivo({ path: 'portal/obras/o/fotos/f/1_a.jpg', nome: 'a.jpg', contentType: 'image/jpeg', bytes: 10 }), {
    path: 'portal/obras/o/fotos/f/1_a.jpg', nome: 'a.jpg', contentType: 'image/jpeg', bytes: 10,
  });
  assert.equal(lerArquivo({ url: 'https://...' }), null);
  assert.equal(lerArquivo(null), null);
  assert.deepEqual(lerPessoa({ uid: 'u1', nome: 'Ana' }), { uid: 'u1', nome: 'Ana' });
  assert.equal(lerPessoa({ nome: 'Ana' }), null);
  const data = new Date('2026-11-04T12:00:00Z');
  assert.equal(lerData({ toDate: () => data }), data);
  assert.equal(lerData('2026-11-04'), null);
  assert.equal(lerStatusParcela('pago'), 'pago');
  assert.equal(lerStatusParcela('aprovado'), 'pendente');
});

test('mensagem de erro: as nossas aparecem, as do Firebase ganham o texto padrão', () => {
  assert.equal(mensagemDeErro(new Error('O arquivo passa do limite de 10 MB.'), 'padrão'), 'O arquivo passa do limite de 10 MB.');
  assert.equal(mensagemDeErro(Object.assign(new Error('Firebase: x'), { code: 'permission-denied' }), 'padrão'), 'padrão');
  assert.equal(mensagemDeErro('x', 'padrão'), 'padrão');
});
