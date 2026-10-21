import { test } from 'node:test';
import assert from 'node:assert/strict';

const m = await import('../lib/fridayCadastrosExistentes.js');
const { valorDoOficial } = await import('../lib/fridayCadastroConverter.js');
const veiculos = m.cadastroExistente('veiculos-v2');

const registros = [
  { id: 'r1', dados: { identificacao: { identificador: 'ABC1D23', nome: 'Caminhão 1', categoria: 'PLACA' }, cadastro: { ativo: true, empresa: null }, capacidades: { cargaLiquida: 125 } } },
  { id: 'r2', dados: { identificacao: { identificador: 'XYZ9K88', nome: 'Caminhão 2', categoria: 'PLACA' }, cadastro: { ativo: true, empresa: 'Ledur' } } },
  { id: 'r3', dados: { identificacao: { identificador: 'dup-1', nome: 'Dup A' } } },
  { id: 'r4', dados: { identificacao: { identificador: 'DUP1', nome: 'Dup B' } } },
  { id: 'r5', dados: { identificacao: { identificador: 'SOLO', nome: 'Sem item' } } },
];
const colunas = [
  { id: 1, titulo: 'Placa', tipo: 'texto' },
  { id: 2, titulo: 'Empresa', tipo: 'texto' },
  { id: 3, titulo: 'Categoria', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'Placa' }, { id: '2', texto: 'Máquina' }, { id: '0', texto: '' }] } },
  { id: 4, titulo: 'Carga (t)', tipo: 'numero' },
  { id: 5, titulo: 'Data', tipo: 'data' },
];

test('catálogo: veiculos-v2 suportado e travado por padrão', () => {
  assert.ok(veiculos);
  assert.equal(m.conciliacaoLiberada('veiculos-v2', undefined), false);
  assert.equal(m.conciliacaoLiberada('veiculos-v2', ' veiculos-v2 , outra'), true);
  assert.match(m.chaveDoExistente('veiculos-v2', 'abc'), /^veiculos_v2_abc$/);
});

test('caminhos e chave normalizada', () => {
  assert.equal(m.lerCaminho({ a: { b: 3 } }, 'a.b'), 3);
  assert.equal(m.lerCaminho({ a: null }, 'a.b'), undefined);
  assert.deepEqual(m.gravarCaminho({}, 'a.b', 1), { a: { b: 1 } });
  assert.equal(m.normalizarChave(' abc-1d23 '), 'ABC1D23');
  assert.equal(m.normalizarChave('Ação 1'), 'ACAO1');
});

test('análise: casados, ambíguos, sem par, sem item e já vinculados', () => {
  const itens = [
    { id: 10, nome: 'abc-1d23', valores: {} },                 // casa com r1 pelo nome
    { id: 11, nome: 'Outro', valores: {} },                    // sem par
    { id: 12, nome: 'DUP1', valores: {} },                     // dois registros com a mesma chave
    { id: 13, nome: 'xyz9k88', valores: {} },                  // dois itens com a mesma chave
    { id: 14, nome: 'XYZ 9K88', valores: {} },
    { id: 15, nome: 'Já ligado', valores: {}, vinculado: true },
  ];
  const a = m.analisar(itens, registros, { coluna_id: null, caminho: 'identificacao.identificador' }, new Set(), 'identificacao.nome');
  assert.deepEqual(a.casados.map(c => [c.itemId, c.registroId]), [[10, 'r1']]);
  assert.deepEqual(a.ambiguos.map(c => [c.itemId, c.registroIds]), [[12, ['r3', 'r4']], [13, ['r2']], [14, ['r2']]]);
  assert.deepEqual(a.semPar.map(c => c.itemId), [11]);
  assert.deepEqual(a.semItem.map(c => [c.registroId, c.nome]), [['r5', 'Sem item']]);
  assert.equal(a.jaVinculados, 1);
  // Registro já vinculado a um item não entra na análise; coluna em vez do nome.
  const b = m.analisar([{ id: 20, nome: 'x', valores: { 1: 'ABC1D23' } }], registros, { coluna_id: 1, caminho: 'identificacao.identificador' }, new Set(['r1']), 'identificacao.nome');
  assert.deepEqual(b.semPar.map(c => c.itemId), [20]);
});

test('campos: compatibilidade, opções e coluna-chave', () => {
  const chave = { coluna_id: 1, caminho: 'identificacao.identificador' };
  const bom = m.montarCamposExistente(veiculos, colunas, [
    { caminho: 'identificacao.identificador', coluna_id: 1 },
    { caminho: 'cadastro.empresa', coluna_id: 2, prioridade: 'quadro' },
    { caminho: 'identificacao.categoria', coluna_id: 3, rotulos: { 1: 'PLACA', 2: 'EXTRA' } },
    { caminho: 'capacidades.cargaLiquida', coluna_id: 4 },
  ], chave);
  assert.deepEqual(bom.erros, []);
  const categoria = bom.campos.find(c => c.chave === 'identificacao.categoria');
  assert.deepEqual(categoria.rotulos.map(r => [r.friday_id, r.codigo]), [['1', 'PLACA'], ['2', 'EXTRA']]);
  assert.equal(bom.campos.find(c => c.chave === 'cadastro.empresa').prioridade, 'quadro');
  assert.equal(bom.campos.find(c => c.chave === 'capacidades.cargaLiquida').escala, 10);

  const ruim = m.montarCamposExistente(veiculos, colunas, [
    { caminho: 'cadastro.empresa', coluna_id: 4 },                       // número → texto
    { caminho: 'identificacao.categoria', coluna_id: 3, rotulos: { 1: 'PLACA', 2: 'MOTO' } },
    { caminho: 'operacional.quilometragemUltima', coluna_id: 5 },        // data → número
    { caminho: 'nao.existe', coluna_id: 2 },
  ], chave);
  assert.equal(ruim.erros.length, 5, ruim.erros.join(' | ')); // coluna-chave, número→texto, opção inválida, data→número, campo inexistente
  assert.ok(m.montarCamposExistente(veiculos, colunas, [{ caminho: 'cadastro.empresa', coluna_id: 4 }], chave).erros.some(e => e.includes('coluna-chave')));
  assert.ok(m.montarCamposExistente(veiculos, [...colunas, { id: 7, titulo: 'Ativo', tipo: 'caixa' }], [{ caminho: 'cadastro.ativo', coluna_id: 7 }], { coluna_id: null, caminho: 'identificacao.identificador' }).erros.some(e => e.includes('calculado')));
  const leitura = m.montarCamposExistente(veiculos, [...colunas, { id: 6, titulo: 'KM', tipo: 'numero' }],
    [{ caminho: 'operacional.quilometragemUltima', coluna_id: 6, prioridade: 'quadro' }], { coluna_id: null, caminho: 'identificacao.identificador' });
  assert.equal(leitura.campos[0].somente_leitura, true);
  assert.equal(leitura.campos[0].prioridade, 'cadastro');
});

test('valores: escala, inteiro, opção, caixa, vazio e só leitura', () => {
  const campos = m.montarCamposExistente(veiculos, [...colunas, { id: 7, titulo: 'Ativo', tipo: 'caixa' }, { id: 8, titulo: 'KM', tipo: 'numero' }, { id: 9, titulo: 'Ano', tipo: 'numero' }], [
    { caminho: 'capacidades.cargaLiquida', coluna_id: 4 }, { caminho: 'identificacao.categoria', coluna_id: 3, rotulos: { 1: 'PLACA', 2: 'EXTRA' } },
    { caminho: 'operacional.quilometragemUltima', coluna_id: 8 }, { caminho: 'cadastro.anoFabricacao', coluna_id: 9 },
    { caminho: 'identificacao.nome', coluna_id: 2 },
  ], { coluna_id: null, caminho: 'identificacao.identificador' }).campos;
  const c = k => campos.find(x => x.chave === k);
  assert.deepEqual(m.valorParaGravarExistente(c('capacidades.cargaLiquida'), 12.5), { gravar: [['capacidades.cargaLiquida', 125]] });
  assert.deepEqual(m.valorParaGravarExistente(c('capacidades.cargaLiquida'), null), { gravar: [['capacidades.cargaLiquida', null]] });
  assert.ok('erro' in m.valorParaGravarExistente(c('cadastro.anoFabricacao'), 2019.5));
  assert.deepEqual(m.valorParaGravarExistente(c('identificacao.categoria'), '2'), { gravar: [['identificacao.categoria', 'EXTRA']] });
  assert.ok('erro' in m.valorParaGravarExistente(c('identificacao.categoria'), '9'));
  assert.ok('erro' in m.valorParaGravarExistente(c('identificacao.nome'), ''));
  assert.ok('erro' in m.valorParaGravarExistente(c('operacional.quilometragemUltima'), 10));
  // Volta para a tela: escala desfeita, opção pelo id do rótulo, caixa falsa vira vazio.
  assert.equal(valorDoOficial(c('capacidades.cargaLiquida'), 125, () => undefined), 12.5);
  assert.equal(valorDoOficial(c('identificacao.categoria'), 'EXTRA', () => undefined), '2');
  assert.equal(valorDoOficial({ tipo: 'caixa' }, false, () => undefined), undefined);
});

test('plano: prioridade por campo, criação com obrigatórios, ambíguos escolhidos e registros trazidos', () => {
  const chave = { coluna_id: null, caminho: 'identificacao.identificador' };
  const campos = m.montarCamposExistente(veiculos, colunas, [
    { caminho: 'cadastro.empresa', coluna_id: 2 },                                   // prioridade do cadastro
    { caminho: 'capacidades.cargaLiquida', coluna_id: 4, prioridade: 'quadro' },
    { caminho: 'identificacao.categoria', coluna_id: 3, rotulos: { 1: 'PLACA', 2: 'EXTRA' } },
  ], chave).campos;
  const itens = [
    { id: 10, nome: 'ABC1D23', valores: { 2: 'Outra empresa', 4: 13, 3: '1' } },   // empresa vazia no registro → preenche; carga diverge → quadro vence
    { id: 11, nome: 'XYZ9K88', valores: { 2: 'Outra', 3: '1' } },                    // empresa diverge → cadastro vence
    { id: 12, nome: 'DUP1', valores: {} },
    { id: 13, nome: 'NOVO1', valores: { 3: '2' } },                                 // criar: falta nome → erro
    { id: 14, nome: 'FORA', valores: {} },
  ];
  const a = m.analisar(itens, registros, chave, new Set(), veiculos.nome_item);
  const p = m.planejar(veiculos, campos, a, itens, registros, { criar: [13], trazer: ['r5'], ambiguos: { 12: 'r4' } }, chave);
  assert.deepEqual(p.vincular.map(v => [v.itemId, v.registroId]), [[10, 'r1'], [11, 'r2'], [12, 'r4']]);
  assert.deepEqual(p.vincular[0].gravar, [['cadastro.empresa', 'Outra empresa'], ['capacidades.cargaLiquida', 130]]);
  assert.deepEqual(p.vincular[1].gravar, []);
  const empresa = p.campos.find(c => c.caminho === 'cadastro.empresa');
  assert.deepEqual([empresa.preenchidos, empresa.divergentes, empresa.mantidos], [1, 1, 1]);
  assert.equal(p.criar.length, 0);
  assert.ok(p.erros.some(e => e.includes('NOVO1') && e.includes('Nome')));
  assert.deepEqual(p.trazer, [{ registroId: 'r5', nome: 'SOLO' }]);
  assert.equal(p.deixadosFora, 2); // NOVO1 (erro) e FORA
  assert.equal(p.foraDoQuadro, 0); // r3 (o outro DUP) foi disputado por um item: não é oferecido para trazer

  // Criação completa: chave pelo nome do item, padrões e fixos do contrato.
  const comNome = m.montarCamposExistente(veiculos, [...colunas, { id: 9, titulo: 'Nome', tipo: 'texto' }], [
    { caminho: 'identificacao.nome', coluna_id: 9 }, { caminho: 'identificacao.categoria', coluna_id: 3, rotulos: { 1: 'PLACA', 2: 'EXTRA' } },
  ], chave).campos;
  const r = m.novoRegistro(veiculos, comNome, { id: 13, nome: 'novo-1', valores: { 9: 'Carregadeira', 3: '2' } }, chave);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.doc, {
    schemaVersion: 2,
    identificacao: { identificador: 'novo-1', nome: 'Carregadeira', categoria: 'EXTRA' },
    cadastro: { ativo: true, anoFabricacao: null, tipoVeiculo: null, empresa: null, responsavel: '' },
    capacidades: { cargaLiquida: null, munck: null },
    operacional: { quilometragemInicial: null, quilometragemUltima: null },
  });
});

test('chave "começa com": item com placa e modelo no nome; criação divide o nome', () => {
  const regs = [
    { id: 'p1', dados: { identificacao: { identificador: 'JBJ-4J22', nome: 'Mercedez Atego 3030 CE' } } },
    { id: 'p2', dados: { identificacao: { identificador: 'JBJ', nome: 'prefixo mais curto' } } },
    { id: 'p3', dados: { identificacao: { identificador: 'AB', nome: 'curto' } } },
  ];
  const chave = { coluna_id: null, caminho: 'identificacao.identificador', modo: 'prefixo' };
  const itens = [{ id: 1, nome: 'JBJ-4J22 Mercedez Atego 3030 CE', valores: {} }, { id: 2, nome: 'ABX 123', valores: {} }];
  const a = m.analisar(itens, regs, chave, new Set(), 'identificacao.nome');
  assert.deepEqual(a.casados.map(c => [c.itemId, c.registroId]), [[1, 'p1']]); // a chave mais longa vence
  assert.deepEqual(a.semPar.map(s => s.itemId), [2]);                          // "AB" tem menos de 3 caracteres
  const cat = m.montarCamposExistente(veiculos, colunas, [{ caminho: 'identificacao.categoria', coluna_id: 3, rotulos: { 1: 'PLACA', 2: 'EXTRA' } }], chave).campos;
  const r = m.novoRegistro(veiculos, cat, { id: 9, nome: 'QWE-1A23 Volvo FH 540', valores: { 3: '1' } }, chave);
  assert.deepEqual(r.erros, []);
  assert.deepEqual([r.doc.identificacao.identificador, r.doc.identificacao.nome, r.doc.identificacao.categoria], ['QWE-1A23', 'Volvo FH 540', 'PLACA']);
});

test('rótulo → texto, situação com ativo calculado e grupo livre "friday"', () => {
  const cols = [
    { id: 11, titulo: 'Empresa', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'ARTEBASE' }, { id: '2', texto: 'LEDUR' }, { id: '0', texto: '' }] } },
    { id: 12, titulo: 'Status', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'Disponível' }, { id: '2', texto: 'Em manutenção' }] } },
    { id: 13, titulo: 'Seguro', tipo: 'data' },
    { id: 14, titulo: 'Combustível', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'Diesel S10' }] } },
  ];
  const chave = { coluna_id: null, caminho: 'identificacao.identificador', modo: 'prefixo' };
  const { campos, erros } = m.montarCamposExistente(veiculos, cols, [
    { caminho: 'cadastro.empresa', coluna_id: 11 }, { caminho: 'cadastro.situacao', coluna_id: 12, prioridade: 'quadro' },
    { caminho: 'friday.seguro', coluna_id: 13 }, { caminho: 'friday.combustivel', coluna_id: 14 },
  ], chave);
  assert.deepEqual(erros, []);
  const c = k => campos.find(x => x.chave === k);
  assert.deepEqual(m.valorParaGravarExistente(c('cadastro.empresa'), '1'), { gravar: [['cadastro.empresa', 'ARTEBASE']] });
  assert.deepEqual(m.valorParaGravarExistente(c('cadastro.situacao'), '1'), { gravar: [['cadastro.situacao', 'disponivel'], ['cadastro.ativo', true]] });
  assert.deepEqual(m.valorParaGravarExistente(c('cadastro.situacao'), '2'), { gravar: [['cadastro.situacao', 'em_manutencao'], ['cadastro.ativo', false]] });
  assert.deepEqual(m.valorParaGravarExistente(c('friday.seguro'), '2026-12-01'), { gravar: [['friday.seguro', '2026-12-01']] });
  assert.deepEqual(m.valorParaGravarExistente(c('friday.combustivel'), '1'), { gravar: [['friday.combustivel', 'diesel_s10']] });
  assert.equal(valorDoOficial(c('cadastro.empresa'), 'ARTEBASE', () => undefined), '1');
  assert.ok(m.montarCamposExistente(veiculos, cols, [{ caminho: 'friday.Errada', coluna_id: 13 }], chave).erros.some(e => e.includes('Chave inválida')));

  // Plano: textos do cadastro que não são rótulo viram rótulos novos; situação preenchida grava o ativo calculado.
  const regs = [{ id: 'v1', dados: { identificacao: { identificador: 'JBJ-4J22' }, cadastro: { empresa: 'OUTRA EMPRESA', ativo: true } } }];
  const itens = [{ id: 1, nome: 'JBJ-4J22 Atego', valores: { 11: '1', 12: '2' } }];
  const a = m.analisar(itens, regs, chave, new Set(), 'identificacao.identificador');
  const p = m.planejar(veiculos, campos, a, itens, regs, {}, chave);
  assert.deepEqual(p.vincular[0].gravar, [['cadastro.situacao', 'em_manutencao'], ['cadastro.ativo', false]]);
  assert.deepEqual(p.rotulosNovos, [{ coluna_id: 11, chave: 'cadastro.empresa', textos: ['OUTRA EMPRESA'] }]);
  const r = m.acrescentarRotulosDeTexto(cols[0].config, c('cadastro.empresa'), ['OUTRA EMPRESA']);
  assert.deepEqual(r.config.rotulos.at(-1), { id: '3', texto: 'OUTRA EMPRESA', cor: '#ff642e' });
  assert.deepEqual(r.campo.rotulos.at(-1), { codigo: 'OUTRA EMPRESA', texto: 'OUTRA EMPRESA', cor: '#ff642e', friday_id: '3' });
});
