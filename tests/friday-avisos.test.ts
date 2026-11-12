import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparAvisos, destinatariosDaMencao, filtrarAvisos, marcadosSemAcesso, periodoDoAviso, textoDoAviso, textoSemMarcas, trechoDoAviso } from '../src/features/friday-gestao-interna/avisos.ts';

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

test('texto do aviso tem o prefixo e no máximo 300 caracteres', () => {
  assert.equal(textoDoAviso('  @{ana} confere  ', nome), 'mencionou você: @Ana Souza confere');
  assert.equal(textoDoAviso('x'.repeat(400), nome).length, 300);
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

test('trecho do aviso sai sem o "mencionou você:"', () => {
  assert.equal(trechoDoAviso('mencionou você: @Ana Souza confere'), '@Ana Souza confere');
  assert.equal(trechoDoAviso('outro texto'), 'outro texto');
  assert.equal(trechoDoAviso(null), '');
});

test('período: hoje, últimos 7 dias (hoje e os 6 dias antes) e mais antigos', () => {
  const agora = new Date(2026, 10, 12, 15, 0, 0);
  assert.equal(periodoDoAviso('2026-11-12 00:00:00', agora), 'Hoje');
  assert.equal(periodoDoAviso('2026-11-11 23:59:59', agora), 'Últimos 7 dias');
  assert.equal(periodoDoAviso('2026-11-06 00:00:00', agora), 'Últimos 7 dias');
  assert.equal(periodoDoAviso('2026-11-05 23:59:59', agora), 'Mais antigos');
  assert.equal(periodoDoAviso('sem data', agora), 'Mais antigos');
});

test('grupos na ordem Hoje, Últimos 7 dias, Mais antigos, sem grupo vazio e mantendo a ordem da lista', () => {
  const agora = new Date(2026, 10, 12, 15, 0, 0);
  const lista = [
    { id: 1, criado_em: '2026-11-12 10:00:00' }, { id: 2, criado_em: '2026-10-01 10:00:00' },
    { id: 3, criado_em: '2026-11-12 09:00:00' },
  ];
  assert.deepEqual(agruparAvisos(lista, agora, n => n.criado_em).map(g => [g.periodo, g.avisos.map(n => n.id)]), [['Hoje', [1, 3]], ['Mais antigos', [2]]]);
});

test('busca: todas as palavras, sem acento nem maiúsculas, em pessoa, item, quadro ou trecho', () => {
  const lista = [
    { id: 1, de: 'João Silva', item: 'Pavilhão Norte', quadro: 'GESTÃO DE OBRAS' },
    { id: 2, de: 'Ana Souza', item: 'Lote 3', quadro: null },
  ];
  const textos = (n: (typeof lista)[number]) => [n.de, n.item, n.quadro];
  assert.deepEqual(filtrarAvisos(lista, 'joao gestao', textos).map(n => n.id), [1]);
  assert.deepEqual(filtrarAvisos(lista, 'PAVILHAO', textos).map(n => n.id), [1]);
  assert.deepEqual(filtrarAvisos(lista, 'lote ana', textos).map(n => n.id), [2]);
  assert.deepEqual(filtrarAvisos(lista, '  ', textos).map(n => n.id), [1, 2]);
  assert.deepEqual(filtrarAvisos(lista, 'xyz', textos), []);
});
