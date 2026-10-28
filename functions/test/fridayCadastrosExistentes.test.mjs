import { test } from 'node:test';
import assert from 'node:assert/strict';

const m = await import('../lib/fridayCadastrosExistentes.js');
const { valorDoOficial } = await import('../lib/fridayCadastroConverter.js');
const veiculos = m.cadastroExistente('veiculos-v2');

const colunas = [
  { id: 1, titulo: 'Placa', tipo: 'texto' },
  { id: 2, titulo: 'Empresa', tipo: 'texto' },
  { id: 3, titulo: 'Categoria', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'Placa' }, { id: '2', texto: 'Máquina' }, { id: '0', texto: '' }] } },
  { id: 4, titulo: 'Carga (t)', tipo: 'numero' },
  { id: 5, titulo: 'Data', tipo: 'data' },
];

test('catálogo: veiculos-v2 cria registro, sai do app quando arquivado e só "parado" desativa', () => {
  assert.ok(veiculos);
  assert.equal(veiculos.cria_registro, true);
  assert.equal(veiculos.arquivado_desativa, 'cadastro.ativo');
  assert.deepEqual(veiculos.campos.find(c => c.caminho === 'cadastro.situacao').deriva, { caminho: 'cadastro.ativo', falso_quando: ['parado'] });
});

test('caminhos', () => {
  assert.equal(m.lerCaminho({ a: { b: 3 } }, 'a.b'), 3);
  assert.equal(m.lerCaminho({ a: null }, 'a.b'), undefined);
  assert.deepEqual(m.gravarCaminho({}, 'a.b', 1), { a: { b: 1 } });
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

test('criação: chave pelo nome do item, padrões e fixos do contrato', () => {
  const chave = { coluna_id: null, caminho: 'identificacao.identificador' };
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

test('chave "começa com": criação divide o nome em placa e modelo; equipamento vira EXTRA pelo nome', () => {
  const chave = { coluna_id: null, caminho: 'identificacao.identificador', modo: 'prefixo' };
  const cat = m.montarCamposExistente(veiculos, colunas, [{ caminho: 'identificacao.categoria', coluna_id: 3, rotulos: { 1: 'PLACA', 2: 'EXTRA' } }], chave).campos;
  const r = m.novoRegistro(veiculos, cat, { id: 9, nome: 'QWE-1A23 Volvo FH 540', valores: { 3: '1' } }, chave);
  assert.deepEqual(r.erros, []);
  assert.deepEqual([r.doc.identificacao.identificador, r.doc.identificacao.nome, r.doc.identificacao.categoria], ['QWE-1A23', 'Volvo FH 540', 'PLACA']);
  // Sem placa no começo (decisão de 2026-10-28): EXTRA, identificador = nome em maiúsculas sem parênteses, nome = nome do item.
  const d = veiculos.dividir_nome;
  assert.deepEqual(m.dividirNomeDoItem(d, 'Gerador - 27671 ( NOVO )'), { identificador: 'GERADOR 27671', resto: 'Gerador - 27671 ( NOVO )', categoria: 'EXTRA' });
  assert.deepEqual(m.dividirNomeDoItem(d, 'Bate-Estaca'), { identificador: 'BATE-ESTACA', resto: 'Bate-Estaca', categoria: 'EXTRA' });
  assert.deepEqual(m.dividirNomeDoItem(d, 'Escavadeira Hidráulica Cat'), { identificador: 'ESCAVADEIRA HIDRÁULICA CAT', resto: 'Escavadeira Hidráulica Cat', categoria: 'EXTRA' });
  assert.deepEqual(m.dividirNomeDoItem(d, 'irq4349  Ford Cargo'), { identificador: 'IRQ4349', resto: 'Ford Cargo', categoria: 'PLACA' });
  const e = m.novoRegistro(veiculos, [], { id: 8, nome: 'Gerador - 28126', valores: {} }, chave);
  assert.deepEqual(e.erros, []);
  assert.deepEqual([e.doc.identificacao.identificador, e.doc.identificacao.nome, e.doc.identificacao.categoria, e.doc.cadastro.ativo], ['GERADOR 28126', 'Gerador - 28126', 'EXTRA', true]);
});

test('rótulo → texto, situação com ativo calculado e grupo livre "friday"', () => {
  const cols = [
    { id: 11, titulo: 'Empresa', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'ARTEBASE' }, { id: '2', texto: 'LEDUR' }, { id: '0', texto: '' }] } },
    { id: 12, titulo: 'Status', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'Disponível' }, { id: '2', texto: 'Em manutenção' }, { id: '3', texto: 'Parado' }] } },
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
  // Só "parado" tira do app (decisão de 2026-10-28); em manutenção continua aparecendo.
  assert.deepEqual(m.valorParaGravarExistente(c('cadastro.situacao'), '2'), { gravar: [['cadastro.situacao', 'em_manutencao'], ['cadastro.ativo', true]] });
  assert.deepEqual(m.valorParaGravarExistente(c('cadastro.situacao'), '3'), { gravar: [['cadastro.situacao', 'parado'], ['cadastro.ativo', false]] });
  // Arquivado ou na lixeira: ativo false; restaurado: volta ao calculado da situação (ou true sem situação).
  assert.deepEqual(m.valorDesativado(veiculos, campos, { cadastro: { situacao: 'em_obra' } }, false), ['cadastro.ativo', false]);
  assert.deepEqual(m.valorDesativado(veiculos, campos, { cadastro: { situacao: 'em_obra' } }, true), ['cadastro.ativo', true]);
  assert.deepEqual(m.valorDesativado(veiculos, campos, { cadastro: { situacao: 'parado' } }, true), ['cadastro.ativo', false]);
  assert.deepEqual(m.valorDesativado(veiculos, campos, { cadastro: {} }, true), ['cadastro.ativo', true]);
  assert.equal(m.valorDesativado(m.cadastroExistente('obras-v2'), [], {}, false), null);
  assert.deepEqual(m.valorParaGravarExistente(c('friday.seguro'), '2026-12-01'), { gravar: [['friday.seguro', '2026-12-01']] });
  assert.deepEqual(m.valorParaGravarExistente(c('friday.combustivel'), '1'), { gravar: [['friday.combustivel', 'diesel_s10']] });
  assert.equal(valorDoOficial(c('cadastro.empresa'), 'ARTEBASE', () => undefined), '1');
  assert.ok(m.montarCamposExistente(veiculos, cols, [{ caminho: 'friday.Errada', coluna_id: 13 }], chave).erros.some(e => e.includes('Chave inválida')));
  // "friday.ok" é a marca dos registros ligados: nenhuma coluna pode usar essa chave.
  assert.equal(m.caminhoDaMarca(veiculos), 'friday.ok');
  assert.ok(m.montarCamposExistente(veiculos, cols, [{ caminho: 'friday.ok', coluna_id: 13 }], chave).erros.some(e => e.includes('reservada')));
});

test('coluna número ×10: sem conversão dupla nos campos ×10 do contrato', () => {
  const cols = [{ id: 21, titulo: 'Cap. Carga', tipo: 'numero', config: { x10: true } }, { id: 22, titulo: 'Ano', tipo: 'numero', config: { x10: true } }];
  const chave = { coluna_id: null, caminho: 'identificacao.identificador', modo: 'prefixo' };
  const { campos } = m.montarCamposExistente(veiculos, cols, [{ caminho: 'capacidades.cargaLiquida', coluna_id: 21 }, { caminho: 'cadastro.anoFabricacao', coluna_id: 22 }], chave);
  const carga = campos.find(c => c.chave === 'capacidades.cargaLiquida'), ano = campos.find(c => c.chave === 'cadastro.anoFabricacao');
  assert.equal(carga.escala, undefined);
  assert.deepEqual(m.valorParaGravarExistente(carga, 205), { gravar: [['capacidades.cargaLiquida', 205]] });
  assert.equal(valorDoOficial(carga, 200, () => undefined), 200);
  assert.equal(ano.escala, 0.1); // ano é inteiro puro no contrato: 20220 (×10) → 2022
  assert.deepEqual(m.valorParaGravarExistente(ano, 20220), { gravar: [['cadastro.anoFabricacao', 2022]] });
  assert.equal(valorDoOficial(ano, 2022, () => undefined), 20220);
});

test('campo secundário: Tipo do Veículo também alimenta a Categoria', () => {
  const cols = [{ id: 31, titulo: 'Tipo do Veículo', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'Carretas' }, { id: '2', texto: 'Máquinas' }] } }];
  const chave = { coluna_id: null, caminho: 'identificacao.identificador', modo: 'prefixo' };
  const pedidos = [{ caminho: 'cadastro.tipoVeiculo', coluna_id: 31 }, { caminho: 'identificacao.categoria', coluna_id: 31, secundario: true, rotulos: { 1: 'PLACA', 2: 'EXTRA' } }];
  const { campos, erros } = m.montarCamposExistente(veiculos, cols, pedidos, chave);
  assert.deepEqual(erros, []);
  const cat = campos.find(c => c.chave === 'identificacao.categoria');
  assert.equal(cat.secundario, true);
  assert.deepEqual(m.valorParaGravarExistente(cat, '2'), { gravar: [['identificacao.categoria', 'EXTRA']] });
  assert.ok(m.montarCamposExistente(veiculos, cols, [pedidos[1]], chave).erros.some(e => e.includes('já está ligada')));
  assert.ok(m.montarCamposExistente(veiculos, cols, [pedidos[0], { caminho: 'cadastro.empresa', coluna_id: 31, secundario: true }], chave).erros.length);
  // Criação: categoria vem do Tipo; o tipo grava o texto do rótulo.
  const r = m.novoRegistro(veiculos, campos, { id: 1, nome: 'XYZ-1A23 Case 580', valores: { 31: '2' } }, chave);
  assert.deepEqual(r.erros, []);
  assert.deepEqual([r.doc.identificacao.categoria, r.doc.cadastro.tipoVeiculo], ['EXTRA', 'Máquinas']);
});

// ---------------------------------------------------------------- obras-v2 (contratos com LOTEs)
const obras = m.cadastroExistente('obras-v2');

test('catálogo: obras-v2 casa pelo nome do contrato, com LOTEs e situação pela fórmula', () => {
  assert.ok(obras);
  assert.deepEqual(obras.chaves, ['nomeObra']);
  assert.deepEqual({ chave: obras.subitens.chave, nome: obras.subitens.nome_caminho, ordem: obras.subitens.ordem_caminho }, { chave: 'lotes', nome: 'nome', ordem: 'ordem' });
  assert.deepEqual(obras.situacao_por_formula.status, { caminho: 'status', quando: 'Obra Finalizada', sim: 'FINALIZADA', nao: 'CONTRATADA' });
});

test('obras-v2: rótulo vira texto; lista ainda não liga; status e situação são calculados', () => {
  const cols = [
    { id: 10, titulo: 'Empresa', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'LEDUR' }, { id: '2', texto: 'ARTEBASE' }, { id: '0', texto: '' }] } },
    { id: 11, titulo: 'Situação', tipo: 'lista', config: { opcoes: [{ id: '1', texto: 'Finalizada' }] } },
    { id: 12, titulo: 'Fim', tipo: 'data' },
    { id: 13, titulo: 'Status', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'X' }] } },
  ];
  const chave = { coluna_id: null, caminho: 'nomeObra' };
  const ok = m.montarCamposExistente(obras, cols, [{ caminho: 'empresa', coluna_id: 10 }, { caminho: 'dataFinal', coluna_id: 12 }], chave);
  assert.deepEqual(ok.erros, []);
  const empresa = ok.campos.find(c => c.chave === 'empresa');
  assert.deepEqual(m.valorParaContrato(empresa, '2'), { valor: 'ARTEBASE' });
  assert.deepEqual(m.valorParaContrato(ok.campos.find(c => c.chave === 'dataFinal'), '2026-09-25'), { valor: '2026-09-25' });
  assert.match(m.montarCamposExistente(obras, cols, [{ caminho: 'tipoObra', coluna_id: 11 }], chave).erros.join(), /não combina/);
  assert.match(m.montarCamposExistente(obras, cols, [{ caminho: 'status', coluna_id: 13 }], chave).erros.join(), /calculado/);
  assert.match(m.montarCamposExistente(obras, cols, [{ caminho: 'situacao', coluna_id: 13 }], chave).erros.join(), /calculado/);
});

test('obras-v2: subcentro ERP guardado exatamente como veio', () => {
  const [campo] = m.montarCamposExistente(obras, [{ id: 20, titulo: 'Subcentro ERP', tipo: 'texto' }], [{ caminho: 'subcentroErp', coluna_id: 20 }], { coluna_id: null, caminho: 'nomeObra' }).campos;
  assert.deepEqual(m.valorParaContrato(campo, ' 0012 '), { valor: ' 0012 ' });
  assert.deepEqual(m.valorParaContrato(campo, '   '), { vazio: true });
});

test('obras-v2: campos dos LOTEs (Status do subitem → lotes.{id}.status como texto)', () => {
  const cols = [{ id: 30, titulo: 'Status', tipo: 'status', config: { rotulos: [{ id: '1', texto: 'Em andamento' }, { id: '2', texto: 'Finalizado' }, { id: '0', texto: '' }] } }];
  const r = m.montarCamposSubitens(obras, cols, [{ caminho: 'status', coluna_id: 30 }]);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(m.valorParaContrato(r.campos[0], '2'), { valor: 'Finalizado' });
  assert.match(m.montarCamposSubitens(veiculos, cols, []).erros.join(), /não tem subitens/);
});

test('obras-v2: resultado da fórmula → situacao e status', () => {
  assert.deepEqual(m.camposDaFormula(obras, 'Obra Finalizada'), [['situacao', 'Obra Finalizada'], ['status', 'FINALIZADA']]);
  assert.deepEqual(m.camposDaFormula(obras, 'Solicitar Aditivo de Prazo'), [['situacao', 'Solicitar Aditivo de Prazo'], ['status', 'CONTRATADA']]);
  assert.deepEqual(m.camposDaFormula(obras, ''), [['situacao', null], ['status', 'CONTRATADA']]);
  assert.deepEqual(m.camposDaFormula(veiculos, 'x'), []);
});

test('obras-v2: contrato novo criado pela conciliação nasce com os padrões do contrato', () => {
  const r = m.novoRegistro(obras, [], { id: 1, nome: 'NOVO CONTRATO 12/2026', valores: {} }, { coluna_id: null, caminho: 'nomeObra' });
  assert.deepEqual(r.erros, []);
  assert.equal(r.doc.nomeObra, 'NOVO CONTRATO 12/2026');
  assert.deepEqual([r.doc.siglaObra, r.doc.codObra, r.doc.local, r.doc.status, r.doc.situacao, r.doc.dataFinal], ['', 0, 'CORRIGIR', 'CONTRATADA', null, null]);
});

test('gravação pelo registro: escolhe o item do LOTE certo, só nos cadastros ativos da coleção', () => {
  const itens = [
    { id: 1, vinculo: { cadastro: 'obras_v2_q', id: 'V1' } },
    { id: 2, vinculo: { cadastro: 'obras_v2_q', id: 'V1', sub: 'L1' } },
    { id: 3, vinculo: { cadastro: 'obras_v2_q', id: 'V1', sub: 'L2' } },
    { id: 4, vinculo: { cadastro: 'outro', id: 'V1', sub: 'L1' } },
  ];
  const chaves = new Set(['obras_v2_q']);
  assert.equal(m.itemDoRegistro(itens, chaves, 'L1').item.id, 2);
  assert.equal(m.itemDoRegistro(itens, chaves, null).item.id, 1);
  assert.match(m.itemDoRegistro(itens, chaves, 'L9').erro, /não está ligado/);
  assert.match(m.itemDoRegistro(itens, new Set(), 'L1').erro, /não está ligado/);
  assert.match(m.itemDoRegistro([...itens, { id: 5, vinculo: { cadastro: 'obras_v2_q', id: 'V1', sub: 'L1' } }], chaves, 'L1').erro, /Mais de um/);
});

test('gravação pelo registro: o texto do rótulo vira o id do rótulo no Friday', () => {
  const status = { chave: 'status', titulo: 'Status', tipo: 'status', coluna_id: 9, situacao: 'ativo', rotulos: [
    { codigo: 'Finalizado', texto: 'Finalizado', cor: '#0c7', friday_id: '2' }, { codigo: 'Não iniciada', texto: 'Não iniciada', cor: '#ccc', friday_id: '6' }] };
  assert.deepEqual(m.valorPeloTexto(status, 'Finalizado'), { valor: '2' });
  assert.match(m.valorPeloTexto(status, 'Concluído').erro, /não é um valor/);
  assert.match(m.valorPeloTexto({ ...status, situacao: 'descontinuado' }, 'Finalizado').erro, /não é um campo oficial ativo/);
  assert.match(m.valorPeloTexto({ ...status, tipo: 'texto' }, 'Finalizado').erro, /não é um campo de rótulo/);
  assert.match(m.valorPeloTexto(undefined, 'Finalizado').erro, /não é um campo oficial ativo/);
});
