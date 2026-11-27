import { test } from 'node:test';
import assert from 'node:assert/strict';

const d = await import('../lib/logisticaObservacaoMencaoDominio.js');

// Aviso de marcação (@) nas observações do Cronograma Logístico. Só dados fictícios.
const LOG = { logistica: 'ver' };

test('marcados: sem repetir, sem vazios nem caminhos, até 20; sem lista, nenhum', () => {
  assert.deepEqual(d.marcadosDa({ marcados: ['ana', 'ana', '', 7, 'a/b', 'bia'] }), ['ana', 'bia']);
  assert.equal(d.marcadosDa({ marcados: Array.from({ length: 25 }, (_, i) => `u${i}`) }).length, 20);
  assert.deepEqual(d.marcadosDa({}), []);
  assert.deepEqual(d.marcadosDa(undefined), []);
});

test('edição: só quem entrou agora em marcados', () => {
  assert.deepEqual(d.marcadosNovos({ marcados: ['ana'] }, { marcados: ['ana', 'bia'] }), ['bia']);
  assert.deepEqual(d.marcadosNovos({}, { marcados: ['ana'] }), ['ana']);
  assert.deepEqual(d.marcadosNovos({ marcados: ['ana', 'bia'] }, { marcados: ['ana'] }), []);
  assert.deepEqual(d.marcadosNovos({ marcados: ['ana'] }, {}), []);
});

test('destinatários: ativos que veem a Logística ou adm2, menos o autor', () => {
  const funcionarios = new Map([
    ['ana', { ativo: true, perfis: {}, areas: LOG }],
    ['chefe', { ativo: true, perfis: { adm2: true } }],
    ['eng', { ativo: true, perfis: {}, areas: { engenharia: 'editar' } }],
    ['inativo', { ativo: false, perfis: {}, areas: LOG }],
    ['autor', { ativo: true, perfis: {}, areas: LOG }],
  ]);
  assert.deepEqual(d.destinatariosDaMarcacao(['ana', 'chefe', 'eng', 'inativo', 'autor', 'sumido'], 'autor', funcionarios), ['ana', 'chefe']);
});

test('aviso: título com o item e a expedição, trecho com os nomes, rota nas Observações, autor como deNome', () => {
  const nomes = { ana: 'Ana Paula' };
  const aviso = d.avisoDeMarcacao({
    observacaoId: 'o1',
    observacao: { programacaoId: 'p 1', texto: 'Ver com @{ana} e @{sumido}', anexos: [], autor: { uid: 'autor', nome: 'Mateus' } },
    programacao: { item: 'Transporte', expedicao: '1768' },
    nome: (uid) => nomes[uid],
  });
  assert.deepEqual(aviso, {
    area: 'logistica', tipo: 'mencao', titulo: 'mencionou você em Transporte (Expedição 1768)',
    mensagem: 'Ver com @Ana Paula e @alguém', rota: '/logistica/cronograma?programacao=p%201&aba=observacoes',
    local: 'Cronograma Logístico', deUid: 'autor', deNome: 'Mateus', origem: { colecao: 'logistica-observacoes', id: 'o1' }, lida: false,
  });
  const soArquivo = d.avisoDeMarcacao({ observacaoId: 'o2', observacao: { programacaoId: 'p', texto: '', anexos: [{}, {}], autor: {} }, programacao: undefined, nome: () => undefined });
  assert.equal(soArquivo.titulo, 'mencionou você em uma programação');
  assert.equal(soArquivo.mensagem, '2 arquivo(s) anexado(s)');
});

test('id estável por observação e pessoa', () => {
  assert.equal(d.idAvisoMarcacao('o1', 'ana'), d.idAvisoMarcacao('o1', 'ana'));
  assert.notEqual(d.idAvisoMarcacao('o1', 'ana'), d.idAvisoMarcacao('o1', 'bia'));
  assert.match(d.idAvisoMarcacao('o1', 'ana'), /^lom_[0-9a-f]{28}$/);
});
