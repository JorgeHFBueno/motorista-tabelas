import assert from 'node:assert/strict';
import test from 'node:test';
import { alvosPara, converterColuna, nomeDoAlvo } from '../src/features/friday-gestao-interna/quadro/mudarTipo.ts';
import { calcular } from '../src/features/friday-gestao-interna/quadro/formula.ts';
import type { Coluna, Item } from '../src/features/friday-gestao-interna/quadro/tipos.ts';
import { fmtNumeroColuna } from '../src/features/friday-gestao-interna/util.ts';

const coluna = (id: number, tipo: Coluna['tipo'], config: Record<string, unknown> = {}): Coluna =>
  ({ id, quadro_id: 1, titulo: `c${id}`, tipo, config, largura: 120, posicao: id, oculta: 0 }) as Coluna;
const empresa = coluna(10, 'lista', { opcoes: [{ id: '1', texto: 'LEDUR', cor: '#111111' }, { id: '2', texto: 'ARTEBASE', cor: '#222222' }, { id: '3', texto: 'SEM USO', cor: '#333333' }] });
const valores = (vs: unknown[]) => vs.map((v, i) => ({ id: i + 1, nome: `item ${i + 1}`, v }));

test('lista oferece só a conversão para status', () => {
  assert.deepEqual(alvosPara(empresa).map(o => o.alvo), [{ tipo: 'status' }]);
});

test('lista → status: opções viram rótulos com o mesmo id, texto e cor; cada célula guarda o id do rótulo', () => {
  const r = converterColuna(empresa, { tipo: 'status' }, valores([['1'], ['2'], [], null, ['1']]));
  assert.deepEqual(r.config.rotulos, [
    { id: '1', texto: 'LEDUR', cor: '#111111' }, { id: '2', texto: 'ARTEBASE', cor: '#222222' }, { id: '3', texto: 'SEM USO', cor: '#333333' },
    { id: '0', texto: '', cor: '#c4c4c4' },
  ]);
  assert.deepEqual(r.mudancas, [{ id: 1, valor: '1' }, { id: 2, valor: '2' }, { id: 5, valor: '1' }]);
  assert.equal(r.convertidos, 3); assert.deepEqual(r.falhas, []);
});

test('lista → status: célula com mais de uma opção fica vazia e aparece nas falhas', () => {
  const r = converterColuna(empresa, { tipo: 'status' }, valores([['1', '2'], ['2']]));
  assert.deepEqual(r.falhas, [{ id: 1, nome: 'item 1', original: 'LEDUR, ARTEBASE' }]);
  assert.deepEqual(r.mudancas, [{ id: 1, valor: null }, { id: 2, valor: '2' }]);
});

test('lista → status: opção com id "0" ganha id novo (o "0" é o rótulo vazio do Friday)', () => {
  const c = coluna(11, 'lista', { opcoes: [{ id: '0', texto: 'Zero', cor: '#000000' }, { id: '4', texto: 'Quatro', cor: '#444444' }] });
  const r = converterColuna(c, { tipo: 'status' }, valores([['0'], ['4']]));
  assert.deepEqual((r.config.rotulos as { id: string; texto: string }[]).map(x => `${x.id}:${x.texto}`), ['5:Zero', '4:Quatro', '0:']);
  assert.deepEqual(r.mudancas, [{ id: 1, valor: '5' }, { id: 2, valor: '4' }]);
});

test('a fórmula lê o texto do rótulo igual antes e depois da troca (lista → status)', () => {
  const formula = coluna(20, 'formula', { formula: 'IF({@10#Labels}="ARTEBASE", "sim", "não")' });
  const item = (v: unknown) => ({ id: 1, quadro_id: 1, grupo_id: 1, item_pai_id: null, nome: 'x', posicao: 0, valores: { 10: v } }) as unknown as Item;
  const antes = calcular(formula, item(['2']), { colunas: [empresa, formula], nomeUsuario: () => '' });
  const r = converterColuna(empresa, { tipo: 'status' }, valores([['2']]));
  const status = { ...empresa, tipo: 'status' as const, config: r.config };
  const depois = calcular(formula, item(r.mudancas[0].valor), { colunas: [status, formula], nomeUsuario: () => '' });
  assert.equal(antes.valor, 'sim'); assert.equal(depois.valor, 'sim');
});

test('número → número sem separador de milhar: mesmos valores, 2025 aparece "2025" e o rodapé não soma', () => {
  const ano = coluna(30, 'numero', { unidade: '', resumo: 'soma' });
  const opcao = alvosPara(ano).find(o => o.alvo.semMilhar)!;
  assert.equal(nomeDoAlvo(opcao.alvo), 'Número sem separador');
  const r = converterColuna(ano, opcao.alvo, valores([2025, 2024, null]));
  assert.deepEqual(r.config, { unidade: '', resumo: 'nenhum', milhar: false });
  assert.deepEqual(r.mudancas, []); assert.equal(r.convertidos, 2);
  assert.equal(fmtNumeroColuna(ano.config, 2025), '2.025');
  assert.equal(fmtNumeroColuna(r.config, 2025), '2025');
});

test('número sem separador pode voltar a número comum; texto "2025" vai direto para sem separador', () => {
  const ano = coluna(31, 'numero', { unidade: '', resumo: 'nenhum', milhar: false });
  assert.ok(alvosPara(ano).some(o => o.alvo.tipo === 'numero' && !o.alvo.semMilhar && !o.alvo.x10));
  assert.ok(!alvosPara(ano).some(o => o.alvo.semMilhar));
  const texto = coluna(32, 'texto');
  const r = converterColuna(texto, { tipo: 'numero', semMilhar: true }, valores(['2025', ' 2024 ']));
  assert.deepEqual(r.mudancas, [{ id: 1, valor: 2025 }, { id: 2, valor: 2024 }]);
});

test('número ×10 continua como antes (só volta para número comum)', () => {
  const x10 = coluna(33, 'numero', { unidade: 't', resumo: 'soma', x10: true });
  assert.deepEqual(alvosPara(x10).filter(o => o.alvo.tipo === 'numero').map(o => o.alvo), [{ tipo: 'numero' }]);
});
