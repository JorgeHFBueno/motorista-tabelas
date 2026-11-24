import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizarAtividade } from '../src/services/atividade-normalizer';
import { normalizarMovimentoCombustivel } from '../src/services/combustivel-normalizer';
import {
  contratoTexto,
  filtrarLocais,
  filtrarObras,
  linhasDeApoio,
  localDaCidade,
  localPendente,
  obraDetalheFromV2,
  periodosDosMestres,
  resumirCombustivel,
  veiculosNaObra,
  type ObraDetalhe,
} from '../src/features/obras/obrasDomain';
import { createObraRelatorioPdf, nomeArquivoRelatorioObra } from '../src/features/obras/obraRelatorioPdf';
import { LOCAIS_SUGERIDOS } from '../src/features/obras/locaisSugeridos';
import { agruparPorTipo, comPdf, comPdfsGravados, preFabricadosDoPlannix, resumoEtapas, revisoes, semProjeto, totalPdfs, type PdfGravado, type PreFabricado } from '../src/features/obras/preFabricados';
import { coordenadaDoLote, lotesDaObra, obraFromV2 } from '../src/utils/cadastrosV2';

const contrato = {
  nomeObra: 'LAGOA BONITA DO SUL 16/2026', siglaObra: '', codObra: 0, local: 'CORRIGIR', status: 'CONTRATADA',
  situacao: 'Obra em andamento', numeroContrato: '16', ano: 2026, empresa: 'LEDUR', tipoObra: 'Pública',
  subcentroErp: ' 0102 ', dataInicial: '2026-03-01', dataFinal: '2026-12-31T00:00:00', friday: { ok: true },
  lotes: {
    b: { nome: 'LOTE 2', status: 'Não iniciada', ordem: 1 },
    a: { nome: 'LOTE 1', status: 'Em andamento', ordem: 0 },
    z: { nome: 'LOTE VELHO', status: 'Finalizado', ordem: 2, situacao: 'arquivado' },
  },
};

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

test('obra de obras-v2: LOTEs ativos na ordem, arquivados só no mapa de nomes, datas só AAAA-MM-DD', () => {
  const obra = obraDetalheFromV2('c1', contrato)!;
  assert.deepEqual(obra.lotes.map((lote) => lote.nome), ['LOTE 1', 'LOTE 2']);
  assert.equal(obra.nomesLotes.z, 'LOTE VELHO');
  assert.equal(obra.subcentroErp, ' 0102 ', 'subcentro guardado exatamente como veio');
  assert.equal(obra.dataInicial, '2026-03-01');
  assert.equal(obra.dataFinal, null);
  assert.equal(contratoTexto(obra), '16/2026');
  assert.equal(obraDetalheFromV2('x', { nomeObra: '  ' }), null);
});

test('sugestões de local: lista antiga do /combustivel/novo, sem repetição, busca sem acento e no máximo 50', () => {
  assert.equal(LOCAIS_SUGERIDOS[0], 'Fábrica');
  assert.equal(LOCAIS_SUGERIDOS.length, 1183);
  assert.equal(new Set(LOCAIS_SUGERIDOS).size, LOCAIS_SUGERIDOS.length);
  assert.ok(LOCAIS_SUGERIDOS.includes('Lagoa Bonita do Sul - RS'));
  assert.deepEqual(filtrarLocais(LOCAIS_SUGERIDOS, 'lagoa bonita'), ['Lagoa Bonita do Sul - RS']);
  assert.ok(filtrarLocais(LOCAIS_SUGERIDOS, 'sao jose').includes('São José do Herval - RS'));
  assert.equal(filtrarLocais(LOCAIS_SUGERIDOS, '').length, 50);
  assert.deepEqual(filtrarLocais(LOCAIS_SUGERIDOS, 'zzz'), []);
});

test('local pendente: vazio ou CORRIGIR', () => {
  assert.equal(localPendente('CORRIGIR'), true);
  assert.equal(localPendente(' corrigir '), true);
  assert.equal(localPendente(''), true);
  assert.equal(localPendente('Lagoa Bonita do Sul - RS'), false);
});

test('lista: filtros Ativas, Sem local, Finalizadas e busca sem acento', () => {
  const obras = [
    obraDetalheFromV2('c1', contrato)!,
    obraDetalheFromV2('c2', { ...contrato, nomeObra: 'SÃO JOSÉ 1/2025', local: 'São José', status: 'FINALIZADA' })!,
    obraDetalheFromV2('c3', { ...contrato, nomeObra: 'ARROIO 2/2026', local: 'Arroio do Meio' })!,
  ] as ObraDetalhe[];
  assert.deepEqual(filtrarObras(obras, '', 'ATIVAS').map((obra) => obra.id), ['c3', 'c1']);
  assert.deepEqual(filtrarObras(obras, '', 'SEM_LOCAL').map((obra) => obra.id), ['c1']);
  assert.deepEqual(filtrarObras(obras, '', 'FINALIZADAS').map((obra) => obra.id), ['c2']);
  assert.deepEqual(filtrarObras(obras, 'sao jose', 'TODAS').map((obra) => obra.id), ['c2']);
});

test('mestres: um período por alocação, fim = início + dias − 1, LOTE pelo nome (arquivado também)', () => {
  const periodos = periodosDosMestres([
    { id: '2', mestreId: 'dine', obraId: 'z', inicio: '2026-05-10', tempoPlanejado: 3 },
    { id: '1', mestreId: 'jefe', obraId: 'a', inicio: '2026-04-01', tempoPlanejado: 30 },
    { id: '3', mestreId: 'novo', inicio: '2026-06-01', tempoPlanejado: 1 },
    { id: '5', mestreId: 'dine', obraId: 'a', inicio: '2026-07-01', tempoPlanejado: 21, naoTrabalhados: [{ inicio: '2026-07-10', dias: 3 }] },
    { id: '4', mestreId: 'dine', obraId: 'a', inicio: 'inválido', tempoPlanejado: 3 },
  ], { dine: 'DINE', jefe: 'JEFE' }, obraDetalheFromV2('c1', contrato)!.nomesLotes);
  assert.deepEqual(periodos.map((p) => [p.mestre, p.lote, p.inicio, p.fim, p.dias, p.diasTexto]), [
    ['JEFE', 'LOTE 1', '2026-04-01', '2026-04-30', 30, '30 dias'],
    ['DINE', 'LOTE VELHO', '2026-05-10', '2026-05-12', 3, '3 dias'],
    ['novo', 'Contrato', '2026-06-01', '2026-06-01', 1, '1 dia'],
    ['DINE', 'LOTE 1', '2026-07-01', '2026-07-21', 21, '21 dias (3 NT)'],
  ]);
});

test('apoio ("ajuda por fora"): fora da tabela de mestres; linhas "Recebeu apoio" e "Prestou apoio", em ordem de início', () => {
  const apoio = { alocacaoId: 'orig', contratoId: 'c-origem' };
  const recebidos = [
    { id: '1', mestreId: 'jefe', obraId: 'a', inicio: '2026-11-01', tempoPlanejado: 20 },
    { id: '2', mestreId: 'dine', obraId: 'a', inicio: '2026-11-24', tempoPlanejado: 2, apoio },
  ];
  assert.deepEqual(periodosDosMestres(recebidos, { jefe: 'JEFE', dine: 'DINE' }, obraDetalheFromV2('c1', contrato)!.nomesLotes).map((p) => p.mestre), ['JEFE']);
  const prestados = [{ id: '3', mestreId: 'jefe', obraId: 'x', contratoId: 'c-outra', inicio: '2026-11-20', tempoPlanejado: 1, apoio: { alocacaoId: '1', contratoId: 'c1' } }];
  assert.deepEqual(linhasDeApoio(recebidos, prestados, { jefe: 'JEFE', dine: 'DINE' }, { 'c-outra': 'ARVOREDO 032/2026' }), [
    'Prestou apoio JEFE, Obra ARVOREDO 032/2026, período 20/11',
    'Recebeu apoio de DINE, período 24/11 a 25/11',
  ]);
});

const atividade = (id: string, placa: string, motorista: string, iso: string) => normalizarAtividade({
  schemaVersion: 2, tipo: 'saida', data: ts(iso), id_obra: 'c1', item_frota_id: `v-${placa}`,
  item_frota_snapshot: { identificador: placa, nome: `Caminhão ${placa}` }, motorista: { uid: motorista, nome: motorista },
}, id);

test('veículos: agrupados pelo veículo, com primeira e última data e motoristas; fora do contrato fica de fora', () => {
  const veiculos = veiculosNaObra([
    atividade('1', 'ABC1D23', 'ANA', '2026-04-01T12:00:00Z'),
    atividade('2', 'ABC1D23', 'BETO', '2026-04-20T12:00:00Z'),
    atividade('3', 'XYZ9K88', 'ANA', '2026-05-02T12:00:00Z'),
    normalizarAtividade({ tipo: 'saida', id_obra: 'c1' }, '4'),
  ]);
  assert.deepEqual(veiculos.map((v) => [v.placa, v.atividades, v.motoristas]), [['XYZ9K88', 1, ['ANA']], ['ABC1D23', 2, ['ANA', 'BETO']]]);
  assert.equal(veiculos[1].primeira?.toISOString(), '2026-04-01T12:00:00.000Z');
  assert.equal(veiculos[1].ultima?.toISOString(), '2026-04-20T12:00:00.000Z');
});

const saida = (id: string, placa: string, quantidade: number, valor: number, iso: string) => normalizarMovimentoCombustivel({
  schemaVersion: 2, tipo: 'saida', data: ts(iso), id_obra: 'c1', item_frota_id: `v-${placa}`,
  item_frota_snapshot: { identificador: placa, categoria: 'PLACA' }, quantidadeAbastecida: quantidade, valorAbastecimento: valor,
  motoristaOperador: { nome: 'ANA' }, frentista: { nome: 'FRENTISTA' },
}, id);

test('combustível: litros ×10 e valor em centavos, total e por veículo; entradas ficam de fora', () => {
  const resumo = resumirCombustivel([
    saida('1', 'ABC1D23', 1005, 59295, '2026-04-02T12:00:00Z'),
    saida('2', 'ABC1D23', 500, 29500, '2026-04-01T12:00:00Z'),
    saida('3', 'XYZ9K88', 2000, 118000, '2026-04-03T12:00:00Z'),
    normalizarMovimentoCombustivel({ schemaVersion: 2, tipo: 'entrada', litrosComprados: 50000 }, '4'),
  ]);
  assert.equal(resumo.abastecimentos, 3);
  assert.equal(resumo.litros, 350.5);
  assert.equal(resumo.valor, 2067.95);
  assert.deepEqual(resumo.porVeiculo.map((v) => [v.veiculo, v.abastecimentos, v.litros]), [['XYZ9K88', 1, 200], ['ABC1D23', 2, 150.5]]);
  assert.deepEqual(resumo.itens.map((item) => item.id), ['2', '1', '3']);
  assert.equal(resumo.itens[0].paraQuem, 'ANA');
});

test('relatório da obra: PDF com todas as seções; fonte que falhou aparece como indisponível', async () => {
  const obra = obraDetalheFromV2('c1', contrato)!;
  const pdf = createObraRelatorioPdf({
    obra,
    geradoEm: new Date('2026-10-30T15:00:00Z'),
    mestres: { status: 'ok', data: { periodos: periodosDosMestres([{ id: '1', mestreId: 'jefe', obraId: 'a', inicio: '2026-04-01', tempoPlanejado: 30 }], { jefe: 'JEFE' }, obra.nomesLotes), apoios: ['Recebeu apoio de DINE, periodo 24/11'] } },
    veiculos: { status: 'erro' },
    combustivel: { status: 'ok', data: resumirCombustivel([saida('1', 'ABC1D23', 1005, 59295, '2026-04-02T12:00:00Z')]) },
  });
  assert.equal(pdf.type, 'application/pdf');
  const conteudo = Buffer.from(await pdf.arrayBuffer()).toString('latin1');
  for (const trecho of ['RELAT\xd3RIO DA OBRA', 'DADOS DA OBRA', 'Sin\xf4nimo', 'MESTRES ALOCADOS', 'VE\xcdCULOS QUE FORAM PARA A OBRA', 'COMBUST\xcdVEL', 'JEFE', 'Recebeu apoio de DINE', 'R$ 592,95', '100,5 L', 'N\xe3o foi poss\xedvel carregar as atividades.', 'Ledur Motorista \x97 relat\xf3rio da obra']) {
    assert.ok(conteudo.includes(trecho), trecho);
  }
  // A seção de medições saiu do detalhe da obra e do relatório (2026-11-24).
  assert.ok(!conteudo.includes('MEDI\xc7\xd5ES'));
  assert.equal(nomeArquivoRelatorioObra(obra, new Date('2026-10-30T15:00:00Z')), 'Relatorio-Obra-LAGOA-BONITA-DO-SUL-16-2026-2026-10-30.pdf');
});

test('LOTE: coordenada da coluna Coordenada do subitem ({ lat, lng }) ou null; o mesmo para o Cronograma Logístico', () => {
  assert.deepEqual(coordenadaDoLote({ lat: -29.502239, lng: -53.12 }), { lat: -29.502239, lng: -53.12 });
  for (const ruim of [null, undefined, {}, { lat: '-29', lng: -53 }, { lat: 95, lng: 10 }, { lat: 10, lng: 181 }, { lat: Number.NaN, lng: 1 }]) {
    assert.equal(coordenadaDoLote(ruim), null);
  }
  const lotes = lotesDaObra({
    b: { nome: 'LOTE 2', ordem: 1 },
    a: { nome: 'LOTE 1', status: 'Em andamento', ordem: 0, coordenada: { lat: -29.5, lng: -53.1 } },
    z: { nome: 'LOTE VELHO', ordem: 2, situacao: 'arquivado', coordenada: { lat: -1, lng: -1 } },
  });
  assert.deepEqual(lotes, [
    { chave: 'a', nome: 'LOTE 1', status: 'Em andamento', coordenada: { lat: -29.5, lng: -53.1 } },
    { chave: 'b', nome: 'LOTE 2', status: '', coordenada: null },
  ]);
  const detalhe = obraDetalheFromV2('c1', { ...contrato, lotes: { a: { nome: 'LOTE 1', ordem: 0, coordenada: { lat: -29.5, lng: -53.1 } } } })!;
  assert.deepEqual(detalhe.lotes[0].coordenada, { lat: -29.5, lng: -53.1 });
  const obra = obraFromV2('c1', { ...contrato, lotes: { a: { nome: 'LOTE 1', ordem: 0, coordenada: { lat: -29.5, lng: -53.1 } } } })!;
  assert.deepEqual(obra.lotes.map((lote) => lote.coordenada), [{ lat: -29.5, lng: -53.1 }]);
});

test('Local pela coordenada do LOTE: a grafia da lista de sugestões, sem diferença de acento e caixa', () => {
  assert.equal(localDaCidade('Arroio do Tigre', 'RS', LOCAIS_SUGERIDOS), 'Arroio do Tigre - RS');
  assert.equal(localDaCidade('palmeira das missoes', 'rs', LOCAIS_SUGERIDOS), 'Palmeira das Missões - RS');
  assert.equal(localDaCidade('Cidade Nova', 'SP', LOCAIS_SUGERIDOS), 'Cidade Nova - SP'); // fora da lista: como veio
  assert.equal(localDaCidade('Roma', '', LOCAIS_SUGERIDOS), 'Roma');
  assert.equal(localDaCidade('  ', 'RS', LOCAIS_SUGERIDOS), null);
});

const pdfItem = (id: string, quando: string) => ({ id, nome: `${id}.pdf`, tamanho: 1024, anexadoEm: new Date(quando), anexadoPor: 'Teste', url: null });
const preFabricado = (id: string, grupo: string, etapas: string[], pdfs = 0, quantidade = etapas.length): PreFabricado => ({
  id, grupo, tipo: id, quantidade, desenhos: [],
  pecas: etapas.map((etapa, i) => ({ codigo: `${id}-${i}`, etapa, data: null })),
  pdfs: Array.from({ length: pdfs }, (_, i) => pdfItem(`${id}-${i}`, `2026-11-0${i + 1}T10:00:00-03:00`)),
});

test('pré-fabricados: agrupa pelo produto do Plannix (PILAR → Pilar), na ordem em que aparece', () => {
  const grupos = agruparPorTipo([preFabricado('P01', 'PILAR', []), preFabricado('VL', 'VIGA', []), preFabricado('P02', 'PILAR', []), preFabricado('X', '', [])]);
  assert.deepEqual(grupos.map((g) => [g.nome, g.itens.map((i) => i.id)]), [['Pilar', ['P01', 'P02']], ['Viga', ['VL']], ['Sem produto', ['X']]]);
});

test('pré-fabricados: resumo das etapas na ordem da produção, sem acento e etapa desconhecida no fim', () => {
  const itens = [preFabricado('P01', 'PILAR', ['EXPEDIDA', 'CORTE DOBRA', 'ACABADA', 'CORTE DOBRA', 'ARMAÇÃO']), preFabricado('P02', 'PILAR', ['ACABADA', 'NOVA ETAPA'])];
  assert.deepEqual(resumoEtapas(itens).map((e) => `${e.quantidade} ${e.rotulo}`), ['2 Corte e dobra', '1 Armação', '2 Acabada', '1 Expedida', '1 NOVA ETAPA']);
  assert.equal(semProjeto([preFabricado('LF', 'VIGA', [], 0, 8), ...itens]), 8);
});

test('pré-fabricados: "N de M com PDF", total de PDFs e revisões da mais nova (Rev. N) à mais antiga (Rev. 0)', () => {
  const itens = [preFabricado('a', 'PILAR', [], 2), preFabricado('b', 'PILAR', [], 0), preFabricado('c', 'PILAR', [], 1)];
  assert.equal(comPdf(itens), 2);
  assert.equal(totalPdfs(itens), 3);
  assert.deepEqual(revisoes(itens[0].pdfs).map((r) => [r.item.id, r.revisao]), [['a-1', 1], ['a-0', 0]]);
});

test('pré-fabricados: resposta do Plannix ligada aos LOTEs pelo Nº Pedido; sem pedido, pedido sem obra ou em duas obras vira aviso', () => {
  const r = preFabricadosDoPlannix(
    [{ chave: 'l1' }, { chave: 'l2' }, { chave: 'l3' }, { chave: 'l4' }, { chave: 'l5' }],
    [
      { lote: 'l1', pedido: '951', codigo: 117, sigla: 'PM IBARAMA', nome: 'PONTE 5,00X25,00M (LAJ. GRINGA)', projeto: true, itens: [{ produto: 'PILAR', nome: 'P01', secao: '25X40', quantidade: 1, desenhos: ['p01.pdf'], pecas: [{ codigo: '1001', etapa: 'ACABADA', data: null }] }] },
      { lote: 'l3', pedido: '909', erro: 'nao-encontrada' },
      { lote: 'l4', pedido: '960', codigo: 200, sigla: 'PM NOVA', nome: 'GALERIA', projeto: false, itens: [] },
      { lote: 'l5', pedido: '970', erro: 'duplicada', codigos: [301, 302] },
    ],
  );
  const l1 = r.l1 as { itens: PreFabricado[]; origem: string; plannix: number };
  assert.equal(l1.origem, 'Pedido 951 · Plannix 117 · PM IBARAMA · PONTE 5,00X25,00M (LAJ. GRINGA)');
  assert.equal(l1.plannix, 117);
  assert.deepEqual([l1.itens[0].grupo, l1.itens[0].tipo, l1.itens[0].pecas.length, l1.itens[0].desenhos], ['PILAR', 'P01', 1, ['p01.pdf']]);
  assert.deepEqual([l1.itens[0].id, l1.itens[0].chave], ['117|PILAR|P01', 'PILAR|P01']);
  assert.match((r.l2 as { aviso: string }).aviso, /Sem Nº Pedido/);
  assert.match((r.l3 as { aviso: string }).aviso, /Pedido 909 sem obra no Plannix: preencha o Cód\. Auxiliar/);
  assert.equal((r.l4 as { origem: string }).origem, 'Pedido 960 · Plannix 200 · PM NOVA · GALERIA (sem projeto: Lançamento Final)');
  assert.match((r.l5 as { aviso: string }).aviso, /mais de uma obra do Plannix \(301, 302\)/);
});

test('pré-fabricados: PDFs gravados vão para o item do mesmo LOTE e chave "produto|nome"', () => {
  const gravado = (id: string, lote: string, item: string): PdfGravado => ({ ...pdfItem(id, '2026-11-24T10:00:00-03:00'), caminho: `obras/pre-fabricados/o1/${id}.pdf`, lote, plannix: 112, item });
  const itens = [{ ...preFabricado('P01', 'PILAR', ['ACABADA']), chave: 'PILAR|P01' }, { ...preFabricado('VL', 'VIGA', []), chave: 'VIGA|VL' }];
  const r = comPdfsGravados('l1', itens, [gravado('a', 'l1', 'PILAR|P01'), gravado('b', 'l2', 'PILAR|P01'), gravado('c', 'l1', 'VIGA|VL'), gravado('d', 'l1', 'PILAR|P01')]);
  assert.deepEqual(r.map((i) => i.pdfs.map((p) => p.id)), [['a', 'd'], ['c']]);
});
