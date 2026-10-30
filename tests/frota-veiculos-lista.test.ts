import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { ItemFrotaV2 } from '../src/utils/cadastrosV2';
import { atualizacaoInfo, camposQuadroFrota, filtrarVeiculos, lerKmInicial, medidorTexto, origemKmTexto, somarValores } from '../src/utils/frotaVeiculosLista';

const item = (parcial: Partial<ItemFrotaV2>): ItemFrotaV2 => ({
  id: 'x', categoria: 'PLACA', identificador: 'IXR-7D23', nome: 'Hilux', ativo: true, situacao: null,
  quilometragemInicial: null, quilometragemUltima: null, dataUltimaAtualizacao: null, raw: {}, ...parcial,
});

test('busca ignora hífen, caixa e acento e filtra pela categoria', () => {
  const itens = [item({ id: 'a' }), item({ id: 'b', categoria: 'EXTRA', identificador: 'ESCAVADEIRA PC200', nome: 'Escavadeira Komatsu' })];
  assert.deepEqual(filtrarVeiculos(itens, 'ixr7d', 'TODOS').map((i) => i.id), ['a']);
  assert.deepEqual(filtrarVeiculos(itens, 'KOMATSU', 'TODOS').map((i) => i.id), ['b']);
  assert.deepEqual(filtrarVeiculos(itens, '', 'EXTRA').map((i) => i.id), ['b']);
  assert.deepEqual(filtrarVeiculos(itens, 'komatsu', 'PLACA'), []);
});

test('medidor usa km em PLACA, h em EXTRA e traço sem leitura', () => {
  assert.equal(medidorTexto({ categoria: 'PLACA', quilometragemUltima: 184320 }), '184.320 km');
  assert.equal(medidorTexto({ categoria: 'EXTRA', quilometragemUltima: 8214 }), '8.214 h');
  assert.equal(medidorTexto({ categoria: 'PLACA', quilometragemUltima: null }), '—');
});

test('idade da atualização: recente até 7 dias, atenção até 30, antiga depois', () => {
  const agora = new Date(2026, 9, 28, 15, 0);
  assert.equal(atualizacaoInfo(new Date(2026, 9, 28, 7, 42), agora).frescor, 'recente');
  assert.match(atualizacaoInfo(new Date(2026, 9, 28, 7, 42), agora).texto, /^hoje, 07:42$/);
  assert.match(atualizacaoInfo(new Date(2026, 9, 27, 7, 42), agora).texto, /^ontem/);
  assert.deepEqual(atualizacaoInfo({ seconds: new Date(2026, 9, 21).getTime() / 1000 }, agora), { texto: 'há 7 dias', frescor: 'recente' });
  assert.deepEqual(atualizacaoInfo(new Date(2026, 9, 16), agora), { texto: 'há 12 dias', frescor: 'atencao' });
  assert.equal(atualizacaoInfo(new Date(2026, 8, 11), agora).frescor, 'antiga');
  assert.equal(atualizacaoInfo(new Date(2026, 6, 1), agora).texto, '01/07/2026');
  assert.deepEqual(atualizacaoInfo(null, agora), { texto: 'sem atualização', frescor: 'sem-dado' });
});

test('Frota é um grupo sem /frota próprio; rotas antigas foram apagadas', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  const menu = readFileSync('src/components/menuPrincipal.tsx', 'utf8');
  for (const rota of ['frota/veiculos', 'frota/veiculos/:id', 'frota/registros', 'frota/checklists', 'frota/checklists/:id', 'frota/analytics']) {
    assert.match(app, new RegExp(`path="${rota}"`));
  }
  assert.doesNotMatch(app, /path="(frota|registros|checklists|checklists\/:id|frota\/:id)"/);
  const ordem = ['Veículos', 'Registros', 'Checklists', 'KPI'].map((label) => menu.indexOf(`label: '${label}', to: '/frota/`));
  assert.ok(ordem.every((pos, i) => pos > 0 && (i === 0 || pos > ordem[i - 1])), 'ordem Veículos, Registros, Checklists, KPI');
  assert.doesNotMatch(menu, /to: '\/(frota|registros|checklists)',/);
});

test('custo total soma só os valores numéricos dos registros listados', () => {
  assert.equal(somarValores([{ valor: 170 }, { valor: null }, { valor: 30.5 }, {}, { valor: Number.NaN }]), 200.5);
  assert.equal(somarValores([]), 0);
});

test('valor da manutenção: dígitos sem vírgula são centavos; com vírgula vale o número pt-BR', async () => {
  const { formatValorManutencao, parseValorManutencao } = await import('../src/components/manutencaoFormShared');
  assert.equal(parseValorManutencao('123456'), 1234.56);
  assert.equal(parseValorManutencao('5000'), 50);
  assert.equal(parseValorManutencao('1.234,5'), 1234.5);
  assert.equal(parseValorManutencao('R$ 1.234,56'), 1234.56);
  assert.ok(Number.isNaN(parseValorManutencao('')));
  const formatado = formatValorManutencao('123456');
  assert.equal(formatado.replace(/\s/g, ' '), 'R$ 1.234,56');
  assert.equal(parseValorManutencao(formatado), 1234.56);
  assert.equal(formatValorManutencao('abc'), 'abc');
});

test('origem do KM inicial em texto', () => {
  assert.equal(origemKmTexto('atividades/saida - 02_04_25 - 1614 - IUT-2D00'), 'atividade');
  assert.equal(origemKmTexto('03-combustivel/abc'), 'abastecimento');
  assert.equal(origemKmTexto(' cadastro antigo (01-placas) '), 'cadastro antigo (01-placas)');
  assert.equal(origemKmTexto(null), null);
  assert.equal(origemKmTexto('  '), null);
});

test('edição do KM inicial: inteiro, origem obrigatória com KM, data opcional', () => {
  const ok = lerKmInicial({ km: '811.295', data: '2025-02-04T16:14', origem: ' manual: revisão ' });
  assert.equal(ok.ok, true);
  if (ok.ok) { assert.equal(ok.valor.km, 811295); assert.equal(ok.valor.origem, 'manual: revisão'); assert.ok(ok.valor.data instanceof Date); }
  assert.deepEqual(lerKmInicial({ km: '', data: '', origem: '' }), { ok: true, valor: { km: null, data: null, origem: null } });
  assert.equal(lerKmInicial({ km: '12,5', data: '', origem: 'x' }).ok, false);
  assert.deepEqual(lerKmInicial({ km: '100', data: '', origem: '' }), { ok: false, erro: 'Informe de onde veio o KM inicial.' });
  assert.equal(lerKmInicial({ km: '100', data: 'xx', origem: 'x' }).ok, false);
});

test('campos do quadro FROTA: textos, ano sem separador, capacidades ÷10 e traço sem valor', () => {
  const campos = Object.fromEntries(camposQuadroFrota({
    cadastro: { tipoVeiculo: 'Caminhões Munck', anoFabricacao: 2010, empresa: 'LEDUR', responsavel: '' },
    operacional: { local: ' Fábrica ', chaveTitular: 'MECANICO', chaveReserva: null },
    capacidades: { cargaLiquida: 100, munck: 175, pesoBruto: null },
    identificacao: { corCabine: 'BRANCO' },
  }).map((c) => [c.rotulo, c.valor]));
  assert.equal(campos['Tipo do veículo'], 'Caminhões Munck');
  assert.equal(campos['Ano de fabricação'], '2010');
  assert.equal(campos['Local'], 'Fábrica');
  assert.equal(campos['Responsável'], '—');
  assert.equal(campos['Chave reserva'], '—');
  assert.equal(campos['Cap. de carga líquida'], '10');
  assert.equal(campos['Cap. munck'], '17,5');
  assert.equal(campos['Peso bruto'], '—');
  assert.equal(campos['Cor da carroceria'], '—');
  assert.equal(camposQuadroFrota({}).length, 12);
});
