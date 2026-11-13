import test from 'node:test';
import assert from 'node:assert/strict';
import { avisoDeMencao, destinatariosDaMencao, marcadosSemAcesso, textoSemMarcas } from '../src/features/friday-gestao-interna/avisos.ts';

test('quadro restrito: marcados fora da lista e sem adm2 ficam sem acesso; quadro aberto não avisa', () => {
  const marcados = [{ id: 'ana' }, { id: 'beto' }, { id: 'chefe', adm2: true }, { id: 'beto' }];
  assert.deepEqual(marcadosSemAcesso({ restrito: 1, acesso: ['ana'] }, marcados), ['beto']);
  assert.deepEqual(marcadosSemAcesso({ restrito: 1 }, [{ id: 'ana' }]), ['ana']);
  assert.deepEqual(marcadosSemAcesso({ restrito: 0, acesso: [] }, marcados), []);
  assert.deepEqual(marcadosSemAcesso(null, marcados), []);
});

const nomes: Record<string, string> = { ana: 'Ana Souza', beto: 'Beto Lima' };
const nome = (uid: string) => nomes[uid];
const todos = () => true;

test('marcas @{uid} viram @Nome; pessoa desconhecida vira @alguém', () => {
  assert.equal(textoSemMarcas('Oi @{ana}, veja com @{beto} e @{xyz}', nome), 'Oi @Ana Souza, veja com @Beto Lima e @alguém');
});

test('aviso de menção: título com o item, trecho com @Nome até 300 caracteres, quadro como local e rota do item', () => {
  const base = { quadroId: 12, itemId: 34, itemNome: ' Pedido de ART ', quadroNome: 'TAREFAS', atualizacaoId: 56, deUid: 'eu', deNome: 'Jorge B', nome };
  assert.deepEqual(avisoDeMencao({ ...base, texto: '  @{ana} confere  ' }), {
    area: 'friday', tipo: 'mencao', titulo: 'mencionou você em Pedido de ART', mensagem: '@Ana Souza confere',
    rota: '/friday/quadros/12?item=34&aba=atualizacoes', local: 'TAREFAS', deUid: 'eu', deNome: 'Jorge B',
    origem: { colecao: 'friday-atualizacoes', id: '56' }, lida: false,
  });
  assert.equal(avisoDeMencao({ ...base, texto: 'x'.repeat(400) }).mensagem.length, 300);
  const semItem = avisoDeMencao({ ...base, quadroId: null, itemNome: null, quadroNome: '', texto: 'oi' });
  assert.deepEqual([semItem.titulo, semItem.rota, semItem.local], ['mencionou você em um item', '/friday/', null]);
});

test('cada pessoa marcada recebe um aviso, menos quem escreveu', () => {
  assert.deepEqual(destinatariosDaMencao({ marcados: ['ana', 'beto', 'ana', 'eu'], autor: 'eu', podeReceber: todos }), ['ana', 'beto']);
});

test('na edição, só quem foi marcado agora recebe', () => {
  assert.deepEqual(destinatariosDaMencao({ marcados: ['ana', 'beto'], antes: ['ana'], autor: 'eu', podeReceber: todos }), ['beto']);
  assert.deepEqual(destinatariosDaMencao({ marcados: ['ana'], antes: ['ana', 'beto'], autor: 'eu', podeReceber: todos }), []);
});

test('quem não pode receber (fora do Friday) fica de fora; marcas inválidas são ignoradas', () => {
  assert.deepEqual(destinatariosDaMencao({ marcados: ['ana', 'beto'], autor: 'eu', podeReceber: uid => uid === 'beto' }), ['beto']);
  assert.deepEqual(destinatariosDaMencao({ marcados: null, autor: 'eu', podeReceber: todos }), []);
  assert.deepEqual(destinatariosDaMencao({ marcados: ['', 'ana'], antes: 'x', autor: 'eu', podeReceber: todos }), ['ana']);
});
