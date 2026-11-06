import test from 'node:test';
import assert from 'node:assert/strict';
import { classificarPessoas, lerLigacao, lerPedido, nomesBatem } from '../lib/fridayMondayPessoas.js';

const u = (id, nome, email, extra = {}) => ({ id, nome, email, ativo: true, convidado: false, pendente: false, ...extra });

test('pessoas do monday: novo, já funcionário, ligado e fora', () => {
  const usuarios = [
    u('1', 'Ana', 'Ana@Ledur.com.br '),
    u('2', 'Bruno', 'bruno@ledur.com.br'),
    u('3', 'Carla', 'carla@ledur.com.br'),
    u('4', 'Davi', 'davi@ledur.com.br', { ativo: false }),
    u('5', 'Externo', 'x@cliente.com', { convidado: true }),
    u('6', 'Pendente', 'p@ledur.com.br', { pendente: true }),
    u('7', 'Celular', '5199999@example.com'),
    u('8', 'Cliente', 'cli@empresa.com'),
    u('9', 'Solto', 'solto@ledur.com.br'),
    u('10', 'Outro', 'outro@ledur.com.br'),
  ];
  const funcionarios = [
    { uid: 'uB', nome: 'Bruno S.', ativo: true, mondayId: null },
    { uid: 'uC', nome: 'Carla M.', ativo: true, mondayId: '3' },
    { uid: 'uO', nome: 'Outro F.', ativo: true, mondayId: '77' },
  ];
  const contas = new Map([['bruno@ledur.com.br', 'uB'], ['carla@ledur.com.br', 'uC'], ['cli@empresa.com', 'uCli'], ['solto@ledur.com.br', 'uSolto'], ['outro@ledur.com.br', 'uO']]);
  const r = Object.fromEntries(classificarPessoas(usuarios, funcionarios, contas, new Set(['uCli'])).map(p => [p.id, p]));

  assert.deepEqual([r[1].situacao, r[1].email, r[1].uid], ['novo', 'ana@ledur.com.br', null]);
  assert.deepEqual([r[2].situacao, r[2].uid, r[2].funcionario], ['funcionario', 'uB', 'Bruno S.']);
  assert.deepEqual([r[3].situacao, r[3].uid], ['vinculado', 'uC']);
  assert.equal(r[4].motivo, 'desativado no monday');
  assert.equal(r[5].motivo, 'convidado (de fora da Ledur)');
  assert.equal(r[6].motivo, 'convite pendente no monday');
  assert.equal(r[7].motivo, 'sem e-mail que receba o link');
  assert.equal(r[8].motivo, 'conta de cliente do portal');
  // Conta solta no Auth (sem funcionário): é "novo", reaproveitando a conta.
  assert.deepEqual([r[9].situacao, r[9].uid], ['novo', 'uSolto']);
  assert.deepEqual([r[10].situacao, r[10].motivo], ['fora', 'o funcionário já está ligado a outro usuário do monday']);
});

test('pedido de criar: ids sem repetir e ao menos uma credencial', () => {
  const ok = lerPedido({ ids: ['1', 1, '2', 'x'], credenciais: { escritorio: true } });
  assert.deepEqual(ok.ids, ['1', '2']);
  assert.equal(ok.credenciais.escritorio, true);
  assert.equal(ok.credenciais.adm2, false);
  assert.ok('erro' in lerPedido({ ids: [], credenciais: { escritorio: true } }));
  assert.ok('erro' in lerPedido({ ids: ['1'], credenciais: {} }));
  assert.ok('erro' in lerPedido({ ids: ['1'], credenciais: { escritorio: 'sim' } }));
  assert.ok('erro' in lerPedido({ ids: Array.from({ length: 101 }, (_, i) => String(i + 1)), credenciais: { escritorio: true } }));
});

test('nomes que batem: mesmo primeiro nome, sem acento nem "da/de/do", o curto contido no longo', () => {
  assert.equal(nomesBatem('Gabriella Conceição', 'GABRIELLA DA CONCEICAO SILVA'), true);
  assert.equal(nomesBatem('Brayan Martins', 'Brayan  Martins'), true);
  assert.equal(nomesBatem('Bruno Martins Rodrigues', 'Brayan Martins'), false);
  assert.equal(nomesBatem('Diego Ramon Gonçalves', 'Diego Souza'), false);
  // Um nome só não basta para sugerir.
  assert.equal(nomesBatem('Dora', 'Dora'), false);
  assert.equal(nomesBatem('Ana Paula', null), false);
});

test('novo com outro login: sugere o funcionário sem ligação cujo nome bate, só se for um', () => {
  const usuarios = [
    u('1', 'Brayan Martins', 'brayan@ledur.com.br'),
    u('2', 'Paola Lima', 'paola@ledur.com.br'),
    u('3', 'Ana Souza', 'ana@ledur.com.br'),
    u('4', 'Leonardo Quadros', 'leo@ledur.com.br'),
  ];
  const funcionarios = [
    { uid: 'uBr', nome: 'Brayan Martins da Silva', ativo: true, mondayId: null },
    { uid: 'uPa', nome: 'Paola Lima', ativo: true, mondayId: '99' },
    { uid: 'uA1', nome: 'Ana Souza', ativo: true, mondayId: null },
    { uid: 'uA2', nome: 'Ana Souza Pereira', ativo: false, mondayId: null },
    { uid: 'uLe', nome: 'Leonardo Quadros', ativo: true, mondayId: null },
  ];
  const contas = new Map([['leo@ledur.com.br', 'uLe']]);
  const r = Object.fromEntries(classificarPessoas(usuarios, funcionarios, contas, new Set()).map(p => [p.id, p]));

  assert.deepEqual([r[1].situacao, r[1].uid, r[1].sugestao], ['novo', null, { uid: 'uBr', nome: 'Brayan Martins da Silva' }]);
  // Já ligado a outro usuário do monday: não é sugerido.
  assert.deepEqual([r[2].situacao, r[2].sugestao], ['novo', null]);
  // Dois candidatos: nenhum é sugerido, a escolha fica com quem importa.
  assert.equal(r[3].sugestao, null);
  // Achado pelo e-mail: é "já funcionário", sem sugestão.
  assert.deepEqual([r[4].situacao, r[4].sugestao], ['funcionario', null]);
});

test('pedido de ligar: id do monday numérico e UID do funcionário', () => {
  assert.deepEqual(lerLigacao({ mondayId: 123, uid: ' abc ' }), { mondayId: '123', uid: 'abc' });
  assert.ok('erro' in lerLigacao({ mondayId: 'x', uid: 'abc' }));
  assert.ok('erro' in lerLigacao({ mondayId: '1', uid: '' }));
  assert.ok('erro' in lerLigacao({ mondayId: '1', uid: 'a/b' }));
  assert.ok('erro' in lerLigacao(null));
});
