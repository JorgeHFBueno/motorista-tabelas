import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  celularDe, classificarItens, colunasDaPessoa, cpfDe, createImportarFridayService, lerLigacao, lerPedido, novoFuncionario, senhaDoCpf,
} from '../lib/funcionariosImportarFriday.js';

// CPFs válidos de teste (dígitos verificadores certos), nenhum de pessoa real conhecida.
const CPF_A = '52998224725';
const CPF_B = '11144477735';
const COLUNAS = { telefone: { id: 1, tipo: 'telefone' }, cpf: { id: 2, tipo: 'texto' } };
const item = (id, nome, tel, cpf, extra = {}) => ({ id, nome, item_pai_id: null, arquivado_em: null, excluido_em: null, valores: { 1: tel, 2: cpf }, ...extra });
const func = (uid, nome, extra = {}) => ({ uid, nome, ativo: true, email: null, fridayItemId: null, ...extra });

test('colunas: Telefone/Celular pelo título (ou a primeira de telefone) e CPF pelo título', () => {
  assert.deepEqual(colunasDaPessoa([{ id: 1, titulo: 'Telefone', tipo: 'texto' }, { id: 2, titulo: ' cpf ', tipo: 'numero' }]),
    { telefone: { id: 1, titulo: 'Telefone', tipo: 'texto' }, cpf: { id: 2, titulo: ' cpf ', tipo: 'numero' } });
  assert.equal(colunasDaPessoa([{ id: 3, titulo: 'Contato', tipo: 'telefone' }]).telefone?.id, 3);
  assert.equal(colunasDaPessoa([{ id: 4, titulo: 'CELULAR', tipo: 'texto' }, { id: 3, titulo: 'Fixo', tipo: 'telefone' }]).telefone?.id, 4);
  assert.deepEqual(colunasDaPessoa([{ id: 5, titulo: 'Nome', tipo: 'texto' }]), { telefone: null, cpf: null });
});

test('celular: só dígitos, com DDD; o 55 do país sai', () => {
  assert.equal(celularDe('(51) 99166-2971'), '51991662971');
  assert.equal(celularDe('+55 51 99166-2971'), '51991662971');
  assert.equal(celularDe('5133334444'), '5133334444');
  assert.equal(celularDe('99166-2971'), null);
  assert.equal(celularDe(''), null);
  assert.equal(celularDe(null), null);
});

test('CPF: 11 dígitos com verificadores certos; número perde zeros da frente, que voltam', () => {
  assert.equal(cpfDe('529.982.247-25'), CPF_A);
  assert.equal(cpfDe('529.982.247-26'), null);
  assert.equal(cpfDe('111.111.111-11'), null);
  assert.equal(cpfDe('1234'), null);
  assert.equal(cpfDe(1234567890), '01234567890'); // coluna numérica: o zero da frente volta
  assert.equal(cpfDe('1234567890'), null);         // texto com 10 dígitos não é completado
  assert.equal(cpfDe(1234567891), null);
  assert.equal(senhaDoCpf(CPF_A), '529982');
});

test('situação: novo, já funcionário, ligado, incompleto e fora', () => {
  const itens = [
    item(1, ' Ana   Souza ', '(51) 99999-0001', CPF_A),
    item(2, 'Bruno Lima', '51 99999-0002', ''),             // já é funcionário pelo celular: liga mesmo sem CPF
    item(3, 'Caio Reis', '51999990003', CPF_B),              // ligado
    item(4, 'Davi Melo', '9999-0004', CPF_A),                // sem DDD
    item(5, 'Eva Nunes', '51999990005', '123'),              // CPF inválido
    item(6, 'Fabi Dias', '51999990006', CPF_A),
    item(7, 'Gil Dias', '51999990006', CPF_B),               // telefone repetido no quadro
    item(8, 'Hugo Paz', '51999990008', CPF_A),               // login de cliente
    item(9, 'Ivo Sá', '51999990009', CPF_A),                 // funcionário ligado a outro item
    item(10, 'Joana Prado', '51999990010', CPF_A),           // conta solta, sem funcionário
    item(11, 'Arquivado', '51999990011', CPF_A, { arquivado_em: '2026-11-01 10:00:00' }),
    item(12, 'Subitem', '51999990012', CPF_A, { item_pai_id: 1 }),
    item(13, 'Kátia Moura', '', ''),
  ];
  const funcionarios = [
    func('u2', 'Bruno Lima', { email: '51999990002@example.com' }),
    func('u3', 'Caio Reis', { fridayItemId: '3' }),
    func('u9', 'Ivo Sá', { fridayItemId: '99' }),
    func('ue', 'Ana Souza', { email: 'ana@ledur.com' }),     // mesmo nome com outro login: sugestão
    func('uk', 'Katia Moura'),
  ];
  const contas = new Map([['51999990002@example.com', 'u2'], ['51999990008@example.com', 'c8'], ['51999990009@example.com', 'u9'], ['51999990010@example.com', 'solta']]);
  const r = Object.fromEntries(classificarItens(itens, COLUNAS, funcionarios, contas, new Set(['c8'])).map(p => [p.id, p]));

  assert.deepEqual(Object.keys(r).sort((a, b) => a - b), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '13']);
  assert.deepEqual(r[1], { id: '1', nome: 'Ana Souza', celular: '51999990001', situacao: 'novo', uid: null, funcionario: null, motivo: null, sugestao: { uid: 'ue', nome: 'Ana Souza' }, cpf: CPF_A });
  assert.equal(r[2].situacao, 'funcionario'); assert.equal(r[2].uid, 'u2');
  assert.equal(r[3].situacao, 'vinculado'); assert.equal(r[3].uid, 'u3');
  assert.equal(r[4].situacao, 'incompleto'); assert.match(r[4].motivo, /DDD/);
  assert.equal(r[5].situacao, 'incompleto'); assert.equal(r[5].motivo, 'CPF inválido');
  assert.equal(r[6].situacao, 'fora'); assert.equal(r[7].situacao, 'fora');
  assert.equal(r[8].situacao, 'fora'); assert.match(r[8].motivo, /cliente/);
  assert.equal(r[9].situacao, 'fora'); assert.equal(r[9].uid, 'u9');
  assert.equal(r[10].situacao, 'novo'); assert.equal(r[10].uid, 'solta');
  assert.equal(r[13].situacao, 'incompleto'); assert.equal(r[13].motivo, 'sem telefone'); assert.deepEqual(r[13].sugestao, { uid: 'uk', nome: 'Katia Moura' });
});

test('pedidos: ids numéricos sem repetir; ligação pede item e funcionário', () => {
  assert.deepEqual(lerPedido({ ids: ['1', 1, 'x', '2'] }), { ids: ['1', '2'] });
  assert.ok('erro' in lerPedido({ ids: [] }));
  assert.ok('erro' in lerPedido({ ids: Array.from({ length: 101 }, (_, k) => String(k)) }));
  assert.deepEqual(lerLigacao({ itemId: '7', uid: ' u1 ' }), { itemId: '7', uid: 'u1' });
  assert.ok('erro' in lerLigacao({ itemId: '7', uid: 'a/b' }));
});

test('funcionário novo: só Motorista, login pelo celular, item ligado, sem CPF', () => {
  const doc = novoFuncionario({ nome: 'Ana Souza', celular: '51999990001', id: '1' });
  assert.equal(doc.email, '51999990001@example.com');
  assert.equal(doc.perfis.motorista, true);
  assert.ok(Object.entries(doc.perfis).every(([k, v]) => k === 'motorista' || v === false));
  assert.deepEqual(doc.motorista, { ordem: 0 });
  assert.equal(doc.fridayItemId, '1');
  assert.ok(!JSON.stringify(doc).includes(CPF_A));
});

function loja(extra = {}) {
  const log = [];
  const funcionarios = [func('u2', 'Bruno Lima', { email: '51999990002@example.com' }), func('livre', 'Outra Pessoa')];
  return {
    log,
    store: {
      async getEmployee(uid) { return { esc: { ativo: true, perfis: { escritorio: true } }, mot: { ativo: true, perfis: { motorista: true } } }[uid]; },
      async itensDoQuadro() { return [item(1, 'Ana Souza', '51999990001', CPF_A), item(2, 'Bruno Lima', '51999990002', ''), item(3, 'Caio', '51999990003', CPF_B), item(4, 'Sem tel', '', CPF_A)]; },
      async colunasDoQuadro() { return [{ id: 1, titulo: 'Telefone', tipo: 'telefone' }, { id: 2, titulo: 'CPF', tipo: 'texto' }]; },
      async funcionarios() { return funcionarios; },
      async contas() { return new Map([['51999990002@example.com', 'u2'], ['51999990003@example.com', 'solta']]); },
      async clientes() { return new Set(); },
      async criarConta(login, senha, nome) { log.push(['criarConta', login, senha, nome]); return 'novo-uid'; },
      async reaproveitarConta(uid, senha, nome) { log.push(['reaproveitar', uid, senha, nome]); },
      async apagarConta(uid) { log.push(['apagar', uid]); },
      async criarFuncionario(uid, dados) { log.push(['funcionario', uid, dados.fridayItemId]); },
      async ligar(uid, itemId) { log.push(['ligar', uid, itemId]); },
      ...extra,
    },
  };
}

test('serviço: só escritorio ou adm2; a tela não recebe o CPF', async () => {
  const { store } = loja();
  const s = createImportarFridayService(store);
  await assert.rejects(s.listar(undefined), { code: 'unauthenticated' });
  await assert.rejects(s.listar('mot'), { code: 'permission-denied' });
  const { pessoas, livres } = await s.listar('esc');
  assert.equal(pessoas.length, 4);
  assert.ok(pessoas.every(p => !('cpf' in p)));
  assert.deepEqual(livres.map(l => l.uid), ['u2', 'livre']); // por nome: Bruno Lima, Outra Pessoa
});

test('serviço: criar com senha = 6 primeiros dígitos do CPF; liga quem já é funcionário; recusa incompleto', async () => {
  const { store, log } = loja();
  const { resultados } = await createImportarFridayService(store).criar('esc', { ids: ['1', '2', '3', '4'] });
  assert.deepEqual(resultados.map(r => r.resultado), ['criado', 'vinculado', 'criado', 'erro']);
  assert.equal(resultados[3].mensagem, 'sem telefone');
  assert.deepEqual(log, [
    ['criarConta', '51999990001@example.com', '529982', 'Ana Souza'], ['funcionario', 'novo-uid', '1'],
    ['ligar', 'u2', '2'],
    ['reaproveitar', 'solta', '111444', 'Caio'], ['funcionario', 'solta', '3'],
  ]);
  await assert.rejects(createImportarFridayService(store).criar('esc', { ids: ['999'] }), { code: 'not-found' });
});

test('serviço: falha ao gravar o funcionário apaga a conta criada agora', async () => {
  const { store, log } = loja({ async criarFuncionario() { throw new Error('falhou'); } });
  const { resultados } = await createImportarFridayService(store).criar('esc', { ids: ['1', '3'] });
  assert.deepEqual(resultados.map(r => r.resultado), ['erro', 'erro']);
  assert.deepEqual(log.filter(l => l[0] === 'apagar'), [['apagar', 'novo-uid']]); // a conta solta reaproveitada não é apagada
});

test('serviço: falta coluna no quadro', async () => {
  const { store } = loja({ async colunasDoQuadro() { return [{ id: 1, titulo: 'Telefone', tipo: 'telefone' }]; } });
  await assert.rejects(createImportarFridayService(store).listar('esc'), { code: 'failed-precondition', message: /CPF/ });
});

test('serviço: ligar só item novo ou incompleto', async () => {
  const { store, log } = loja();
  const s = createImportarFridayService(store);
  assert.equal((await s.ligar('esc', { itemId: '4', uid: 'livre' })).resultado.resultado, 'vinculado');
  assert.deepEqual(log, [['ligar', 'livre', '4']]);
  await assert.rejects(s.ligar('esc', { itemId: '2', uid: 'livre' }), { code: 'failed-precondition' });
});
