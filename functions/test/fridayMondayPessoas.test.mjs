import test from 'node:test';
import assert from 'node:assert/strict';
import { classificarPessoas, lerPedido } from '../lib/fridayMondayPessoas.js';

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
