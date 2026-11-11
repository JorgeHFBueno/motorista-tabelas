import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  QUADRO_CURRICULOS, QUADRO_FUNCIONARIOS, colunaPeloTitulo, createLogisticaPessoasService, pessoasDoQuadro,
} from '../lib/logisticaPessoas.js';

const item = (id, nome, extra = {}) => ({ id, nome, item_pai_id: null, arquivado_em: null, excluido_em: null, valores: {}, ...extra });

test('pessoas: só itens ativos de primeiro nível, por nome; função pela célula', () => {
  const itens = [
    item(3, '  Wellington   Fernandes '),
    item(1, 'Ederson Borges'),
    item(2, 'Arquivado', { arquivado_em: '2026-11-01 10:00:00' }),
    item(4, 'Na lixeira', { excluido_em: '2026-11-01 10:00:00' }),
    item(5, 'Subitem', { item_pai_id: 1 }),
    item(6, '   '),
  ];
  assert.deepEqual(pessoasDoQuadro(itens), [{ id: '1', nome: 'Ederson Borges' }, { id: '3', nome: 'Wellington Fernandes' }]);

  const status = { id: 77, tipo: 'status', config: { rotulos: [{ id: '1', texto: 'Motorista' }, { id: '2', texto: 'Ajudante' }] } };
  const curriculos = [item(10, 'Ana', { valores: { 77: '2' } }), item(11, 'Bruno', { valores: { 77: null } })];
  assert.deepEqual(pessoasDoQuadro(curriculos, status), [{ id: '10', nome: 'Ana', funcao: 'Ajudante' }, { id: '11', nome: 'Bruno' }]);
  assert.deepEqual(pessoasDoQuadro([item(12, 'Caio', { valores: { 5: 'Operador de munck' } })], { id: 5, tipo: 'texto' }), [{ id: '12', nome: 'Caio', funcao: 'Operador de munck' }]);
});

test('coluna "Função Desejada" pelo título, sem acento nem maiúsculas', () => {
  const colunas = [{ id: 1, titulo: 'Telefone' }, { id: 2, titulo: ' FUNCAO desejada ' }];
  assert.equal(colunaPeloTitulo(colunas, 'Função Desejada')?.id, 2);
  assert.equal(colunaPeloTitulo([{ id: 1, titulo: 'Cargo' }], 'Função Desejada'), null);
});

test('só logistica, mecanico ou adm2 ativos; devolve os dois quadros', async () => {
  const funcionarios = {
    log: { ativo: true, perfis: { logistica: true } },
    mec: { ativo: true, perfis: { mecanico: true } },
    adm: { ativo: true, perfis: { adm2: true } },
    eng: { ativo: true, perfis: { engenharia: true } },
    inativo: { ativo: false, perfis: { logistica: true } },
  };
  const pedidos = [];
  const service = createLogisticaPessoasService({
    async getEmployee(uid) { return funcionarios[uid]; },
    async itensDoQuadro(id) { pedidos.push(id); return id === QUADRO_FUNCIONARIOS ? [item(1, 'Ederson')] : [item(2, 'Ana', { valores: { 9: 'Auxiliar' } })]; },
    async colunasDoQuadro(id) { assert.equal(id, QUADRO_CURRICULOS); return [{ id: 9, titulo: 'Função Desejada', tipo: 'texto' }]; },
  });
  for (const uid of ['log', 'mec', 'adm']) {
    assert.deepEqual(await service(uid), { motoristas: [{ id: '1', nome: 'Ederson' }], auxiliares: [{ id: '2', nome: 'Ana', funcao: 'Auxiliar' }] });
  }
  assert.deepEqual([...new Set(pedidos)].sort(), [QUADRO_CURRICULOS, QUADRO_FUNCIONARIOS].sort());
  await assert.rejects(service(undefined), (e) => e.code === 'unauthenticated');
  for (const uid of ['eng', 'inativo', 'nao-existe']) await assert.rejects(service(uid), (e) => e.code === 'permission-denied');
});
