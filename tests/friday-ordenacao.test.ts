import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pessoa } from '../src/features/friday-gestao-interna/api.ts';
import { estadoDaVisao, lerOrdenacao, mesmoEstado, ordenarItens } from '../src/features/friday-gestao-interna/quadro/filtros.ts';
import { aceitaReais, colunaDoMenu, emReais, infoColuna, pessoasDoQuadro, type Coluna, type Item, type Visao } from '../src/features/friday-gestao-interna/quadro/tipos.ts';
import { fmtNumeroColuna } from '../src/features/friday-gestao-interna/util.ts';

// Ordenação da visão (vários critérios, como no monday), visões antigas e pessoas do quadro. Só dados fictícios.
const DATA = { id: 1, titulo: 'Data Fim', tipo: 'data', config: {} } as unknown as Coluna;
const PRIO = { id: 2, titulo: 'Prioridade', tipo: 'status', config: { rotulos: [{ id: '0', texto: '' }, { id: 'a', texto: 'Alta' }, { id: 'b', texto: 'Baixa' }] } } as unknown as Coluna;
const ORDEM = { id: 3, titulo: 'Ordem', tipo: 'numero', config: {} } as unknown as Coluna;
const colunas = [DATA, PRIO, ORDEM];
const item = (id: number, posicao: number, valores: Record<string, unknown>) => ({ id, nome: `I${id}`, posicao, valores }) as unknown as Item;
const porPosicao = (a: Item, b: Item) => a.posicao - b.posicao;
const nomes = (l: Item[]) => l.map(i => i.nome);

const itens = [
  item(1, 1, { 1: '2026-11-10', 2: 'b', 3: 2 }),
  item(2, 2, { 1: '2026-11-10', 2: 'a', 3: 5 }),
  item(3, 3, { 1: '2026-11-09', 2: 'b', 3: 1 }),
  item(4, 4, { 2: 'a', 3: 3 }), // sem data: fica no fim
  item(5, 5, { 1: '2026-11-10', 2: 'a', 3: 4 }),
];

test('critérios valem na ordem: data, depois prioridade, depois ordem; vazio no fim', () => {
  const r = ordenarItens(itens, [{ colunaId: 1, dir: 1 }, { colunaId: 2, dir: 1 }, { colunaId: 3, dir: 1 }], colunas, () => '', porPosicao);
  assert.deepEqual(nomes(r), ['I3', 'I5', 'I2', 'I1', 'I4']);
  const desc = ordenarItens(itens, [{ colunaId: 1, dir: -1 }, { colunaId: 3, dir: -1 }], colunas, () => '', porPosicao);
  assert.deepEqual(nomes(desc), ['I2', 'I5', 'I1', 'I3', 'I4'], 'decrescente; o vazio continua no fim');
});

test('sem critério (ou coluna apagada): posição manual', () => {
  const embaralhado = [itens[3], itens[0], itens[4], itens[2], itens[1]];
  assert.deepEqual(nomes(ordenarItens(embaralhado, [], colunas, () => '', porPosicao)), ['I1', 'I2', 'I3', 'I4', 'I5']);
  assert.deepEqual(nomes(ordenarItens(embaralhado, [{ colunaId: 99, dir: 1 }], colunas, () => '', porPosicao)), ['I1', 'I2', 'I3', 'I4', 'I5']);
});

test('visão antiga com um critério só é lida como lista; nada salvo = sem ordenação', () => {
  assert.deepEqual(lerOrdenacao({ colunaId: 2, dir: -1 }), [{ colunaId: 2, dir: -1 }]);
  assert.deepEqual(lerOrdenacao(null), []);
  assert.deepEqual(lerOrdenacao([{ colunaId: 1, dir: 1 }, { colunaId: 1, dir: -1 }, { colunaId: 'x' }]), [{ colunaId: 1, dir: 1 }], 'sem repetir coluna nem id inválido');
  const antiga = { id: 1, config: { ordenacao: { colunaId: 2, dir: -1 } } } as unknown as Visao;
  const nova = { id: 1, config: { ordenacao: [{ colunaId: 2, dir: -1 }] } } as unknown as Visao;
  assert.ok(mesmoEstado(estadoDaVisao(antiga, colunas), estadoDaVisao(nova, colunas)), 'abrir uma visão antiga não aparece como alterada');
  const vazia = { id: 1, config: {} } as unknown as Visao;
  assert.deepEqual(estadoDaVisao(vazia, colunas).ordenacao, []);
});

test('pessoas do quadro: aberto = todos do Friday; restrito = lista e administradores', () => {
  const p = (id: string, extra: Partial<Pessoa> = {}) => ({ id, uid: id, nome: id, email: null, cor: '#000', ativo: true, friday: true, adm2: false, ...extra }) as Pessoa;
  const usuarios = [p('ana'), p('bia'), p('chefe', { adm2: true }), p('inativo', { ativo: false }), p('motorista', { friday: false })];
  assert.deepEqual(pessoasDoQuadro({ id: 1, restrito: 0 }, usuarios).map(u => u.id), ['ana', 'bia', 'chefe']);
  assert.deepEqual(pessoasDoQuadro({ id: 1, restrito: 1, acesso: ['bia', 'inativo'] }, usuarios).map(u => u.id), ['bia', 'chefe']);
});

test('coluna Colaboradores é uma coluna de pessoa marcada', () => {
  assert.deepEqual(colunaDoMenu('colaboradores'), { tipo: 'pessoa', config: { colaboradores: true } });
  assert.deepEqual(colunaDoMenu('status'), { tipo: 'status' });
  assert.equal(infoColuna({ tipo: 'pessoa', config: { colaboradores: true } }).rotulo, 'Colaboradores');
  assert.equal(infoColuna({ tipo: 'pessoa', config: {} }).rotulo, 'Pessoa');
});

test('coluna Valor (R$) é uma coluna de número em reais', () => {
  const { tipo, config } = colunaDoMenu('moeda');
  assert.deepEqual({ tipo, config }, { tipo: 'numero', config: { unidade: 'R$', resumo: 'soma' } });
  assert.equal(fmtNumeroColuna(config, 1234.5).replace(/\s/g, ' '), 'R$ 1.234,50');
  assert.equal(fmtNumeroColuna(config, 1500).replace(/\s/g, ' '), 'R$ 1.500');
  const col = (cfg: Record<string, unknown>) => ({ tipo: 'numero', config: cfg }) as Pick<Coluna, 'tipo' | 'config'>;
  assert.ok(emReais(col(config!)) && aceitaReais(col(config!)));
  assert.ok(!emReais(col({ unidade: '' })) && aceitaReais(col({ unidade: '' })), 'Números comum pode passar para reais');
  assert.ok(!aceitaReais(col({ x10: true })) && !aceitaReais(col({ milhar: false })), '×10 e sem separador de milhar ficam de fora');
  assert.ok(!aceitaReais({ tipo: 'texto', config: {} }));
});
