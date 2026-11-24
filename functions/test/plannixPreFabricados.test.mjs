import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLUNA_PEDIDO, createPlannixService, etapaPelasDatas, itensDasPecas, itensDoLancamento, obraIdValido, pedidoDaCelula } from '../lib/plannixPreFabricados.js';

// Formato das rotas do Plannix (mesmos campos na API antiga /api/bi e na nova /public/v1/bi), com dados inventados.
const OBRAS = [
  { codObra: 113, codAuxiliarObra: '950', siglaObra: 'PM IBARAMA', nomeObra: 'PONTE 5,00X30,00M (CABRITOS)' },
  { codObra: 117, codAuxiliarObra: ' 951 ', siglaObra: 'PM IBARAMA', nomeObra: 'PONTE 5,00X25,00M (LAJ. GRINGA)' },
  { codObra: 200, codAuxiliarObra: '960', siglaObra: 'PM NOVA', nomeObra: 'GALERIA 2,00X2,00M ' },
  { codObra: 301, codAuxiliarObra: '970', siglaObra: 'PM X', nomeObra: 'PONTE A' },
  { codObra: 302, codAuxiliarObra: '970', siglaObra: 'PM X', nomeObra: 'PONTE B' },
  { codObra: 112, codAuxiliarObra: null, siglaObra: 'PM LAGOA BS', nomeObra: 'PONTE 5,00X10,00M' },
];
const ELEVOR = 'https://s15.elevor.cloud/LedurPreFabricados/ERP360/CD_Pedidos.aspx?Cod=';
const peca = (codigoControle, nomeObra, produto, nomePeca, secao = '25X40') => ({ codigoControle, nomeObra, produto, nomePeca, secao, sigla: 'PM IBARAMA' });
const PECAS = [
  { ...peca('1003', 'PONTE 5,00X25,00M (LAJ. GRINGA)', 'PILAR', 'P01'), data_Projeto: '13/07/2026 00:00:00', data_CorteDobra: '28/07/2026 16:35:00', data_Acabamento: '11/09/2026 14:52:00', status_Logistica: 'EXPEDIDA', data_Expedicao: '14/09/2026 16:30:00' },
  peca('1001', 'PONTE 5,00X25,00M (LAJ. GRINGA)', 'PILAR', 'P01'),
  peca('1002', 'PONTE 5,00X25,00M (LAJ. GRINGA)', 'PILAR', 'P01'),
  peca('1010', 'PONTE 5,00X25,00M (LAJ. GRINGA)', 'VIGA', 'VL - 25X70X1250', '25X70'),
  peca('2001', 'PONTE 5,00X30,00M (CABRITOS)', 'VIGA', 'VL - 25X70X1500', '25X70'),
];
const STATUS = [
  { codigoControle: '1001', processo: 'CORTE DOBRA', status: 'LIBERADA', data: '2026-11-24T09:36:00' },
  { codigoControle: '1002', processo: 'ACABADA', status: 'LIBERADA', data: '2026-11-20T10:00:00' },
  { codigoControle: '1010', processo: 'EXPEDIDA', status: 'EXPEDIDA', data: '2026-11-22T08:00:00' },
];
const LANCAMENTOS = [{ CodigoObra: 200, Sigla: 'PM NOVA', NomeObra: 'GALERIA 2,00X2,00M', Itens: [
  { Produto: 'GALERIA', SubgrupoProduto: 'GALERIA', Secao: '2,00X2,00', Comprimento: 1.0, QtdPecas: 8.0, Fase: 'Lançamento Final' },
  { Produto: 'GALERIA', SubgrupoProduto: 'GALERIA', Secao: '2,00X2,00', Comprimento: null, QtdPecas: 8.0, Fase: 'Lançamento Inicial' },
] }];

test('obra e pedido: o contrato pedido pela tela e o número do pedido da célula de link do Friday', () => {
  assert.equal(obraIdValido({ obraId: 'DEL3A8zLBbxHzfvd8bR0' }), 'DEL3A8zLBbxHzfvd8bR0');
  for (const dados of [null, {}, { obraId: '' }, { obraId: 'a/b' }, { obraId: 12 }]) {
    assert.throws(() => obraIdValido(dados), (e) => e.code === 'invalid-argument', JSON.stringify(dados));
  }
  assert.equal(pedidoDaCelula({ url: `${ELEVOR}816`, texto: '816' }), '816');
  assert.equal(pedidoDaCelula({ url: `${ELEVOR}909`, texto: '' }), '909');
  assert.equal(pedidoDaCelula(' 953 '), '953');
  assert.equal(pedidoDaCelula({ url: '', texto: '' }), '');
  assert.equal(pedidoDaCelula(null), '');
  assert.ok(COLUNA_PEDIDO.test('Nº Pedido/Cód. Auxiliar'));
  assert.ok(COLUNA_PEDIDO.test('N° Pedido'));
  assert.ok(!COLUNA_PEDIDO.test('ID do Pedido'));
});

test('peças: só as da obra, agrupadas pelo nome da peça, com a etapa atual de cada código', () => {
  const itens = itensDasPecas(PECAS, STATUS, 'PONTE 5,00X25,00M (LAJ. GRINGA)');
  assert.deepEqual(itens.map((i) => [i.produto, i.nome, i.quantidade]), [['PILAR', 'P01', 3], ['VIGA', 'VL - 25X70X1250', 1]]);
  assert.deepEqual(itens[0].pecas, [
    { codigo: '1001', etapa: 'CORTE DOBRA', data: '2026-11-24T09:36:00' },
    { codigo: '1002', etapa: 'ACABADA', data: '2026-11-20T10:00:00' },
    // Fora de exportaStatusProducao: a etapa sai das datas da própria peça.
    { codigo: '1003', etapa: 'EXPEDIDA', data: '2026-09-14T16:30:00' },
  ]);
});

test('etapa pelas datas: o último evento com data, da montagem para trás', () => {
  assert.deepEqual(etapaPelasDatas({ data_Projeto: '24/11/2026 00:00:00', data_CorteDobra: '24/11/2026 09:36:00' }), { etapa: 'CORTE DOBRA', data: '2026-11-24T09:36:00' });
  assert.deepEqual(etapaPelasDatas({ data_Projeto: '13/07/2026 00:00:00', data_Concretagem: '28/07/2026 16:35:00', data_Acabamento: '11/09/2026 14:52:00' }), { etapa: 'ACABADA', data: '2026-09-11T14:52:00' });
  assert.deepEqual(etapaPelasDatas({ data_Expedicao: '14/09/2026 16:30:00', montada: true, dataMontada: '20/09/2026 08:00:00' }), { etapa: 'MONTADA', data: '2026-09-20T08:00:00' });
  assert.deepEqual(etapaPelasDatas({ status_Logistica: 'EXPEDIDA' }), { etapa: 'EXPEDIDA', data: null });
  assert.deepEqual(etapaPelasDatas({ data_Projeto: null }), { etapa: '', data: null });
});

test('sem projeto: as linhas do Lançamento Final (só a fase Final) com a quantidade prevista', () => {
  assert.deepEqual(itensDoLancamento(LANCAMENTOS, 200), [{ produto: 'GALERIA', nome: 'GALERIA · 2,00X2,00 · 1 m', secao: '2,00X2,00', pecas: [], quantidade: 8, desenhos: [] }]);
  assert.deepEqual(itensDoLancamento(LANCAMENTOS, 999), []);
});

test('serviço: exige a área Engenharia; liga cada LOTE pelo pedido ao Cód. Auxiliar e junta peças, etapas, Lançamento Final e desenhos', async () => {
  const chamadas = [];
  const store = {
    async getEmployee(uid) { return uid === 'eng' ? { ativo: true, perfis: {}, areas: { engenharia: 'ver' } } : { ativo: true, perfis: {}, areas: { logistica: 'ver' } }; },
    async getPedidos(obraId) {
      if (obraId !== 'o1') return { l9: { url: '', texto: '' } };
      return { l1: { url: `${ELEVOR}951`, texto: '951' }, l2: '960', l3: { url: `${ELEVOR}909`, texto: '909' }, l4: { texto: '970' }, l5: null };
    },
    async get(rota, p = {}) {
      chamadas.push(`${rota} ${JSON.stringify(p)}`);
      if (rota === 'obras') return OBRAS;
      if (rota === 'informacaoGlobalPeca') return p.siglaObra === 'PM IBARAMA' ? PECAS : [];
      if (rota === 'exportaStatusProducao') return p.sigla === 'PM IBARAMA' ? STATUS : null;
      if (rota === 'lancamentoInicialeFinal') return LANCAMENTOS;
      if (rota === 'ListaArquivosProjetos') return p.codigoControle === '1001' ? ['p01.pdf'] : [];
      throw new Error(rota);
    },
  };
  const servico = createPlannixService(store);
  await assert.rejects(servico(undefined, { obraId: 'o1' }), (e) => e.code === 'unauthenticated');
  await assert.rejects(servico('log', { obraId: 'o1' }), (e) => e.code === 'permission-denied');

  const { lotes } = await servico('eng', { obraId: 'o1' });
  assert.equal(lotes.length, 4); // l5 sem pedido fica de fora
  assert.deepEqual([lotes[0].lote, lotes[0].pedido, lotes[0].codigo, lotes[0].sigla, lotes[0].nome, lotes[0].projeto, lotes[0].itens.length],
    ['l1', '951', 117, 'PM IBARAMA', 'PONTE 5,00X25,00M (LAJ. GRINGA)', true, 2]);
  assert.deepEqual(lotes[0].itens[0].desenhos, ['p01.pdf']);
  assert.deepEqual([lotes[1].codigo, lotes[1].projeto, lotes[1].itens[0].quantidade], [200, false, 8]);
  assert.deepEqual(lotes[2], { lote: 'l3', pedido: '909', erro: 'nao-encontrada' });
  assert.deepEqual(lotes[3], { lote: 'l4', pedido: '970', erro: 'duplicada', codigos: [301, 302] });
  // Uma consulta de peças e de etapas por sigla, não por LOTE.
  assert.equal(chamadas.filter((c) => c.startsWith('informacaoGlobalPeca')).length, 2);

  // Obra sem nenhum pedido: nem chama o Plannix.
  chamadas.length = 0;
  assert.deepEqual(await servico('eng', { obraId: 'o2' }), { lotes: [] });
  assert.equal(chamadas.length, 0);
});
